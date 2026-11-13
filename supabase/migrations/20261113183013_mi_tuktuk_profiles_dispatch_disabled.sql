SET LOCAL lock_timeout = '3s';
-- Mi TukTuk candidate. NOT a deployed migration. Both flags default off.
-- Apply only in disposable PostgreSQL until cross-app acceptance is complete.
CREATE TABLE app_private.marketplace_driver_promo_settings (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id),
  profiles_enabled boolean NOT NULL DEFAULT false,
  priority_enabled boolean NOT NULL DEFAULT false,
  priority_seconds integer NOT NULL DEFAULT 30 CHECK(priority_seconds BETWEEN 0 AND 60)
);
CREATE TABLE app_private.marketplace_driver_promo_profiles (
  project_id uuid NOT NULL REFERENCES public.projects(id),
  driver_user_id uuid NOT NULL,
  code text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-','') CHECK(code ~ '^[0-9a-f]{32}$'),
  public_name text NOT NULL CHECK(char_length(btrim(public_name)) BETWEEN 1 AND 80),
  consent_photo_asset_id uuid,
  consent_version text NOT NULL CHECK(consent_version='mi-tuktuk-v1'),
  consented_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY(project_id,driver_user_id)
);
CREATE TABLE app_private.marketplace_driver_promo_attribution (
  project_id uuid NOT NULL REFERENCES public.projects(id),
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  service_request_id uuid NOT NULL UNIQUE REFERENCES public.service_requests(id) ON DELETE CASCADE,
  driver_user_id uuid NOT NULL,
  source_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  phase text NOT NULL DEFAULT 'pending' CHECK(phase IN ('pending','preferred','fleet')),
  priority_until timestamptz,
  released_at timestamptz,
  release_reason text,
  FOREIGN KEY(project_id,driver_user_id) REFERENCES app_private.marketplace_driver_promo_profiles(project_id,driver_user_id),
  CHECK(phase <> 'preferred' OR priority_until IS NOT NULL)
);
CREATE INDEX promo_attribution_driver_idx ON app_private.marketplace_driver_promo_attribution(project_id,driver_user_id,created_at);
CREATE INDEX promo_attribution_waiting_idx ON app_private.marketplace_driver_promo_attribution(priority_until) WHERE phase='preferred';
ALTER TABLE app_private.marketplace_driver_promo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.marketplace_driver_promo_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.marketplace_driver_promo_attribution ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.marketplace_driver_promo_settings,app_private.marketplace_driver_promo_profiles,app_private.marketplace_driver_promo_attribution FROM PUBLIC,anon,authenticated,service_role;

-- The driver alone consents/revokes. Never accept another driver ID or a storage path.
CREATE FUNCTION public.set_my_marketplace_promo_profile(target_public_name text,target_consent boolean,target_share_photo boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE actor uuid:=auth.uid(); pid uuid; d public.driver_profiles%ROWTYPE; p app_private.marketplace_driver_promo_profiles%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT id INTO pid FROM public.projects WHERE slug='tuktuk-control';
  SELECT * INTO d FROM public.driver_profiles WHERE project_id=pid AND user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRIVER_PROFILE_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF target_consent IS FALSE THEN
    UPDATE app_private.marketplace_driver_promo_profiles SET revoked_at=coalesce(revoked_at,now()) WHERE project_id=pid AND driver_user_id=actor;
    UPDATE app_private.marketplace_driver_promo_attribution SET phase='fleet',released_at=now(),release_reason='revoked'
      WHERE project_id=pid AND driver_user_id=actor AND phase='preferred';
    RETURN jsonb_build_object('enabled',false);
  END IF;
  IF target_consent IS DISTINCT FROM true OR d.status<>'active' OR d.suspended_at IS NOT NULL OR d.activated_at IS NULL
    OR NOT EXISTS(SELECT 1 FROM app_private.marketplace_driver_promo_settings s WHERE s.project_id=pid AND s.profiles_enabled)
  THEN RAISE EXCEPTION 'PROMO_NOT_AVAILABLE' USING ERRCODE='42501'; END IF;
  IF target_public_name IS NULL OR char_length(btrim(target_public_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'PUBLIC_NAME_INVALID' USING ERRCODE='22023'; END IF;
  INSERT INTO app_private.marketplace_driver_promo_profiles(project_id,driver_user_id,public_name,consent_photo_asset_id,consent_version)
    VALUES(pid,actor,btrim(target_public_name),CASE WHEN target_share_photo THEN d.photo_asset_id END,'mi-tuktuk-v1')
  ON CONFLICT(project_id,driver_user_id) DO UPDATE SET
    public_name=excluded.public_name,consent_photo_asset_id=excluded.consent_photo_asset_id,
    consented_at=now(),revoked_at=NULL,
    code=CASE WHEN marketplace_driver_promo_profiles.revoked_at IS NOT NULL THEN replace(gen_random_uuid()::text,'-','') ELSE marketplace_driver_promo_profiles.code END
  RETURNING * INTO p;
  RETURN jsonb_build_object('enabled',true,'code',p.code,'public_name',p.public_name,'photo_authorized',p.consent_photo_asset_id IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.set_my_marketplace_promo_profile(text,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_my_marketplace_promo_profile(text,boolean,boolean) TO authenticated;

CREATE FUNCTION public.get_my_marketplace_promo_profile()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE actor uuid:=auth.uid(); result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('enabled',p.revoked_at IS NULL AND d.status='active' AND d.suspended_at IS NULL AND d.activated_at IS NOT NULL AND coalesce(s.profiles_enabled,false),
    'code',p.code,'public_name',p.public_name,'photo_authorized',p.consent_photo_asset_id IS NOT NULL AND p.consent_photo_asset_id=d.photo_asset_id)
    INTO result FROM app_private.marketplace_driver_promo_profiles p
    JOIN public.projects pr ON pr.id=p.project_id AND pr.slug='tuktuk-control'
    JOIN public.driver_profiles d ON d.project_id=p.project_id AND d.user_id=p.driver_user_id
    LEFT JOIN app_private.marketplace_driver_promo_settings s ON s.project_id=p.project_id
    WHERE p.driver_user_id=actor;
  RETURN coalesce(result,jsonb_build_object('enabled',false));
END $$;
REVOKE ALL ON FUNCTION public.get_my_marketplace_promo_profile() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_marketplace_promo_profile() TO authenticated;

-- Internal resolution includes ONLY consented photo asset reference; gateway must sign
-- a marketplace-media image after validating ownership and return no asset IDs.
CREATE FUNCTION app_private.resolve_marketplace_promo_profile(target_code text)
RETURNS TABLE(project_id uuid,driver_user_id uuid,public_name text,photo_asset_id uuid,vehicle_id text,category_code text,service_codes text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT p.project_id,p.driver_user_id,p.public_name,
    CASE WHEN p.consent_photo_asset_id=d.photo_asset_id AND EXISTS(SELECT 1 FROM public.media_assets m WHERE m.id=d.photo_asset_id AND m.project_id=p.project_id AND m.owner_user_id=p.driver_user_id AND m.asset_kind='driver_photo' AND m.status='available' AND m.storage_bucket='marketplace-media') THEN d.photo_asset_id END,
    v.id,v.category_code,array_agg(DISTINCT vs.service_code ORDER BY vs.service_code)
  FROM app_private.marketplace_driver_promo_profiles p
  JOIN app_private.marketplace_driver_promo_settings s ON s.project_id=p.project_id AND s.profiles_enabled
  JOIN public.projects pr ON pr.id=p.project_id AND pr.slug='tuktuk-control'
  JOIN public.driver_profiles d ON d.project_id=p.project_id AND d.user_id=p.driver_user_id
  JOIN public.driver_vehicle_assignments a ON a.project_id=d.project_id AND a.driver_user_id=d.user_id AND a.is_active
  JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id AND v.marketplace_status='active' AND v.deleted_at IS NULL
  JOIN public.vehicle_services vs ON vs.project_id=v.project_id AND vs.vehicle_id=v.id AND vs.enabled
  JOIN public.list_marketplace_published_modalities('tuktuk-control') pub ON pub.service_code=vs.service_code AND pub.vehicle_category_code=v.category_code
  WHERE target_code ~ '^[0-9a-f]{32}$' AND p.code=target_code AND p.revoked_at IS NULL
    AND d.status='active' AND d.suspended_at IS NULL AND d.activated_at IS NOT NULL
  GROUP BY p.project_id,p.driver_user_id,p.public_name,p.consent_photo_asset_id,d.photo_asset_id,v.id,v.category_code
  ORDER BY v.id LIMIT 1
$$;
REVOKE ALL ON FUNCTION app_private.resolve_marketplace_promo_profile(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.resolve_marketplace_promo_profile_v1(target_code text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT jsonb_build_object('public_name',p.public_name,'category_code',p.category_code,'service_codes',p.service_codes,'photo_asset_id',p.photo_asset_id)
  FROM app_private.resolve_marketplace_promo_profile(target_code) p
$$;
REVOKE ALL ON FUNCTION public.resolve_marketplace_promo_profile_v1(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_marketplace_promo_profile_v1(text) TO service_role;

-- Route verification and existing pricing/session/idempotency stay in the original v2 RPC.
-- Only the trusted map gateway may call this wrapper; no caller-supplied driver UUID.
CREATE FUNCTION public.create_marketplace_customer_request_promo_v1(
  target_session_id uuid,target_session_token text,target_service_code text,target_origin_text text,target_destination_text text,
  target_scheduled_for timestamptz,target_passenger_count integer,target_cargo_weight_kg numeric,target_cargo_volume_m3 numeric,
  target_cargo_length_cm numeric,target_cargo_width_cm numeric,target_cargo_height_cm numeric,target_required_body_type text,
  target_notes text,target_details jsonb,target_vehicle_category_code text,target_idempotency_key uuid,target_promo_code text)
RETURNS TABLE(job_id uuid,service_request_id uuid,status text,recommended_price numeric,minimum_price numeric,
  low_price_warning_threshold numeric,currency text,pricing_version text,pricing_breakdown jsonb,server_time timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE pid uuid; cid uuid; existing_job uuid; p record; created record;
BEGIN
  IF target_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token);
  SELECT id INTO pid FROM public.projects WHERE slug='tuktuk-control';
  IF pid IS NULL THEN RAISE EXCEPTION 'MARKETPLACE_PROJECT_NOT_FOUND'; END IF;
  -- Same advisory lock as v2: retries or legacy callers cannot attach attribution to an old job.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tuktuk:customer-request:'||pid::text||':'||cid::text||':'||target_idempotency_key::text,0));
  SELECT o.job_id INTO existing_job FROM public.marketplace_customer_request_operations o
  WHERE o.project_id=pid AND o.customer_id=cid AND o.idempotency_key=target_idempotency_key;
  SELECT * INTO created FROM public.create_marketplace_customer_request_v2(
    target_session_id,target_session_token,target_service_code,target_origin_text,target_destination_text,target_scheduled_for,
    target_passenger_count,target_cargo_weight_kg,target_cargo_volume_m3,target_cargo_length_cm,target_cargo_width_cm,target_cargo_height_cm,
    target_required_body_type,target_notes,target_details,target_vehicle_category_code,target_idempotency_key);
  IF existing_job IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM app_private.marketplace_driver_promo_attribution a WHERE a.job_id=existing_job AND a.source_code IS DISTINCT FROM target_promo_code)
    THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PROMO' USING ERRCODE='22023'; END IF;
  ELSE
    SELECT * INTO p FROM app_private.resolve_marketplace_promo_profile(target_promo_code);
    IF FOUND AND p.project_id=pid AND p.category_code=target_vehicle_category_code AND target_service_code=ANY(p.service_codes) THEN
      INSERT INTO app_private.marketplace_driver_promo_attribution(project_id,job_id,service_request_id,driver_user_id,source_code)
      VALUES(pid,created.job_id,created.service_request_id,p.driver_user_id,target_promo_code);
    END IF;
  END IF;
  RETURN QUERY SELECT created.job_id,created.service_request_id,created.status,created.recommended_price,created.minimum_price,
    created.low_price_warning_threshold,created.currency,created.pricing_version,created.pricing_breakdown,created.server_time;
END $$;
REVOKE ALL ON FUNCTION public.create_marketplace_customer_request_promo_v1(uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_marketplace_customer_request_promo_v1(uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,text,uuid,text) TO service_role;

-- No global activation: rows are created only by an explicitly reviewed rollout.

-- Candidate phase 2: apply AFTER mi-tuktuk-profiles-candidate.sql in isolated test DB.
-- Original production radar logic copied without semantic changes into private base.
-- Deployment requires drift review against the live definition.
CREATE OR REPLACE FUNCTION app_private.marketplace_promo_base_candidate_state(target_project_id uuid, target_driver_user_id uuid, target_vehicle_id text, target_job_id uuid)
 RETURNS TABLE(policy_enabled boolean, allowed boolean, distance_km numeric, radius_stage integer, radius_limit_km numeric, rating_average numeric, rating_count bigint, rating_preferred boolean, eligible_from timestamp with time zone, rating_score numeric, tie_breaker text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.jobs%rowtype;
  v_details jsonb;
  v_settings public.project_marketplace_dispatch_settings%rowtype;
  v_has_settings boolean := false;

  v_base_time timestamptz;

  v_origin_lat_text text;
  v_origin_lon_text text;
  v_origin_lat numeric;
  v_origin_lon numeric;

  v_driver_lat numeric;
  v_driver_lon numeric;
  v_distance_km numeric;

  v_radii numeric[] := array[]::numeric[];
  v_radius_count integer := 0;
  v_stage integer;
  v_radius_limit numeric;
  v_radius_from timestamptz;

  v_rating_average numeric;
  v_rating_count bigint := 0;
  v_rating_preferred boolean := true;
  v_rating_score numeric;

  v_eligible_from timestamptz;
  v_tie_breaker text := 'rating_then_distance';

  idx integer;
begin
  if target_project_id is null
     or target_driver_user_id is null
     or target_vehicle_id is null
     or target_job_id is null then
    return query
    select
      false,
      false,
      null::numeric,
      null::integer,
      null::numeric,
      null::numeric,
      0::bigint,
      true,
      null::timestamptz,
      4.0::numeric,
      'rating_then_distance'::text;
    return;
  end if;

  select j.*
    into v_job
  from public.jobs j
  where j.project_id = target_project_id
    and j.id = target_job_id;

  if not found then
    return query
    select
      false,
      false,
      null::numeric,
      null::integer,
      null::numeric,
      null::numeric,
      0::bigint,
      true,
      null::timestamptz,
      4.0::numeric,
      'rating_then_distance'::text;
    return;
  end if;

  v_base_time := coalesce(v_job.published_at, v_job.created_at, now());

  select r.details
    into v_details
  from public.service_requests r
  where r.project_id = target_project_id
    and r.id = v_job.service_request_id;

  v_details := coalesce(v_details, '{}'::jsonb);

  select s.*
    into v_settings
  from public.project_marketplace_dispatch_settings s
  where s.project_id = target_project_id;

  v_has_settings := found;

  if v_has_settings then
    v_tie_breaker := coalesce(
      v_settings.tie_breaker,
      'rating_then_distance'
    );
  end if;

  if not v_has_settings
     or not coalesce(v_settings.enabled, false)
     or (
       v_job.is_test
       and not coalesce(v_settings.apply_to_test_jobs, false)
     ) then

    return query
    select
      false,
      true,
      null::numeric,
      0::integer,
      null::numeric,
      null::numeric,
      0::bigint,
      true,
      v_base_time,
      coalesce(v_settings.preferred_min_rating, 4.0::numeric),
      v_tie_breaker;

    return;
  end if;

  if coalesce(v_settings.radius_search_enabled, true) then
    v_origin_lat_text := v_details #>> '{route_origin,lat}';
    v_origin_lon_text := v_details #>> '{route_origin,lon}';

    if v_origin_lat_text is null
       or v_origin_lon_text is null
       or v_origin_lat_text !~ '^-?[0-9]+(\.[0-9]+)?$'
       or v_origin_lon_text !~ '^-?[0-9]+(\.[0-9]+)?$' then

      return query
      select
        true,
        false,
        null::numeric,
        null::integer,
        null::numeric,
        null::numeric,
        0::bigint,
        true,
        null::timestamptz,
        coalesce(v_settings.preferred_min_rating, 4.0::numeric),
        v_tie_breaker;

      return;
    end if;

    v_origin_lat := v_origin_lat_text::numeric;
    v_origin_lon := v_origin_lon_text::numeric;

    if v_origin_lat < -90
       or v_origin_lat > 90
       or v_origin_lon < -180
       or v_origin_lon > 180 then

      return query
      select
        true,
        false,
        null::numeric,
        null::integer,
        null::numeric,
        null::numeric,
        0::bigint,
        true,
        null::timestamptz,
        coalesce(v_settings.preferred_min_rating, 4.0::numeric),
        v_tie_breaker;

      return;
    end if;

    select
      l.latitude,
      l.longitude
    into
      v_driver_lat,
      v_driver_lon
    from public.marketplace_driver_locations l
    where l.project_id = target_project_id
      and l.driver_user_id = target_driver_user_id
      and l.vehicle_id = target_vehicle_id
      and l.captured_at >= now() - interval '300 seconds'
    order by l.captured_at desc
    limit 1;

    if not found then
      return query
      select
        true,
        false,
        null::numeric,
        null::integer,
        null::numeric,
        null::numeric,
        0::bigint,
        true,
        null::timestamptz,
        coalesce(v_settings.preferred_min_rating, 4.0::numeric),
        v_tie_breaker;

      return;
    end if;

    v_distance_km := app_private.marketplace_haversine_km(
      v_origin_lat,
      v_origin_lon,
      v_driver_lat,
      v_driver_lon
    );

    if coalesce(v_settings.radius_1_enabled, false) then
      v_radii := array_append(v_radii, v_settings.radius_1_km);
    end if;

    if coalesce(v_settings.radius_2_enabled, false) then
      v_radii := array_append(v_radii, v_settings.radius_2_km);
    end if;

    if coalesce(v_settings.radius_3_enabled, false) then
      v_radii := array_append(v_radii, v_settings.radius_3_km);
    end if;

    v_radius_count := coalesce(array_length(v_radii, 1), 0);

    if v_radius_count = 0 then
      return query
      select
        true,
        false,
        v_distance_km,
        null::integer,
        null::numeric,
        null::numeric,
        0::bigint,
        true,
        null::timestamptz,
        coalesce(v_settings.preferred_min_rating, 4.0::numeric),
        v_tie_breaker;

      return;
    end if;

    if not coalesce(v_settings.expansion_enabled, true) then
      if v_distance_km <= v_radii[1] then
        v_stage := 1;
        v_radius_limit := v_radii[1];
        v_radius_from := v_base_time;
      else
        return query
        select
          true,
          false,
          v_distance_km,
          1::integer,
          v_radii[1],
          null::numeric,
          0::bigint,
          true,
          null::timestamptz,
          coalesce(v_settings.preferred_min_rating, 4.0::numeric),
          v_tie_breaker;

        return;
      end if;
    else
      v_stage := null;

      for idx in 1..v_radius_count loop
        if v_distance_km <= v_radii[idx] then
          v_stage := idx;
          v_radius_limit := v_radii[idx];
          exit;
        end if;
      end loop;

      if v_stage is null then
        if coalesce(v_settings.allow_outside_max_radius, false) then
          v_stage := v_radius_count + 1;
          v_radius_limit := null;
          v_radius_from :=
            v_base_time
            + make_interval(
                secs => v_radius_count * v_settings.expansion_seconds
              );
        else
          return query
          select
            true,
            false,
            v_distance_km,
            v_radius_count,
            v_radii[v_radius_count],
            null::numeric,
            0::bigint,
            true,
            null::timestamptz,
            coalesce(v_settings.preferred_min_rating, 4.0::numeric),
            v_tie_breaker;

          return;
        end if;
      else
        v_radius_from :=
          v_base_time
          + make_interval(
              secs => (v_stage - 1) * v_settings.expansion_seconds
            );
      end if;
    end if;
  else
    v_distance_km := null;
    v_stage := 0;
    v_radius_limit := null;
    v_radius_from := v_base_time;
  end if;

  select
    avg(r.stars::numeric),
    count(r.id)::bigint
  into
    v_rating_average,
    v_rating_count
  from public.marketplace_customer_ratings r
  join public.jobs rating_job
    on rating_job.project_id = r.project_id
   and rating_job.id = r.job_id
  where r.project_id = target_project_id
    and r.driver_user_id = target_driver_user_id
    and rating_job.status = 'settled'
    and not rating_job.is_test
    and rating_job.test_deleted_at is null;

  v_rating_count := coalesce(v_rating_count, 0);

  if v_rating_count = 0
     or (
       coalesce(v_settings.minimum_rating_count_enabled, true)
       and v_rating_count < v_settings.minimum_rating_count
     ) then
    v_rating_score := coalesce(
      v_settings.preferred_min_rating,
      4.0::numeric
    );
  else
    v_rating_score := v_rating_average;
  end if;

  if coalesce(v_settings.rating_priority_enabled, true)
     and coalesce(v_settings.preferred_min_rating_enabled, true) then

    if v_rating_count = 0
       or (
         coalesce(v_settings.minimum_rating_count_enabled, true)
         and v_rating_count < v_settings.minimum_rating_count
       ) then
      v_rating_preferred := true;
    else
      v_rating_preferred :=
        v_rating_average >= v_settings.preferred_min_rating;
    end if;

    if not v_rating_preferred then
      if not coalesce(v_settings.allow_below_preferred, true) then
        return query
        select
          true,
          false,
          v_distance_km,
          v_stage,
          v_radius_limit,
          v_rating_average,
          v_rating_count,
          false,
          null::timestamptz,
          v_rating_score,
          v_tie_breaker;

        return;
      end if;

      v_eligible_from :=
        v_radius_from
        + make_interval(secs => v_settings.expansion_seconds);
    else
      v_eligible_from := v_radius_from;
    end if;
  else
    v_rating_preferred := true;
    v_eligible_from := v_radius_from;
  end if;

  return query
  select
    true,
    now() >= v_eligible_from,
    v_distance_km,
    v_stage,
    v_radius_limit,
    v_rating_average,
    v_rating_count,
    v_rating_preferred,
    v_eligible_from,
    v_rating_score,
    v_tie_breaker;
end;
$function$;

REVOKE ALL ON FUNCTION app_private.marketplace_promo_base_candidate_state(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.marketplace_promo_preferred_eligible(target_job_id uuid,target_driver_user_id uuid,target_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.jobs j
    JOIN public.service_requests req ON req.project_id=j.project_id AND req.id=j.service_request_id
    JOIN app_private.marketplace_driver_promo_settings cfg ON cfg.project_id=j.project_id AND cfg.profiles_enabled AND cfg.priority_enabled AND cfg.priority_seconds>0
    JOIN public.project_marketplace_dispatch_settings radar ON radar.project_id=j.project_id AND radar.enabled
    JOIN app_private.resolve_marketplace_promo_profile(target_code) p ON p.project_id=j.project_id AND p.driver_user_id=target_driver_user_id
    JOIN public.project_marketplace_financial_settings fin ON fin.project_id=j.project_id
    WHERE j.id=target_job_id AND j.status='published' AND NOT j.is_test AND j.test_deleted_at IS NULL
      AND req.scheduled_for IS NULL
      AND p.category_code=coalesce(req.vehicle_category_code,j.pricing_vehicle_category_code)
      AND j.service_code=ANY(p.service_codes)
      AND app_private.marketplace_driver_can_receive_job(j.project_id,p.driver_user_id,p.vehicle_id,j.id)
      AND EXISTS(SELECT 1 FROM public.marketplace_driver_locations l WHERE l.project_id=j.project_id
        AND l.driver_user_id=p.driver_user_id AND l.vehicle_id=p.vehicle_id
        AND l.captured_at >= now()-interval '300 seconds' AND l.captured_at <= now()+interval '30 seconds')
      AND NOT EXISTS(SELECT 1 FROM public.jobs busy WHERE busy.project_id=j.project_id AND busy.assigned_driver_user_id=p.driver_user_id
        AND busy.status IN ('accepted','en_route','pickup','in_progress','incident'))
      AND (fin.commission_enabled IS FALSE OR app_private.has_active_marketplace_work_trial(p.driver_user_id)
        OR coalesce(app_private.marketplace_wallet_available_balance(j.project_id,p.driver_user_id),0)>=round(j.final_price*j.commission_rate_snapshot,2))
      AND EXISTS(SELECT 1 FROM app_private.marketplace_promo_base_candidate_state(j.project_id,p.driver_user_id,p.vehicle_id,j.id) b WHERE b.allowed)
  )
$$;
REVOKE ALL ON FUNCTION app_private.marketplace_promo_preferred_eligible(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- AFTER status update, before existing marketplace_enqueue_job_offers (trigger alphabetical order).
-- At this point radar and eligibility see the published job and final price.
CREATE FUNCTION app_private.marketplace_promo_on_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE attr app_private.marketplace_driver_promo_attribution%ROWTYPE; seconds integer;
BEGIN
  IF OLD.status<>'requested' OR NEW.status<>'published' THEN RETURN NEW; END IF;
  SELECT * INTO attr FROM app_private.marketplace_driver_promo_attribution a WHERE a.job_id=NEW.id AND a.project_id=NEW.project_id FOR UPDATE;
  IF NOT FOUND OR attr.phase<>'pending' THEN RETURN NEW; END IF;
  SELECT cfg.priority_seconds INTO seconds FROM app_private.marketplace_driver_promo_settings cfg WHERE cfg.project_id=NEW.project_id;
  IF app_private.marketplace_promo_preferred_eligible(NEW.id,attr.driver_user_id,attr.source_code) THEN
    UPDATE app_private.marketplace_driver_promo_attribution SET phase='preferred',priority_until=now()+make_interval(secs=>seconds) WHERE job_id=NEW.id;
  ELSE
    UPDATE app_private.marketplace_driver_promo_attribution SET phase='fleet',released_at=now(),release_reason='initially_ineligible' WHERE job_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.marketplace_promo_on_publish() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER aa_marketplace_promo_on_publish AFTER UPDATE OF status ON public.jobs
FOR EACH ROW EXECUTE FUNCTION app_private.marketplace_promo_on_publish();

-- The same authoritative gate is used by the existing offer outbox, driver list
-- and the BEFORE acceptance trigger, including concurrent accept_job calls.
CREATE FUNCTION app_private.marketplace_promo_allows(target_project_id uuid,target_driver_user_id uuid,target_job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT NOT EXISTS(
    SELECT 1 FROM app_private.marketplace_driver_promo_attribution a
    JOIN app_private.marketplace_driver_promo_settings s ON s.project_id=a.project_id AND s.profiles_enabled AND s.priority_enabled
    WHERE a.project_id=target_project_id AND a.job_id=target_job_id AND a.phase='preferred'
      AND a.priority_until>now() AND a.driver_user_id<>target_driver_user_id
  )
$$;
REVOKE ALL ON FUNCTION app_private.marketplace_promo_allows(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.marketplace_dispatch_candidate_state(target_project_id uuid,target_driver_user_id uuid,target_vehicle_id text,target_job_id uuid)
RETURNS TABLE(policy_enabled boolean,allowed boolean,distance_km numeric,radius_stage integer,radius_limit_km numeric,rating_average numeric,rating_count bigint,rating_preferred boolean,eligible_from timestamptz,rating_score numeric,tie_breaker text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT b.policy_enabled,b.allowed AND app_private.marketplace_promo_allows(target_project_id,target_driver_user_id,target_job_id),
    b.distance_km,b.radius_stage,b.radius_limit_km,b.rating_average,b.rating_count,b.rating_preferred,b.eligible_from,b.rating_score,b.tie_breaker
  FROM app_private.marketplace_promo_base_candidate_state(target_project_id,target_driver_user_id,target_vehicle_id,target_job_id) b
$$;

-- Existing scheduler runs every 5 seconds. Release once, never reopen a window.
-- Lock the job first to serialize with accept_job and publication.
CREATE FUNCTION app_private.marketplace_promo_release_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE pending record; total integer:=0; reason text;
BEGIN
  FOR pending IN
    SELECT a.job_id,a.driver_user_id,a.source_code,a.priority_until
    FROM app_private.marketplace_driver_promo_attribution a
    JOIN public.jobs j ON j.id=a.job_id AND j.project_id=a.project_id
    WHERE a.phase='preferred' AND j.status='published'
    ORDER BY a.job_id FOR UPDATE OF j SKIP LOCKED
  LOOP
    reason:=CASE WHEN pending.priority_until<=now() THEN 'timeout'
      WHEN NOT app_private.marketplace_promo_preferred_eligible(pending.job_id,pending.driver_user_id,pending.source_code) THEN 'ineligible'
      ELSE NULL END;
    IF reason IS NOT NULL THEN
      UPDATE app_private.marketplace_driver_promo_attribution a SET phase='fleet',released_at=now(),release_reason=reason
      WHERE a.job_id=pending.job_id AND a.phase='preferred';
      IF FOUND THEN
        total:=total+1;
        PERFORM app_private.enqueue_marketplace_job_offer_wave(pending.job_id);
      END IF;
    END IF;
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION app_private.marketplace_promo_release_due() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.dispatch_marketplace_offer_waves()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pending_job record;
  inserted_count integer;
  total_inserted integer := 0;
begin
  perform app_private.marketplace_promo_release_due();
  for pending_job in
    select j.id
    from public.jobs j
    join public.project_marketplace_dispatch_settings settings
      on settings.project_id = j.project_id
     and settings.enabled
    where j.status = 'published'
      and j.test_deleted_at is null
      and (j.expires_at is null or j.expires_at > now())
      and (
        not j.is_test
        or settings.apply_to_test_jobs
      )
    order by
      coalesce(j.published_at, j.created_at),
      j.id
  loop
    inserted_count :=
      app_private.enqueue_marketplace_job_offer_wave(pending_job.id);

    total_inserted :=
      total_inserted + coalesce(inserted_count, 0);
  end loop;

  return total_inserted;
end;
$function$;

-- Existing function privileges and OIDs are retained by CREATE OR REPLACE.
-- Decline is an explicit opt-out, not a job cancellation. UI connection follows.
CREATE FUNCTION public.decline_my_marketplace_promo_offer(target_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE actor uuid:=auth.uid(); pid uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT id INTO pid FROM public.projects WHERE slug='tuktuk-control';
  PERFORM 1 FROM public.jobs j WHERE j.id=target_job_id AND j.project_id=pid AND j.status='published' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE app_private.marketplace_driver_promo_attribution a SET phase='fleet',released_at=now(),release_reason='declined'
  WHERE a.project_id=pid AND a.job_id=target_job_id AND a.driver_user_id=actor AND a.phase='preferred';
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM app_private.enqueue_marketplace_job_offer_wave(target_job_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.decline_my_marketplace_promo_offer(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decline_my_marketplace_promo_offer(uuid) TO authenticated;


INSERT INTO app_private.marketplace_driver_promo_settings(project_id,profiles_enabled,priority_enabled) SELECT id,false,false FROM public.projects WHERE slug='tuktuk-control';
