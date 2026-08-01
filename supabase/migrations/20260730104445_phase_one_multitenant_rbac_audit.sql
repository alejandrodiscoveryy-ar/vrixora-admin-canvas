create table public.project_roles (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (btrim(name) <> ''),
  description text,
  rank smallint not null unique check (rank > 0),
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.project_permissions (
  code text primary key check (code ~ '^[a-z][a-z0-9_.]*$'),
  name text not null check (btrim(name) <> ''),
  category text not null check (btrim(category) <> ''),
  created_at timestamptz not null default now()
);

create table public.project_role_permissions (
  role_code text not null references public.project_roles(code)
    on update cascade on delete cascade,
  permission_code text not null references public.project_permissions(code)
    on update cascade on delete cascade,
  primary key (role_code, permission_code)
);

insert into public.project_roles (code, name, description, rank) values
  ('owner', 'Owner', 'Control total y propiedad del proyecto', 100),
  ('admin', 'Administrador', 'Administración operativa del proyecto', 80),
  ('support', 'Soporte', 'Atención a clientes y gestión de licencias', 60),
  ('accounting', 'Contabilidad', 'Pagos, ingresos y reportes financieros', 40),
  ('marketing', 'Marketing', 'Clientes y analítica comercial', 20);

insert into public.project_permissions (code, name, category) values
  ('project.view', 'Ver proyecto', 'project'),
  ('customers.view', 'Ver clientes', 'customers'),
  ('customers.manage', 'Gestionar clientes', 'customers'),
  ('licenses.view', 'Ver licencias', 'licenses'),
  ('licenses.manage', 'Gestionar licencias', 'licenses'),
  ('plans.view', 'Ver planes', 'plans'),
  ('plans.manage', 'Gestionar planes', 'plans'),
  ('payments.view', 'Ver pagos', 'payments'),
  ('payments.manage', 'Gestionar pagos', 'payments'),
  ('members.view', 'Ver empleados', 'members'),
  ('members.manage', 'Gestionar empleados', 'members'),
  ('analytics.view', 'Ver analítica', 'analytics'),
  ('settings.view', 'Ver configuración', 'settings'),
  ('settings.manage', 'Gestionar configuración', 'settings'),
  ('audit.view', 'Ver auditoría', 'audit');

insert into public.project_role_permissions (role_code, permission_code)
select 'owner', code from public.project_permissions;

insert into public.project_role_permissions (role_code, permission_code)
select 'admin', code from public.project_permissions
where code <> 'members.manage';

insert into public.project_role_permissions (role_code, permission_code) values
  ('support', 'project.view'),
  ('support', 'customers.view'),
  ('support', 'customers.manage'),
  ('support', 'licenses.view'),
  ('support', 'licenses.manage'),
  ('support', 'plans.view'),
  ('support', 'members.view'),
  ('support', 'audit.view'),
  ('accounting', 'project.view'),
  ('accounting', 'customers.view'),
  ('accounting', 'licenses.view'),
  ('accounting', 'plans.view'),
  ('accounting', 'payments.view'),
  ('accounting', 'payments.manage'),
  ('accounting', 'analytics.view'),
  ('accounting', 'audit.view'),
  ('marketing', 'project.view'),
  ('marketing', 'customers.view'),
  ('marketing', 'plans.view'),
  ('marketing', 'analytics.view');

alter table public.project_members
  drop constraint if exists project_members_role_check;

update public.project_members set role = 'support' where role = 'employee';

alter table public.project_members
  add constraint project_members_role_fkey
  foreign key (role) references public.project_roles(code)
  on update cascade on delete restrict;

insert into public.project_members (project_id, user_id, role)
select id, owner_id, 'owner'
from public.projects
on conflict (project_id, user_id) do update set role = 'owner';

create or replace function app_private.has_project_permission(
  target_project_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.project_members member
      join public.project_role_permissions role_permission
        on role_permission.role_code = member.role
      where member.project_id = target_project_id
        and member.user_id = (select auth.uid())
        and role_permission.permission_code = target_permission
    );
$$;

create or replace function app_private.require_project_permission(
  target_project_id uuid,
  target_permission text
)
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
  if not app_private.has_project_permission(target_project_id, target_permission) then
    raise exception 'PERMISSION_DENIED:%', target_permission using errcode = '42501';
  end if;
  return actor;
end;
$$;

revoke all on function app_private.has_project_permission(uuid, text)
  from public, anon, authenticated;
revoke all on function app_private.require_project_permission(uuid, text)
  from public, anon, authenticated;

create or replace function public.get_my_project_permissions(target_project_id uuid)
returns table(permission_code text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'project.view');
  return query
  select role_permission.permission_code
  from public.project_members member
  join public.project_role_permissions role_permission
    on role_permission.role_code = member.role
  where member.project_id = target_project_id
    and member.user_id = auth.uid()
  order by role_permission.permission_code;
end;
$$;

revoke all on function public.get_my_project_permissions(uuid) from public, anon;
grant execute on function public.get_my_project_permissions(uuid) to authenticated;

alter table public.project_roles enable row level security;
alter table public.project_permissions enable row level security;
alter table public.project_role_permissions enable row level security;

revoke all on public.project_roles from anon, authenticated;
revoke all on public.project_permissions from anon, authenticated;
revoke all on public.project_role_permissions from anon, authenticated;
grant select on public.project_roles to authenticated;
grant select on public.project_permissions to authenticated;
grant select on public.project_role_permissions to authenticated;

create policy "Authenticated users can view project roles"
on public.project_roles for select to authenticated using (true);
create policy "Authenticated users can view project permissions"
on public.project_permissions for select to authenticated using (true);
create policy "Authenticated users can view role permissions"
on public.project_role_permissions for select to authenticated using (true);

drop policy if exists "Project members can view memberships" on public.project_members;
drop policy if exists "Project owners can add memberships" on public.project_members;
drop policy if exists "Project owners can update memberships" on public.project_members;
drop policy if exists "Project owners can remove memberships" on public.project_members;

create policy "Authorized users can view memberships"
on public.project_members for select to authenticated
using ((select app_private.has_project_permission(project_id, 'members.view')));

-- Plans become project-scoped. Existing rows are assigned without changing their codes.
alter table public.licenses drop constraint if exists licenses_plan_fkey;
alter table public.payments drop constraint if exists payments_plan_fkey;
alter table public.projects drop constraint if exists projects_default_trial_plan_fkey;

alter table public.license_plans add column project_id uuid;

do $$
begin
  if (select count(*) from public.projects) <> 1
     and exists (select 1 from public.license_plans) then
    raise exception 'PLAN_PROJECT_MIGRATION_REQUIRES_EXPLICIT_MAPPING';
  end if;
end;
$$;

update public.license_plans
set project_id = (select id from public.projects limit 1)
where project_id is null;

alter table public.license_plans
  alter column project_id set not null,
  drop constraint if exists license_plans_pkey,
  add constraint license_plans_pkey primary key (project_id, code),
  add constraint license_plans_project_id_fkey
    foreign key (project_id) references public.projects(id)
    on update cascade on delete restrict;

alter table public.licenses
  add constraint licenses_project_plan_fkey
  foreign key (project_id, plan)
  references public.license_plans(project_id, code)
  on update cascade on delete restrict;

alter table public.payments
  add constraint payments_project_plan_fkey
  foreign key (project_id, plan)
  references public.license_plans(project_id, code)
  on update cascade on delete restrict;

alter table public.projects
  add constraint projects_default_trial_plan_fkey
  foreign key (id, default_trial_plan)
  references public.license_plans(project_id, code)
  on update cascade on delete restrict;

create index license_plans_license_type_idx
  on public.license_plans(license_type);
create index payments_project_plan_idx
  on public.payments(project_id, plan);

drop policy if exists "Authenticated users can view active license plans"
  on public.license_plans;
create policy "Authorized users can view project plans"
on public.license_plans for select to authenticated
using (
  (select app_private.has_project_permission(project_id, 'plans.view'))
  or exists (
    select 1 from public.licenses license
    where license.project_id = license_plans.project_id
      and license.plan = license_plans.code
      and license.user_id = (select auth.uid())
  )
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id)
    on update cascade on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (btrim(action) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_events_project_created_idx
  on public.audit_events(project_id, created_at desc);
create index audit_events_actor_created_idx
  on public.audit_events(actor_id, created_at desc)
  where actor_id is not null;
create index audit_events_entity_idx
  on public.audit_events(project_id, entity_type, entity_id);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;

create policy "Authorized users can view audit events"
on public.audit_events for select to authenticated
using ((select app_private.has_project_permission(project_id, 'audit.view')));

create or replace function app_private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  request_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  resolved_project_id uuid;
begin
  resolved_project_id := case
    when tg_table_name = 'projects' then (row_data->>'id')::uuid
    else (row_data->>'project_id')::uuid
  end;

  insert into public.audit_events (
    project_id, actor_id, action, entity_type, entity_id,
    metadata, ip_address, user_agent
  )
  values (
    resolved_project_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(row_data->>'id', row_data->>'user_id', row_data->>'code'),
    jsonb_build_object('old', old_data, 'new', case when tg_op = 'DELETE' then null else row_data end),
    coalesce(request_headers->>'cf-connecting-ip', request_headers->>'x-forwarded-for'),
    request_headers->>'user-agent'
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app_private.capture_audit_event()
  from public, anon, authenticated;

create trigger audit_projects_changes
after insert or update on public.projects
for each row execute function app_private.capture_audit_event();
create trigger audit_project_members_changes
after insert or update or delete on public.project_members
for each row execute function app_private.capture_audit_event();
create trigger audit_license_plans_changes
after insert or update or delete on public.license_plans
for each row execute function app_private.capture_audit_event();
create trigger audit_licenses_changes
after insert or update or delete on public.licenses
for each row execute function app_private.capture_audit_event();
create trigger audit_payments_changes
after insert or update or delete on public.payments
for each row execute function app_private.capture_audit_event();

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
  select * into type_config
  from public.license_types
  where code = new.license_type and active;
  if not found then raise exception 'LICENSE_TYPE_MISSING_OR_INACTIVE'; end if;

  select * into plan_config
  from public.license_plans
  where project_id = new.project_id
    and code = new.plan
    and active;
  if not found then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE'; end if;
  if plan_config.license_type <> new.license_type then
    raise exception 'PLAN_LICENSE_TYPE_MISMATCH';
  end if;

  new.max_devices := coalesce(new.max_devices, plan_config.max_devices, type_config.default_max_devices);
  new.features := type_config.default_features || plan_config.features || coalesce(new.features, '{}'::jsonb);
  if type_config.never_expires then
    new.duration_days := null;
    new.expires_at := null;
  elsif tg_op = 'INSERT'
        or new.plan is distinct from old.plan
        or new.license_type is distinct from old.license_type then
    effective_days := plan_config.duration_days;
    if effective_days is null or effective_days <= 0 then
      raise exception 'PLAN_DURATION_REQUIRED';
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

create or replace function app_private.provision_initial_licenses(target_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare inserted_count integer;
begin
  if target_profile_id is null then return 0; end if;
  insert into public.licenses (
    project_id, user_id, license_key, license_type, plan,
    status, activated_at, created_by, notes
  )
  select
    project.id, profile.id, app_private.generate_license_key(),
    plan.license_type, plan.code,
    case
      when plan.duration_days is null
        or profile.created_at + make_interval(days => plan.duration_days) > now()
        then 'active'
      else 'expired'
    end,
    profile.created_at, project.owner_id,
    'Licencia inicial generada automáticamente al registrar el usuario'
  from public.profiles profile
  join public.projects project
    on project.status = 'active' and project.default_trial_plan is not null
  join public.license_plans plan
    on plan.project_id = project.id
   and plan.code = project.default_trial_plan
   and plan.active
  where profile.id = target_profile_id
  on conflict (project_id, user_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.admin_list_license_plans(target_project_id uuid)
returns setof public.license_plans
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'plans.view');
  return query
  select * from public.license_plans
  where project_id = target_project_id
  order by is_featured desc, name;
end;
$$;

create or replace function public.admin_save_license_plan(
  target_project_id uuid, target_code text, target_name text, target_license_type text,
  target_duration_days integer, target_price numeric, target_currency text,
  target_max_devices integer, target_features jsonb, target_description text,
  target_is_active boolean, target_is_featured boolean
)
returns public.license_plans
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.license_plans%rowtype;
begin
  perform app_private.require_project_permission(target_project_id, 'plans.manage');
  if nullif(btrim(target_code), '') is null or nullif(btrim(target_name), '') is null then
    raise exception 'PLAN_CODE_AND_NAME_REQUIRED' using errcode = '22023';
  end if;
  insert into public.license_plans (
    project_id, code, name, license_type, duration_days, price, currency,
    max_devices, features, description, active, is_featured
  )
  values (
    target_project_id, lower(btrim(target_code)), btrim(target_name),
    target_license_type, target_duration_days, target_price, target_currency,
    target_max_devices, coalesce(target_features, '{}'),
    nullif(btrim(target_description), ''), target_is_active, target_is_featured
  )
  on conflict (project_id, code) do update set
    name = excluded.name,
    license_type = excluded.license_type,
    duration_days = excluded.duration_days,
    price = excluded.price,
    currency = excluded.currency,
    max_devices = excluded.max_devices,
    features = excluded.features,
    description = excluded.description,
    active = excluded.active,
    is_featured = excluded.is_featured
  returning * into saved;
  return saved;
end;
$$;

create or replace function public.admin_list_licenses(target_project_id uuid)
returns table (
  id uuid, project_id uuid, user_id uuid, user_email text, license_key text,
  license_type text, plan text, status text, duration_days integer,
  max_devices integer, active_devices bigint, features jsonb, notes text,
  activated_at timestamptz, expires_at timestamptz, last_validation timestamptz,
  revoked_at timestamptz, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'licenses.view');
  return query
  select
    license.id, license.project_id, license.user_id, profile.email,
    license.license_key, license.license_type, license.plan, license.status,
    license.duration_days, license.max_devices,
    count(device.id) filter (where device.revoked_at is null),
    license.features, license.notes, license.activated_at, license.expires_at,
    license.last_validation, license.revoked_at, license.created_at
  from public.licenses license
  join public.profiles profile on profile.id = license.user_id
  left join public.license_devices device on device.license_id = license.id
  where license.project_id = target_project_id
  group by license.id, profile.email
  order by license.created_at desc;
end;
$$;

create or replace function public.admin_create_license(
  target_project_id uuid, target_email text, target_license_type text,
  target_plan text, target_status text default 'pending',
  target_duration_days integer default null,
  target_activated_at timestamptz default now(),
  target_max_devices integer default null, target_features jsonb default null,
  target_notes text default null, target_license_key text default null
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
  actor := app_private.require_project_permission(target_project_id, 'licenses.manage');
  select id into target_user_id from public.profiles
  where lower(email) = lower(btrim(target_email));
  if target_user_id is null then raise exception 'USER_NOT_FOUND' using errcode = 'P0002'; end if;
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
  actor := app_private.require_project_permission(previous_license.project_id, 'licenses.manage');

  if operation = 'renew' then
    updated_license := public.renew_license(
      target_license_id,
      nullif(payload->>'duration_days', '')::integer,
      coalesce(reason, 'Renovación desde el panel administrativo')
    );
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
      expires_at = greatest(now(), coalesce(expires_at, now()))
        + make_interval(days => days_to_add),
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
    'license_' || operation,
    coalesce(reason, 'Operación administrativa: ' || operation),
    actor,
    jsonb_build_object(
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
  select * into target_device from public.license_devices
  where id = target_device_id for update;
  if not found then raise exception 'DEVICE_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into target_license from public.licenses where id = target_device.license_id;
  actor := app_private.require_project_permission(target_license.project_id, 'licenses.manage');
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
  select * into target_license from public.licenses
  where id = target_license_id for update;
  if not found then raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002'; end if;
  actor := app_private.require_project_permission(target_license.project_id, 'licenses.manage');
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

create or replace function public.admin_list_registered_clients(target_project_id uuid)
returns table (
  user_id uuid, email text, display_name text, registered_at timestamptz,
  license_id uuid, license_key text, plan text, status text, expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'customers.view');
  return query
  select
    profile.id, profile.email, profile.display_name, profile.created_at,
    current_license.id, current_license.license_key,
    coalesce(current_license.plan, project.default_trial_plan, 'trial'),
    coalesce(
      current_license.status,
      case when now() < profile.created_at + interval '30 days'
        then 'active' else 'expired' end
    ),
    coalesce(current_license.expires_at, profile.created_at + interval '30 days')
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
  where project.id = target_project_id
  order by profile.created_at desc;
end;
$$;

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
  target_license public.licenses%rowtype;
  target_profile public.profiles%rowtype;
  trial_plan public.license_plans%rowtype;
  normalized_reason text := nullif(btrim(target_reason), '');
begin
  perform app_private.require_project_permission(target_project_id, 'customers.manage');
  perform app_private.require_project_permission(target_project_id, 'licenses.manage');
  if target_status not in ('active','pending','expired','suspended','revoked') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if target_status in ('suspended','revoked') and normalized_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into target_profile from public.profiles where id = target_user_id;
  if not found then raise exception 'USER_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into target_license from public.licenses
  where project_id = target_project_id and user_id = target_user_id for update;
  if found then
    return public.admin_update_license(
      target_license.id, 'status',
      jsonb_build_object(
        'status', target_status,
        'reason', coalesce(normalized_reason, 'Estado actualizado desde Clientes')
      )
    );
  end if;
  select plan.* into trial_plan
  from public.projects project
  join public.license_plans plan
    on plan.project_id = project.id and plan.code = project.default_trial_plan
  where project.id = target_project_id and plan.active;
  if not found then raise exception 'DEFAULT_TRIAL_PLAN_NOT_CONFIGURED' using errcode = 'P0002'; end if;
  return public.admin_create_license(
    target_project_id, target_profile.email, trial_plan.license_type, trial_plan.code,
    target_status, trial_plan.duration_days, target_profile.created_at,
    trial_plan.max_devices, trial_plan.features,
    coalesce(normalized_reason, 'Licencia inicial administrada desde Clientes'), null
  );
end;
$$;

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
  perform app_private.require_project_permission(target_project_id, 'settings.manage');
  if nullif(btrim(target_name), '') is null then
    raise exception 'PROJECT_NAME_REQUIRED' using errcode = '22023';
  end if;
  update public.projects set
    name = btrim(target_name),
    description = nullif(btrim(target_description), ''),
    notify_license_expiry = target_notify_license_expiry,
    auto_renew_verified_payments = target_auto_renew_verified_payments,
    updated_at = now()
  where id = target_project_id;
  if not found then raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;

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
declare target_user_id uuid;
begin
  perform app_private.require_project_permission(target_project_id, 'members.manage');
  if target_role = 'owner' or not exists (
    select 1 from public.project_roles where code = target_role
  ) then
    raise exception 'INVALID_ASSIGNABLE_ROLE' using errcode = '22023';
  end if;
  select id into target_user_id from public.profiles
  where lower(email) = lower(btrim(target_email));
  if target_user_id is null then raise exception 'USER_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.projects
    where id = target_project_id and owner_id = target_user_id
  ) then
    raise exception 'PROJECT_OWNER_ROLE_CANNOT_CHANGE' using errcode = '42501';
  end if;
  insert into public.project_members(project_id, user_id, role)
  values (target_project_id, target_user_id, target_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
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
  perform app_private.require_project_permission(target_project_id, 'members.manage');
  if exists (
    select 1 from public.projects
    where id = target_project_id and owner_id = target_user_id
  ) then
    raise exception 'PROJECT_OWNER_CANNOT_BE_REMOVED' using errcode = '42501';
  end if;
  delete from public.project_members
  where project_id = target_project_id and user_id = target_user_id;
end;
$$;

create or replace function public.admin_list_audit_events(
  target_project_id uuid,
  target_limit integer default 100
)
returns setof public.audit_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'audit.view');
  return query
  select * from public.audit_events
  where project_id = target_project_id
  order by created_at desc
  limit least(greatest(coalesce(target_limit, 100), 1), 500);
end;
$$;

revoke all on function public.admin_upsert_project_member(uuid, text, text) from public, anon;
revoke all on function public.admin_list_audit_events(uuid, integer) from public, anon;
grant execute on function public.admin_upsert_project_member(uuid, text, text) to authenticated;
grant execute on function public.admin_list_audit_events(uuid, integer) to authenticated;

create or replace function app_private.apply_confirmed_payment_to_license(target_payment_id uuid)
returns public.licenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  previous_license public.licenses%rowtype;
  updated_license public.licenses%rowtype;
  plan_config public.license_plans%rowtype;
begin
  select * into payment_record from public.payments
  where id = target_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into previous_license from public.licenses
  where id = payment_record.license_id for update;
  if not found then raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002'; end if;
  if payment_record.status not in ('paid','complimentary')
     or payment_record.license_applied_at is not null then
    return previous_license;
  end if;
  select * into plan_config from public.license_plans
  where project_id = payment_record.project_id
    and code = payment_record.plan and active for share;
  if not found then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002'; end if;
  update public.licenses set
    plan = plan_config.code,
    license_type = plan_config.license_type,
    status = 'active',
    activated_at = coalesce(activated_at, now()),
    max_devices = plan_config.max_devices,
    features = plan_config.features
  where id = previous_license.id returning * into updated_license;
  if plan_config.duration_days is null then
    update public.licenses set duration_days = null, expires_at = null
    where id = previous_license.id returning * into updated_license;
  else
    update public.licenses set
      duration_days = plan_config.duration_days,
      expires_at = greatest(now(), coalesce(previous_license.expires_at, now()))
        + make_interval(days => plan_config.duration_days)
    where id = previous_license.id returning * into updated_license;
  end if;
  update public.payments set license_applied_at = now() where id = payment_record.id;
  insert into public.license_audit_log
    (project_id, license_id, action, detail, actor_id, metadata)
  values (
    previous_license.project_id, previous_license.id, 'license_renewed',
    'Vigencia aplicada por pago confirmado', payment_record.recorded_by,
    jsonb_build_object(
      'payment_id', payment_record.id, 'plan', plan_config.code,
      'previous_expires_at', previous_license.expires_at,
      'new_expires_at', updated_license.expires_at
    )
  );
  return updated_license;
end;
$$;

create or replace function public.admin_list_license_payments(target_project_id uuid)
returns table (
  id uuid, user_email text, license_key text, plan text, list_price numeric,
  discount numeric, amount numeric, currency text, method text, reference text,
  paid_status text, recorded_by uuid, notes text, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'payments.view');
  return query
  select
    payment.id, profile.email, license.license_key, payment.plan,
    payment.list_price, payment.discount, payment.amount, payment.currency,
    payment.method, payment.reference, payment.status, payment.recorded_by,
    payment.notes, payment.created_at
  from public.payments payment
  join public.profiles profile on profile.id = payment.user_id
  left join public.licenses license on license.id = payment.license_id
  where payment.project_id = target_project_id
  order by payment.created_at desc;
end;
$$;

create or replace function public.admin_assign_license_with_payment(
  target_project_id uuid, target_email text, target_plan text,
  target_started_at timestamptz, target_status text, target_method text,
  target_reference text, target_notes text,
  target_override_amount numeric default null,
  target_adjustment_reason text default null,
  target_payment_status text default 'paid'
)
returns public.licenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  config public.license_plans%rowtype;
  created_license public.licenses%rowtype;
  paid numeric;
begin
  actor := app_private.require_project_permission(target_project_id, 'payments.manage');
  perform app_private.require_project_permission(target_project_id, 'licenses.manage');
  select * into config from public.license_plans
  where project_id = target_project_id and code = target_plan and active for share;
  if not found then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002'; end if;
  paid := coalesce(target_override_amount, config.price);
  if paid <> config.price and nullif(btrim(target_adjustment_reason), '') is null then
    raise exception 'PRICE_ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if paid < 0 or paid > config.price then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023';
  end if;
  created_license := public.admin_create_license(
    target_project_id, target_email, config.license_type, config.code,
    target_status, config.duration_days, target_started_at,
    config.max_devices, config.features, target_notes, null
  );
  insert into public.payments (
    project_id, user_id, license_id, plan, list_price, discount, amount,
    currency, method, reference, status, recorded_by, notes
  )
  values (
    target_project_id, created_license.user_id, created_license.id, config.code,
    config.price, config.price - paid, paid, config.currency, target_method,
    coalesce(
      nullif(btrim(target_reference), ''),
      'PAY-' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16))
    ),
    target_payment_status, actor,
    concat_ws(' · ', nullif(btrim(target_notes), ''), nullif(btrim(target_adjustment_reason), ''))
  );
  return created_license;
end;
$$;

create or replace function public.admin_record_license_payment(
  target_license_id uuid, target_plan text, target_method text,
  target_reference text, target_notes text default null,
  target_override_amount numeric default null,
  target_adjustment_reason text default null,
  target_payment_status text default 'paid'
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  current_license public.licenses%rowtype;
  config public.license_plans%rowtype;
  recorded_payment public.payments%rowtype;
  paid numeric;
begin
  select * into current_license from public.licenses
  where id = target_license_id for share;
  if not found then raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002'; end if;
  actor := app_private.require_project_permission(current_license.project_id, 'payments.manage');
  select * into config from public.license_plans
  where project_id = current_license.project_id and code = target_plan and active for share;
  if not found then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002'; end if;
  if target_payment_status not in ('pending','paid','cancelled','refunded','complimentary') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;
  paid := case when target_payment_status = 'complimentary'
    then 0 else coalesce(target_override_amount, config.price) end;
  if paid <> config.price and nullif(btrim(target_adjustment_reason), '') is null then
    raise exception 'PRICE_ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if paid < 0 or paid > config.price then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023';
  end if;
  insert into public.payments (
    project_id, user_id, license_id, plan, list_price, discount, amount,
    currency, method, reference, status, recorded_by, notes
  )
  values (
    current_license.project_id, current_license.user_id, current_license.id,
    config.code, config.price, config.price - paid, paid, config.currency,
    target_method,
    coalesce(
      nullif(btrim(target_reference), ''),
      'PAY-' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16))
    ),
    target_payment_status, actor,
    concat_ws(' · ', nullif(btrim(target_notes), ''), nullif(btrim(target_adjustment_reason), ''))
  )
  returning * into recorded_payment;
  if recorded_payment.status in ('paid','complimentary') then
    perform app_private.apply_confirmed_payment_to_license(recorded_payment.id);
    select * into recorded_payment from public.payments where id = recorded_payment.id;
  end if;
  return recorded_payment;
end;
$$;

create or replace function public.admin_update_payment_status(
  target_payment_id uuid,
  target_status text,
  target_notes text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  previous_payment public.payments%rowtype;
  updated_payment public.payments%rowtype;
begin
  select * into previous_payment from public.payments
  where id = target_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  actor := app_private.require_project_permission(previous_payment.project_id, 'payments.manage');
  if target_status not in ('pending','paid','cancelled','refunded','complimentary') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;
  if target_status = 'complimentary' and previous_payment.amount <> 0 then
    raise exception 'COMPLIMENTARY_PAYMENT_MUST_BE_ZERO' using errcode = '22023';
  end if;
  update public.payments set
    status = target_status,
    notes = coalesce(nullif(btrim(target_notes), ''), notes)
  where id = target_payment_id returning * into updated_payment;
  insert into public.license_audit_log
    (project_id, license_id, action, detail, actor_id, metadata)
  values (
    updated_payment.project_id, updated_payment.license_id,
    'payment_status_updated', 'Estado del pago actualizado desde el panel administrativo',
    actor,
    jsonb_build_object(
      'payment_id', updated_payment.id,
      'previous_status', previous_payment.status,
      'new_status', updated_payment.status
    )
  );
  if updated_payment.status in ('paid','complimentary') then
    perform app_private.apply_confirmed_payment_to_license(updated_payment.id);
    select * into updated_payment from public.payments where id = updated_payment.id;
  end if;
  return updated_payment;
end;
$$;

create or replace function public.admin_renew_license_with_payment(
  target_license_id uuid, target_plan text, target_method text, target_reference text,
  target_notes text, target_override_amount numeric default null,
  target_adjustment_reason text default null, target_payment_status text default 'paid'
)
returns public.licenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  current_license public.licenses%rowtype;
  config public.license_plans%rowtype;
  recorded_payment public.payments%rowtype;
  paid numeric;
begin
  select * into current_license
  from public.licenses
  where id = target_license_id
  for update;
  if not found then raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002'; end if;

  actor := app_private.require_project_permission(
    current_license.project_id,
    'payments.manage'
  );
  perform app_private.require_project_permission(
    current_license.project_id,
    'licenses.manage'
  );

  select * into config
  from public.license_plans
  where project_id = current_license.project_id
    and code = target_plan
    and active
  for share;
  if not found then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002'; end if;
  if target_payment_status not in ('pending','paid','cancelled','refunded','complimentary') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;

  paid := case
    when target_payment_status = 'complimentary' then 0
    else coalesce(target_override_amount, config.price)
  end;
  if paid <> config.price and nullif(btrim(target_adjustment_reason), '') is null then
    raise exception 'PRICE_ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if paid < 0 or paid > config.price then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023';
  end if;

  insert into public.payments (
    project_id, user_id, license_id, plan, list_price, discount, amount,
    currency, method, reference, status, recorded_by, notes
  )
  values (
    current_license.project_id, current_license.user_id, current_license.id,
    config.code, config.price, config.price - paid, paid, config.currency,
    target_method,
    coalesce(
      nullif(btrim(target_reference), ''),
      'PAY-' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16))
    ),
    target_payment_status, actor,
    concat_ws(' · ', nullif(btrim(target_notes), ''), nullif(btrim(target_adjustment_reason), ''))
  )
  returning * into recorded_payment;

  if recorded_payment.status in ('paid','complimentary') then
    perform app_private.apply_confirmed_payment_to_license(recorded_payment.id);
  end if;

  select * into current_license
  from public.licenses
  where id = target_license_id;
  return current_license;
end;
$$;

drop policy if exists "Project members can view license audit log"
  on public.license_audit_log;
drop policy if exists "Project owners can view license audit log"
  on public.license_audit_log;
drop policy if exists "Users can view their own license audit log"
  on public.license_audit_log;
create policy "Authorized members can view license audit log"
on public.license_audit_log
for select
to authenticated
using (
  app_private.has_project_permission(project_id, 'audit.view')
  or exists (
    select 1
    from public.licenses license
    where license.id = license_audit_log.license_id
      and license.user_id = (select auth.uid())
  )
);

revoke insert, update, delete on public.project_members from authenticated;
revoke insert, update, delete on public.license_plans from authenticated;
revoke insert, update, delete on public.licenses from authenticated;
revoke insert, update, delete on public.payments from authenticated;
revoke insert, update, delete on public.audit_events from authenticated;

revoke all on function public.admin_renew_license_with_payment(
  uuid, text, text, text, text, numeric, text, text
) from public, anon;
grant execute on function public.admin_renew_license_with_payment(
  uuid, text, text, text, text, numeric, text, text
) to authenticated;
