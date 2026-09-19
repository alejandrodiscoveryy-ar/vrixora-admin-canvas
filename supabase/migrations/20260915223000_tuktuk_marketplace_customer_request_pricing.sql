-- TUKTUK Marketplace V1, Block 10-A2:
-- Customer request draft, versioned pricing and atomic publication.
-- No concrete commercial tariffs are seeded here. They remain configurable
-- and must be approved before quote/pilot use.

create table public.marketplace_pricing_rules (
  project_id uuid not null
    references public.projects(id) on delete restrict,
  service_code text not null,
  version text not null
    check (
      char_length(version) between 1 and 64
      and btrim(version) = version
    ),
  active boolean not null default false,
  currency text not null default 'CUP'
    check (currency = 'CUP'),

  base_price numeric(14,2) not null
    check (base_price > 0),
  minimum_price numeric(14,2) not null
    check (minimum_price > 0),

  per_km_price numeric(14,2) not null default 0
    check (per_km_price >= 0),
  per_extra_passenger_price numeric(14,2) not null default 0
    check (per_extra_passenger_price >= 0),
  per_cargo_kg_price numeric(14,4) not null default 0
    check (per_cargo_kg_price >= 0),
  per_cargo_m3_price numeric(14,2) not null default 0
    check (per_cargo_m3_price >= 0),
  per_stop_price numeric(14,2) not null default 0
    check (per_stop_price >= 0),
  load_help_surcharge numeric(14,2) not null default 0
    check (load_help_surcharge >= 0),
  unload_help_surcharge numeric(14,2) not null default 0
    check (unload_help_surcharge >= 0),

  urgency_multiplier numeric(8,4) not null default 1
    check (urgency_multiplier >= 1),

  low_price_warning_ratio numeric(8,6) not null
    check (
      low_price_warning_ratio > 0
      and low_price_warning_ratio <= 1
    ),

  rounding_increment numeric(14,2) not null
    check (rounding_increment > 0),
  rounding_mode text not null
    check (rounding_mode in ('nearest', 'up')),

  publication_ttl_minutes integer not null
    check (
      publication_ttl_minutes >= 5
      and publication_ttl_minutes <= 10080
    ),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (project_id, service_code, version),

  foreign key (project_id, service_code)
    references public.service_types(project_id, code)
    on delete restrict
);

create unique index marketplace_pricing_rules_one_active_idx
  on public.marketplace_pricing_rules(project_id, service_code)
  where active;

create index marketplace_pricing_rules_service_history_idx
  on public.marketplace_pricing_rules(
    project_id,
    service_code,
    created_at desc
  );


create table public.marketplace_customer_request_operations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  customer_id uuid not null,
  operation_kind text not null
    check (operation_kind in ('create_request', 'publish_job')),
  idempotency_key uuid not null,
  payload_hash text not null
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  job_id uuid not null,
  created_at timestamptz not null default now(),

  unique (project_id, customer_id, idempotency_key),
  unique (project_id, id),

  foreign key (project_id, customer_id)
    references public.customers(project_id, id)
    on delete restrict,

  foreign key (project_id, job_id)
    references public.jobs(project_id, id)
    on delete restrict
);

create index marketplace_customer_request_operations_job_idx
  on public.marketplace_customer_request_operations(
    project_id,
    job_id,
    created_at
  );


alter table public.jobs
  add column pricing_breakdown jsonb not null default '{}'::jsonb
  check (jsonb_typeof(pricing_breakdown) = 'object');


create trigger marketplace_pricing_rules_set_updated_at
before update on public.marketplace_pricing_rules
for each row execute function app_private.set_updated_at();


create or replace function app_private.protect_marketplace_pricing_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    to_jsonb(new) - 'active' - 'updated_at'
  ) is distinct from (
    to_jsonb(old) - 'active' - 'updated_at'
  ) then
    raise exception 'MARKETPLACE_PRICING_RULE_IMMUTABLE'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function
  app_private.protect_marketplace_pricing_rule()
from public, anon, authenticated;

create trigger marketplace_pricing_rules_protect
before update on public.marketplace_pricing_rules
for each row
execute function app_private.protect_marketplace_pricing_rule();


create or replace function
app_private.prevent_marketplace_customer_request_operation_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'MARKETPLACE_CUSTOMER_REQUEST_OPERATION_IMMUTABLE'
    using errcode = '42501';
end;
$$;

revoke all on function
  app_private.prevent_marketplace_customer_request_operation_mutation()
from public, anon, authenticated;

create trigger marketplace_customer_request_operations_immutable
before update or delete
on public.marketplace_customer_request_operations
for each row
execute function
  app_private.prevent_marketplace_customer_request_operation_mutation();


create trigger audit_marketplace_pricing_rules
after insert or update on public.marketplace_pricing_rules
for each row execute function app_private.capture_audit_event();

create trigger audit_marketplace_customer_request_operations
after insert on public.marketplace_customer_request_operations
for each row execute function app_private.capture_audit_event();


alter table public.marketplace_pricing_rules enable row level security;
alter table public.marketplace_customer_request_operations
  enable row level security;

revoke all on
  public.marketplace_pricing_rules,
  public.marketplace_customer_request_operations
from public, anon, authenticated;


-- Keep the new pricing breakdown immutable once a job leaves requested.
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
    or new.pricing_breakdown is distinct from old.pricing_breakdown
    or new.commission_rate_snapshot
      is distinct from old.commission_rate_snapshot
    or new.price_warning_acknowledged
      is distinct from old.price_warning_acknowledged
    or new.service_request_id
      is distinct from old.service_request_id
    or new.service_code is distinct from old.service_code
  ) then
    raise exception
      'JOB_PRICING_SNAPSHOT_IMMUTABLE_AFTER_PUBLICATION'
      using errcode = '22023';
  end if;

  return new;
end;
$$;


create or replace function app_private.calculate_marketplace_customer_quote(
  target_project_id uuid,
  target_service_code text,
  target_passenger_count integer,
  target_cargo_weight_kg numeric,
  target_cargo_volume_m3 numeric,
  target_details jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pricing public.marketplace_pricing_rules%rowtype;
  details_value jsonb := coalesce(target_details, '{}'::jsonb);

  distance_text text;
  distance_source text;
  distance_km numeric;

  stop_text text;
  stop_count integer := 0;

  load_help boolean := false;
  unload_help boolean := false;
  urgent boolean := false;

  base_component numeric;
  distance_component numeric;
  passenger_component numeric;
  cargo_weight_component numeric;
  cargo_volume_component numeric;
  stop_component numeric;
  load_component numeric;
  unload_component numeric;

  subtotal numeric;
  after_urgency numeric;
  rounded_value numeric;
  recommended_value numeric;
  warning_threshold numeric;
begin
  if jsonb_typeof(details_value) <> 'object' then
    raise exception 'CUSTOMER_REQUEST_DETAILS_MUST_BE_OBJECT'
      using errcode = '22023';
  end if;

  if octet_length(details_value::text) > 16384 then
    raise exception 'CUSTOMER_REQUEST_DETAILS_TOO_LARGE'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.service_types service
    where service.project_id = target_project_id
      and service.code = target_service_code
      and service.active
  ) then
    raise exception 'MARKETPLACE_SERVICE_NOT_AVAILABLE'
      using errcode = '22023';
  end if;

  select *
  into pricing
  from public.marketplace_pricing_rules rule
  where rule.project_id = target_project_id
    and rule.service_code = target_service_code
    and rule.active;

  if not found then
    raise exception 'MARKETPLACE_PRICING_RULE_NOT_CONFIGURED'
      using errcode = 'P0002';
  end if;

  distance_text :=
    nullif(btrim(details_value ->> 'estimated_distance_km'), '');

  if distance_text is not null then
    if distance_text !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'ESTIMATED_DISTANCE_INVALID'
        using errcode = '22023';
    end if;

    distance_km := distance_text::numeric;

    if distance_km <= 0 or distance_km > 5000 then
      raise exception 'ESTIMATED_DISTANCE_INVALID'
        using errcode = '22023';
    end if;
  end if;

  distance_source := coalesce(
    nullif(btrim(details_value ->> 'distance_source'), ''),
    case
      when distance_km is null then 'unavailable'
      else 'manual'
    end
  );

  if distance_source not in ('manual', 'provider', 'unavailable') then
    raise exception 'DISTANCE_SOURCE_INVALID'
      using errcode = '22023';
  end if;

  if distance_km is null and distance_source <> 'unavailable' then
    raise exception 'DISTANCE_SOURCE_REQUIRES_DISTANCE'
      using errcode = '22023';
  end if;

  if distance_km is not null and distance_source = 'unavailable' then
    raise exception 'DISTANCE_SOURCE_INVALID'
      using errcode = '22023';
  end if;

  stop_text :=
    nullif(btrim(details_value ->> 'stop_count'), '');

  if stop_text is not null then
    if stop_text !~ '^[0-9]+$' then
      raise exception 'STOP_COUNT_INVALID'
        using errcode = '22023';
    end if;

    stop_count := stop_text::integer;

    if stop_count > 20 then
      raise exception 'STOP_COUNT_INVALID'
        using errcode = '22023';
    end if;
  end if;

  if details_value ? 'load_help' then
    if lower(details_value ->> 'load_help')
      not in ('true', 'false')
    then
      raise exception 'LOAD_HELP_INVALID'
        using errcode = '22023';
    end if;

    load_help := (details_value ->> 'load_help')::boolean;
  end if;

  if details_value ? 'unload_help' then
    if lower(details_value ->> 'unload_help')
      not in ('true', 'false')
    then
      raise exception 'UNLOAD_HELP_INVALID'
        using errcode = '22023';
    end if;

    unload_help :=
      (details_value ->> 'unload_help')::boolean;
  end if;

  if details_value ? 'urgent' then
    if lower(details_value ->> 'urgent')
      not in ('true', 'false')
    then
      raise exception 'URGENCY_INVALID'
        using errcode = '22023';
    end if;

    urgent := (details_value ->> 'urgent')::boolean;
  end if;

  base_component := pricing.base_price;

  distance_component := round(
    coalesce(distance_km, 0) * pricing.per_km_price,
    2
  );

  passenger_component := round(
    greatest(coalesce(target_passenger_count, 1) - 1, 0)
      * pricing.per_extra_passenger_price,
    2
  );

  cargo_weight_component := round(
    coalesce(target_cargo_weight_kg, 0)
      * pricing.per_cargo_kg_price,
    2
  );

  cargo_volume_component := round(
    coalesce(target_cargo_volume_m3, 0)
      * pricing.per_cargo_m3_price,
    2
  );

  stop_component :=
    round(stop_count * pricing.per_stop_price, 2);

  load_component :=
    case when load_help
      then pricing.load_help_surcharge
      else 0
    end;

  unload_component :=
    case when unload_help
      then pricing.unload_help_surcharge
      else 0
    end;

  subtotal :=
    base_component
    + distance_component
    + passenger_component
    + cargo_weight_component
    + cargo_volume_component
    + stop_component
    + load_component
    + unload_component;

  after_urgency :=
    case
      when urgent then subtotal * pricing.urgency_multiplier
      else subtotal
    end;

  rounded_value :=
    case pricing.rounding_mode
      when 'up' then
        ceil(after_urgency / pricing.rounding_increment)
          * pricing.rounding_increment
      else
        round(after_urgency / pricing.rounding_increment)
          * pricing.rounding_increment
    end;

  recommended_value :=
    round(
      greatest(pricing.minimum_price, rounded_value),
      2
    );

  warning_threshold :=
    round(
      recommended_value * pricing.low_price_warning_ratio,
      2
    );

  return jsonb_build_object(
    'recommended_price', recommended_value,
    'minimum_price', pricing.minimum_price,
    'low_price_warning_threshold', warning_threshold,
    'currency', pricing.currency,
    'pricing_version', pricing.version,
    'publication_ttl_minutes',
      pricing.publication_ttl_minutes,
    'pricing_breakdown',
      jsonb_build_object(
        'pricing_version', pricing.version,
        'currency', pricing.currency,
        'base_price', pricing.base_price,
        'distance_km', distance_km,
        'distance_source', distance_source,
        'distance_reliable', distance_km is not null,
        'distance_component', distance_component,
        'extra_passenger_component',
          passenger_component,
        'cargo_weight_component',
          cargo_weight_component,
        'cargo_volume_component',
          cargo_volume_component,
        'stop_count', stop_count,
        'stop_component', stop_component,
        'load_help', load_help,
        'load_help_component', load_component,
        'unload_help', unload_help,
        'unload_help_component', unload_component,
        'urgent', urgent,
        'urgency_multiplier',
          case
            when urgent then pricing.urgency_multiplier
            else 1
          end,
        'subtotal_before_urgency', round(subtotal, 2),
        'rounding_mode', pricing.rounding_mode,
        'rounding_increment', pricing.rounding_increment,
        'minimum_price', pricing.minimum_price,
        'low_price_warning_ratio',
          pricing.low_price_warning_ratio,
        'low_price_warning_threshold',
          warning_threshold,
        'recommended_price', recommended_value
      )
  );
end;
$$;

revoke all on function
  app_private.calculate_marketplace_customer_quote(
    uuid,
    text,
    integer,
    numeric,
    numeric,
    jsonb
  )
from public, anon, authenticated;


create or replace function public.list_marketplace_customer_services()
returns table(
  service_code text,
  service_name text,
  sort_order integer,
  currency text,
  pricing_version text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    service.code,
    service.name,
    service.sort_order,
    pricing.currency,
    pricing.version
  from public.projects project
  join public.service_types service
    on service.project_id = project.id
   and service.active
  join public.marketplace_pricing_rules pricing
    on pricing.project_id = service.project_id
   and pricing.service_code = service.code
   and pricing.active
  where project.slug = 'tuktuk-control'
  order by service.sort_order, service.code;
$$;


create or replace function public.create_marketplace_customer_request(
  target_session_id uuid,
  target_session_token text,
  target_service_code text,
  target_origin_text text,
  target_destination_text text,
  target_scheduled_for timestamptz,
  target_passenger_count integer,
  target_cargo_weight_kg numeric,
  target_cargo_volume_m3 numeric,
  target_cargo_length_cm numeric,
  target_cargo_width_cm numeric,
  target_cargo_height_cm numeric,
  target_required_body_type text,
  target_notes text,
  target_details jsonb,
  target_idempotency_key uuid
)
returns table(
  job_id uuid,
  service_request_id uuid,
  status text,
  recommended_price numeric,
  minimum_price numeric,
  low_price_warning_threshold numeric,
  currency text,
  pricing_version text,
  pricing_breakdown jsonb,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
  cid uuid;

  normalized_service text :=
    nullif(btrim(target_service_code), '');
  normalized_origin text :=
    nullif(btrim(target_origin_text), '');
  normalized_destination text :=
    nullif(btrim(target_destination_text), '');
  normalized_body_type text :=
    nullif(btrim(target_required_body_type), '');
  normalized_notes text :=
    nullif(btrim(target_notes), '');
  details_value jsonb :=
    coalesce(target_details, '{}'::jsonb);

  quote jsonb;
  payload jsonb;
  payload_digest text;

  op public.marketplace_customer_request_operations%rowtype;
  request_row public.service_requests%rowtype;
  job_row public.jobs%rowtype;

  commission_rate numeric(8,6);
begin
  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED'
      using errcode = '22023';
  end if;

  cid :=
    app_private.resolve_marketplace_customer_session(
      target_session_id,
      target_session_token
    );

  select project.id
  into pid
  from public.projects project
  where project.slug = 'tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if normalized_service is null then
    raise exception 'SERVICE_CODE_REQUIRED'
      using errcode = '22023';
  end if;

  if normalized_origin is null
    or char_length(normalized_origin) > 240
  then
    raise exception 'ORIGIN_INVALID'
      using errcode = '22023';
  end if;

  if normalized_destination is null
    or char_length(normalized_destination) > 240
  then
    raise exception 'DESTINATION_INVALID'
      using errcode = '22023';
  end if;

  if normalized_notes is not null
    and char_length(normalized_notes) > 1000
  then
    raise exception 'NOTES_TOO_LONG'
      using errcode = '22023';
  end if;

  if target_scheduled_for is not null
    and target_scheduled_for < now() - interval '5 minutes'
  then
    raise exception 'SCHEDULED_TIME_INVALID'
      using errcode = '22023';
  end if;

  if target_passenger_count is not null
    and target_passenger_count <= 0
  then
    raise exception 'PASSENGER_COUNT_INVALID'
      using errcode = '22023';
  end if;

  if normalized_service in ('passenger', 'tourism')
    and coalesce(target_passenger_count, 0) <= 0
  then
    raise exception 'PASSENGER_COUNT_REQUIRED'
      using errcode = '22023';
  end if;

  if normalized_service = 'cargo'
    and greatest(
      coalesce(target_cargo_weight_kg, 0),
      coalesce(target_cargo_volume_m3, 0),
      coalesce(target_cargo_length_cm, 0),
      coalesce(target_cargo_width_cm, 0),
      coalesce(target_cargo_height_cm, 0)
    ) <= 0
  then
    raise exception 'CARGO_REQUIREMENTS_REQUIRED'
      using errcode = '22023';
  end if;

  if coalesce(target_cargo_weight_kg, 0) < 0
    or coalesce(target_cargo_volume_m3, 0) < 0
    or coalesce(target_cargo_length_cm, 0) < 0
    or coalesce(target_cargo_width_cm, 0) < 0
    or coalesce(target_cargo_height_cm, 0) < 0
  then
    raise exception 'CARGO_REQUIREMENTS_INVALID'
      using errcode = '22023';
  end if;

  payload :=
    jsonb_build_object(
      'service_code', normalized_service,
      'origin_text', normalized_origin,
      'destination_text', normalized_destination,
      'scheduled_for', target_scheduled_for,
      'passenger_count', target_passenger_count,
      'cargo_weight_kg', target_cargo_weight_kg,
      'cargo_volume_m3', target_cargo_volume_m3,
      'cargo_length_cm', target_cargo_length_cm,
      'cargo_width_cm', target_cargo_width_cm,
      'cargo_height_cm', target_cargo_height_cm,
      'required_body_type', normalized_body_type,
      'notes', normalized_notes,
      'details', details_value
    );

  payload_digest :=
    encode(
      extensions.digest(
        convert_to(payload::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tuktuk:customer-request:'
      || pid::text
      || ':'
      || cid::text
      || ':'
      || target_idempotency_key::text,
      0
    )
  );

  select *
  into op
  from public.marketplace_customer_request_operations operation
  where operation.project_id = pid
    and operation.customer_id = cid
    and operation.idempotency_key = target_idempotency_key
  for update;

  if found then
    if op.operation_kind <> 'create_request'
      or op.payload_hash <> payload_digest
    then
      raise exception
        'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
        using errcode = '22023';
    end if;

    select job.*
    into job_row
    from public.jobs job
    where job.project_id = pid
      and job.id = op.job_id;

    if not found then
      raise exception 'IDEMPOTENCY_RESULT_NOT_FOUND';
    end if;

    return query
    select
      job_row.id,
      job_row.service_request_id,
      job_row.status,
      job_row.recommended_price,
      (job_row.pricing_breakdown ->> 'minimum_price')::numeric,
      (
        job_row.pricing_breakdown
          ->> 'low_price_warning_threshold'
      )::numeric,
      job_row.currency,
      job_row.pricing_version,
      job_row.pricing_breakdown,
      now();

    return;
  end if;

  quote :=
    app_private.calculate_marketplace_customer_quote(
      pid,
      normalized_service,
      target_passenger_count,
      target_cargo_weight_kg,
      target_cargo_volume_m3,
      details_value
    );

  select settings.commission_rate
  into commission_rate
  from public.project_marketplace_financial_settings settings
  where settings.project_id = pid;

  if commission_rate is null then
    raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  insert into public.service_requests(
    project_id,
    customer_id,
    service_code,
    origin_text,
    destination_text,
    scheduled_for,
    passenger_count,
    cargo_weight_kg,
    cargo_volume_m3,
    cargo_length_cm,
    cargo_width_cm,
    cargo_height_cm,
    required_body_type,
    notes,
    details
  )
  values (
    pid,
    cid,
    normalized_service,
    normalized_origin,
    normalized_destination,
    target_scheduled_for,
    target_passenger_count,
    target_cargo_weight_kg,
    target_cargo_volume_m3,
    target_cargo_length_cm,
    target_cargo_width_cm,
    target_cargo_height_cm,
    normalized_body_type,
    normalized_notes,
    details_value
  )
  returning *
  into request_row;

  insert into public.jobs(
    project_id,
    service_request_id,
    service_code,
    status,
    recommended_price,
    final_price,
    currency,
    price_warning_acknowledged,
    pricing_version,
    pricing_breakdown,
    commission_rate_snapshot
  )
  values (
    pid,
    request_row.id,
    normalized_service,
    'requested',
    (quote ->> 'recommended_price')::numeric,
    (quote ->> 'recommended_price')::numeric,
    quote ->> 'currency',
    false,
    quote ->> 'pricing_version',
    quote -> 'pricing_breakdown',
    commission_rate
  )
  returning *
  into job_row;

  insert into public.marketplace_customer_request_operations(
    project_id,
    customer_id,
    operation_kind,
    idempotency_key,
    payload_hash,
    job_id
  )
  values (
    pid,
    cid,
    'create_request',
    target_idempotency_key,
    payload_digest,
    job_row.id
  );

  return query
  select
    job_row.id,
    request_row.id,
    job_row.status,
    job_row.recommended_price,
    (quote ->> 'minimum_price')::numeric,
    (quote ->> 'low_price_warning_threshold')::numeric,
    job_row.currency,
    job_row.pricing_version,
    job_row.pricing_breakdown,
    now();
end;
$$;


create or replace function public.publish_marketplace_customer_job(
  target_session_id uuid,
  target_session_token text,
  target_job_id uuid,
  target_final_price numeric,
  target_price_warning_acknowledged boolean,
  target_idempotency_key uuid
)
returns table(
  job_id uuid,
  status text,
  recommended_price numeric,
  final_price numeric,
  minimum_price numeric,
  low_price_warning_threshold numeric,
  price_warning_required boolean,
  price_warning_acknowledged boolean,
  currency text,
  pricing_version text,
  pricing_breakdown jsonb,
  published_at timestamptz,
  expires_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
  cid uuid;

  job_row public.jobs%rowtype;
  request_row public.service_requests%rowtype;
  op public.marketplace_customer_request_operations%rowtype;

  quote jsonb;

  final_value numeric(14,2);
  minimum_value numeric(14,2);
  warning_threshold numeric(14,2);
  warning_required boolean;
  warning_ack boolean :=
    coalesce(target_price_warning_acknowledged, false);

  ttl_minutes integer;
  commission_rate numeric(8,6);

  payload jsonb;
  payload_digest text;
begin
  if target_job_id is null then
    raise exception 'JOB_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED'
      using errcode = '22023';
  end if;

  if target_final_price is null
    or target_final_price <= 0
  then
    raise exception 'FINAL_PRICE_INVALID'
      using errcode = '22023';
  end if;

  final_value := round(target_final_price, 2);

  cid :=
    app_private.resolve_marketplace_customer_session(
      target_session_id,
      target_session_token
    );

  select project.id
  into pid
  from public.projects project
  where project.slug = 'tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  payload :=
    jsonb_build_object(
      'job_id', target_job_id,
      'final_price', final_value,
      'price_warning_acknowledged', warning_ack
    );

  payload_digest :=
    encode(
      extensions.digest(
        convert_to(payload::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tuktuk:customer-publish:'
      || pid::text
      || ':'
      || cid::text
      || ':'
      || target_idempotency_key::text,
      0
    )
  );

  select *
  into op
  from public.marketplace_customer_request_operations operation
  where operation.project_id = pid
    and operation.customer_id = cid
    and operation.idempotency_key = target_idempotency_key
  for update;

  if found then
    if op.operation_kind <> 'publish_job'
      or op.job_id <> target_job_id
      or op.payload_hash <> payload_digest
    then
      raise exception
        'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
        using errcode = '22023';
    end if;

    select *
    into job_row
    from public.jobs job
    where job.project_id = pid
      and job.id = op.job_id;

    if not found then
      raise exception 'IDEMPOTENCY_RESULT_NOT_FOUND';
    end if;

    minimum_value :=
      (job_row.pricing_breakdown ->> 'minimum_price')::numeric;

    warning_threshold :=
      (
        job_row.pricing_breakdown
          ->> 'low_price_warning_threshold'
      )::numeric;

    warning_required :=
      job_row.final_price < warning_threshold;

    return query
    select
      job_row.id,
      job_row.status,
      job_row.recommended_price,
      job_row.final_price,
      minimum_value,
      warning_threshold,
      warning_required,
      job_row.price_warning_acknowledged,
      job_row.currency,
      job_row.pricing_version,
      job_row.pricing_breakdown,
      job_row.published_at,
      job_row.expires_at,
      now();

    return;
  end if;

  select *
  into job_row
  from public.jobs job
  where job.project_id = pid
    and job.id = target_job_id
  for update;

  if not found then
    raise exception 'JOB_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select *
  into request_row
  from public.service_requests request
  where request.project_id = pid
    and request.id = job_row.service_request_id;

  if not found or request_row.customer_id <> cid then
    raise exception 'ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if request_row.scheduled_for is not null
    and request_row.scheduled_for < now() - interval '5 minutes'
  then
    raise exception 'SCHEDULED_TIME_EXPIRED'
      using errcode = '22023';
  end if;

  if job_row.status <> 'requested' then
    raise exception 'JOB_NOT_REQUESTED'
      using errcode = '22023';
  end if;

  if not app_private.marketplace_job_transition_allowed(
    'requested',
    'published',
    'customer'
  ) then
    raise exception 'INVALID_JOB_TRANSITION'
      using errcode = '22023';
  end if;

  quote :=
    app_private.calculate_marketplace_customer_quote(
      pid,
      request_row.service_code,
      request_row.passenger_count,
      request_row.cargo_weight_kg,
      request_row.cargo_volume_m3,
      request_row.details
    );

  if job_row.pricing_version
    is distinct from (quote ->> 'pricing_version')
  then
    raise exception 'PRICE_QUOTE_STALE'
      using errcode = '22023';
  end if;

  minimum_value :=
    (quote ->> 'minimum_price')::numeric;

  warning_threshold :=
    (quote ->> 'low_price_warning_threshold')::numeric;

  if final_value < minimum_value then
    raise exception 'FINAL_PRICE_BELOW_MINIMUM'
      using errcode = '22023';
  end if;

  warning_required :=
    final_value < warning_threshold;

  if warning_required and not warning_ack then
    raise exception 'PRICE_WARNING_ACKNOWLEDGEMENT_REQUIRED'
      using errcode = '22023';
  end if;

  ttl_minutes :=
    (quote ->> 'publication_ttl_minutes')::integer;

  select settings.commission_rate
  into commission_rate
  from public.project_marketplace_financial_settings settings
  where settings.project_id = pid;

  if commission_rate is null then
    raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  update public.jobs
  set
    status = 'published',
    recommended_price =
      (quote ->> 'recommended_price')::numeric,
    final_price = final_value,
    currency = quote ->> 'currency',
    pricing_version = quote ->> 'pricing_version',
    pricing_breakdown = quote -> 'pricing_breakdown',
    commission_rate_snapshot = commission_rate,
    price_warning_acknowledged =
      case when warning_required then warning_ack else false end,
    published_at = now(),
    expires_at =
      now() + make_interval(mins => ttl_minutes),
    state_version = state_version + 1
  where project_id = pid
    and id = target_job_id
  returning *
  into job_row;

  insert into public.job_events(
    project_id,
    job_id,
    from_status,
    to_status,
    action,
    actor_kind,
    customer_id,
    operation_idempotency_key,
    metadata
  )
  values (
    pid,
    job_row.id,
    'requested',
    'published',
    'publish',
    'customer',
    cid,
    target_idempotency_key,
    jsonb_build_object(
      'recommended_price', job_row.recommended_price,
      'final_price', job_row.final_price,
      'currency', job_row.currency,
      'pricing_version', job_row.pricing_version,
      'price_warning_required', warning_required,
      'price_warning_acknowledged',
        job_row.price_warning_acknowledged
    )
  );

  insert into public.marketplace_customer_request_operations(
    project_id,
    customer_id,
    operation_kind,
    idempotency_key,
    payload_hash,
    job_id
  )
  values (
    pid,
    cid,
    'publish_job',
    target_idempotency_key,
    payload_digest,
    job_row.id
  );

  return query
  select
    job_row.id,
    job_row.status,
    job_row.recommended_price,
    job_row.final_price,
    minimum_value,
    warning_threshold,
    warning_required,
    job_row.price_warning_acknowledged,
    job_row.currency,
    job_row.pricing_version,
    job_row.pricing_breakdown,
    job_row.published_at,
    job_row.expires_at,
    now();
end;
$$;


create or replace function public.admin_create_marketplace_pricing_rule(
  target_project_id uuid,
  target_service_code text,
  target_version text,
  target_base_price numeric,
  target_minimum_price numeric,
  target_per_km_price numeric,
  target_per_extra_passenger_price numeric,
  target_per_cargo_kg_price numeric,
  target_per_cargo_m3_price numeric,
  target_per_stop_price numeric,
  target_load_help_surcharge numeric,
  target_unload_help_surcharge numeric,
  target_urgency_multiplier numeric,
  target_low_price_warning_ratio numeric,
  target_rounding_increment numeric,
  target_rounding_mode text,
  target_publication_ttl_minutes integer,
  target_activate boolean
)
returns public.marketplace_pricing_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  result public.marketplace_pricing_rules%rowtype;
begin
  actor :=
    app_private.require_project_permission(
      target_project_id,
      'marketplace.manage'
    );

  if not exists (
    select 1
    from public.service_types service
    where service.project_id = target_project_id
      and service.code = target_service_code
  ) then
    raise exception 'MARKETPLACE_SERVICE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if target_activate then
    update public.marketplace_pricing_rules rule
    set active = false
    where rule.project_id = target_project_id
      and rule.service_code = target_service_code
      and rule.active;
  end if;

  insert into public.marketplace_pricing_rules(
    project_id,
    service_code,
    version,
    active,
    currency,
    base_price,
    minimum_price,
    per_km_price,
    per_extra_passenger_price,
    per_cargo_kg_price,
    per_cargo_m3_price,
    per_stop_price,
    load_help_surcharge,
    unload_help_surcharge,
    urgency_multiplier,
    low_price_warning_ratio,
    rounding_increment,
    rounding_mode,
    publication_ttl_minutes,
    created_by
  )
  values (
    target_project_id,
    target_service_code,
    target_version,
    target_activate,
    'CUP',
    target_base_price,
    target_minimum_price,
    coalesce(target_per_km_price, 0),
    coalesce(target_per_extra_passenger_price, 0),
    coalesce(target_per_cargo_kg_price, 0),
    coalesce(target_per_cargo_m3_price, 0),
    coalesce(target_per_stop_price, 0),
    coalesce(target_load_help_surcharge, 0),
    coalesce(target_unload_help_surcharge, 0),
    coalesce(target_urgency_multiplier, 1),
    target_low_price_warning_ratio,
    target_rounding_increment,
    target_rounding_mode,
    target_publication_ttl_minutes,
    actor
  )
  returning *
  into result;

  return result;
end;
$$;


create or replace function public.admin_list_marketplace_pricing_rules(
  target_project_id uuid
)
returns setof public.marketplace_pricing_rules
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(
    target_project_id,
    'marketplace.view'
  );

  return query
  select rule.*
  from public.marketplace_pricing_rules rule
  where rule.project_id = target_project_id
  order by
    rule.service_code,
    rule.active desc,
    rule.created_at desc;
end;
$$;


revoke all on function
  public.list_marketplace_customer_services(),
  public.create_marketplace_customer_request(
    uuid,
    text,
    text,
    text,
    text,
    timestamptz,
    integer,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    text,
    text,
    jsonb,
    uuid
  ),
  public.publish_marketplace_customer_job(
    uuid,
    text,
    uuid,
    numeric,
    boolean,
    uuid
  ),
  public.admin_create_marketplace_pricing_rule(
    uuid,
    text,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    text,
    integer,
    boolean
  ),
  public.admin_list_marketplace_pricing_rules(uuid)
from public, anon, authenticated;


grant execute on function
  public.list_marketplace_customer_services(),
  public.create_marketplace_customer_request(
    uuid,
    text,
    text,
    text,
    text,
    timestamptz,
    integer,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    text,
    text,
    jsonb,
    uuid
  ),
  public.publish_marketplace_customer_job(
    uuid,
    text,
    uuid,
    numeric,
    boolean,
    uuid
  )
to anon, authenticated;


grant execute on function
  public.admin_create_marketplace_pricing_rule(
    uuid,
    text,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    text,
    integer,
    boolean
  ),
  public.admin_list_marketplace_pricing_rules(uuid)
to authenticated;