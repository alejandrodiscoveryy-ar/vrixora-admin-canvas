create table public.license_types (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (btrim(name) <> ''),
  default_duration_days integer check (default_duration_days > 0),
  allows_custom_duration boolean not null default false,
  never_expires boolean not null default false,
  default_max_devices integer not null default 1 check (default_max_devices > 0),
  default_features jsonb not null default '{}'::jsonb
    check (jsonb_typeof(default_features) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (never_expires and default_duration_days is null)
    or (not never_expires and (default_duration_days is not null or allows_custom_duration))
  )
);

create table public.license_plans (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (btrim(name) <> ''),
  max_devices integer not null default 1 check (max_devices > 0),
  features jsonb not null default '{}'::jsonb
    check (jsonb_typeof(features) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.license_types (
  code,
  name,
  default_duration_days,
  allows_custom_duration,
  never_expires,
  default_max_devices
)
values
  ('trial', 'Prueba', 30, false, false, 1),
  ('monthly', 'Mensual', 30, false, false, 1),
  ('quarterly', 'Trimestral', 90, false, false, 1),
  ('annual', 'Anual', 365, false, false, 1),
  ('promo', 'Promocional', null, true, false, 1),
  ('lifetime', 'De por vida', null, false, true, 1),
  ('admin', 'Administrador', null, false, true, 5)
on conflict (code) do nothing;

insert into public.license_plans (code, name, max_devices, features)
values
  ('standard', 'Estándar', 1, '{}'::jsonb),
  ('admin', 'Administrador', 5, '{"admin": true}'::jsonb)
on conflict (code) do nothing;

alter table public.licenses
  add column license_type text,
  add column plan text,
  add column duration_days integer,
  add column max_devices integer,
  add column notes text,
  add column last_validation timestamptz,
  add column revoked_at timestamptz,
  add column features jsonb;

update public.licenses
set
  duration_days = case
    when expires_at is null or activated_at is null then null
    else greatest(
      1,
      ceil(extract(epoch from (expires_at - activated_at)) / 86400.0)::integer
    )
  end,
  license_type = case
    when expires_at is null then 'lifetime'
    when activated_at is null then 'monthly'
    when ceil(extract(epoch from (expires_at - activated_at)) / 86400.0) <= 30 then 'monthly'
    when ceil(extract(epoch from (expires_at - activated_at)) / 86400.0) <= 90 then 'quarterly'
    when ceil(extract(epoch from (expires_at - activated_at)) / 86400.0) <= 365 then 'annual'
    else 'promo'
  end,
  plan = 'standard',
  max_devices = 1,
  features = '{}'::jsonb;

alter table public.licenses
  alter column license_type set not null,
  alter column plan set not null,
  alter column max_devices set not null,
  alter column features set not null,
  alter column features set default '{}'::jsonb;

alter table public.licenses
  add constraint licenses_license_type_fkey
    foreign key (license_type) references public.license_types(code)
    on update cascade on delete restrict,
  add constraint licenses_plan_fkey
    foreign key (plan) references public.license_plans(code)
    on update cascade on delete restrict,
  add constraint licenses_duration_days_check
    check (duration_days is null or duration_days > 0),
  add constraint licenses_max_devices_check
    check (max_devices > 0),
  add constraint licenses_features_object_check
    check (jsonb_typeof(features) = 'object');

alter table public.licenses
  drop constraint licenses_status_check;

alter table public.licenses
  add constraint licenses_status_check
    check (status in ('active', 'pending', 'expired', 'suspended', 'revoked')),
  add constraint licenses_revoked_at_check
    check (
      (status = 'revoked' and revoked_at is not null)
      or (status <> 'revoked' and revoked_at is null)
    );

do $$
begin
  if exists (
    select 1
    from public.licenses
    group by project_id, user_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one license per project and user: duplicate licenses exist';
  end if;
end;
$$;

alter table public.licenses
  add constraint licenses_project_id_user_id_key unique (project_id, user_id);

alter table public.license_audit_log
  add column metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object');

create table public.license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_hash text not null check (length(device_hash) = 64),
  label text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (license_id, device_hash)
);

create index licenses_validation_idx
  on public.licenses(user_id, status, expires_at);
create index licenses_project_status_idx
  on public.licenses(project_id, status);
create index license_audit_log_license_created_idx
  on public.license_audit_log(license_id, created_at desc);
create index license_audit_log_actor_id_idx
  on public.license_audit_log(actor_id);
create index license_devices_active_idx
  on public.license_devices(license_id)
  where revoked_at is null;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger license_types_set_updated_at
before update on public.license_types
for each row execute function app_private.set_updated_at();

create trigger license_plans_set_updated_at
before update on public.license_plans
for each row execute function app_private.set_updated_at();

create trigger licenses_set_updated_at
before update on public.licenses
for each row execute function app_private.set_updated_at();

create or replace function app_private.apply_license_configuration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  type_config public.license_types%rowtype;
  plan_config public.license_plans%rowtype;
  effective_days integer;
begin
  select *
  into type_config
  from public.license_types
  where code = new.license_type
    and active;

  if not found then
    raise exception 'License type is missing or inactive';
  end if;

  select *
  into plan_config
  from public.license_plans
  where code = new.plan
    and active;

  if not found then
    raise exception 'License plan is missing or inactive';
  end if;

  new.max_devices := coalesce(new.max_devices, plan_config.max_devices, type_config.default_max_devices);
  new.features := type_config.default_features || plan_config.features || coalesce(new.features, '{}'::jsonb);

  if type_config.never_expires then
    new.duration_days := null;
    new.expires_at := null;
  elsif tg_op = 'INSERT' or new.license_type is distinct from old.license_type then
    effective_days := case
      when type_config.allows_custom_duration
        then coalesce(new.duration_days, type_config.default_duration_days)
      else type_config.default_duration_days
    end;

    if effective_days is null or effective_days <= 0 then
      raise exception 'A positive duration is required for this license type';
    end if;

    new.duration_days := effective_days;
    new.expires_at := case
      when new.activated_at is null then null
      else new.activated_at + make_interval(days => effective_days)
    end;
  end if;

  if new.status = 'revoked' then
    new.revoked_at := coalesce(new.revoked_at, now());
  else
    new.revoked_at := null;
  end if;

  return new;
end;
$$;

create trigger licenses_apply_configuration
before insert or update of license_type, plan, status, activated_at, expires_at,
  duration_days, max_devices, features
on public.licenses
for each row execute function app_private.apply_license_configuration();

alter table public.license_types enable row level security;
alter table public.license_plans enable row level security;
alter table public.license_devices enable row level security;

revoke all on public.license_types from anon, authenticated;
revoke all on public.license_plans from anon, authenticated;
revoke all on public.license_devices from anon, authenticated;

grant select on public.license_types to authenticated;
grant select on public.license_plans to authenticated;
grant select on public.license_devices to authenticated;

grant select (
  license_type,
  plan,
  duration_days,
  max_devices,
  notes,
  last_validation,
  revoked_at,
  features
) on public.licenses to authenticated;

grant update (
  license_type,
  plan,
  duration_days,
  max_devices,
  notes,
  last_validation,
  revoked_at,
  features
) on public.licenses to authenticated;

grant select (metadata) on public.license_audit_log to authenticated;
grant insert (metadata) on public.license_audit_log to authenticated;

create policy "Authenticated users can view active license types"
on public.license_types for select
to authenticated
using (active);

create policy "Authenticated users can view active license plans"
on public.license_plans for select
to authenticated
using (active);

create policy "Users can view their license devices"
on public.license_devices for select
to authenticated
using (
  exists (
    select 1
    from public.licenses
    where licenses.id = license_devices.license_id
      and licenses.user_id = (select auth.uid())
  )
);

create policy "Project members can view license devices"
on public.license_devices for select
to authenticated
using (
  exists (
    select 1
    from public.licenses
    where licenses.id = license_devices.license_id
      and app_private.can_access_project(licenses.project_id)
  )
);

create or replace function public.renew_license(
  target_license_id uuid,
  requested_duration_days integer default null,
  renewal_note text default null
)
returns public.licenses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_license public.licenses%rowtype;
  type_config public.license_types%rowtype;
  renewed_license public.licenses%rowtype;
  effective_days integer;
  renewal_base timestamptz;
begin
  select *
  into current_license
  from public.licenses
  where id = target_license_id
  for update;

  if not found then
    raise exception 'License not found';
  end if;

  if not app_private.is_project_owner(current_license.project_id) then
    raise exception 'Only the project owner can renew licenses';
  end if;

  select *
  into type_config
  from public.license_types
  where code = current_license.license_type
    and active;

  if not found then
    raise exception 'License type is missing or inactive';
  end if;

  if type_config.never_expires then
    effective_days := null;
  elsif type_config.allows_custom_duration then
    effective_days := coalesce(requested_duration_days, current_license.duration_days, type_config.default_duration_days);
  else
    effective_days := type_config.default_duration_days;
  end if;

  if not type_config.never_expires and (effective_days is null or effective_days <= 0) then
    raise exception 'A positive renewal duration is required';
  end if;

  renewal_base := greatest(now(), coalesce(current_license.expires_at, now()));

  update public.licenses
  set
    status = 'active',
    activated_at = coalesce(activated_at, now()),
    expires_at = case
      when type_config.never_expires then null
      else renewal_base + make_interval(days => effective_days)
    end,
    duration_days = effective_days,
    revoked_at = null,
    last_validation = null,
    notes = coalesce(nullif(btrim(renewal_note), ''), notes)
  where id = target_license_id
  returning * into renewed_license;

  insert into public.license_audit_log (
    project_id,
    license_id,
    action,
    detail,
    actor_id,
    metadata
  )
  values (
    renewed_license.project_id,
    renewed_license.id,
    'license_renewed',
    coalesce(nullif(btrim(renewal_note), ''), 'Licencia renovada'),
    (select auth.uid()),
    jsonb_build_object(
      'previous_expires_at', current_license.expires_at,
      'new_expires_at', renewed_license.expires_at,
      'duration_days', effective_days,
      'license_type', renewed_license.license_type,
      'plan', renewed_license.plan
    )
  );

  return renewed_license;
end;
$$;

create or replace function public.validate_license(
  target_project_id uuid,
  target_license_key text,
  target_device_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_license public.licenses%rowtype;
  active_device_count integer;
  normalized_device_hash text;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('valid', false, 'reason', 'authentication_required');
  end if;

  if nullif(btrim(target_device_fingerprint), '') is null then
    return jsonb_build_object('valid', false, 'reason', 'device_required');
  end if;

  select *
  into current_license
  from public.licenses
  where project_id = target_project_id
    and license_key = target_license_key
    and user_id = (select auth.uid());

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'license_not_found');
  end if;

  if current_license.status <> 'active' then
    return jsonb_build_object('valid', false, 'reason', current_license.status);
  end if;

  if current_license.expires_at is not null and current_license.expires_at <= now() then
    update public.licenses
    set status = 'expired', last_validation = now()
    where id = current_license.id;

    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  normalized_device_hash := encode(
    extensions.digest(target_device_fingerprint, 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(current_license.id::text, 0));

  if exists (
    select 1
    from public.license_devices
    where license_id = current_license.id
      and device_hash = normalized_device_hash
      and revoked_at is null
  ) then
    update public.license_devices
    set last_seen_at = now()
    where license_id = current_license.id
      and device_hash = normalized_device_hash;
  else
    select count(*)
    into active_device_count
    from public.license_devices
    where license_id = current_license.id
      and revoked_at is null;

    if active_device_count >= current_license.max_devices then
      return jsonb_build_object(
        'valid', false,
        'reason', 'device_limit_reached',
        'max_devices', current_license.max_devices
      );
    end if;

    insert into public.license_devices (license_id, device_hash)
    values (current_license.id, normalized_device_hash);
  end if;

  update public.licenses
  set last_validation = now()
  where id = current_license.id;

  return jsonb_build_object(
    'valid', true,
    'reason', 'active',
    'license_id', current_license.id,
    'license_type', current_license.license_type,
    'plan', current_license.plan,
    'expires_at', current_license.expires_at,
    'max_devices', current_license.max_devices,
    'features', current_license.features
  );
end;
$$;

revoke all on function public.renew_license(uuid, integer, text) from public, anon;
grant execute on function public.renew_license(uuid, integer, text) to authenticated;

revoke all on function public.validate_license(uuid, text, text) from public, anon;
grant execute on function public.validate_license(uuid, text, text) to authenticated;
