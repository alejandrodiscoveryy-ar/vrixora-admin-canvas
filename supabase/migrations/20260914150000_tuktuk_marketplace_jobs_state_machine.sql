-- TukTuk Marketplace V1, Block 5: server-first jobs and state-machine foundations.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  profile_user_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (btrim(display_name) <> ''),
  whatsapp_phone text not null check (btrim(whatsapp_phone) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id)
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  customer_id uuid not null,
  service_code text not null,
  origin_text text not null check (btrim(origin_text) <> ''),
  destination_text text not null check (btrim(destination_text) <> ''),
  scheduled_for timestamptz,
  passenger_count integer check (passenger_count is null or passenger_count > 0),
  cargo_weight_kg numeric check (cargo_weight_kg is null or cargo_weight_kg >= 0),
  cargo_volume_m3 numeric check (cargo_volume_m3 is null or cargo_volume_m3 >= 0),
  cargo_length_cm numeric check (cargo_length_cm is null or cargo_length_cm >= 0),
  cargo_width_cm numeric check (cargo_width_cm is null or cargo_width_cm >= 0),
  cargo_height_cm numeric check (cargo_height_cm is null or cargo_height_cm >= 0),
  required_body_type text,
  notes text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, id, service_code),
  foreign key (project_id, customer_id)
    references public.customers(project_id, id) on delete restrict,
  foreign key (project_id, service_code)
    references public.service_types(project_id, code) on delete restrict
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  service_request_id uuid not null,
  service_code text not null,
  status text not null default 'requested' check (status in (
    'requested', 'published', 'accepted', 'en_route', 'pickup', 'in_progress',
    'completed', 'settled', 'cancelled_by_customer', 'cancelled_by_driver', 'expired', 'incident'
  )),
  recommended_price numeric(14,2) not null check (recommended_price > 0),
  final_price numeric(14,2) not null check (final_price > 0),
  currency text not null default 'CUP' check (currency = 'CUP'),
  price_warning_acknowledged boolean not null default false,
  pricing_version text,
  commission_rate_snapshot numeric(8,6) not null check (commission_rate_snapshot > 0 and commission_rate_snapshot <= 1),
  published_at timestamptz,
  expires_at timestamptz,
  assigned_driver_user_id uuid,
  assigned_vehicle_id text,
  incident_from_status text,
  incident_opened_at timestamptz,
  incident_reason text,
  state_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, service_request_id),
  foreign key (project_id, service_request_id, service_code)
    references public.service_requests(project_id, id, service_code) on delete restrict,
  foreign key (project_id, assigned_driver_user_id, assigned_vehicle_id)
    references public.driver_vehicle_assignments(project_id, driver_user_id, vehicle_id) on delete restrict,
  check (
    (assigned_driver_user_id is null and assigned_vehicle_id is null)
    or (assigned_driver_user_id is not null and assigned_vehicle_id is not null)
  ),
  check (
    status <> 'incident'
    or (
      incident_from_status in ('accepted', 'en_route', 'pickup', 'in_progress', 'completed', 'settled')
      and incident_opened_at is not null
      and nullif(btrim(incident_reason), '') is not null
    )
  ),
  check (state_version >= 0)
);

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid not null,
  from_status text,
  to_status text not null check (to_status in (
    'requested', 'published', 'accepted', 'en_route', 'pickup', 'in_progress',
    'completed', 'settled', 'cancelled_by_customer', 'cancelled_by_driver', 'expired', 'incident'
  )),
  action text not null check (btrim(action) <> ''),
  actor_kind text not null check (actor_kind in ('customer', 'driver', 'admin', 'system')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  customer_id uuid,
  operation_idempotency_key uuid not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  client_occurred_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, operation_idempotency_key),
  foreign key (project_id, job_id) references public.jobs(project_id, id) on delete restrict,
  foreign key (project_id, customer_id) references public.customers(project_id, id) on delete restrict,
  check (from_status is null or from_status in (
    'requested', 'published', 'accepted', 'en_route', 'pickup', 'in_progress',
    'completed', 'settled', 'cancelled_by_customer', 'cancelled_by_driver', 'expired', 'incident'
  ))
);

create or replace function app_private.marketplace_job_transition_allowed(
  from_status text,
  to_status text,
  actor_kind text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case from_status
    when 'requested' then
      (actor_kind in ('customer', 'admin') and to_status in ('published', 'cancelled_by_customer'))
    when 'published' then
      (actor_kind = 'driver' and to_status = 'accepted')
      or (actor_kind in ('customer', 'admin') and to_status = 'cancelled_by_customer')
      or (actor_kind in ('system', 'admin') and to_status = 'expired')
    when 'accepted' then
      (actor_kind in ('driver', 'admin') and to_status in ('en_route', 'cancelled_by_driver', 'incident'))
      or (actor_kind in ('customer', 'admin') and to_status = 'cancelled_by_customer')
      or (actor_kind = 'system' and to_status = 'incident')
    when 'en_route' then
      (actor_kind in ('driver', 'admin') and to_status in ('pickup', 'cancelled_by_driver', 'incident'))
      or (actor_kind in ('customer', 'admin') and to_status = 'cancelled_by_customer')
      or (actor_kind = 'system' and to_status = 'incident')
    when 'pickup' then
      (actor_kind in ('driver', 'admin') and to_status in ('in_progress', 'cancelled_by_driver', 'incident'))
      or (actor_kind in ('customer', 'admin') and to_status = 'cancelled_by_customer')
      or (actor_kind = 'system' and to_status = 'incident')
    when 'in_progress' then
      (actor_kind in ('driver', 'admin') and to_status in ('completed', 'incident'))
      or (actor_kind = 'system' and to_status = 'incident')
    when 'completed' then
      (actor_kind in ('system', 'admin') and to_status in ('settled', 'incident'))
    when 'settled' then actor_kind = 'admin' and to_status = 'incident'
    else false
  end;
$$;

create or replace function app_private.protect_job_pricing_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'requested' and (
    new.recommended_price is distinct from old.recommended_price
    or new.final_price is distinct from old.final_price
    or new.currency is distinct from old.currency
    or new.pricing_version is distinct from old.pricing_version
    or new.commission_rate_snapshot is distinct from old.commission_rate_snapshot
    or new.price_warning_acknowledged is distinct from old.price_warning_acknowledged
    or new.service_request_id is distinct from old.service_request_id
    or new.service_code is distinct from old.service_code
  ) then
    raise exception 'JOB_PRICING_SNAPSHOT_IMMUTABLE_AFTER_PUBLICATION' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function app_private.lock_service_request_on_job_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'requested' and new.status <> 'requested' then
    perform 1
    from public.service_requests service_request
    where service_request.project_id = new.project_id
      and service_request.id = new.service_request_id
    for update;
  end if;
  return new;
end;
$$;

create or replace function app_private.protect_published_service_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.jobs job
    where job.project_id = old.project_id
      and job.service_request_id = old.id
      and job.status <> 'requested'
  ) and (
    new.customer_id is distinct from old.customer_id
    or new.service_code is distinct from old.service_code
    or new.origin_text is distinct from old.origin_text
    or new.destination_text is distinct from old.destination_text
    or new.scheduled_for is distinct from old.scheduled_for
    or new.passenger_count is distinct from old.passenger_count
    or new.cargo_weight_kg is distinct from old.cargo_weight_kg
    or new.cargo_volume_m3 is distinct from old.cargo_volume_m3
    or new.cargo_length_cm is distinct from old.cargo_length_cm
    or new.cargo_width_cm is distinct from old.cargo_width_cm
    or new.cargo_height_cm is distinct from old.cargo_height_cm
    or new.required_body_type is distinct from old.required_body_type
    or new.notes is distinct from old.notes
    or new.details is distinct from old.details
  ) then
    raise exception 'SERVICE_REQUEST_IMMUTABLE_AFTER_JOB_PUBLICATION' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function app_private.prevent_job_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'JOB_EVENTS_ARE_APPEND_ONLY' using errcode = '22023';
end;
$$;

revoke all on function app_private.marketplace_job_transition_allowed(text, text, text) from public, anon, authenticated;
revoke all on function app_private.protect_job_pricing_snapshot() from public, anon, authenticated;
revoke all on function app_private.lock_service_request_on_job_publication() from public, anon, authenticated;
revoke all on function app_private.protect_published_service_request() from public, anon, authenticated;
revoke all on function app_private.prevent_job_event_mutation() from public, anon, authenticated;

create trigger customers_set_updated_at before update on public.customers
for each row execute function app_private.set_updated_at();
create trigger service_requests_set_updated_at before update on public.service_requests
for each row execute function app_private.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs
for each row execute function app_private.set_updated_at();
create trigger jobs_protect_pricing_snapshot before update on public.jobs
for each row execute function app_private.protect_job_pricing_snapshot();
create trigger jobs_lock_service_request_on_publication before update on public.jobs
for each row execute function app_private.lock_service_request_on_job_publication();
create trigger service_requests_protect_published_request before update on public.service_requests
for each row execute function app_private.protect_published_service_request();
create trigger job_events_append_only before update or delete on public.job_events
for each row execute function app_private.prevent_job_event_mutation();

create trigger audit_marketplace_customers after insert or update on public.customers
for each row execute function app_private.capture_audit_event();
create trigger audit_marketplace_service_requests after insert or update on public.service_requests
for each row execute function app_private.capture_audit_event();
create trigger audit_marketplace_jobs after insert or update on public.jobs
for each row execute function app_private.capture_audit_event();

create index customers_project_profile_user_idx on public.customers(project_id, profile_user_id);
create index service_requests_project_customer_created_idx on public.service_requests(project_id, customer_id, created_at desc);
create index service_requests_project_service_scheduled_idx on public.service_requests(project_id, service_code, scheduled_for);
create index jobs_project_status_created_idx on public.jobs(project_id, status, created_at desc);
create index jobs_project_status_service_expiry_idx on public.jobs(project_id, status, service_code, expires_at);
create index jobs_published_lookup_idx on public.jobs(project_id, service_code, expires_at) where status = 'published';
create index jobs_assigned_driver_status_idx on public.jobs(project_id, assigned_driver_user_id, status)
  where assigned_driver_user_id is not null;
create index jobs_assigned_driver_vehicle_idx
  on public.jobs(project_id, assigned_driver_user_id, assigned_vehicle_id)
  where assigned_driver_user_id is not null;
create index job_events_project_job_history_idx on public.job_events(project_id, job_id, created_at, id);
create index job_events_project_customer_idx on public.job_events(project_id, customer_id)
  where customer_id is not null;

alter table public.customers enable row level security;
alter table public.service_requests enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;

revoke all on public.customers, public.service_requests, public.jobs, public.job_events
  from public, anon, authenticated;
