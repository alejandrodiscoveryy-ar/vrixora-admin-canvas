-- P0-A integration verification. Run only in an isolated database after the
-- matching migration and replace every :placeholder.
--
-- Payment fixtures must all belong to :project_id/:client_id/:active_plan_code:
-- :within_window_payment_id is paid, older than 48 hours and matches the plan price/currency.
-- :outside_window_payment_id is paid but outside the invoice window.
-- :wrong_amount_payment_id and :wrong_currency_payment_id differ only in the named field.
-- :first_paid_payment_id and :renewal_paid_payment_id belong to :referred_user_id;
-- the former is deterministically first by charged_at, created_at and id.

create or replace function pg_temp.assert_raises(statement text, expected_message text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'TEST_FAILED: expected %, got %',expected_message,sqlerrm;
  end;
  raise exception 'TEST_FAILED: expected error % but statement succeeded',expected_message;
end;
$$;

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
  if exists(select 1 from pg_constraint where conrelid='public.preinvoices'::regclass
      and contype='f' and pg_get_constraintdef(oid) like '%plan_code%') then
    raise exception 'TEST_FAILED: pre-invoice still depends on live plan';
  end if;
end;
$$;

-- Owner settings and immutable document snapshot.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_set_exchange_settings(':project_id'::uuid,'USD','CUP','manual',320,'manual_owner');
select public.admin_set_test_mode(':project_id'::uuid,true);
select public.admin_set_referral_reward_days(':project_id'::uuid,15);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code','CUP',320,'manual_owner',false);
do $$
begin
  if not exists(select 1 from public.project_exchange_rate_history where project_id=':project_id'::uuid and rate=320 and changed_by=':owner_user_id'::uuid) then
    raise exception 'TEST_FAILED: manual exchange history missing actor';
  end if;
  if not exists(select 1 from public.preinvoices where project_id=':project_id'::uuid
      and expires_at=issued_at+interval '48 hours' and identity_snapshot ? 'whatsapp') then
    raise exception 'TEST_FAILED: snapshot, WhatsApp or 48-hour expiry missing';
  end if;
end;
$$;
select pg_temp.assert_raises(
  $$update public.preinvoices set identity_snapshot='{}' where project_id=':project_id'::uuid$$,
  'PREINVOICE_SNAPSHOT_IMMUTABLE'
);
rollback;

-- Accounting can prepare invoices but cannot alter project settings.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false);
select * from public.admin_list_preinvoices(':project_id'::uuid,false);
select pg_temp.assert_raises(
  $$select public.admin_set_test_mode(':project_id'::uuid,true)$$,
  'PERMISSION_DENIED:settings.manage'
);
rollback;

begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select pg_temp.assert_raises(
  $$select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false)$$,
  'PERMISSION_DENIED:payments.manage'
);
rollback;

begin;
select set_config('request.jwt.claim.sub', ':unauthorized_user_id', true);
select pg_temp.assert_raises(
  $$select * from public.admin_list_preinvoices(':project_id'::uuid,false)$$,
  'PERMISSION_DENIED:payments.view'
);
rollback;

-- A payment made inside the 48-hour window can be linked after administrative expiry.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false);
alter table public.preinvoices disable trigger p0a_guard_preinvoice_snapshot;
update public.preinvoices invoice set
  issued_at=payment.charged_at-interval '1 hour',
  expires_at=payment.charged_at+interval '47 hours'
from public.payments payment
where invoice.id=(select id from public.preinvoices where project_id=':project_id'::uuid order by created_at desc limit 1)
  and payment.id=':within_window_payment_id'::uuid;
alter table public.preinvoices enable trigger p0a_guard_preinvoice_snapshot;
select * from public.admin_list_preinvoices(':project_id'::uuid,false);
do $$ begin
  if not exists(select 1 from public.preinvoices where project_id=':project_id'::uuid
      and status='expired') then
    raise exception 'TEST_FAILED: fixture was not expired before late confirmation';
  end if;
end $$;
select public.admin_set_preinvoice_status(
  ':project_id'::uuid,
  (select id from public.preinvoices where project_id=':project_id'::uuid order by created_at desc limit 1),
  'paid',':within_window_payment_id'::uuid
);
do $$ begin
  if not exists(select 1 from public.preinvoices where project_id=':project_id'::uuid
      and paid_payment_id=':within_window_payment_id'::uuid and status='paid') then
    raise exception 'TEST_FAILED: valid late confirmation was not paid';
  end if;
end $$;
rollback;

-- Out-of-window payment expires the invoice instead of paying it.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false);
alter table public.preinvoices disable trigger p0a_guard_preinvoice_snapshot;
update public.preinvoices invoice set issued_at=now()-interval '72 hours',expires_at=now()-interval '24 hours'
where invoice.id=(select id from public.preinvoices where project_id=':project_id'::uuid order by created_at desc limit 1);
alter table public.preinvoices enable trigger p0a_guard_preinvoice_snapshot;
select public.admin_set_preinvoice_status(
  ':project_id'::uuid,
  (select id from public.preinvoices where project_id=':project_id'::uuid order by created_at desc limit 1),
  'paid',':outside_window_payment_id'::uuid
);
do $$ begin
  if not exists(select 1 from public.preinvoices where project_id=':project_id'::uuid
      and status='expired' and paid_payment_id is null) then
    raise exception 'TEST_FAILED: out-of-window payment did not expire invoice';
  end if;
end $$;
rollback;

-- Amount and currency are strict settlement keys.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false);
select pg_temp.assert_raises(format(
  'select public.admin_set_preinvoice_status(%L::uuid,%L::uuid,%L,%L::uuid)',
  ':project_id',(select id::text from public.preinvoices where project_id=':project_id'::uuid order by created_at desc limit 1),
  'paid',':wrong_amount_payment_id'), 'PREINVOICE_PAYMENT_MISMATCH');
select pg_temp.assert_raises(format(
  'select public.admin_set_preinvoice_status(%L::uuid,%L::uuid,%L,%L::uuid)',
  ':project_id',(select id::text from public.preinvoices where project_id=':project_id'::uuid order by created_at desc limit 1),
  'paid',':wrong_currency_payment_id'), 'PREINVOICE_PAYMENT_MISMATCH');
rollback;

-- Test operations are opt-in at creation, hidden by default and safely removable.
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
  if visible_count<>real_count then raise exception 'TEST_FAILED: test rows leaked into real list'; end if;
end;
$$;
select public.admin_delete_p0a_test_data(':project_id'::uuid);
do $$ begin
  if exists(select 1 from public.preinvoices where project_id=':project_id'::uuid and is_test) then
    raise exception 'TEST_FAILED: test cleanup incomplete';
  end if;
  if not exists(select 1 from public.preinvoices where project_id=':project_id'::uuid and not is_test) then
    raise exception 'TEST_FAILED: real pre-invoice was deleted';
  end if;
end $$;
select pg_temp.assert_raises(
  $$update public.preinvoices set is_test=true where project_id=':project_id'::uuid and not is_test$$,
  'PREINVOICE_SNAPSHOT_IMMUTABLE'
);
rollback;

-- Historical invoice survives physical removal of an otherwise unused plan.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
insert into public.license_plans(project_id,code,name,license_type,duration_days,price,currency,max_devices,features,description,active,is_featured)
select project_id,'p0a-history-test',name,license_type,duration_days,price,currency,max_devices,features,description,true,false
from public.license_plans where project_id=':project_id'::uuid and code=':active_plan_code';
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,'p0a-history-test',null,null,null,false);
delete from public.license_plans where project_id=':project_id'::uuid and code='p0a-history-test';
do $$ begin
  if not exists(select 1 from public.preinvoices where project_id=':project_id'::uuid and plan_code='p0a-history-test') then
    raise exception 'TEST_FAILED: historical invoice was not conserved';
  end if;
end $$;
rollback;

-- Only the first confirmed payment can create the one reward for a referred user.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_register_referral_relationship(
  ':project_id'::uuid,':referrer_user_id'::uuid,':referred_user_id'::uuid,'TEST',false
);
select pg_temp.assert_raises(
  $$select public.admin_register_referral_relationship(':project_id'::uuid,':referrer_user_id'::uuid,':referred_user_id'::uuid,'TEST',false)$$,
  'REFERRED_USER_ALREADY_REGISTERED'
);
select pg_temp.assert_raises(format(
  'select public.admin_create_referral_reward(%L::uuid,%L::uuid,%L::uuid,false)',
  ':project_id',(select id::text from public.referral_relationships where project_id=':project_id'::uuid and referred_user_id=':referred_user_id'::uuid),
  ':renewal_paid_payment_id'), 'FIRST_CONFIRMED_PAYMENT_REQUIRED');
select public.admin_create_referral_reward(
  ':project_id'::uuid,
  (select id from public.referral_relationships where project_id=':project_id'::uuid and referred_user_id=':referred_user_id'::uuid),
  ':first_paid_payment_id'::uuid,false
);
select pg_temp.assert_raises(format(
  'select public.admin_create_referral_reward(%L::uuid,%L::uuid,%L::uuid,false)',
  ':project_id',(select id::text from public.referral_relationships where project_id=':project_id'::uuid and referred_user_id=':referred_user_id'::uuid),
  ':first_paid_payment_id'), 'REFERRAL_REWARD_ALREADY_EXISTS');
rollback;
