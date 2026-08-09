-- Close the production RBAC matrix to the three roles defined by the PRD.

insert into public.project_role_permissions(role_code, permission_code)
select 'owner', permission.code
from public.project_permissions permission
on conflict do nothing;

delete from public.project_role_permissions
where role_code = 'accounting'
  and permission_code not in (
    'project.view', 'customers.view', 'licenses.view', 'plans.view',
    'payments.view', 'payments.manage', 'analytics.view'
  );

insert into public.project_role_permissions(role_code, permission_code)
values
  ('accounting', 'project.view'),
  ('accounting', 'customers.view'),
  ('accounting', 'licenses.view'),
  ('accounting', 'plans.view'),
  ('accounting', 'payments.view'),
  ('accounting', 'payments.manage'),
  ('accounting', 'analytics.view')
on conflict do nothing;

delete from public.project_role_permissions
where role_code = 'marketing'
  and permission_code not in (
    'project.view', 'customers.view', 'plans.view', 'analytics.view'
  );

insert into public.project_role_permissions(role_code, permission_code)
values
  ('marketing', 'project.view'),
  ('marketing', 'customers.view'),
  ('marketing', 'plans.view'),
  ('marketing', 'analytics.view')
on conflict do nothing;

create or replace function public.admin_upsert_project_member(
  target_project_id uuid,
  target_email text,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  perform app_private.require_project_permission(target_project_id, 'members.manage');

  if target_role not in ('accounting', 'marketing') then
    raise exception 'INVALID_ASSIGNABLE_ROLE' using errcode = '22023';
  end if;

  select id into target_user_id
  from public.profiles
  where lower(email) = lower(btrim(target_email));

  if target_user_id is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.projects
    where id = target_project_id and owner_id = target_user_id
  ) then
    raise exception 'PROJECT_OWNER_ROLE_CANNOT_CHANGE' using errcode = '42501';
  end if;

  insert into public.project_members(project_id, user_id, role)
  values (target_project_id, target_user_id, target_role)
  on conflict (project_id, user_id) do update
  set role = excluded.role;
end;
$$;

revoke all on function public.admin_upsert_project_member(uuid, text, text)
  from public, anon;
grant execute on function public.admin_upsert_project_member(uuid, text, text)
  to authenticated;
