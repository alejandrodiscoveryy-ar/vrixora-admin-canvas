begin;

do $$
declare
  relation_name text;
  privilege_name text;
  definition text;
  function_definition text;
  required_column text;
  expected_status_values text[];
  actual_status_values text[];
  state_values text[] := array[
    'requested', 'published', 'accepted', 'en_route', 'pickup', 'in_progress',
    'completed', 'settled', 'cancelled_by_customer', 'cancelled_by_driver', 'expired', 'incident'
  ];
begin
  foreach relation_name in array array['customers', 'service_requests', 'jobs', 'job_events'] loop
    if to_regclass('public.' || relation_name) is null then
      raise exception 'TEST_FAILED: missing table public.%', relation_name;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || relation_name)::regclass) then
      raise exception 'TEST_FAILED: RLS is not enabled on %', relation_name;
    end if;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', 'public.' || relation_name, privilege_name)
        or has_table_privilege('authenticated', 'public.' || relation_name, privilege_name) then
        raise exception 'TEST_FAILED: direct % access exists on %', privilege_name, relation_name;
      end if;
    end loop;
  end loop;

  if exists (
    select 1 from pg_constraint where conrelid = 'public.customers'::regclass and contype = 'u'
      and lower(pg_get_constraintdef(oid)) like '%whatsapp_phone%'
  ) then raise exception 'TEST_FAILED: customers must not make whatsapp_phone unique'; end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='jobs'
      and column_name in ('display_name', 'whatsapp_phone', 'phone', 'customer_name', 'customer_phone')) then
    raise exception 'TEST_FAILED: jobs contains customer PII';
  end if;

  foreach required_column in array array[
    'passenger_count', 'cargo_weight_kg', 'cargo_volume_m3', 'cargo_length_cm', 'cargo_width_cm', 'cargo_height_cm'
  ] loop
    if not exists (select 1 from information_schema.columns where table_schema='public'
      and table_name='service_requests' and column_name=required_column) then
      raise exception 'TEST_FAILED: service_requests lacks typed %', required_column;
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conrelid='public.service_requests'::regclass and contype='f'
      and pg_get_constraintdef(oid) like '%project_id, service_code%' and pg_get_constraintdef(oid) like '%service_types%')
    or not exists (select 1 from pg_constraint where conrelid='public.jobs'::regclass and contype='f'
      and pg_get_constraintdef(oid) like '%project_id, service_request_id, service_code%'
      and pg_get_constraintdef(oid) like '%service_requests%') then
    raise exception 'TEST_FAILED: canonical service-code FKs are missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.jobs'::regclass and contype='u'
      and pg_get_constraintdef(oid) like '%project_id, service_request_id%') then
    raise exception 'TEST_FAILED: jobs must allow only one job per service request';
  end if;

  select lower(pg_get_constraintdef(oid)) into definition
  from pg_constraint where conrelid='public.jobs'::regclass and contype='c'
    and lower(pg_get_constraintdef(oid)) like '%status%' order by oid limit 1;
  if definition is null then raise exception 'TEST_FAILED: jobs status CHECK missing'; end if;
  select array_agg(state_value order by state_value) into expected_status_values
  from unnest(state_values) as state_value;
  select array_agg(status_match[1] order by status_match[1]) into actual_status_values
  from regexp_matches(definition, '''([^'']+)''', 'g') as status_match;
  if actual_status_values is distinct from expected_status_values then
    raise exception 'TEST_FAILED: jobs status CHECK is not exact: %', actual_status_values;
  end if;
  if position(quote_literal('reserved') in definition) > 0 then raise exception 'TEST_FAILED: reserved is a forbidden job status'; end if;

  if not exists (select 1 from pg_constraint where conrelid='public.jobs'::regclass and contype='c'
      and lower(pg_get_constraintdef(oid)) like '%status <> ''incident''%'
      and lower(pg_get_constraintdef(oid)) like '%incident_from_status in%'
      and lower(pg_get_constraintdef(oid)) like '%incident_opened_at is not null%'
      and lower(pg_get_constraintdef(oid)) like '%incident_reason%') then
    raise exception 'TEST_FAILED: incident state coherence CHECK missing';
  end if;

  if not exists (select 1 from pg_constraint where conrelid='public.jobs'::regclass and contype='c'
      and lower(pg_get_constraintdef(oid)) like '%recommended_price > 0%')
    or not exists (select 1 from pg_constraint where conrelid='public.jobs'::regclass and contype='c'
      and lower(pg_get_constraintdef(oid)) like '%final_price > 0%')
    or not exists (select 1 from pg_constraint where conrelid='public.jobs'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%currency = ''CUP''%')
    or not exists (select 1 from pg_constraint where conrelid='public.jobs'::regclass and contype='c'
      and lower(pg_get_constraintdef(oid)) like '%commission_rate_snapshot > 0%'
      and lower(pg_get_constraintdef(oid)) like '%commission_rate_snapshot <= 1%') then
    raise exception 'TEST_FAILED: job pricing constraints are incomplete';
  end if;

  if not exists (select 1 from pg_trigger where tgrelid='public.jobs'::regclass and tgname='jobs_protect_pricing_snapshot' and not tgisinternal)
    or not exists (select 1 from pg_trigger where tgrelid='public.service_requests'::regclass and tgname='service_requests_protect_published_request' and not tgisinternal)
    or not exists (select 1 from pg_trigger where tgrelid='public.job_events'::regclass and tgname='job_events_append_only' and not tgisinternal)
    or not exists (select 1 from pg_trigger where tgrelid='public.jobs'::regclass and tgname='jobs_lock_service_request_on_publication' and not tgisinternal) then
    raise exception 'TEST_FAILED: required immutability trigger missing';
  end if;

  select lower(pg_get_functiondef('app_private.protect_job_pricing_snapshot()'::regprocedure)) into function_definition;
  if position('old.status <> ''requested''' in function_definition) = 0 then
    raise exception 'TEST_FAILED: pricing snapshot is not protected after requested';
  end if;
  foreach required_column in array array[
    'recommended_price', 'final_price', 'currency', 'pricing_version', 'commission_rate_snapshot',
    'price_warning_acknowledged', 'service_request_id', 'service_code'
  ] loop
    if position(required_column in function_definition) = 0 then
      raise exception 'TEST_FAILED: pricing snapshot does not protect %', required_column;
    end if;
  end loop;

  select lower(pg_get_functiondef('app_private.protect_published_service_request()'::regprocedure)) into function_definition;
  if position('job.status <> ''requested''' in function_definition) = 0 then
    raise exception 'TEST_FAILED: service request is not protected after publication';
  end if;
  foreach required_column in array array[
    'customer_id', 'service_code', 'origin_text', 'destination_text', 'scheduled_for', 'passenger_count',
    'cargo_weight_kg', 'cargo_volume_m3', 'cargo_length_cm', 'cargo_width_cm', 'cargo_height_cm',
    'required_body_type', 'notes', 'details'
  ] loop
    if position(required_column in function_definition) = 0 then
      raise exception 'TEST_FAILED: published service request does not protect %', required_column;
    end if;
  end loop;

  select lower(pg_get_functiondef('app_private.prevent_job_event_mutation()'::regprocedure)) into function_definition;
  if position('raise exception' in function_definition) = 0
    or position('job_events_are_append_only' in function_definition) = 0 then
    raise exception 'TEST_FAILED: job event mutation guard does not reject writes';
  end if;

  if to_regprocedure('app_private.lock_service_request_on_job_publication()') is null
    or has_function_privilege('anon','app_private.lock_service_request_on_job_publication()','EXECUTE')
    or has_function_privilege('authenticated','app_private.lock_service_request_on_job_publication()','EXECUTE') then
    raise exception 'TEST_FAILED: service request publication lock is unavailable or client-executable';
  end if;
  select lower(pg_get_functiondef('app_private.lock_service_request_on_job_publication()'::regprocedure)) into function_definition;
  if position('old.status = ''requested''' in function_definition) = 0
    or position('new.status <> ''requested''' in function_definition) = 0
    or position('service_request.project_id = new.project_id' in function_definition) = 0
    or position('service_request.id = new.service_request_id' in function_definition) = 0
    or position('for update' in function_definition) = 0 then
    raise exception 'TEST_FAILED: publication lock does not serialize the service request';
  end if;

  if not exists (select 1 from pg_constraint where conrelid='public.job_events'::regclass and contype='u'
      and pg_get_constraintdef(oid) like '%project_id, operation_idempotency_key%')
    or not exists (select 1 from pg_constraint where conrelid='public.job_events'::regclass and contype='c'
      and lower(pg_get_constraintdef(oid)) like '%jsonb_typeof(metadata)%'
      and lower(pg_get_constraintdef(oid)) like '%object%') then
    raise exception 'TEST_FAILED: job event idempotency or metadata protection missing';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='job_events'
      and column_name='created_at' and column_default like 'now()%')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='job_events'
      and column_name='client_occurred_at') then
    raise exception 'TEST_FAILED: job event server/client timestamps missing';
  end if;

  if to_regprocedure('app_private.marketplace_job_transition_allowed(text,text,text)') is null
    or has_function_privilege('anon','app_private.marketplace_job_transition_allowed(text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','app_private.marketplace_job_transition_allowed(text,text,text)','EXECUTE') then
    raise exception 'TEST_FAILED: private transition helper is unavailable or client-executable';
  end if;

  if not app_private.marketplace_job_transition_allowed('requested','published','customer')
    or not app_private.marketplace_job_transition_allowed('published','accepted','driver')
    or not app_private.marketplace_job_transition_allowed('accepted','en_route','driver')
    or not app_private.marketplace_job_transition_allowed('in_progress','completed','driver')
    or not app_private.marketplace_job_transition_allowed('completed','settled','system')
    or not app_private.marketplace_job_transition_allowed('settled','incident','admin') then
    raise exception 'TEST_FAILED: representative allowed transition rejected';
  end if;
  if app_private.marketplace_job_transition_allowed('requested','accepted','driver')
    or app_private.marketplace_job_transition_allowed('published','in_progress','driver')
    or app_private.marketplace_job_transition_allowed('accepted','completed','driver')
    or app_private.marketplace_job_transition_allowed('in_progress','settled','system')
    or app_private.marketplace_job_transition_allowed('cancelled_by_customer','published','customer')
    or app_private.marketplace_job_transition_allowed('expired','published','system')
    or app_private.marketplace_job_transition_allowed('accepted','en_route','customer')
    or app_private.marketplace_job_transition_allowed('completed','settled','driver') then
    raise exception 'TEST_FAILED: invalid job transition accepted';
  end if;

  if to_regprocedure('public.set_job_status(text)') is not null
    or exists (select 1 from pg_proc procedure join pg_namespace namespace on namespace.oid=procedure.pronamespace
      where namespace.nspname='public' and procedure.proname='set_job_status') then
    raise exception 'TEST_FAILED: public generic set_job_status RPC exists';
  end if;
  if to_regclass('public.job_assignments') is not null or to_regclass('public.commission_reservations') is not null then
    raise exception 'TEST_FAILED: out-of-scope Block 6 tables exist';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public'
      and table_name in ('customers','service_requests','jobs','job_events')
      and (udt_name in ('geometry', 'geography')
        or column_name ~ '(^|_)(latitude|longitude|lat|lon|lng|geolocation|geo_location)(_|$)')) then
    raise exception 'TEST_FAILED: Block 5 must not introduce PostGIS/geolocation';
  end if;

  if to_regclass('public.jobs_assigned_driver_vehicle_idx') is null
    or to_regclass('public.job_events_project_customer_idx') is null then
    raise exception 'TEST_FAILED: relationship lookup indexes are missing';
  end if;

  select lower(pg_get_constraintdef(oid)) into definition from pg_constraint
  where conrelid='public.sync_entities'::regclass and contype='c'
    and lower(pg_get_constraintdef(oid)) like '%entity_type%' limit 1;
  if definition is null
    or definition not like '%dailyrecord%' or definition not like '%maintenance%'
    or definition not like '%vehicle%' or definition not like '%settings%'
    or definition like '%job%' or definition like '%service_request%' or definition like '%customer%'
    or definition like '%wallet%' or definition like '%topup%' or definition like '%commission%'
    or definition like '%assignment%' or definition like '%reservation%' then
    raise exception 'TEST_FAILED: sync_entities Control-only contract changed';
  end if;
end;
$$;

-- No PostgreSQL fixture environment is included in this repository. Dynamic DML tests
-- (snapshot mutation rejection and append-only rejection) are deliberately left to a local
-- Supabase database with valid project/auth fixtures; this file remains rollback-safe.
rollback;
