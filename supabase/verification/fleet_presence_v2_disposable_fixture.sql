-- Disposable PostgreSQL only. No real users, projects, or production credentials.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA app_private;
CREATE SCHEMA cron;
GRANT USAGE ON SCHEMA app_private TO service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
CREATE TABLE cron.fixture_jobs(name text PRIMARY KEY,schedule text,command text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.fixture_jobs VALUES($1,$2,$3) RETURNING 1::bigint;
$$;

CREATE TABLE public.projects(id uuid PRIMARY KEY,slug text UNIQUE NOT NULL);
CREATE TABLE public.driver_profiles(project_id uuid,user_id uuid,status text,activated_at timestamptz,suspended_at timestamptz,PRIMARY KEY(project_id,user_id));
CREATE TABLE public.vehicles(project_id uuid,id text,marketplace_status text,deleted_at timestamptz,PRIMARY KEY(project_id,id));
CREATE TABLE public.driver_vehicle_assignments(project_id uuid,driver_user_id uuid,vehicle_id text,is_active boolean NOT NULL,accepting_jobs boolean NOT NULL,is_available boolean NOT NULL,updated_at timestamptz NOT NULL,PRIMARY KEY(project_id,driver_user_id,vehicle_id));
CREATE TABLE public.marketplace_driver_locations(project_id uuid,driver_user_id uuid,vehicle_id text,latitude numeric,longitude numeric,accuracy_m numeric,captured_at timestamptz,received_at timestamptz,PRIMARY KEY(project_id,driver_user_id));
CREATE TABLE public.jobs(id uuid PRIMARY KEY,project_id uuid,assigned_driver_user_id uuid,assigned_vehicle_id text,status text,test_deleted_at timestamptz);
CREATE TABLE public.marketplace_incident_resolutions(id uuid PRIMARY KEY,project_id uuid,job_id uuid);

CREATE FUNCTION app_private.marketplace_customer_project_id() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.projects WHERE slug='tuktuk-control';
$$;
CREATE FUNCTION app_private.resolve_marketplace_customer_session(uuid,text) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  IF $1 IS DISTINCT FROM '00000000-0000-0000-0000-000000000099'::uuid OR $2 IS DISTINCT FROM 'fixture-token' THEN
    RAISE EXCEPTION 'SESSION_INVALID';
  END IF;
  RETURN $1;
END;
$$;

-- Match the production map's relevant anchors and return shape.
CREATE FUNCTION public.admin_get_marketplace_operational_map(target_project_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
WITH selected_assignments AS (
  SELECT * FROM public.driver_vehicle_assignments WHERE project_id=target_project_id
), drivers AS (
  SELECT a.driver_user_id,
      l.latitude as last_latitude,
      l.longitude as last_longitude,
      l.accuracy_m as last_accuracy_m,
      l.captured_at,
      freshness.freshness_seconds,
      freshness.location_fresh
    from selected_assignments a
    left join public.marketplace_driver_locations l
      on l.project_id = target_project_id
     and l.driver_user_id = a.driver_user_id
     and l.vehicle_id = a.vehicle_id
    cross join lateral (
      SELECT 300 AS freshness_seconds,
        coalesce(l.captured_at>=now()-interval '5 minutes',false) AS location_fresh
    ) freshness
)
SELECT coalesce(jsonb_agg(to_jsonb(drivers)),'[]'::jsonb) FROM drivers;
$$;

INSERT INTO public.projects VALUES('00000000-0000-0000-0000-000000000001','tuktuk-control');
-- 1=stale, 2=recent GPS, 3=rest, 4=active job, 5=recent heartbeat without GPS,
-- 6=incident, 7=suspended, 8=old coverage, 9=recent completed, 10=never located.
INSERT INTO public.driver_profiles
SELECT '00000000-0000-0000-0000-000000000001', ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  'active',now()-interval '60 days',CASE WHEN i=7 THEN now() END
FROM generate_series(1,10) i;
INSERT INTO public.vehicles SELECT '00000000-0000-0000-0000-000000000001','v'||i,'active',NULL FROM generate_series(1,10) i;
INSERT INTO public.driver_vehicle_assignments
SELECT '00000000-0000-0000-0000-000000000001',('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  'v'||i,true,i<>3,i NOT IN (3,4,6,9),now()-interval '8 hours'
FROM generate_series(1,10) i;
INSERT INTO public.marketplace_driver_locations
SELECT '00000000-0000-0000-0000-000000000001',('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'v'||i,
  23.1+i*0.013,-82.4+i*0.013,20,
  now()-CASE WHEN i=2 THEN interval '1 minute' WHEN i=8 THEN interval '31 days' ELSE interval '8 hours' END,
  now()-CASE WHEN i=2 THEN interval '1 minute' WHEN i=8 THEN interval '31 days' ELSE interval '8 hours' END
FROM generate_series(1,9) i WHERE i<>5;
INSERT INTO public.jobs VALUES
('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','v4','in_progress',NULL),
('20000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006','v6','incident',NULL),
('20000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000009','v9','completed',NULL);

\ir ../../docs/security/fleet-presence-v2-candidate.sql

DO $test$
DECLARE n integer; result jsonb; row_data jsonb;
BEGIN
  IF app_private.expire_marketplace_driver_shifts_v2()<>0 THEN RAISE EXCEPTION 'disabled expiration changed state'; END IF;
  IF NOT EXISTS(SELECT 1 FROM cron.fixture_jobs WHERE name='tuktuk-expire-inactive-shifts-v2' AND schedule='*/15 * * * *') THEN RAISE EXCEPTION 'cron not configured'; END IF;
  IF has_table_privilege('authenticated','app_private.marketplace_driver_presence_v2','SELECT') OR
     has_table_privilege('service_role','app_private.marketplace_driver_presence_v2','SELECT') OR
     has_function_privilege('anon','public.marketplace_driver_presence_heartbeat_v2(text)','EXECUTE') OR
     NOT has_function_privilege('authenticated','public.marketplace_driver_presence_heartbeat_v2(text)','EXECUTE') OR
     has_function_privilege('authenticated','public.get_marketplace_customer_fleet_presence_v2(uuid,text)','EXECUTE') OR
     NOT has_function_privilege('service_role','public.get_marketplace_customer_fleet_presence_v2(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'privileges incorrect'; END IF;

  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
  IF NOT public.marketplace_driver_presence_heartbeat_v2('v5') OR public.marketplace_driver_presence_heartbeat_v2('v1') THEN RAISE EXCEPTION 'heartbeat ownership failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
  IF public.marketplace_driver_presence_heartbeat_v2('v3') THEN RAISE EXCEPTION 'heartbeat reopened resting shift'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000007',true);
  IF public.marketplace_driver_presence_heartbeat_v2('v7') THEN RAISE EXCEPTION 'suspended heartbeat allowed'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN
    PERFORM public.marketplace_driver_presence_heartbeat_v2('v1');
    RAISE EXCEPTION 'anonymous heartbeat accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  DELETE FROM public.marketplace_driver_locations WHERE vehicle_id='v3';
  SELECT x INTO row_data FROM jsonb_array_elements(public.admin_get_marketplace_operational_map('00000000-0000-0000-0000-000000000001')) x
  WHERE x->>'driver_user_id'='10000000-0000-0000-0000-000000000003';
  IF row_data IS NULL OR row_data->>'last_latitude' IS NULL OR (row_data->>'location_fresh')::boolean THEN RAISE EXCEPTION 'admin fallback missing or marked fresh'; END IF;

  result:=public.get_marketplace_customer_fleet_presence_v2('00000000-0000-0000-0000-000000000099','fixture-token');
  IF jsonb_array_length(result)<>6 THEN RAISE EXCEPTION 'coverage count incorrect: %',result; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(result) x WHERE (x->>'available_now')::boolean)<>1 THEN RAISE EXCEPTION 'live availability incorrect'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result) x WHERE x - 'latitude' - 'longitude' - 'available_now' <> '{}'::jsonb) THEN RAISE EXCEPTION 'personal fields leaked'; END IF;
  BEGIN
    PERFORM public.get_marketplace_customer_fleet_presence_v2('00000000-0000-0000-0000-000000000099','invalid');
    RAISE EXCEPTION 'invalid session accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SESSION_INVALID' THEN RAISE; END IF; END;

  UPDATE app_private.marketplace_presence_policy_v2 SET auto_expire_enabled=true;
  n:=app_private.expire_marketplace_driver_shifts_v2();
  IF n<>4 THEN RAISE EXCEPTION 'unexpected expiration count %',n; END IF;
  IF EXISTS(SELECT 1 FROM public.driver_vehicle_assignments WHERE vehicle_id IN ('v1','v7','v8','v10') AND (accepting_jobs OR is_available)) THEN RAISE EXCEPTION 'ghost remained'; END IF;
  IF EXISTS(SELECT 1 FROM public.driver_vehicle_assignments WHERE vehicle_id IN ('v2','v4','v5','v6','v9') AND NOT accepting_jobs) THEN RAISE EXCEPTION 'protected shift closed'; END IF;
  IF app_private.expire_marketplace_driver_shifts_v2()<>0 THEN RAISE EXCEPTION 'expiration not idempotent'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
  IF public.marketplace_driver_presence_heartbeat_v2('v1') THEN RAISE EXCEPTION 'expired shift reopened'; END IF;
  BEGIN
    UPDATE public.marketplace_driver_locations SET received_at=now() WHERE vehicle_id='v1';
    RAISE EXCEPTION 'GPS write reopened expired shift';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.marketplace_driver_locations SET received_at=now(),captured_at=now() WHERE vehicle_id='v4';
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE assigned_vehicle_id='v4' AND status='in_progress') THEN RAISE EXCEPTION 'active ride changed'; END IF;
END;
$test$;
SELECT 'FLEET_PRESENCE_V2_DISPOSABLE_PASS' AS result;
