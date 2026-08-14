-- P0-C integration verification. Run in an isolated database after applying the
-- matching migration and replace every :placeholder. Every block rolls back.

create or replace function pg_temp.assert_raises(statement text, expected_message text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'TEST_FAILED: expected %, got %',expected_message,sqlerrm;
  end;
  raise exception 'TEST_FAILED: expected error % but statement succeeded',expected_message;
end;
$$;

do $$
begin
  if has_function_privilege('anon','public.admin_confirm_preinvoice_payment(uuid,uuid,numeric,text,text,text,timestamptz,text,uuid)','execute') then
    raise exception 'TEST_FAILED: anonymous can confirm preinvoices';
  end if;
  if not has_function_privilege('authenticated','public.admin_confirm_preinvoice_payment(uuid,uuid,numeric,text,text,text,timestamptz,text,uuid)','execute') then
    raise exception 'TEST_FAILED: authenticated cannot reach secured RPC';
  end if;
  if exists(select 1 from public.project_role_permissions where role_code='accounting' and permission_code='licenses.manage') then
    raise exception 'TEST_FAILED: accounting gained licenses.manage';
  end if;
end;
$$;

-- Accounting prepares and confirms the exact frozen amount inside one transaction.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false) as preinvoice_id \gset
select public.admin_preview_preinvoice_confirmation(':project_id'::uuid,:'preinvoice_id'::uuid,now());
select public.admin_confirm_preinvoice_payment(
  ':project_id'::uuid,:'preinvoice_id'::uuid,
  (select charge_amount from public.preinvoices where id=:'preinvoice_id'::uuid),
  (select charge_currency from public.preinvoices where id=:'preinvoice_id'::uuid),
  'transfer','P0C-VERIFY',now(),null,gen_random_uuid()
) as receipt \gset
do $$
declare invoice public.preinvoices%rowtype; payment public.payments%rowtype;
begin
  select * into invoice from public.preinvoices where id=:'preinvoice_id'::uuid;
  select * into payment from public.payments where id=invoice.paid_payment_id;
  if invoice.status<>'paid' or payment.preinvoice_id<>invoice.id or payment.is_test then
    raise exception 'TEST_FAILED: preinvoice/payment relation missing';
  end if;
  if payment.amount<>invoice.charge_amount or payment.currency<>invoice.charge_currency then
    raise exception 'TEST_FAILED: frozen amount/currency not respected';
  end if;
  if payment.billing_snapshot->>'exchange_rate' is null
     or not exists(select 1 from public.billing_receipts receipt where receipt.payment_id=payment.id and receipt.snapshot ? 'identity_snapshot') then
    raise exception 'TEST_FAILED: billing or identity snapshot missing';
  end if;
end;
$$;
-- Same request is idempotent and cannot create another payment.
select public.admin_confirm_preinvoice_payment(
  ':project_id'::uuid,:'preinvoice_id'::uuid,
  (select charge_amount from public.preinvoices where id=:'preinvoice_id'::uuid),
  (select charge_currency from public.preinvoices where id=:'preinvoice_id'::uuid),
  'transfer','P0C-VERIFY',now(),null,
  (select idempotency_key from public.payments where preinvoice_id=:'preinvoice_id'::uuid)
);
rollback;

-- Exact amount, currency and 48-hour payment occurrence are enforced.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,false) as invoice_error_id \gset
select pg_temp.assert_raises(format(
  'select public.admin_confirm_preinvoice_payment(%L,%L,%L,%L,%L,null,now(),null,gen_random_uuid())',
  ':project_id',:'invoice_error_id',-1,(select charge_currency from public.preinvoices where id=:'invoice_error_id'::uuid),'cash'
),'PREINVOICE_PAYMENT_MISMATCH');
select pg_temp.assert_raises(format(
  'select public.admin_confirm_preinvoice_payment(%L,%L,%L,%L,%L,null,now(),null,gen_random_uuid())',
  ':project_id',:'invoice_error_id',(select charge_amount from public.preinvoices where id=:'invoice_error_id'::uuid),'EUR','cash'
),'PREINVOICE_PAYMENT_MISMATCH');
select pg_temp.assert_raises(format(
  'select public.admin_confirm_preinvoice_payment(%L,%L,%L,%L,%L,null,%L,null,gen_random_uuid())',
  ':project_id',:'invoice_error_id',(select charge_amount from public.preinvoices where id=:'invoice_error_id'::uuid),
  (select charge_currency from public.preinvoices where id=:'invoice_error_id'::uuid),'cash',
  (select expires_at+interval '1 second' from public.preinvoices where id=:'invoice_error_id'::uuid)
),'PAYMENT_OUTSIDE_PREINVOICE_VALIDITY');
rollback;

-- Test operations require enabled test mode, never mutate the real license and
-- never generate real analytics or referral rewards.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_set_test_mode(':project_id'::uuid,true);
select public.admin_create_preinvoice(':project_id'::uuid,':client_id'::uuid,':active_plan_code',null,null,null,true) as test_invoice_id \gset
create temporary table before_license on commit drop as
  select id,plan,activated_at,expires_at,last_payment_id from public.licenses
  where project_id=':project_id'::uuid and user_id=':client_id'::uuid;
select public.admin_confirm_preinvoice_payment(
  ':project_id'::uuid,:'test_invoice_id'::uuid,
  (select charge_amount from public.preinvoices where id=:'test_invoice_id'::uuid),
  (select charge_currency from public.preinvoices where id=:'test_invoice_id'::uuid),
  'cash','P0C-TEST',now(),null,gen_random_uuid()
);
do $$
begin
  if exists(select 1 from before_license before join public.licenses license using(id)
    where (before.plan,before.activated_at,before.expires_at,before.last_payment_id)
      is distinct from (license.plan,license.activated_at,license.expires_at,license.last_payment_id)) then
    raise exception 'TEST_FAILED: test payment mutated real license';
  end if;
  if exists(select 1 from public.analytics_events event join public.payments payment
    on event.dedupe_key='payment:'||payment.id::text where payment.preinvoice_id=:'test_invoice_id'::uuid) then
    raise exception 'TEST_FAILED: test payment contaminated analytics';
  end if;
end;
$$;
rollback;

-- Marketing and unauthorized users are rejected by the backend.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select pg_temp.assert_raises(
  $$select public.admin_preview_preinvoice_confirmation(':project_id'::uuid,':existing_preinvoice_id'::uuid,now())$$,
  'PERMISSION_DENIED:payments.manage'
);
rollback;

begin;
select set_config('request.jwt.claim.sub', ':unauthorized_user_id', true);
select pg_temp.assert_raises(
  $$select public.admin_preview_preinvoice_confirmation(':project_id'::uuid,':existing_preinvoice_id'::uuid,now())$$,
  'PERMISSION_DENIED:payments.manage'
);
rollback;
