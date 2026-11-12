-- Proposed migration, apply only with explicit approval. No table grants.
-- Custom customer-session token (not Supabase auth.uid) is the existing
-- customer identity boundary. The privileged function lives in app_private.
CREATE OR REPLACE FUNCTION app_private.marketplace_customer_tracking_snapshot(
  target_session_id uuid, target_session_token text, target_job_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  pid uuid;
  cid uuid;
  result jsonb;
BEGIN
  cid := app_private.resolve_marketplace_customer_session(target_session_id, target_session_token);
  pid := app_private.marketplace_customer_project_id();
  SELECT jsonb_build_object(
    'status', j.status,
    'driver_location', CASE WHEN l.driver_user_id IS NOT NULL
      AND l.latitude BETWEEN -90 AND 90 AND l.longitude BETWEEN -180 AND 180
      AND l.captured_at BETWEEN now() - interval '120 seconds' AND now() + interval '15 seconds'
      THEN jsonb_build_object(
        'latitude', l.latitude, 'longitude', l.longitude,
        'accuracy_m', l.accuracy_m, 'speed_mps', l.speed_mps,
        'heading_degrees', CASE WHEN l.heading_degrees >= 0 AND l.heading_degrees < 360 THEN l.heading_degrees END,
        'captured_at', l.captured_at,
        'fresh', l.captured_at >= now() - interval '60 seconds'
      ) END,
    'route_origin', CASE WHEN r.details #>> '{route_origin,lat}' ~ '^-?[0-9]+([.][0-9]+)?$'
      AND r.details #>> '{route_origin,lon}' ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN jsonb_build_object('lat', (r.details #>> '{route_origin,lat}')::numeric,
        'lon', (r.details #>> '{route_origin,lon}')::numeric) END,
    'route_destination', CASE WHEN r.details #>> '{route_destination,lat}' ~ '^-?[0-9]+([.][0-9]+)?$'
      AND r.details #>> '{route_destination,lon}' ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN jsonb_build_object('lat', (r.details #>> '{route_destination,lat}')::numeric,
        'lon', (r.details #>> '{route_destination,lon}')::numeric) END
  ) INTO result
  FROM public.jobs j
  JOIN public.service_requests r ON r.project_id=j.project_id AND r.id=j.service_request_id
  LEFT JOIN public.marketplace_driver_locations l ON l.project_id=j.project_id
    AND l.driver_user_id=j.assigned_driver_user_id AND l.vehicle_id=j.assigned_vehicle_id
  WHERE j.project_id=pid AND j.id=target_job_id AND r.customer_id=cid
    AND j.test_deleted_at IS NULL
    AND j.status IN ('accepted','en_route','pickup','in_progress')
    AND (j.status <> 'accepted' OR r.scheduled_for IS NULL OR r.scheduled_for <= now())
    AND j.assigned_driver_user_id IS NOT NULL AND j.assigned_vehicle_id IS NOT NULL;
  IF result IS NULL THEN RAISE EXCEPTION 'CUSTOMER_TRACKING_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION app_private.marketplace_customer_tracking_snapshot(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.marketplace_customer_tracking_snapshot(uuid,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_marketplace_customer_tracking_snapshot(
  target_session_id uuid, target_session_token text, target_job_id uuid
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$
  SELECT app_private.marketplace_customer_tracking_snapshot(target_session_id,target_session_token,target_job_id);
$function$;
REVOKE ALL ON FUNCTION public.get_marketplace_customer_tracking_snapshot(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_customer_tracking_snapshot(uuid,text,uuid) TO service_role;
DO $verify$
BEGIN
  IF has_function_privilege('anon','public.get_marketplace_customer_tracking_snapshot(uuid,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.get_marketplace_customer_tracking_snapshot(uuid,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.get_marketplace_customer_tracking_snapshot(uuid,text,uuid)','EXECUTE')
    OR has_function_privilege('anon','app_private.marketplace_customer_tracking_snapshot(uuid,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','app_private.marketplace_customer_tracking_snapshot(uuid,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','app_private.marketplace_customer_tracking_snapshot(uuid,text,uuid)','EXECUTE')
    OR has_table_privilege('service_role','public.marketplace_driver_locations','SELECT')
    OR has_table_privilege('service_role','public.jobs','SELECT')
    OR has_table_privilege('anon','public.marketplace_driver_locations','SELECT')
    OR has_table_privilege('authenticated','public.marketplace_driver_locations','SELECT')
  THEN RAISE EXCEPTION 'TRACKING_SECURITY_CONTRACT_FAILED'; END IF;
END;
$verify$;
