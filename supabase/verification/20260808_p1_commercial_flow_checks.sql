-- Run in an isolated database after the P1 migration. Replace psql variables
-- with test identities/data. Expected failures are documented per scenario.

do $$
begin
  if not exists (
    select 1 from public.project_role_permissions
    where role_code = 'accounting' and permission_code = 'payments.manage'
  ) then
    raise exception 'TEST_FAILED: accounting lacks payments.manage';
  end if;

  if exists (
    select 1 from public.project_role_permissions
    where role_code = 'accounting'
      and permission_code in ('licenses.manage', 'plans.manage', 'settings.manage')
  ) then
    raise exception 'TEST_FAILED: accounting has a forbidden permission';
  end if;

  if exists (
    select 1 from public.project_role_permissions
    where role_code = 'marketing' and permission_code = 'payments.manage'
  ) then
    raise exception 'TEST_FAILED: marketing can charge';
  end if;
end;
$$;

-- OWNER: expect receipt; rollback proves the complete flow is transactional.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_charge_and_assign_plan_with_client_phone(
  ':license_id'::uuid, ':active_plan_code',
  (select price from public.license_plans where project_id = ':project_id'::uuid and code = ':active_plan_code'),
  'cash', 'TEST-P1-OWNER', now(), 'Owner P1', 'after_expiry', gen_random_uuid(),
  '+5351234567', true
);
rollback;

-- Same E.164 number with spaces, parentheses and hyphens: expect
-- client_whatsapp_updated=false and no WhatsApp audit entry.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
update public.profiles
set phone = '+53 (512) 345-67'
where id = (select user_id from public.licenses where id = ':license_id'::uuid);
select (
  public.admin_charge_and_assign_plan_with_client_phone(
    ':license_id'::uuid, ':active_plan_code',
    (select price from public.license_plans where project_id = ':project_id'::uuid and code = ':active_plan_code'),
    'cash', 'TEST-P1-SAME-PHONE', now(), 'Mismo número normalizado',
    'after_expiry', gen_random_uuid(), '+5351234567', false
  ) ->> 'client_whatsapp_updated'
)::boolean = false as same_formatted_phone_is_not_changed;
rollback;

-- COBROS: expect receipt and client_whatsapp_updated=true.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_charge_and_assign_plan_with_client_phone(
  ':license_id'::uuid, ':active_plan_code',
  (select price from public.license_plans where project_id = ':project_id'::uuid and code = ':active_plan_code'),
  'cash', 'TEST-P1-ACCOUNTING', now(), 'Cobros P1', 'after_expiry', gen_random_uuid(),
  '+5350000002', true
);
rollback;

-- COBROS manual license administration: expect PERMISSION_DENIED:licenses.manage.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_update_license(
  ':license_id'::uuid, 'renew',
  jsonb_build_object('duration_days', 1, 'reason', 'Debe ser rechazado')
);
rollback;

-- MARKETING: expect PERMISSION_DENIED:payments.manage.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select public.admin_charge_and_assign_plan_with_client_phone(
  ':license_id'::uuid, ':active_plan_code', 0, 'cash', null, now(),
  'Debe ser rechazado', 'after_expiry', gen_random_uuid(), null, false
);
rollback;

-- USER WITHOUT MEMBERSHIP: expect PERMISSION_DENIED:payments.manage.
begin;
select set_config('request.jwt.claim.sub', ':unauthorized_user_id', true);
select public.admin_charge_and_assign_plan_with_client_phone(
  ':license_id'::uuid, ':active_plan_code', 0, 'cash', null, now(),
  'Debe ser rechazado', 'after_expiry', gen_random_uuid(), null, false
);
rollback;

-- A changed number without confirmation: expect
-- CLIENT_WHATSAPP_CHANGE_CONFIRMATION_REQUIRED and no writes.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_charge_and_assign_plan_with_client_phone(
  ':license_id'::uuid, ':active_plan_code', 0, 'cash', null, now(),
  'Debe ser rechazado', 'after_expiry', gen_random_uuid(), '+5350000003', false
);
rollback;

-- Number without leading +: expect INVALID_CLIENT_WHATSAPP and no writes.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_charge_and_assign_plan_with_client_phone(
  ':license_id'::uuid, ':active_plan_code', 0, 'cash', null, now(),
  'Debe ser rechazado', 'after_expiry', gen_random_uuid(), '5351234567', true
);
rollback;

-- Invalid number: expect INVALID_CLIENT_WHATSAPP and no writes.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_charge_and_assign_plan_with_client_phone(
  ':license_id'::uuid, ':active_plan_code', 0, 'cash', null, now(),
  'Debe ser rechazado', 'after_expiry', gen_random_uuid(), 'not-a-phone', true
);
rollback;
