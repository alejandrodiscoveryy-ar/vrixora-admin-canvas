-- TUKTUK - simulacros independientes para conductores Trabajando.
-- No cambia las carreras reales, el radar, las reglas de aceptacion ni la APK.
-- Una carrera sintética por conductor: asignacion y valoracion independientes.

CREATE TABLE IF NOT EXISTS public.marketplace_admin_test_campaigns (
  project_id uuid NOT NULL REFERENCES public.projects(id),
  campaign_id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL,
  created_by uuid NOT NULL,
  payload_hash text NOT NULL,
  recipient_count integer NOT NULL CHECK (recipient_count BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, campaign_id),
  UNIQUE(project_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS marketplace_admin_test_campaigns_latest_idx
  ON public.marketplace_admin_test_campaigns(project_id, created_at DESC);
ALTER TABLE public.marketplace_admin_test_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_admin_test_campaigns FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_marketplace_parallel_test_v1(
  target_project_id uuid,
  target_idempotency_key uuid,
  target_vehicle_category_code text,
  target_service_code text,
  target_origin_text text,
  target_destination_text text,
  target_origin_point jsonb,
  target_destination_point jsonb,
  target_distance_km numeric,
  target_route_duration_seconds integer,
  target_expected_price numeric,
  target_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_mode_enabled boolean;
  v_origin_lat numeric;
  v_origin_lon numeric;
  v_destination_lat numeric;
  v_destination_lon numeric;
  v_commission_rate numeric;
  v_customer_id uuid;
  v_request_id uuid;
  v_job_id uuid;
  v_first_job uuid;
  v_count integer := 0;
  v_expected_count integer := 0;
  v_payload_hash text;
  v_previous public.marketplace_admin_test_campaigns%rowtype;
  v_campaign_id uuid := gen_random_uuid();
  v_driver record;
  v_event_key uuid;
  v_child_key uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  PERFORM app_private.require_project_permission(target_project_id, 'marketplace.manage');
  PERFORM app_private.require_project_permission(target_project_id, 'settings.manage');

  IF target_idempotency_key IS NULL
    OR target_service_code IS NULL OR nullif(btrim(target_service_code),'') IS NULL
    OR nullif(btrim(target_origin_text),'') IS NULL
    OR nullif(btrim(target_destination_text),'') IS NULL
    OR length(target_origin_text)>166 OR length(target_destination_text)>180
    OR length(coalesce(target_notes,''))>1000
    OR target_expected_price IS NULL OR target_expected_price<=0 OR target_expected_price>100000
    OR target_distance_km IS NULL OR target_distance_km<=0 OR target_distance_km>5000
    OR target_route_duration_seconds IS NULL OR target_route_duration_seconds<=0
    OR target_route_duration_seconds>259200
    OR target_origin_point IS NULL OR jsonb_typeof(target_origin_point)<>'object'
    OR target_destination_point IS NULL OR jsonb_typeof(target_destination_point)<>'object'
  THEN RAISE EXCEPTION 'TEST_PARALLEL_INVALID_INPUT' USING errcode='22023'; END IF;

  IF coalesce(target_origin_point->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
    OR coalesce(target_origin_point->>'lon','') !~ '^-?[0-9]+([.][0-9]+)?$'
    OR coalesce(target_destination_point->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
    OR coalesce(target_destination_point->>'lon','') !~ '^-?[0-9]+([.][0-9]+)?$'
  THEN RAISE EXCEPTION 'TEST_PARALLEL_INVALID_COORDINATES' USING errcode='22023'; END IF;
  v_origin_lat := (target_origin_point->>'lat')::numeric;
  v_origin_lon := (target_origin_point->>'lon')::numeric;
  v_destination_lat := (target_destination_point->>'lat')::numeric;
  v_destination_lon := (target_destination_point->>'lon')::numeric;
  IF v_origin_lat NOT BETWEEN 18 AND 24.5 OR v_destination_lat NOT BETWEEN 18 AND 24.5
    OR v_origin_lon NOT BETWEEN -85.5 AND -73 OR v_destination_lon NOT BETWEEN -85.5 AND -73
    OR (v_origin_lat=v_destination_lat AND v_origin_lon=v_destination_lon)
  THEN RAISE EXCEPTION 'TEST_PARALLEL_COORDINATES_OUTSIDE_CUBA' USING errcode='22023'; END IF;

  SELECT enabled INTO v_mode_enabled FROM public.marketplace_test_mode WHERE project_id=target_project_id;
  IF NOT coalesce(v_mode_enabled,false) THEN RAISE EXCEPTION 'TEST_LAB_DISABLED' USING errcode='22023'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.service_types t WHERE t.project_id=target_project_id
       AND t.code=target_service_code AND t.active
  ) THEN RAISE EXCEPTION 'TEST_PARALLEL_SERVICE_NOT_FOUND' USING errcode='22023'; END IF;
  IF target_vehicle_category_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vehicle_categories c WHERE c.project_id=target_project_id
      AND c.code=target_vehicle_category_code AND c.active
  ) THEN RAISE EXCEPTION 'TEST_PARALLEL_CATEGORY_NOT_FOUND' USING errcode='22023'; END IF;
  SELECT commission_rate INTO v_commission_rate
  FROM public.project_marketplace_financial_settings WHERE project_id=target_project_id;
  IF v_commission_rate IS NULL THEN RAISE EXCEPTION 'TEST_LAB_FINANCIAL_CONFIG_MISSING'; END IF;

  v_payload_hash := md5(concat_ws('|',target_project_id,target_vehicle_category_code,
    target_service_code,target_origin_text,target_destination_text,target_distance_km,
    target_route_duration_seconds,target_expected_price,coalesce(target_notes,''),
    v_origin_lat,v_origin_lon,v_destination_lat,v_destination_lon));

  -- Evita dos campanas simultaneas y hace el reintento idempotente.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'parallel-test:'||target_project_id::text,0));
  SELECT * INTO v_previous FROM public.marketplace_admin_test_campaigns c
  WHERE c.project_id=target_project_id AND c.idempotency_key=target_idempotency_key;
  IF FOUND THEN
    IF v_previous.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'TEST_PARALLEL_IDEMPOTENCY_MISMATCH' USING errcode='22023';
    END IF;
    SELECT j.id INTO v_first_job FROM public.jobs j
    WHERE j.project_id=target_project_id AND j.is_test
      AND j.pricing_breakdown->>'test_parallel_campaign_id'=v_previous.campaign_id::text
    ORDER BY j.created_at,j.id LIMIT 1;
    RETURN jsonb_build_object('campaign_id',v_previous.campaign_id,
      'job_id',v_first_job,'recipient_count',v_previous.recipient_count,'replayed',true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_admin_test_campaigns c
      WHERE c.project_id=target_project_id AND c.created_at>now()-interval '60 seconds') THEN
    RAISE EXCEPTION 'TEST_PARALLEL_COOLDOWN' USING errcode='22023';
  END IF;

  -- La audiencia incluye a Trabajando sin filtrar is_available ni GPS.
  SELECT count(DISTINCT a.driver_user_id) INTO v_expected_count
  FROM public.driver_vehicle_assignments a
  JOIN public.driver_profiles d ON d.project_id=a.project_id AND d.user_id=a.driver_user_id
  JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id
  WHERE a.project_id=target_project_id AND a.is_active AND a.accepting_jobs
    AND d.status='active' AND d.activated_at IS NOT NULL AND d.suspended_at IS NULL
    AND v.marketplace_status='active' AND v.deleted_at IS NULL
    AND (target_vehicle_category_code IS NULL OR v.category_code=target_vehicle_category_code);
  IF coalesce(v_expected_count,0)=0 THEN
    RAISE EXCEPTION 'TEST_PARALLEL_NO_WORKING_DRIVERS' USING errcode='22023';
  END IF;
  IF v_expected_count>10000 THEN RAISE EXCEPTION 'TEST_PARALLEL_AUDIENCE_TOO_LARGE' USING errcode='22023'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'test-lab-customer:'||target_project_id::text,0));
  SELECT c.customer_id INTO v_customer_id FROM public.marketplace_admin_test_customers c
  WHERE c.project_id=target_project_id;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers(project_id,display_name,whatsapp_phone)
    VALUES(target_project_id,'Simulador administrativo (PRUEBA)','TEST-'||target_project_id::text)
    RETURNING id INTO v_customer_id;
    INSERT INTO public.marketplace_admin_test_customers(project_id,customer_id)
    VALUES(target_project_id,v_customer_id);
  END IF;

  -- Cada conductor dispone de su propio job, aunque otro complete el suyo.
  -- Cada job se asocia a un unico destinatario y a su modalidad real.
  FOR v_driver IN
    SELECT DISTINCT ON (a.driver_user_id)
       a.driver_user_id,a.vehicle_id,v.category_code,
       (SELECT vs.service_code FROM public.vehicle_services vs
        JOIN public.service_types t ON t.project_id=vs.project_id
          AND t.code=vs.service_code AND t.active
        WHERE vs.project_id=a.project_id AND vs.vehicle_id=a.vehicle_id AND vs.enabled
        ORDER BY CASE WHEN vs.service_code=target_service_code THEN 0
          WHEN vs.service_code='courier' THEN 1
          WHEN vs.service_code='cargo' THEN 2
          WHEN vs.service_code='tourism' THEN 3 ELSE 4 END,
          vs.service_code LIMIT 1) AS compatible_service
    FROM public.driver_vehicle_assignments a
    JOIN public.driver_profiles d ON d.project_id=a.project_id AND d.user_id=a.driver_user_id
    JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id
    WHERE a.project_id=target_project_id AND a.is_active AND a.accepting_jobs
      AND d.status='active' AND d.activated_at IS NOT NULL AND d.suspended_at IS NULL
      AND v.marketplace_status='active' AND v.deleted_at IS NULL
      AND (target_vehicle_category_code IS NULL OR v.category_code=target_vehicle_category_code)
    ORDER BY a.driver_user_id,a.is_available DESC,a.vehicle_id ASC
  LOOP
    IF v_driver.compatible_service IS NULL THEN
      RAISE EXCEPTION 'TEST_PARALLEL_DRIVER_HAS_NO_COMPATIBLE_SERVICE' USING errcode='22023';
    END IF;
    v_child_key := gen_random_uuid();
    v_event_key := gen_random_uuid();

    INSERT INTO public.service_requests(
      project_id,customer_id,service_code,origin_text,destination_text,
      notes,vehicle_category_code,passenger_count,details
    ) VALUES (
      target_project_id,v_customer_id,v_driver.compatible_service,
      'PRUEBA · '||btrim(target_origin_text),btrim(target_destination_text),
      nullif(btrim(coalesce(target_notes,'')),''),v_driver.category_code,
      CASE WHEN v_driver.compatible_service='passenger' THEN 1 ELSE NULL END,
      jsonb_build_object('admin_simulated',true,'test_lab',true,
        'test_parallel_cycle',true,'test_parallel_campaign_id',v_campaign_id,
        'test_parallel_driver_user_id',v_driver.driver_user_id,
        'route_origin',jsonb_build_object('lat',v_origin_lat,'lon',v_origin_lon),
        'route_destination',jsonb_build_object('lat',v_destination_lat,'lon',v_destination_lon),
        'estimated_distance_km',target_distance_km,'distance_source','provider',
        'route_provider','mapbox','route_mode','driving',
        'route_duration_seconds',target_route_duration_seconds,'route_verified_at',now())
    ) RETURNING id INTO v_request_id;

    INSERT INTO public.jobs(
      project_id,service_request_id,service_code,status,recommended_price,final_price,
      currency,commission_rate_snapshot,is_test,test_force_wallet_commission,
      test_driver_user_id,pricing_breakdown
    ) VALUES (
      target_project_id,v_request_id,v_driver.compatible_service,'requested',
      target_expected_price,target_expected_price,'CUP',v_commission_rate,true,false,
      v_driver.driver_user_id,
      jsonb_build_object('test_lab',true,'test_lab_v3',true,
        'test_parallel_cycle',true,'test_parallel_campaign_id',v_campaign_id,
        'test_parallel_vehicle_category',v_driver.category_code,
        'test_broadcast',false,'manual_price',true,'route_provider','mapbox',
        'distance_km',target_distance_km,'route_duration_seconds',target_route_duration_seconds)
    ) RETURNING id INTO v_job_id;
    IF v_first_job IS NULL THEN v_first_job:=v_job_id; END IF;

    INSERT INTO public.marketplace_test_job_recipients(project_id,job_id,driver_user_id)
    VALUES(target_project_id,v_job_id,v_driver.driver_user_id);
    INSERT INTO public.marketplace_admin_test_jobs(
      project_id,job_id,created_by,idempotency_key,destination_mode,recipient_count,payload_hash
    ) VALUES(target_project_id,v_job_id,v_actor,v_child_key,'individual',1,v_payload_hash);

    UPDATE public.jobs SET status='published',published_at=now(),
      expires_at=now()+interval '3 hours',state_version=state_version+1
    WHERE project_id=target_project_id AND id=v_job_id AND status='requested';
    IF NOT FOUND THEN RAISE EXCEPTION 'TEST_PARALLEL_PUBLISH_FAILED'; END IF;

    INSERT INTO public.notification_outbox(
      project_id,user_id,kind,notification_date,dedupe_key,title,body,data
    ) VALUES (
      target_project_id,v_driver.driver_user_id,'marketplace_job_available',current_date,
      'marketplace-job:'||v_job_id::text,
      'PRUEBA TUKTUK · tu carrera individual',
      'Simulacro: puedes aceptar, recorrer y finalizar tu propia carrera. No hay comision real.',
      jsonb_build_object('event_type','marketplace_job_available','job_id',v_job_id::text,
        'is_test',true,'test_parallel_cycle',true,'test_parallel_campaign_id',v_campaign_id::text)
    ) ON CONFLICT (project_id,user_id,kind,dedupe_key) DO NOTHING;

    INSERT INTO public.job_events(
      project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,
      operation_idempotency_key,metadata
    ) VALUES (
      target_project_id,v_job_id,'requested','published','publish','admin',v_actor,
      v_event_key,jsonb_build_object('test_lab',true,'test_parallel_cycle',true,
        'test_parallel_campaign_id',v_campaign_id,'recipient_count',1,
        'vehicle_category',v_driver.category_code)
    );
    v_count:=v_count+1;
  END LOOP;

  IF v_count<>v_expected_count THEN
    RAISE EXCEPTION 'TEST_PARALLEL_RECIPIENT_COUNT_CHANGED' USING errcode='40001';
  END IF;
  INSERT INTO public.marketplace_admin_test_campaigns(
     project_id,campaign_id,idempotency_key,created_by,payload_hash,recipient_count
  ) VALUES(target_project_id,v_campaign_id,target_idempotency_key,v_actor,v_payload_hash,v_count);

  -- Despierta una sola vez el emisor, nunca cobra ni asigna de forma automatica.
  BEGIN
    PERFORM net.http_post(
      url:='https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/send-push-notifications',
      headers:=jsonb_build_object('Content-Type','application/json',
        'x-tuktuk-dispatch-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name='tuktuk_push_dispatch_secret' LIMIT 1)),
      body:=jsonb_build_object('limit',100,'max_batches',10,'concurrency',8,'time_budget_ms',45000),
      timeout_milliseconds:=5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'TEST_PARALLEL_PUSH_WAKE_FAILED: %',SQLSTATE;
  END;
  RETURN jsonb_build_object('campaign_id',v_campaign_id,'job_id',v_first_job,
     'recipient_count',v_count,'replayed',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_marketplace_parallel_test_v1(
  uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,integer,numeric,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_marketplace_parallel_test_v1(
  uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,integer,numeric,text
) TO authenticated;
