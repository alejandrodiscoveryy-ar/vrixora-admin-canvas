alter table public.profiles
  add column if not exists phone text;

update public.profiles profile
set phone = nullif(btrim(coalesce(auth_user.phone, auth_user.raw_user_meta_data ->> 'phone')), '')
from auth.users auth_user
where auth_user.id = profile.id
  and profile.phone is null
  and nullif(btrim(coalesce(auth_user.phone, auth_user.raw_user_meta_data ->> 'phone')), '') is not null;

drop function if exists public.admin_list_registered_clients(uuid);

create function public.admin_list_registered_clients(target_project_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  phone text,
  avatar_url text,
  registered_at timestamptz,
  license_id uuid,
  license_key text,
  plan text,
  status text,
  activated_at timestamptz,
  expires_at timestamptz,
  max_devices integer,
  active_devices bigint,
  last_payment_at timestamptz,
  last_payment_amount numeric,
  last_payment_currency text,
  last_renewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'customers.view');

  return query
  select
    profile.id,
    profile.email,
    profile.display_name,
    profile.phone,
    profile.avatar_url,
    profile.created_at,
    current_license.id,
    current_license.license_key,
    coalesce(current_license.plan, project.default_trial_plan, 'trial'),
    coalesce(
      current_license.status,
      case
        when now() < profile.created_at + interval '30 days' then 'active'
        else 'expired'
      end
    ),
    coalesce(current_license.activated_at, profile.created_at),
    coalesce(current_license.expires_at, profile.created_at + interval '30 days'),
    coalesce(current_license.max_devices, 1),
    coalesce(device_totals.active_devices, 0),
    last_payment.created_at,
    last_payment.amount,
    last_payment.currency,
    current_license.last_renewed_at
  from public.projects project
  cross join public.profiles profile
  left join lateral (
    select license.*
    from public.licenses license
    where license.project_id = target_project_id
      and license.user_id = profile.id
    order by license.created_at desc
    limit 1
  ) current_license on true
  left join lateral (
    select count(*)::bigint as active_devices
    from public.license_devices device
    where device.license_id = current_license.id
      and device.revoked_at is null
  ) device_totals on true
  left join lateral (
    select payment.created_at, payment.amount, payment.currency
    from public.payments payment
    where payment.project_id = target_project_id
      and payment.license_id = current_license.id
      and payment.status = 'paid'
    order by payment.created_at desc
    limit 1
  ) last_payment on true
  where project.id = target_project_id
  order by profile.created_at desc;
end;
$$;

revoke all on function public.admin_list_registered_clients(uuid) from public, anon;
grant execute on function public.admin_list_registered_clients(uuid) to authenticated;
