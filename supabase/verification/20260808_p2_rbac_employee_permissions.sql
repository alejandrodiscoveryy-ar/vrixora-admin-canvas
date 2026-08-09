-- Apply the P2 migration in an isolated database before running this file.
-- Required identities: :owner_user_id, :accounting_user_id,
-- :marketing_user_id, :unauthorized_user_id and :project_id.

do $$
declare
  forbidden text;
begin
  if exists (
    select permission.code
    from public.project_permissions permission
    except
    select mapping.permission_code
    from public.project_role_permissions mapping
    where mapping.role_code = 'owner'
  ) then
    raise exception 'TEST_FAILED: owner does not have every permission';
  end if;

  if not exists (
    select 1 from public.project_role_permissions
    where role_code = 'accounting' and permission_code = 'payments.manage'
  ) then
    raise exception 'TEST_FAILED: accounting lacks payments.manage';
  end if;

  foreach forbidden in array array[
    'licenses.manage', 'members.manage', 'settings.manage',
    'whatsapp_settings.manage', 'payments.correct', 'audit.view'
  ] loop
    if exists (
      select 1 from public.project_role_permissions
      where role_code = 'accounting' and permission_code = forbidden
    ) then
      raise exception 'TEST_FAILED: accounting has %', forbidden;
    end if;
  end loop;

  foreach forbidden in array array[
    'payments.manage', 'payments.correct', 'licenses.manage',
    'members.manage', 'settings.manage', 'whatsapp_settings.manage', 'audit.view'
  ] loop
    if exists (
      select 1 from public.project_role_permissions
      where role_code = 'marketing' and permission_code = forbidden
    ) then
      raise exception 'TEST_FAILED: marketing has %', forbidden;
    end if;
  end loop;

  if not exists (
    select 1 from public.project_role_permissions
    where role_code = 'marketing' and permission_code = 'customers.view'
  ) or not exists (
    select 1 from public.project_role_permissions
    where role_code = 'marketing' and permission_code = 'analytics.view'
  ) then
    raise exception 'TEST_FAILED: marketing lacks commercial access';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'audit_project_members_changes' and not tgisinternal
  ) then
    raise exception 'TEST_FAILED: member audit trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.projects'::regclass
      and attname = 'owner_id'
      and attnotnull
      and not attisdropped
  ) then
    raise exception 'TEST_FAILED: a project could be left without owner_id';
  end if;
end;
$$;

-- OWNER: expect all permission checks to return true.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select bool_and(app_private.has_project_permission(':project_id'::uuid, code))
from public.project_permissions;
rollback;

-- ACCOUNTING: payments allowed; critical administration rejected.
begin;
select set_config('request.jwt.claim.sub', ':accounting_user_id', true);
select app_private.has_project_permission(':project_id'::uuid, 'payments.manage') as allowed;
select app_private.has_project_permission(':project_id'::uuid, 'licenses.manage') as rejected;
select app_private.has_project_permission(':project_id'::uuid, 'members.manage') as rejected;
select app_private.has_project_permission(':project_id'::uuid, 'settings.manage') as rejected;
select app_private.has_project_permission(':project_id'::uuid, 'whatsapp_settings.manage') as rejected;
rollback;

-- MARKETING: commercial reads allowed; critical writes rejected.
begin;
select set_config('request.jwt.claim.sub', ':marketing_user_id', true);
select app_private.has_project_permission(':project_id'::uuid, 'customers.view') as allowed;
select app_private.has_project_permission(':project_id'::uuid, 'analytics.view') as allowed;
select app_private.has_project_permission(':project_id'::uuid, 'payments.manage') as rejected;
select app_private.has_project_permission(':project_id'::uuid, 'licenses.manage') as rejected;
select app_private.has_project_permission(':project_id'::uuid, 'members.manage') as rejected;
select app_private.has_project_permission(':project_id'::uuid, 'settings.manage') as rejected;
rollback;

-- UNAUTHORIZED: expect PERMISSION_DENIED:members.manage.
begin;
select set_config('request.jwt.claim.sub', ':unauthorized_user_id', true);
select public.admin_upsert_project_member(
  ':project_id'::uuid, 'nobody@example.com', 'marketing'
);
rollback;

-- OWNER PROTECTION: both operations must be rejected.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_remove_project_member(':project_id'::uuid, ':owner_user_id'::uuid);
rollback;

begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_upsert_project_member(
  ':project_id'::uuid,
  (select email from public.profiles where id = ':owner_user_id'::uuid),
  'marketing'
);
rollback;

-- Legacy roles cannot be newly assigned: expect INVALID_ASSIGNABLE_ROLE.
begin;
select set_config('request.jwt.claim.sub', ':owner_user_id', true);
select public.admin_upsert_project_member(
  ':project_id'::uuid, 'employee@example.com', 'admin'
);
rollback;
