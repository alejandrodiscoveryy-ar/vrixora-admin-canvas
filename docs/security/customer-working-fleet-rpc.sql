-- Proposed migration: customer fleet presence, service-only, no table grants.
-- Apply only after owner approval; record exact Supabase migration version in Git.
-- Use custom customer session validation already used by customer history.
CREATE OR REPLACE FUNCTION app_private.marketplace_customer_working_fleet(
  target_session_id uuid,
  target_session_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  pid uuid;
  result jsonb;
BEGIN
  PERFORM app_private.resolve_marketplace_customer_session(target_session_id, target_session_token);
  pid := app_private.marketplace_customer_project_id();
  SELECT coalesce(jsonb_agg(jsonb_build_object('latitude', q.lat, 'longitude', q.lon)
    ORDER BY q.lat, q.lon), '[]'::jsonb)
  INTO result
  FROM (
    SELECT round(l.latitude / 0.003) * 0.003 AS lat,
           round(l.longitude / 0.003) * 0.003 AS lon
    FROM public.marketplace_driver_locations l
    JOIN public.driver_vehicle_assignments a
      ON a.project_id = l.project_id AND a.driver_user_id = l.driver_user_id
      AND a.vehicle_id = l.vehicle_id
    JOIN public.driver_profiles d ON d.project_id = a.project_id AND d.user_id = a.driver_user_id
    JOIN public.vehicles v ON v.project_id = a.project_id AND v.id = a.vehicle_id
    WHERE l.project_id = pid
      AND a.is_active AND a.accepting_jobs
      AND d.status = 'active' AND d.activated_at IS NOT NULL AND d.suspended_at IS NULL
      AND v.marketplace_status = 'active' AND v.deleted_at IS NULL
      AND l.latitude BETWEEN 18 AND 24.5
      AND l.longitude BETWEEN -85.5 AND -73
      AND round(l.latitude / 0.003) * 0.003 BETWEEN 18 AND 24.5
      AND round(l.longitude / 0.003) * 0.003 BETWEEN -85.5 AND -73
    ORDER BY lat, lon
    LIMIT 1000
  ) q;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION app_private.marketplace_customer_working_fleet(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.marketplace_customer_working_fleet(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_marketplace_customer_working_fleet(
  target_session_id uuid,
  target_session_token text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$
  SELECT app_private.marketplace_customer_working_fleet(target_session_id, target_session_token);
$function$;
REVOKE ALL ON FUNCTION public.get_marketplace_customer_working_fleet(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_customer_working_fleet(uuid, text) TO service_role;

DO $verify$
BEGIN
  IF has_function_privilege('anon','public.get_marketplace_customer_working_fleet(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.get_marketplace_customer_working_fleet(uuid,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.get_marketplace_customer_working_fleet(uuid,text)','EXECUTE')
     OR has_function_privilege('anon','app_private.marketplace_customer_working_fleet(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','app_private.marketplace_customer_working_fleet(uuid,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','app_private.marketplace_customer_working_fleet(uuid,text)','EXECUTE')
     OR has_table_privilege('anon','public.marketplace_driver_locations','SELECT')
     OR has_table_privilege('authenticated','public.marketplace_driver_locations','SELECT')
     OR has_table_privilege('service_role','public.marketplace_driver_locations','SELECT')
  THEN RAISE EXCEPTION 'FLEET_SECURITY_CONTRACT_FAILED'; END IF;
END;
$verify$;
