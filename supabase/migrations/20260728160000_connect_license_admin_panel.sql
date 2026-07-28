create or replace function app_private.require_project_owner(target_project_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not app_private.is_project_owner(target_project_id) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function app_private.generate_license_key()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select 'VRX-' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16));
$$;

create or replace function public.admin_list_licenses(target_project_id uuid)
returns table (
  id uuid,
  project_id uuid,
  user_id uuid,
  user_email text,
  license_key text,
  license_type text,
  plan text,
  status text,
  duration_days integer,
  max_devices integer,
  active_devices bigint,
  features jsonb,
  notes text,
  activated_at timestamptz,
  expires_at timestamptz,
  last_validation timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_owner(target_project_id);
  return query
  select
    l.id, l.project_id, l.user_id, p.email, l.license_key, l.license_type,
    l.plan, l.status, l.duration_days, l.max_devices,
    count(d.id) filter (where d.revoked_at is null), l.features, l.notes,
    l.activated_at, l.expires_at, l.last_validation, l.revoked_at, l.created_at
  from public.licenses l
  join public.profiles p on p.id = l.user_id
  left join public.license_devices d on d.license_id = l.id
  where l.project_id = target_project_id
  group by l.id, p.email
  order by l.created_at desc;
end;
$$;

create or replace function public.admin_create_license(
  target_project_id uuid,
  target_email text,
  target_license_type text,
  target_plan text,
  target_status text default 'pending',
  target_duration_days integer default null,
  target_activated_at timestamptz default now(),
  target_max_devices integer default null,
  target_features jsonb default null,
  target_notes text default null,
  target_license_key text default null
)
returns public.licenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  target_user_id uuid;
  created_license public.licenses%rowtype;
begin
  actor := app_private.require_project_owner(target_project_id);
  select id into target_user_id
  from public.profiles
  where lower(email) = lower(btrim(target_email));

  if target_user_id is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.licenses
    where project_id = target_project_id and user_id = target_user_id
  ) then
    raise exception 'LICENSE_ALREADY_EXISTS' using errcode = '23505';
  end if;

  insert into public.licenses (
    project_id, user_id, license_key, license_type, plan, status,
    duration_days, max_devices, features, notes, activated_at, created_by
  ) values (
    target_project_id, target_user_id,
    coalesce(nullif(btrim(target_license_key), ''), app_private.generate_license_key()),
    target_license_type, target_plan, target_status, target_duration_days,
    target_max_devices, target_features, nullif(btrim(target_notes), ''),
    target_activated_at, actor
  )
  returning * into created_license;

  insert into public.license_audit_log
    (project_id, license_id, action, detail, actor_id, metadata)
  values (
    target_project_id, created_license.id, 'license_created',
    'Licencia creada desde el panel administrativo', actor,
    jsonb_build_object('new', to_jsonb(created_license))
  );
  return created_license;
end;
$$;

create or replace function public.admin_update_license(
  target_license_id uuid,
  operation text,
  payload jsonb default '{}'::jsonb
)
returns public.licenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  previous_license public.licenses%rowtype;
  updated_license public.licenses%rowtype;
  days_to_add integer;
  new_status text;
  reason text := nullif(btrim(payload->>'reason'), '');
begin
  select * into previous_license from public.licenses
  where id = target_license_id for update;
  if not found then raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002'; end if;
  actor := app_private.require_project_owner(previous_license.project_id);

  if operation = 'renew' then
    updated_license := public.renew_license(
      target_license_id,
      nullif(payload->>'duration_days', '')::integer,
      coalesce(reason, 'Renovación desde el panel administrativo')
    );
    if nullif(payload->>'plan', '') is not null
       or nullif(payload->>'license_type', '') is not null then
      update public.licenses set
        plan = coalesce(nullif(payload->>'plan', ''), plan),
        license_type = coalesce(nullif(payload->>'license_type', ''), license_type)
      where id = target_license_id returning * into updated_license;
    end if;
    return updated_license;
  elsif operation = 'status' then
    new_status := payload->>'status';
    if new_status not in ('active','pending','expired','suspended','revoked') then
      raise exception 'INVALID_STATUS' using errcode = '22023';
    end if;
    if new_status in ('suspended','revoked') and reason is null then
      raise exception 'REASON_REQUIRED' using errcode = '22023';
    end if;
    update public.licenses set status = new_status
    where id = target_license_id returning * into updated_license;
  elsif operation = 'extend' then
    days_to_add := nullif(payload->>'days', '')::integer;
    if days_to_add is null or days_to_add <= 0 or reason is null then
      raise exception 'POSITIVE_DAYS_AND_REASON_REQUIRED' using errcode = '22023';
    end if;
    update public.licenses set
      expires_at = greatest(now(), coalesce(expires_at, now())) + make_interval(days => days_to_add),
      duration_days = coalesce(duration_days, 0) + days_to_add
    where id = target_license_id returning * into updated_license;
  elsif operation = 'plan' then
    update public.licenses set
      plan = coalesce(nullif(payload->>'plan', ''), plan),
      license_type = coalesce(nullif(payload->>'license_type', ''), license_type),
      duration_days = nullif(payload->>'duration_days', '')::integer,
      max_devices = null,
      features = null
    where id = target_license_id returning * into updated_license;
  else
    raise exception 'INVALID_OPERATION' using errcode = '22023';
  end if;

  insert into public.license_audit_log
    (project_id, license_id, action, detail, actor_id, metadata)
  values (
    previous_license.project_id, target_license_id,
    'license_' || operation, coalesce(reason, 'Operación administrativa: ' || operation),
    actor, jsonb_build_object(
      'operation', operation, 'previous', to_jsonb(previous_license),
      'new', to_jsonb(updated_license), 'payload', payload
    )
  );
  return updated_license;
end;
$$;

create or replace function public.admin_manage_license_device(
  target_device_id uuid,
  operation text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  target_device public.license_devices%rowtype;
  target_license public.licenses%rowtype;
begin
  select * into target_device from public.license_devices where id = target_device_id for update;
  if not found then raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into target_license from public.licenses where id = target_device.license_id;
  actor := app_private.require_project_owner(target_license.project_id);

  if operation = 'block' then
    update public.license_devices set revoked_at = now() where id = target_device_id;
  elsif operation = 'remove' then
    delete from public.license_devices where id = target_device_id;
  else
    raise exception 'INVALID_DEVICE_OPERATION' using errcode = '22023';
  end if;

  insert into public.license_audit_log
    (project_id, license_id, action, detail, actor_id, metadata)
  values (
    target_license.project_id, target_license.id, 'device_' || operation,
    coalesce(nullif(btrim(reason), ''), 'Dispositivo ' || operation),
    actor, jsonb_build_object('device_id', target_device.id, 'previous', to_jsonb(target_device))
  );
end;
$$;

create or replace function public.admin_reset_license_devices(
  target_license_id uuid,
  reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  target_license public.licenses%rowtype;
  affected integer;
begin
  select * into target_license from public.licenses where id = target_license_id for update;
  if not found then raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002'; end if;
  actor := app_private.require_project_owner(target_license.project_id);
  if nullif(btrim(reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.license_devices set revoked_at = now()
  where license_id = target_license_id and revoked_at is null;
  get diagnostics affected = row_count;
  insert into public.license_audit_log
    (project_id, license_id, action, detail, actor_id, metadata)
  values (
    target_license.project_id, target_license.id, 'devices_reset',
    reason, actor, jsonb_build_object('devices_revoked', affected)
  );
  return affected;
end;
$$;

revoke all on function public.admin_list_licenses(uuid) from public, anon;
revoke all on function public.admin_create_license(uuid,text,text,text,text,integer,timestamptz,integer,jsonb,text,text) from public, anon;
revoke all on function public.admin_update_license(uuid,text,jsonb) from public, anon;
revoke all on function public.admin_manage_license_device(uuid,text,text) from public, anon;
revoke all on function public.admin_reset_license_devices(uuid,text) from public, anon;

grant execute on function public.admin_list_licenses(uuid) to authenticated;
grant execute on function public.admin_create_license(uuid,text,text,text,text,integer,timestamptz,integer,jsonb,text,text) to authenticated;
grant execute on function public.admin_update_license(uuid,text,jsonb) to authenticated;
grant execute on function public.admin_manage_license_device(uuid,text,text) to authenticated;
grant execute on function public.admin_reset_license_devices(uuid,text) to authenticated;
