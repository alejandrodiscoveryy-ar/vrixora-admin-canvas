create or replace function public.admin_list_registered_clients(
  target_project_id uuid
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  registered_at timestamptz,
  license_id uuid,
  license_key text,
  plan text,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_owner(target_project_id);

  return query
  select
    profile.id,
    profile.email,
    profile.display_name,
    profile.created_at,
    current_license.id,
    current_license.license_key,
    coalesce(current_license.plan, 'trial'),
    coalesce(
      current_license.status,
      case
        when now() < profile.created_at + interval '30 days' then 'active'
        else 'expired'
      end
    ),
    coalesce(current_license.expires_at, profile.created_at + interval '30 days')
  from public.profiles as profile
  left join lateral (
    select license.*
    from public.licenses as license
    where license.project_id = target_project_id
      and license.user_id = profile.id
    order by license.created_at desc
    limit 1
  ) as current_license on true
  order by profile.created_at desc;
end;
$$;

revoke all on function public.admin_list_registered_clients(uuid) from public, anon;
grant execute on function public.admin_list_registered_clients(uuid) to authenticated;
