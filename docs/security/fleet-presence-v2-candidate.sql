-- Candidate migration; validate on an isolated database before applying.
-- No existing customer V1 contract changes. Expiration is disabled until driver rollout.
BEGIN;

CREATE TABLE app_private.marketplace_driver_presence_v2 (
  project_id uuid NOT NULL,
  driver_user_id uuid NOT NULL,
  vehicle_id text NOT NULL,
  last_contact_at timestamptz,
  coverage_latitude numeric,
  coverage_longitude numeric,
  coverage_captured_at timestamptz,
  PRIMARY KEY(project_id, driver_user_id, vehicle_id),
  CHECK ((coverage_latitude IS NULL) = (coverage_longitude IS NULL))
);
ALTER TABLE app_private.marketplace_driver_presence_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.marketplace_driver_presence_v2 FROM PUBLIC, anon, authenticated, service_role;

-- Store only a coarse coverage cell, independently of the operational GPS row.
-- Existing explicit clearing of the operational location remains unchanged.
CREATE FUNCTION app_private.capture_marketplace_presence_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.projects p WHERE p.id=NEW.project_id AND p.slug='tuktuk-control')
     AND NEW.latitude BETWEEN 18 AND 24.5 AND NEW.longitude BETWEEN -85.5 AND -73 THEN
    INSERT INTO app_private.marketplace_driver_presence_v2 AS p
      (project_id,driver_user_id,vehicle_id,last_contact_at,coverage_latitude,coverage_longitude,coverage_captured_at)
    VALUES (NEW.project_id,NEW.driver_user_id,NEW.vehicle_id,NEW.received_at,
      round(NEW.latitude / 0.01)*0.01,round(NEW.longitude / 0.01)*0.01,NEW.captured_at)
    ON CONFLICT (project_id,driver_user_id,vehicle_id) DO UPDATE
      SET last_contact_at=greatest(p.last_contact_at,EXCLUDED.last_contact_at),
          coverage_latitude=EXCLUDED.coverage_latitude,
          coverage_longitude=EXCLUDED.coverage_longitude,
          coverage_captured_at=EXCLUDED.coverage_captured_at
      WHERE p.coverage_captured_at IS NULL OR EXCLUDED.coverage_captured_at >= p.coverage_captured_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.capture_marketplace_presence_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER marketplace_presence_v2_capture
AFTER INSERT OR UPDATE OF latitude,longitude,captured_at,received_at ON public.marketplace_driver_locations
FOR EACH ROW EXECUTE FUNCTION app_private.capture_marketplace_presence_v2();

-- Backfill only positions actually received, not invented positions.
INSERT INTO app_private.marketplace_driver_presence_v2
  (project_id,driver_user_id,vehicle_id,last_contact_at,coverage_latitude,coverage_longitude,coverage_captured_at)
SELECT l.project_id,l.driver_user_id,l.vehicle_id,l.received_at,
       round(l.latitude / 0.01)*0.01,round(l.longitude / 0.01)*0.01,l.captured_at
FROM public.marketplace_driver_locations l JOIN public.projects p ON p.id=l.project_id
WHERE p.slug='tuktuk-control' AND l.latitude BETWEEN 18 AND 24.5 AND l.longitude BETWEEN -85.5 AND -73
ON CONFLICT DO NOTHING;

-- Authentication and active assignment are verified here, not trusted from the client.
-- The assignment lock serializes heartbeats with shift expiration and acceptance.
CREATE FUNCTION public.marketplace_driver_presence_heartbeat_v2(target_vehicle_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE actor uuid:=auth.uid(); pid uuid; working boolean;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT id INTO STRICT pid FROM public.projects WHERE slug='tuktuk-control';
  SELECT a.accepting_jobs INTO working
  FROM public.driver_vehicle_assignments a
  JOIN public.driver_profiles d ON d.project_id=a.project_id AND d.user_id=a.driver_user_id
  JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id
  WHERE a.project_id=pid AND a.driver_user_id=actor AND a.vehicle_id=target_vehicle_id
    AND a.is_active AND d.status='active' AND d.activated_at IS NOT NULL AND d.suspended_at IS NULL
    AND v.marketplace_status='active' AND v.deleted_at IS NULL
  FOR UPDATE OF a;
  IF NOT FOUND OR NOT coalesce(working,false) THEN RETURN false; END IF;
  INSERT INTO app_private.marketplace_driver_presence_v2 AS p
    (project_id,driver_user_id,vehicle_id,last_contact_at)
  VALUES(pid,actor,target_vehicle_id,now())
  ON CONFLICT (project_id,driver_user_id,vehicle_id) DO UPDATE
    SET last_contact_at=greatest(p.last_contact_at,EXCLUDED.last_contact_at);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.marketplace_driver_presence_heartbeat_v2(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_driver_presence_heartbeat_v2(text) TO authenticated;

CREATE TABLE app_private.marketplace_presence_policy_v2 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  auto_expire_enabled boolean NOT NULL DEFAULT false,
  inactivity_hours integer NOT NULL DEFAULT 6 CHECK(inactivity_hours BETWEEN 1 AND 24),
  coverage_days integer NOT NULL DEFAULT 30 CHECK(coverage_days BETWEEN 1 AND 90)
);
ALTER TABLE app_private.marketplace_presence_policy_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.marketplace_presence_policy_v2 FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO app_private.marketplace_presence_policy_v2(singleton) VALUES(true);

-- Use actual server contact, not merely a recent device GPS timestamp.
-- Protect active, incident and completed-awaiting-rating work; no job rows are changed.
-- The assignment lock is shared with accept_job and explicit Work/Rest.
CREATE FUNCTION app_private.expire_marketplace_driver_shifts_v2()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE candidate record; closed integer:=0; threshold timestamptz;
BEGIN
  SELECT now()-make_interval(hours=>inactivity_hours) INTO threshold
    FROM app_private.marketplace_presence_policy_v2 WHERE singleton AND auto_expire_enabled;
  IF threshold IS NULL THEN RETURN 0; END IF;
  FOR candidate IN
    SELECT a.project_id,a.driver_user_id,a.vehicle_id
    FROM public.driver_vehicle_assignments a
    JOIN public.projects p ON p.id=a.project_id AND p.slug='tuktuk-control'
    LEFT JOIN app_private.marketplace_driver_presence_v2 s
      ON s.project_id=a.project_id AND s.driver_user_id=a.driver_user_id AND s.vehicle_id=a.vehicle_id
    LEFT JOIN public.marketplace_driver_locations l
      ON l.project_id=a.project_id AND l.driver_user_id=a.driver_user_id AND l.vehicle_id=a.vehicle_id
    WHERE a.is_active AND a.accepting_jobs
      AND greatest(a.updated_at,s.last_contact_at,l.received_at)<threshold
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    -- Recheck after acquiring the assignment lock (including concurrent heartbeats).
    UPDATE public.driver_vehicle_assignments a
       SET accepting_jobs=false,is_available=false,updated_at=now()
     WHERE a.project_id=candidate.project_id AND a.driver_user_id=candidate.driver_user_id
       AND a.vehicle_id=candidate.vehicle_id AND a.is_active AND a.accepting_jobs
       AND greatest(a.updated_at,
         (SELECT s.last_contact_at FROM app_private.marketplace_driver_presence_v2 s
          WHERE s.project_id=a.project_id AND s.driver_user_id=a.driver_user_id AND s.vehicle_id=a.vehicle_id),
         (SELECT l.received_at FROM public.marketplace_driver_locations l
          WHERE l.project_id=a.project_id AND l.driver_user_id=a.driver_user_id AND l.vehicle_id=a.vehicle_id))<threshold
       AND NOT EXISTS (
         SELECT 1 FROM public.jobs j
         LEFT JOIN public.marketplace_incident_resolutions r ON r.project_id=j.project_id AND r.job_id=j.id
         WHERE j.project_id=a.project_id AND j.assigned_driver_user_id=a.driver_user_id
           AND j.test_deleted_at IS NULL
           AND (j.status IN ('accepted','en_route','pickup','in_progress','completed')
                OR (j.status='incident' AND r.id IS NULL))
       );
    IF FOUND THEN closed:=closed+1; END IF;
  END LOOP;
  RETURN closed;
END;
$$;
REVOKE ALL ON FUNCTION app_private.expire_marketplace_driver_shifts_v2() FROM PUBLIC,anon,authenticated,service_role;
-- Activation is a separate operation after verified conductor rollout.
-- pg_cron already exists in the TukTuk project.
SELECT cron.schedule('tuktuk-expire-inactive-shifts-v2','*/15 * * * *',
  'SELECT app_private.expire_marketplace_driver_shifts_v2();');

-- New, isolated customer API. V1 remains unchanged for existing web/APK clients.
-- Live cells are approximately 330 m; historical coverage cells approximately 1 km.
-- No names, identifiers, timestamps, paths, or exact locations leave the database.
CREATE FUNCTION app_private.marketplace_customer_fleet_presence_v2(target_session_id uuid,target_session_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE pid uuid; result jsonb; retention integer;
BEGIN
  PERFORM app_private.resolve_marketplace_customer_session(target_session_id,target_session_token);
  pid:=app_private.marketplace_customer_project_id();
  SELECT coverage_days INTO STRICT retention FROM app_private.marketplace_presence_policy_v2 WHERE singleton;
  SELECT coalesce(jsonb_agg(jsonb_build_object('latitude',q.lat,'longitude',q.lon,'available_now',q.live)
    ORDER BY q.lat,q.lon,q.live),'[]'::jsonb) INTO result
  FROM (
    SELECT CASE WHEN x.live THEN round(l.latitude/0.003)*0.003 ELSE s.coverage_latitude END AS lat,
           CASE WHEN x.live THEN round(l.longitude/0.003)*0.003 ELSE s.coverage_longitude END AS lon,
           x.live
    FROM public.driver_vehicle_assignments a
    JOIN public.driver_profiles d ON d.project_id=a.project_id AND d.user_id=a.driver_user_id
    JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id
    LEFT JOIN public.marketplace_driver_locations l
      ON l.project_id=a.project_id AND l.driver_user_id=a.driver_user_id AND l.vehicle_id=a.vehicle_id
    LEFT JOIN app_private.marketplace_driver_presence_v2 s
      ON s.project_id=a.project_id AND s.driver_user_id=a.driver_user_id AND s.vehicle_id=a.vehicle_id
    CROSS JOIN LATERAL (SELECT coalesce(a.accepting_jobs AND a.is_available
      AND l.received_at>=now()-interval '5 minutes' AND l.captured_at>=now()-interval '5 minutes'
      AND l.captured_at<=now()+interval '5 minutes'
      AND l.latitude BETWEEN 18 AND 24.5 AND l.longitude BETWEEN -85.5 AND -73,false) AS live) x
    WHERE a.project_id=pid AND a.is_active AND d.status='active' AND d.activated_at IS NOT NULL
      AND d.suspended_at IS NULL AND v.marketplace_status='active' AND v.deleted_at IS NULL
      AND (x.live OR s.coverage_captured_at>=now()-make_interval(days=>retention))
    ORDER BY lat,lon,x.live LIMIT 1000
  ) q WHERE q.lat BETWEEN 18 AND 24.5 AND q.lon BETWEEN -85.5 AND -73;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION app_private.marketplace_customer_fleet_presence_v2(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.marketplace_customer_fleet_presence_v2(uuid,text) TO service_role;
CREATE FUNCTION public.get_marketplace_customer_fleet_presence_v2(target_session_id uuid,target_session_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $$ SELECT app_private.marketplace_customer_fleet_presence_v2(target_session_id,target_session_token); $$;
REVOKE ALL ON FUNCTION public.get_marketplace_customer_fleet_presence_v2(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_marketplace_customer_fleet_presence_v2(uuid,text) TO service_role;

-- Admin-only map fallback: do not turn a coverage cell into fresh GPS.
DO $admin_map$
DECLARE ddl text; fn_oid oid;
BEGIN
  SELECT p.oid INTO STRICT fn_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='admin_get_marketplace_operational_map';
  ddl:=pg_get_functiondef(fn_oid);
  IF position('l.latitude as last_latitude' IN ddl)=0
     OR position('l.longitude as last_longitude' IN ddl)=0
     OR position('l.accuracy_m as last_accuracy_m' IN ddl)=0
     OR position('l.captured_at,' IN ddl)=0
     OR position($anchor$     and l.vehicle_id = a.vehicle_id
    cross join lateral ($anchor$ IN ddl)=0 THEN
    RAISE EXCEPTION 'PRESENCE_V2_ADMIN_MAP_ANCHOR_MISSING';
  END IF;
  ddl:=replace(ddl,'l.latitude as last_latitude','coalesce(l.latitude,s.coverage_latitude) as last_latitude');
  ddl:=replace(ddl,'l.longitude as last_longitude','coalesce(l.longitude,s.coverage_longitude) as last_longitude');
  ddl:=replace(ddl,'l.accuracy_m as last_accuracy_m','coalesce(l.accuracy_m,case when s.coverage_latitude is not null then 1500::numeric end) as last_accuracy_m');
  ddl:=replace(ddl,$anchor$      l.captured_at,
      freshness.freshness_seconds,$anchor$,$replacement$      coalesce(l.captured_at,s.coverage_captured_at) as captured_at,
      freshness.freshness_seconds,$replacement$);
  ddl:=replace(ddl,$anchor$     and l.vehicle_id = a.vehicle_id
    cross join lateral ($anchor$,$replacement$     and l.vehicle_id = a.vehicle_id
    left join app_private.marketplace_driver_presence_v2 s
      on s.project_id=target_project_id and s.driver_user_id=a.driver_user_id and s.vehicle_id=a.vehicle_id
    cross join lateral ($replacement$);
  IF position('coalesce(l.captured_at,s.coverage_captured_at) as captured_at' IN ddl)=0 THEN
    RAISE EXCEPTION 'PRESENCE_V2_ADMIN_MAP_TIMESTAMP_ANCHOR_MISSING';
  END IF;
  EXECUTE ddl;
END;
$admin_map$;

COMMIT;

-- Before activation:
-- 1. Verify heartbeat with a permitted driver and denial for unauthorized users/vehicles.
-- 2. Verify recent contact without GPS, manual rest, old clients and reconnect behavior.
-- 3. Verify concurrent acceptance and completion/rating/incident protection.
-- 4. Verify privacy, removal on suspension and the coverage retention policy.
-- 5. Verify admin fallback and V2 gateway/client rollout; do not activate on production first.
