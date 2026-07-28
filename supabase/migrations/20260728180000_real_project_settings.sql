alter table public.projects
  add column if not exists notify_license_expiry boolean not null default true,
  add column if not exists auto_renew_verified_payments boolean not null default false;

create or replace function public.admin_update_project_settings(
  target_project_id uuid,
  target_name text,
  target_description text,
  target_notify_license_expiry boolean,
  target_auto_renew_verified_payments boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not app_private.is_project_owner(target_project_id) then
    raise exception 'Only the project owner can update project settings'
      using errcode = '42501';
  end if;

  if nullif(btrim(target_name), '') is null then
    raise exception 'Project name is required'
      using errcode = '22023';
  end if;

  update public.projects
  set name = btrim(target_name),
      description = nullif(btrim(target_description), ''),
      notify_license_expiry = target_notify_license_expiry,
      auto_renew_verified_payments = target_auto_renew_verified_payments,
      updated_at = now()
  where id = target_project_id;

  if not found then
    raise exception 'Project not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_update_project_settings(
  uuid, text, text, boolean, boolean
) from public;
grant execute on function public.admin_update_project_settings(
  uuid, text, text, boolean, boolean
) to authenticated;
