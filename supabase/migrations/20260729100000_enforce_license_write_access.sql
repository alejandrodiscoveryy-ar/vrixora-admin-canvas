insert into public.license_plans (
  code,
  name,
  license_type,
  duration_days,
  price,
  currency,
  max_devices,
  features,
  description,
  active,
  is_featured
)
values (
  'trial',
  'Prueba inicial',
  'trial',
  30,
  0,
  'CUP',
  1,
  '{}'::jsonb,
  'Acceso inicial durante 30 días desde el primer registro.',
  true,
  false
)
on conflict (code) do update
set name = excluded.name,
    license_type = excluded.license_type,
    duration_days = excluded.duration_days,
    price = excluded.price,
    currency = excluded.currency,
    max_devices = excluded.max_devices,
    features = excluded.features,
    description = excluded.description,
    active = excluded.active;

create or replace function app_private.has_active_write_license(target_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.licenses
      where user_id = target_user_id
    ) then exists (
      select 1
      from public.licenses
      where user_id = target_user_id
        and status = 'active'
        and (expires_at is null or expires_at > now())
    )
    else exists (
      select 1
      from public.profiles
      where id = target_user_id
        and created_at + interval '30 days' > now()
    )
  end;
$$;

revoke all on function app_private.has_active_write_license(uuid) from public, anon;
grant execute on function app_private.has_active_write_license(uuid) to authenticated;

drop policy if exists "Users insert only their synchronized data" on public.sync_entities;
drop policy if exists "Users update only their synchronized data" on public.sync_entities;
drop policy if exists "Users delete only their synchronized data" on public.sync_entities;

create policy "Active users insert their synchronized data"
on public.sync_entities
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and app_private.has_active_write_license((select auth.uid()))
);

create policy "Active users update their synchronized data"
on public.sync_entities
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and app_private.has_active_write_license((select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and app_private.has_active_write_license((select auth.uid()))
);

create policy "Active users delete their synchronized data"
on public.sync_entities
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and app_private.has_active_write_license((select auth.uid()))
);

revoke insert, update, delete, truncate on public.sync_entities from anon;

create or replace function public.admin_set_client_license_status(
  target_project_id uuid,
  target_user_id uuid,
  target_status text,
  target_reason text default null
)
returns public.licenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  target_license public.licenses%rowtype;
  normalized_reason text := nullif(btrim(target_reason), '');
begin
  perform app_private.require_project_owner(target_project_id);

  if target_status not in ('active', 'pending', 'expired', 'suspended', 'revoked') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  if target_status in ('suspended', 'revoked') and normalized_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into target_profile
  from public.profiles
  where id = target_user_id;

  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into target_license
  from public.licenses
  where project_id = target_project_id
    and user_id = target_user_id
  for update;

  if found then
    if target_status = 'active'
       and target_license.expires_at is not null
       and target_license.expires_at <= now() then
      target_license := public.admin_update_license(
        target_license.id,
        'extend',
        jsonb_build_object(
          'days', 30,
          'reason', coalesce(normalized_reason, 'Reactivación por 30 días desde Clientes')
        )
      );
    end if;

    return public.admin_update_license(
      target_license.id,
      'status',
      jsonb_build_object(
        'status', target_status,
        'reason', coalesce(normalized_reason, 'Estado actualizado desde Clientes')
      )
    );
  end if;

  return public.admin_create_license(
    target_project_id,
    target_profile.email,
    'trial',
    'trial',
    target_status,
    30,
    case
      when target_status = 'active'
       and target_profile.created_at + interval '30 days' <= now() then now()
      else target_profile.created_at
    end,
    1,
    '{}'::jsonb,
    coalesce(normalized_reason, 'Licencia inicial administrada desde Clientes'),
    null
  );
end;
$$;

revoke all on function public.admin_set_client_license_status(
  uuid, uuid, text, text
) from public, anon;
grant execute on function public.admin_set_client_license_status(
  uuid, uuid, text, text
) to authenticated;
