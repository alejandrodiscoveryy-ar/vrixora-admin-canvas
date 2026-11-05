-- TUKTUK | Centro de Pruebas: difusión a todos los conductores Trabajando.
-- Aislado de la contratación real: solo trabajos is_test=true, sin cobro.
-- Mantiene los mecanismos existentes de publicación, avisos, historial y limpieza.
-- Hasta 10.000 destinatarios por salvaguarda operativa (sin el antiguo límite de 30).

ALTER TABLE public.marketplace_admin_test_jobs
  DROP CONSTRAINT IF EXISTS marketplace_admin_test_jobs_recipient_count_check;
ALTER TABLE public.marketplace_admin_test_jobs
  ADD CONSTRAINT marketplace_admin_test_jobs_recipient_count_check
  CHECK (recipient_count BETWEEN 1 AND 10000);

CREATE OR REPLACE FUNCTION public.admin_create_marketplace_test_broadcast_v1(
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
  v_recipient_count integer;
  v_inserted integer;
  v_payload_hash text;
  v_previous record;
  v_broadcast_mode text;
BEGIN
  PERFORM app_private.require_project_permission(target_project_id, 'marketplace.manage');
  PERFORM app_private.require_project_permission(target_project_id, 'settings.manage');

  IF target_idempotency_key IS NULL
     OR target_service_code IS NULL OR btrim(target_service_code) = ''
     OR nullif(btrim(target_origin_text),'') IS NULL
     OR nullif(btrim(target_destination_text),'') IS NULL
     OR length(target_origin_text)>166
     OR length(target_destination_text)>180
     OR length(coalesce(target_notes,''))>1000
     OR target_expected_price IS NULL OR target_expected_price <= 0 OR target_expected_price > 100000
     OR target_distance_km IS NULL OR target_distance_km <= 0 OR target_distance_km > 5000
     OR target_route_duration_seconds IS NULL OR target_route_duration_seconds <= 0
     OR target_route_duration_seconds > 259200
     OR target_origin_point IS NULL OR jsonb_typeof(target_origin_point) <> 'object'
     OR target_destination_point IS NULL OR jsonb_typeof(target_destination_point) <> 'object'
  THEN
    RAISE EXCEPTION 'TEST_BROADCAST_INVALID_INPUT' USING errcode='22023';
  END IF;

  IF coalesce(target_origin_point->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
     OR coalesce(target_origin_point->>'lon','') !~ '^-?[0-9]+([.][0-9]+)?$'
     OR coalesce(target_destination_point->>'lat','') !~ '^-?[0-9]+([.][0-9]+)?$'
     OR coalesce(target_destination_point->>'lon','') !~ '^-?[0-9]+([.][0-9]+)?$'
  THEN
    RAISE EXCEPTION 'TEST_BROADCAST_INVALID_COORDINATES' USING errcode='22023';
  END IF;
  v_origin_lat := (target_origin_point->>'lat')::numeric;
  v_origin_lon := (target_origin_point->>'lon')::numeric;
  v_destination_lat := (target_destination_point->>'lat')::numeric;
  v_destination_lon := (target_destination_point->>'lon')::numeric;
  IF v_origin_lat NOT BETWEEN 18 AND 24.5 OR v_destination_lat NOT BETWEEN 18 AND 24.5
     OR v_origin_lon NOT BETWEEN -85.5 AND -73 OR v_destination_lon NOT BETWEEN -85.5 AND -73
     OR (v_origin_lat=v_destination_lat AND v_origin_lon=v_destination_lon)
  THEN
    RAISE EXCEPTION 'TEST_BROADCAST_COORDINATES_OUTSIDE_CUBA' USING errcode='22023';
  END IF;
  v_broadcast_mode := CASE WHEN target_vehicle_category_code IS NULL THEN 'all' ELSE 'category' END;

  SELECT enabled INTO v_mode_enabled FROM public.marketplace_test_mode WHERE project_id=target_project_id;
  IF NOT coalesce(v_mode_enabled,false) THEN
    RAISE EXCEPTION 'TEST_LAB_DISABLED' USING errcode='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_types s
                 WHERE s.project_id=target_project_id AND s.code=target_service_code AND s.active) THEN
    RAISE EXCEPTION 'TEST_BROADCAST_SERVICE_NOT_FOUND' USING errcode='22023';
  END IF;
  IF target_vehicle_category_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vehicle_categories c WHERE c.project_id=target_project_id
       AND c.code=target_vehicle_category_code AND c.active
  ) THEN
    RAISE EXCEPTION 'TEST_BROADCAST_CATEGORY_NOT_FOUND' USING errcode='22023';
  END IF;
  SELECT commission_rate INTO v_commission_rate
    FROM public.project_marketplace_financial_settings WHERE project_id=target_project_id;
  IF v_commission_rate IS NULL THEN
    RAISE EXCEPTION 'TEST_LAB_FINANCIAL_CONFIG_MISSING';
  END IF;

  v_payload_hash:=md5(concat_ws('|',target_project_id,target_vehicle_category_code,
    target_service_code,target_origin_text,target_destination_text,target_distance_km,
    target_route_duration_seconds,target_expected_price,coalesce(target_notes,''),
    v_origin_lat,v_origin_lon,v_destination_lat,v_destination_lon));

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'test-lab-admin:'||target_project_id::text||':'||target_idempotency_key::text,0));
  SELECT t.job_id,t.payload_hash INTO v_previous FROM public.marketplace_admin_test_jobs t
    WHERE t.project_id=target_project_id AND t.idempotency_key=target_idempotency_key;
  IF FOUND THEN
    IF v_previous.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'TEST_LAB_IDEMPOTENCY_MISMATCH' USING errcode='22023';
    END IF;
    RETURN jsonb_build_object('job_id',v_previous.job_id,'replayed',true);
  END IF;

  -- Una difusión reciente no puede repetir avisos por error de pulsación.
  IF EXISTS (
    SELECT 1 FROM public.marketplace_admin_test_jobs t
    JOIN public.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
    WHERE t.project_id=target_project_id
      AND j.is_test AND j.pricing_breakdown->>'test_broadcast'='true'
      AND j.created_at>now()-interval '60 seconds'
      AND j.test_deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TEST_BROADCAST_COOLDOWN' USING errcode='22023';
  END IF;

  -- Trabajando es accepting_jobs; is_available y GPS NO deciden la audiencia.
  SELECT count(DISTINCT a.driver_user_id) INTO v_recipient_count
  FROM public.driver_vehicle_assignments a
  JOIN public.driver_profiles d ON d.project_id=a.project_id AND d.user_id=a.driver_user_id
  JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id
  WHERE a.project_id=target_project_id AND a.is_active AND a.accepting_jobs
    AND d.status='active' AND d.activated_at IS NOT NULL AND d.suspended_at IS NULL
    AND v.marketplace_status='active' AND v.deleted_at IS NULL
    AND (target_vehicle_category_code IS NULL OR v.category_code=target_vehicle_category_code);
  IF v_recipient_count IS NULL OR v_recipient_count<1 THEN
    RAISE EXCEPTION 'TEST_BROADCAST_NO_WORKING_DRIVERS' USING errcode='22023';
  END IF;
  IF v_recipient_count>10000 THEN
    RAISE EXCEPTION 'TEST_BROADCAST_AUDIENCE_TOO_LARGE' USING errcode='22023';
  END IF;

  -- Identidad sintética preexistente: nunca se crea un cliente real.
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

  INSERT INTO public.service_requests(
    project_id,customer_id,service_code,origin_text,destination_text,
    notes,vehicle_category_code,passenger_count,details
  ) VALUES (
    target_project_id,v_customer_id,target_service_code,
    'PRUEBA · '||btrim(target_origin_text),btrim(target_destination_text),
    nullif(btrim(coalesce(target_notes,'')),''),NULL,
    CASE WHEN target_service_code='passenger' THEN 1 ELSE NULL END,
    jsonb_build_object('admin_simulated',true,'test_lab',true,
      'test_broadcast',true,'test_broadcast_mode',v_broadcast_mode,
      'test_broadcast_category',target_vehicle_category_code,
      'route_origin',jsonb_build_object('lat',v_origin_lat,'lon',v_origin_lon),
      'route_destination',jsonb_build_object('lat',v_destination_lat,'lon',v_destination_lon),
      'estimated_distance_km',target_distance_km,'distance_source','provider',
      'route_provider','mapbox','route_mode','driving',
      'route_duration_seconds',target_route_duration_seconds,'route_verified_at',now())
  ) RETURNING id INTO v_request_id;

  INSERT INTO public.jobs(
    project_id,service_request_id,service_code,status,recommended_price,final_price,
    currency,commission_rate_snapshot,is_test,test_force_wallet_commission,pricing_breakdown
  ) VALUES (
    target_project_id,v_request_id,target_service_code,'requested',
    target_expected_price,target_expected_price,'CUP',v_commission_rate,true,false,
    jsonb_build_object('test_lab',true,'test_lab_v3',true,'test_broadcast',true,
      'test_broadcast_mode',v_broadcast_mode,'test_broadcast_category',target_vehicle_category_code,
      'manual_price',true,'route_provider','mapbox','distance_km',target_distance_km,
      'route_duration_seconds',target_route_duration_seconds)
  ) RETURNING id INTO v_job_id;

  INSERT INTO public.marketplace_test_job_recipients(project_id,job_id,driver_user_id)
  SELECT DISTINCT target_project_id,v_job_id,a.driver_user_id
  FROM public.driver_vehicle_assignments a
  JOIN public.driver_profiles d ON d.project_id=a.project_id AND d.user_id=a.driver_user_id
  JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id
  WHERE a.project_id=target_project_id AND a.is_active AND a.accepting_jobs
    AND d.status='active' AND d.activated_at IS NOT NULL AND d.suspended_at IS NULL
    AND v.marketplace_status='active' AND v.deleted_at IS NULL
    AND (target_vehicle_category_code IS NULL OR v.category_code=target_vehicle_category_code);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted<>v_recipient_count THEN
    RAISE EXCEPTION 'TEST_BROADCAST_RECIPIENT_COUNT_CHANGED' USING errcode='40001';
  END IF;

  INSERT INTO public.marketplace_admin_test_jobs(
    project_id,job_id,created_by,idempotency_key,destination_mode,recipient_count,payload_hash
  ) VALUES(target_project_id,v_job_id,v_actor,target_idempotency_key,'group',v_recipient_count,v_payload_hash);

  UPDATE public.jobs SET status='published',published_at=now(),
    expires_at=now()+interval '20 minutes',state_version=state_version+1
    WHERE project_id=target_project_id AND id=v_job_id AND status='requested';
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  IF v_inserted<>1 THEN RAISE EXCEPTION 'TEST_BROADCAST_PUBLISH_FAILED'; END IF;

  -- La oferta real usa filtros de GPS/disponibilidad. El simulacro no:
  -- se insertan avisos directamente en el MISMO outbox existente.
  -- No modifica is_available, no asigna viajes y no cobra saldo.
  INSERT INTO public.notification_outbox(
    project_id,user_id,kind,notification_date,dedupe_key,title,body,data
  ) SELECT target_project_id,r.driver_user_id,'marketplace_job_available',current_date,
    'marketplace-job:'||v_job_id::text,
    'PRUEBA TUKTUK · simulacro',
    'Prueba del Centro de Pruebas. No es un viaje real ni requiere aceptación.',
    jsonb_build_object('event_type','marketplace_job_available','job_id',v_job_id::text,
      'is_test',true,'test_broadcast',true,'test_broadcast_mode',v_broadcast_mode)
  FROM public.marketplace_test_job_recipients r
  WHERE r.project_id=target_project_id AND r.job_id=v_job_id
  ON CONFLICT(project_id,user_id,kind,dedupe_key) DO UPDATE
    SET title=excluded.title,body=excluded.body,data=excluded.data;

  INSERT INTO public.job_events(
    project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,
    operation_idempotency_key,metadata
  ) VALUES (
    target_project_id,v_job_id,'requested','published','publish','admin',v_actor,
    target_idempotency_key,
    jsonb_build_object('test_lab',true,'test_broadcast',true,'recipient_count',v_recipient_count,
      'destination_mode','group','broadcast_mode',v_broadcast_mode,
      'vehicle_category',target_vehicle_category_code)
  );

  -- Envío asíncrono; el outbox conserva el aviso si la red está caída.
  BEGIN
    PERFORM net.http_post(
      url:='https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/send-push-notifications',
      headers:=jsonb_build_object('Content-Type','application/json',
        'x-tuktuk-dispatch-secret',(
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name='tuktuk_push_dispatch_secret' LIMIT 1
        )),
      body:=jsonb_build_object('limit',100,'max_batches',10,'concurrency',8,'time_budget_ms',45000),
      timeout_milliseconds:=5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'TEST_BROADCAST_PUSH_WAKE_FAILED: %',SQLSTATE;
  END;

  RETURN jsonb_build_object('job_id',v_job_id,'replayed',false,
    'recipient_count',v_recipient_count,'destination_mode','group',
    'broadcast_mode',v_broadcast_mode);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_marketplace_test_broadcast_v1(
  uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,integer,numeric,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_marketplace_test_broadcast_v1(
  uuid,uuid,text,text,text,text,jsonb,jsonb,numeric,integer,numeric,text
) TO authenticated;
