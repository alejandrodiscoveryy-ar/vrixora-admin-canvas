-- Regression verification for the transactional charge authorization boundary.
-- Run after applying 20260808120000_allow_accounting_transactional_charge.sql
-- to an isolated/local database. All write scenarios must run inside a
-- transaction that is rolled back.
--
-- Required test identities in the same project:
--   :owner_user_id       member with role owner
--   :accounting_user_id  member with role accounting
--   :marketing_user_id   member with role marketing
--   :unauthorized_user_id authenticated user without project membership
-- Required data:
--   :project_id, :license_id and :active_plan_code

-- Static RBAC assertions: accounting can manage payments but not licenses,
-- plans, or settings. Marketing cannot manage payments.
do $$
begin
  if not exists (
    select 1
    from public.project_role_permissions
    where role_code = 'accounting'
      and permission_code = 'payments.manage'
  ) then
    raise exception 'TEST_FAILED: accounting lacks payments.manage';
  end if;

  if exists (
    select 1
    from public.project_role_permissions
    where role_code = 'accounting'
      and permission_code in (
        'licenses.manage', 'plans.manage', 'settings.manage'
      )
  ) then
    raise exception 'TEST_FAILED: accounting has a forbidden management permission';
  end if;

  if exists (
    select 1
    from public.project_role_permissions
    where role_code = 'marketing'
      and permission_code = 'payments.manage'
  ) then
    raise exception 'TEST_FAILED: marketing can manage payments';
  end if;
end;
$$;

-- Execute each scenario in its own transaction/session, replacing placeholders.
-- The JWT subject is set exactly as PostgREST does for auth.uid().

-- 1) OWNER: expect a receipt JSON; ROLLBACK leaves no data behind.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_charge_and_assign_plan(
  ':license_id'::uuid,
  ':active_plan_code',
  (select price from public.license_plans
   where project_id = ':project_id'::uuid and code = ':active_plan_code'),
  'cash',
  'TEST-OWNER-' || gen_random_uuid(),
  now(),
  'Prueba de autorización owner',
  'after_expiry',
  gen_random_uuid()
);
rollback;

-- 2) ACCOUNTING: expect a receipt JSON; this proves payments.manage is enough
-- for the atomic payment + license + receipt + audit operation.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_charge_and_assign_plan(
  ':license_id'::uuid,
  ':active_plan_code',
  (select price from public.license_plans
   where project_id = ':project_id'::uuid and code = ':active_plan_code'),
  'cash',
  'TEST-ACCOUNTING-' || gen_random_uuid(),
  now(),
  'Prueba de autorización Cobros',
  'after_expiry',
  gen_random_uuid()
);
rollback;

-- 3) ACCOUNTING MANUAL LICENSE ADMINISTRATION: expect
-- PERMISSION_DENIED:licenses.manage.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select public.admin_update_license(
  ':license_id'::uuid,
  'renew',
  jsonb_build_object('duration_days', 1, 'reason', 'Debe ser rechazado')
);
rollback;

-- 4) MARKETING: expect PERMISSION_DENIED:payments.manage.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select public.admin_charge_and_assign_plan(
  ':license_id'::uuid, ':active_plan_code', 0, 'cash', null, now(),
  'Debe ser rechazado', 'after_expiry', gen_random_uuid()
);
rollback;

-- 5) AUTHENTICATED USER WITHOUT MEMBERSHIP: expect
-- PERMISSION_DENIED:payments.manage.
begin;
select set_config('request.jwt.claim.sub', ':unauthorized_user_id', true);
select public.admin_charge_and_assign_plan(
  ':license_id'::uuid, ':active_plan_code', 0, 'cash', null, now(),
  'Debe ser rechazado', 'after_expiry', gen_random_uuid()
);
rollback;
