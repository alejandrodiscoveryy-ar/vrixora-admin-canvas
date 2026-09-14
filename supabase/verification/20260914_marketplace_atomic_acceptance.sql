begin;

do $$
declare
  relation_name text;
  privilege_name text;
  definition text;
  function_definition text;
  expected text[] := array['consumed','open','released'];
  actual text[];
begin
  foreach relation_name in array array['job_assignments','commission_reservations'] loop
    if to_regclass('public.' || relation_name) is null then raise exception 'TEST_FAILED: missing %', relation_name; end if;
    if not (select relrowsecurity from pg_class where oid=('public.'||relation_name)::regclass) then raise exception 'TEST_FAILED: RLS missing on %',relation_name; end if;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon','public.'||relation_name,privilege_name) or has_table_privilege('authenticated','public.'||relation_name,privilege_name) then raise exception 'TEST_FAILED: direct % access on %',privilege_name,relation_name; end if;
    end loop;
  end loop;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name in ('cargo_length_cm','cargo_width_cm','cargo_height_cm')) <> 3 then raise exception 'TEST_FAILED: typed vehicle dimensions missing'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.vehicles'::regclass and contype='c' and pg_get_constraintdef(oid) like '%cargo_length_cm is null or cargo_length_cm >= 0%') then raise exception 'TEST_FAILED: vehicle dimension nonnegative check missing'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.job_assignments'::regclass and contype='u' and pg_get_constraintdef(oid) like '%project_id, job_id%')
    or not exists(select 1 from pg_constraint where conrelid='public.job_assignments'::regclass and contype='u' and pg_get_constraintdef(oid) like '%project_id, driver_user_id, acceptance_idempotency_key%') then raise exception 'TEST_FAILED: assignment uniqueness missing'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.commission_reservations'::regclass and contype='u' and pg_get_constraintdef(oid) like '%project_id, job_id%') then raise exception 'TEST_FAILED: reservation per-job uniqueness missing'; end if;
  select lower(pg_get_constraintdef(oid)) into definition from pg_constraint where conrelid='public.commission_reservations'::regclass and contype='c' and lower(pg_get_constraintdef(oid)) like '%status in%' limit 1;
  select array_agg(status_match[1] order by status_match[1]) into actual from regexp_matches(definition,'''([^'']+)''','g') as status_match;
  if actual is distinct from expected then raise exception 'TEST_FAILED: reservation statuses are not exact'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.commission_reservations'::regclass and contype='c' and lower(pg_get_constraintdef(oid)) like '%round(final_price_snapshot * commission_rate_snapshot, 2)%') then raise exception 'TEST_FAILED: reservation amount formula missing'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.commission_reservations'::regclass and contype='f' and pg_get_constraintdef(oid) like '%project_id, user_id, ledger_transaction_id%') then raise exception 'TEST_FAILED: safe reservation ledger FK missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.job_assignments'::regclass and tgname='job_assignments_protect_provenance' and not tgisinternal)
    or not exists(select 1 from pg_trigger where tgrelid='public.commission_reservations'::regclass and tgname='commission_reservations_protect_provenance' and not tgisinternal) then raise exception 'TEST_FAILED: provenance guard missing'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='wallets' and column_name in ('balance','reserved_balance','available_balance')) then raise exception 'TEST_FAILED: mutable wallet balance exists'; end if;
  if to_regprocedure('app_private.marketplace_wallet_reserved_balance(uuid,uuid)') is null or to_regprocedure('app_private.marketplace_wallet_available_balance(uuid,uuid)') is null then raise exception 'TEST_FAILED: derived balance helpers missing'; end if;
  if has_function_privilege('anon','app_private.marketplace_wallet_reserved_balance(uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','app_private.marketplace_wallet_reserved_balance(uuid,uuid)','EXECUTE') or has_function_privilege('anon','app_private.marketplace_wallet_available_balance(uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','app_private.marketplace_wallet_available_balance(uuid,uuid)','EXECUTE') then raise exception 'TEST_FAILED: private balance helper executable by client'; end if;
  select lower(pg_get_functiondef('app_private.marketplace_wallet_reserved_balance(uuid,uuid)'::regprocedure)) into definition;
  if definition not like '%status = ''open''%' then raise exception 'TEST_FAILED: reserved balance is not open-only'; end if;
  select lower(pg_get_functiondef('app_private.marketplace_wallet_available_balance(uuid,uuid)'::regprocedure)) into definition;
  if definition not like '%marketplace_wallet_total_balance%' or definition not like '%marketplace_wallet_reserved_balance%' then raise exception 'TEST_FAILED: available balance formula incorrect'; end if;
  foreach relation_name in array array['public.accept_job(uuid,text,uuid)','public.advance_my_marketplace_job(uuid,text,uuid)','public.cancel_my_marketplace_job(uuid,text,uuid)'] loop
    if to_regprocedure(relation_name) is null then raise exception 'TEST_FAILED: missing RPC %',relation_name; end if;
    if has_function_privilege('anon',relation_name,'EXECUTE') then raise exception 'TEST_FAILED: anon executes %',relation_name; end if;
    if not exists (select 1 from pg_proc p where p.oid=relation_name::regprocedure and p.prosecdef and coalesce(p.proconfig,array[]::text[]) @> array['search_path=']) then raise exception 'TEST_FAILED: RPC % is not SECURITY DEFINER with an empty search_path',relation_name; end if;
  end loop;
  select lower(pg_get_functiondef('public.accept_job(uuid,text,uuid)'::regprocedure)) into function_definition;
  foreach definition in array array['auth.uid()', 'security definer', 'tuktuk-control', 'for update', 'has_active_marketplace_suite', 'has_confirmed_marketplace_initial_deposit', 'status <> ''published''', 'expires_at', 'is_active', 'is_available', 'marketplace_status=''active''', 'vehicle_services', 'passenger_count', 'cargo_weight_kg', 'cargo_volume_m3', 'cargo_length_cm', 'cargo_width_cm', 'cargo_height_cm', 'required_body_type', 'round(job_record.final_price * job_record.commission_rate_snapshot, 2)', 'available_balance < commission_amount', 'job_assignments', 'commission_reservations', 'status=''accepted''', 'action=''accept'''] loop
    if position(definition in function_definition)=0 then raise exception 'TEST_FAILED: accept_job lacks %',definition; end if;
  end loop;
  if position('from public.jobs where project_id=tuktuk_project_id and id=target_job_id for update' in function_definition)
       > position('from public.driver_vehicle_assignments d where d.project_id=tuktuk_project_id and d.driver_user_id=actor and d.vehicle_id=target_vehicle_id for update' in function_definition)
    or position('from public.driver_vehicle_assignments d where d.project_id=tuktuk_project_id and d.driver_user_id=actor and d.vehicle_id=target_vehicle_id for update' in function_definition)
       > position('from public.wallets w where w.project_id=tuktuk_project_id and w.user_id=actor for update' in function_definition) then raise exception 'TEST_FAILED: accept lock order invalid'; end if;
  if function_definition like '%insert into public.wallet_transactions%' then raise exception 'TEST_FAILED: accept must not debit ledger'; end if;
  select lower(pg_get_functiondef('public.advance_my_marketplace_job(uuid,text,uuid)'::regprocedure)) into function_definition;
  if function_definition not like '%start_en_route%' or function_definition not like '%mark_pickup%' or function_definition not like '%start_service%' or function_definition not like '%complete_service%' or function_definition like '%target_status%' or function_definition not like '%marketplace_job_transition_allowed%' or function_definition not like '%job_assignments%' or function_definition not like '%commission_reservations%' or function_definition not like '%job_commission%' or function_definition not like '%amount_delta%' or function_definition not like '%status=''consumed''%' or function_definition not like '%status=''settled''%' then raise exception 'TEST_FAILED: advance or settlement contract incomplete'; end if;
  select lower(pg_get_functiondef('public.cancel_my_marketplace_job(uuid,text,uuid)'::regprocedure)) into function_definition;
  foreach definition in array array['cancelled_by_driver','status=''released''','release_reason','status=''incident''','incident_from_status=''in_progress''','open_incident','is_available=is_active'] loop
    if position(definition in function_definition)=0 then raise exception 'TEST_FAILED: cancel contract lacks %',definition; end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('set_job_status','cancel_customer_marketplace_job')) then raise exception 'TEST_FAILED: forbidden public state RPC exists'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('jobs','job_assignments','commission_reservations') and column_name ~ '(phone|whatsapp|customer_name|display_name)') then raise exception 'TEST_FAILED: Marketplace work table contains PII'; end if;
  if to_regclass('public.ratings') is not null or to_regclass('public.disputes') is not null or to_regclass('public.outbox_events') is not null then raise exception 'TEST_FAILED: out-of-scope table exists'; end if;
end;
$$;

-- Dynamic tests require a local PostgreSQL/Supabase fixture with authenticated users,
-- active driver/vehicle/service records, an initial confirmed topup, and published jobs.
-- In that fixture verify competing acceptances, repeated idempotency keys, insufficient
-- available balance, all progress actions, atomic settlement, release on cancellation,
-- and incident opening. Keep every case inside this transaction and roll it back.
rollback;
