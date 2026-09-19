begin;

do $$
declare
  target_project_id uuid;
  relation_name text;
  privilege_name text;
  definition text;
begin
  foreach relation_name in array array[
    'project_marketplace_financial_settings', 'wallets', 'topups', 'wallet_transactions'
  ] loop
    if to_regclass('public.' || relation_name) is null then
      raise exception 'TEST_FAILED: missing table public.%', relation_name;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || relation_name)::regclass) then
      raise exception 'TEST_FAILED: RLS is not enabled on %', relation_name;
    end if;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', 'public.' || relation_name, privilege_name)
        or has_table_privilege('authenticated', 'public.' || relation_name, privilege_name) then
        raise exception 'TEST_FAILED: direct % access exists on %', privilege_name, relation_name;
      end if;
    end loop;
  end loop;

  select id into target_project_id from public.projects where slug = 'tuktuk-control';
  if target_project_id is not null and not exists (
    select 1 from public.project_marketplace_financial_settings
    where project_id = target_project_id and wallet_currency = 'CUP'
      and initial_minimum_deposit = 500.00 and commission_rate = 0.10
  ) then raise exception 'TEST_FAILED: TukTuk financial seed is not CUP/500/0.10'; end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='wallets' and column_name='vehicle_id') then
    raise exception 'TEST_FAILED: wallets must not belong to vehicles';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.wallets'::regclass and contype='p' and pg_get_constraintdef(oid) like '%project_id, user_id%') then
    raise exception 'TEST_FAILED: wallets PK is not (project_id,user_id)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='wallets' and column_name in ('balance','reserved_balance','available_balance')) then
    raise exception 'TEST_FAILED: wallet stores a mutable balance';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.wallets'::regclass and contype='c' and pg_get_constraintdef(oid) like '%initial_deposit_amount >= initial_minimum_snapshot%') then
    raise exception 'TEST_FAILED: initial deposit snapshot minimum constraint missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.topups'::regclass and contype='u' and pg_get_constraintdef(oid) like '%project_id, user_id, request_idempotency_key%')
    or not exists (select 1 from pg_constraint where conrelid='public.topups'::regclass and contype='u' and pg_get_constraintdef(oid) like '%project_id, confirmation_idempotency_key%') then
    raise exception 'TEST_FAILED: topup idempotency constraints missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.topups'::regclass and contype='f' and pg_get_constraintdef(oid) like '%project_id, user_id, ledger_transaction_id%')
    or not exists (select 1 from pg_constraint where conrelid='public.wallets'::regclass and contype='f' and pg_get_constraintdef(oid) like '%project_id, user_id, initial_deposit_topup_id%') then
    raise exception 'TEST_FAILED: project/user-safe wallet/topup foreign keys missing';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.topups'::regclass and tgname='topups_protect_provenance' and not tgisinternal) then
    raise exception 'TEST_FAILED: topup provenance trigger missing';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.wallet_transactions'::regclass and tgname='wallet_transactions_immutable' and not tgisinternal) then
    raise exception 'TEST_FAILED: wallet ledger immutability trigger missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.wallet_transactions'::regclass and contype='u' and pg_get_constraintdef(oid) like '%project_id, idempotency_key%') then
    raise exception 'TEST_FAILED: ledger idempotency uniqueness missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.wallet_transactions'::regclass and contype='u' and pg_get_constraintdef(oid) like '%project_id, source_type, source_id, transaction_type%') then
    raise exception 'TEST_FAILED: ledger source uniqueness missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.wallet_transactions'::regclass and contype='c'
      and lower(pg_get_constraintdef(oid)) like '%amount_delta%' and pg_get_constraintdef(oid) like '%<>%') then
    raise exception 'TEST_FAILED: ledger non-zero amount constraint missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.wallet_transactions'::regclass and contype='c'
      and lower(pg_get_constraintdef(oid)) like '%jsonb_typeof%' and lower(pg_get_constraintdef(oid)) like '%metadata%'
      and lower(pg_get_constraintdef(oid)) like '%object%') then
    raise exception 'TEST_FAILED: ledger metadata object constraint missing';
  end if;

  select lower(pg_get_constraintdef(oid)) into definition
  from pg_constraint
  where conrelid = 'public.sync_entities'::regclass and contype = 'c'
    and lower(pg_get_constraintdef(oid)) like '%entity_type%'
  limit 1;
  if definition is null
    or definition not like '%dailyrecord%' or definition not like '%maintenance%'
    or definition not like '%vehicle%' or definition not like '%settings%'
    or definition like '%wallet%' or definition like '%topup%'
    or definition like '%job%' or definition like '%commission%' then
    raise exception 'TEST_FAILED: sync_entities entity_type CHECK contract changed';
  end if;
  if to_regprocedure('app_private.marketplace_wallet_total_balance(uuid,uuid)') is null
    or to_regprocedure('app_private.has_confirmed_marketplace_initial_deposit(uuid)') is null then
    raise exception 'TEST_FAILED: protected Marketplace helpers missing';
  end if;
  if has_function_privilege('anon','app_private.marketplace_wallet_total_balance(uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','app_private.marketplace_wallet_total_balance(uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','app_private.has_confirmed_marketplace_initial_deposit(uuid)','EXECUTE')
    or has_function_privilege('authenticated','app_private.has_confirmed_marketplace_initial_deposit(uuid)','EXECUTE') then
    raise exception 'TEST_FAILED: private Marketplace helpers are executable by authenticated';
  end if;
  if to_regprocedure('public.request_my_marketplace_topup(numeric,text,text,uuid)') is null
    or to_regprocedure('public.get_my_marketplace_wallet()') is null then
    raise exception 'TEST_FAILED: current-user RPCs missing';
  end if;
  if to_regprocedure('public.admin_create_marketplace_topup_request(uuid,uuid,numeric,text,text,text,uuid)') is null
    or to_regprocedure('public.admin_confirm_marketplace_topup(uuid,uuid,uuid)') is null
    or to_regprocedure('public.admin_reject_marketplace_topup(uuid,uuid,text)') is null
    or to_regprocedure('public.admin_set_marketplace_financial_settings(uuid,numeric,numeric)') is null then
    raise exception 'TEST_FAILED: administrative wallet RPCs missing';
  end if;
  select pg_get_functiondef('public.admin_confirm_marketplace_topup(uuid,uuid,uuid)'::regprocedure) into definition;
  if definition not like '%require_project_permission%' or definition not like '%payments.manage%' or definition not like '%for update%'
    or definition like '%public.payments%' or definition like '%public.licenses%' or definition like '%driver_profiles%'
    or definition like '%jobs%' or definition like '%service_requests%' or definition like '%job_assignments%'
    or definition like '%job_events%' or definition like '%commission_reservations%' then
    raise exception 'TEST_FAILED: confirmation RPC violates the Block 4 boundary';
  end if;
  select pg_get_functiondef('public.request_my_marketplace_topup(numeric,text,text,uuid)'::regprocedure) into definition;
  if definition not like '%auth.uid()%' or definition like '%target_user_id%' then
    raise exception 'TEST_FAILED: current-user topup RPC is not auth-scoped';
  end if;
  select pg_get_functiondef('public.get_my_marketplace_wallet()'::regprocedure) into definition;
  if definition not like '%auth.uid()%' or definition like '%target_user_id%' then
    raise exception 'TEST_FAILED: current-user wallet RPC is not auth-scoped';
  end if;
  foreach relation_name in array array[
    'public.admin_create_marketplace_topup_request(uuid,uuid,numeric,text,text,text,uuid)',
    'public.admin_confirm_marketplace_topup(uuid,uuid,uuid)',
    'public.admin_reject_marketplace_topup(uuid,uuid,text)'
  ] loop
    select pg_get_functiondef(relation_name::regprocedure) into definition;
    if definition not like '%app_private.require_project_permission%'
      or definition not like '%payments.manage%' then raise exception 'TEST_FAILED: % lacks project-scoped payments.manage', relation_name; end if;
  end loop;
  select pg_get_functiondef('public.admin_set_marketplace_financial_settings(uuid,numeric,numeric)'::regprocedure) into definition;
  if definition not like '%app_private.require_project_permission%'
    or definition not like '%settings.manage%' then raise exception 'TEST_FAILED: settings RPC lacks project-scoped settings.manage'; end if;
  select pg_get_functiondef('app_private.has_confirmed_marketplace_initial_deposit(uuid)'::regprocedure) into definition;
  if definition not like '%public.wallets%' or definition not like '%public.topups%'
    or definition not like '%public.wallet_transactions%' or definition like '%public.licenses%'
    or definition like '%public.payments%' or definition like '%driver_profiles%' then
    raise exception 'TEST_FAILED: initial deposit helper has an invalid dependency boundary';
  end if;
  foreach relation_name in array array[
    'public.jobs', 'public.service_requests', 'public.job_assignments',
    'public.job_events', 'public.commission_reservations'
  ] loop
    if to_regclass(relation_name) is not null then
      raise exception 'TEST_FAILED: Block 4 must not create %', relation_name;
    end if;
  end loop;
end;
$$;

-- Dynamic cases A-G require real auth and project-member fixtures. They are intentionally
-- not fabricated here; run them only in a local fixture environment and always roll back.
rollback;
