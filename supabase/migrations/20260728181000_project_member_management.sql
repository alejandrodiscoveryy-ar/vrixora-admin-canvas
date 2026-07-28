create or replace function public.admin_add_project_member_by_email(
  target_project_id uuid,
  target_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if auth.uid() is null or not app_private.is_project_owner(target_project_id) then
    raise exception 'Only the project owner can add members'
      using errcode = '42501';
  end if;

  select id into target_user_id
  from public.profiles
  where lower(email) = lower(btrim(target_email));

  if target_user_id is null then
    raise exception 'The user does not exist'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.projects
    where id = target_project_id and owner_id = target_user_id
  ) then
    raise exception 'The project owner is already assigned'
      using errcode = '22023';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (target_project_id, target_user_id, 'employee')
  on conflict (project_id, user_id)
  do update set role = 'employee';
end;
$$;

create or replace function public.admin_remove_project_member(
  target_project_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not app_private.is_project_owner(target_project_id) then
    raise exception 'Only the project owner can remove members'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.projects
    where id = target_project_id and owner_id = target_user_id
  ) then
    raise exception 'The project owner cannot be removed'
      using errcode = '42501';
  end if;

  delete from public.project_members
  where project_id = target_project_id and user_id = target_user_id;
end;
$$;

revoke all on function public.admin_add_project_member_by_email(uuid, text) from public;
revoke all on function public.admin_remove_project_member(uuid, uuid) from public;
grant execute on function public.admin_add_project_member_by_email(uuid, text) to authenticated;
grant execute on function public.admin_remove_project_member(uuid, uuid) to authenticated;
