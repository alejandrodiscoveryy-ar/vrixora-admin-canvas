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
    CASE WHEN p.consent_photo_asset_id=d.photo_asset_id AND EXISTS(SELECT 1 FROM public.media_assets m WHERE m.id=d.photo_asset_id AND m.project_id=d.project_id AND m.owner_user_id=d.user_id AND m.asset_kind='driver_photo' AND m.status='available' AND m.storage_bucket='marketplace-media') THEN d.photo_asset_id END,
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
