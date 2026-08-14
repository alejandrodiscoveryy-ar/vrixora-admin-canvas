-- P0-A integration verification. Run only in an isolated database after the
-- matching migration. Replace every :placeholder before execution.

do $$
begin
  if not exists(select 1 from public.project_role_permissions where role_code='accounting' and permission_code='payments.manage') then
    raise exception 'TEST_FAILED: accounting must keep payments.manage';
  end if;
  if exists(select 1 from public.project_role_permissions where role_code='accounting' and permission_code in ('settings.manage','licenses.manage')) then
    raise exception 'TEST_FAILED: accounting gained forbidden permissions';
  end if;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public'
      and table_name in ('preinvoices','project_exchange_settings','project_exchange_rate_history',
        'project_test_settings','project_referral_settings','referral_relationships','referral_reward_ledger')
      and grantee in ('anon','authenticated')) then
    raise exception 'TEST_FAILED: P0-A tables expose direct grants';
  end if;
end;
$$;

-- OWNER: settings, manual exchange history and pre-invoice creation work.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_set_exchange_settings(':project_id'::uuid,'USD','CUP','manual',320,'manual_owner');
select public.admin_set_test_mode(':project_id'::uuid,true);
select public.admin_set_referral_reward_days(':project_id'::uuid,15);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code','CUP',320,'manual_owner',false);
select * from public.admin_list_preinvoices(':project_id'::uuid,false);
do $$
begin
  if not exists(select 1 from public.project_exchange_rate_history where project_id=':project_id'::uuid and rate=320 and changed_by=':owner_user_id'::uuid) then
    raise exception 'TEST_FAILED: manual exchange history missing actor';
  end if;
  if not exists(select 1 from public.preinvoices where project_id=':project_id'::uuid
      and expires_at=issued_at+interval '48 hours' and jsonb_typeof(identity_snapshot)='object') then
    raise exception 'TEST_FAILED: frozen snapshot or 48-hour expiry missing';
  end if;
end;
$$;
rollback;

-- ACCOUNTING: can create/list pre-invoices, but cannot alter global settings.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false);
select * from public.admin_list_preinvoices(':project_id'::uuid,false);
select public.admin_set_test_mode(':project_id'::uuid,true); -- expect PERMISSION_DENIED:settings.manage
rollback;

-- MARKETING and a non-member cannot create pre-invoices.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false);
rollback; -- expect PERMISSION_DENIED:payments.manage

begin;
select set_config('request.jwt.claim.sub', ':unauthorized_user_id', true);
select * from public.admin_list_preinvoices(':project_id'::uuid,false);
rollback; -- expect PERMISSION_DENIED:payments.view

-- Snapshots and is_test cannot be modified after creation; test rows are hidden
-- from the default list and safe cleanup leaves real rows untouched.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_set_test_mode(':project_id'::uuid,true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,true);
do $$
declare real_count bigint; visible_count bigint;
begin
  select count(*) into real_count from public.preinvoices where project_id=':project_id'::uuid and not is_test;
  select count(*) into visible_count from public.admin_list_preinvoices(':project_id'::uuid,false);
  if visible_count <> real_count then raise exception 'TEST_FAILED: test rows leaked into real list'; end if;
end;
$$;
select public.admin_delete_p0a_test_data(':project_id'::uuid);
do $$
begin
  if exists(select 1 from public.preinvoices where project_id=':project_id'::uuid and is_test) then
    raise exception 'TEST_FAILED: test cleanup incomplete';
  end if;
  if not exists(select 1 from public.preinvoices where project_id=':project_id'::uuid and not is_test) then
    raise exception 'TEST_FAILED: real pre-invoice was deleted';
  end if;
end;
$$;
update public.preinvoices set is_test=true where project_id=':project_id'::uuid and not is_test;
-- expect PREINVOICE_SNAPSHOT_IMMUTABLE
rollback;

-- Automatic expiry is materialized on authorized read.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false);
alter table public.preinvoices disable trigger p0a_guard_preinvoice_snapshot;
update public.preinvoices set issued_at=now()-interval '72 hours',expires_at=now()-interval '24 hours'
where project_id=':project_id'::uuid and status='prepared';
alter table public.preinvoices enable trigger p0a_guard_preinvoice_snapshot;
select * from public.admin_list_preinvoices(':project_id'::uuid,false);
do $$ begin
  if exists(select 1 from public.preinvoices where project_id=':project_id'::uuid and expires_at<=now() and status<>'expired') then
    raise exception 'TEST_FAILED: expired pre-invoice still open';
  end if;
end $$;
rollback;

-- Referral relation/reward uniqueness: repeat each call and expect the second
-- one to fail with REFERRED_USER_ALREADY_REGISTERED / REFERRAL_REWARD_ALREADY_EXISTS.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_register_referral_relationship(':project_id'::uuid,':referrer_user_id'::uuid,':referred_user_id'::uuid,'TEST',false);
select public.admin_register_referral_relationship(':project_id'::uuid,':referrer_user_id'::uuid,':referred_user_id'::uuid,'TEST',false);
rollback;
