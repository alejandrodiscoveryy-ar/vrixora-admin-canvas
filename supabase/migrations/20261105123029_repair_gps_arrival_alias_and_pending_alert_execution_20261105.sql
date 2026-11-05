-- TUKTUK: reparacion del fallo en GPS y permisos de alertas (5 nov 2026).
-- Aplicada en Supabase con migracion 20261105123029.
-- Conservar en el control de versiones con el mismo numero de migracion.
-- No modifica tablas, registros de conductores ni carreras.
DO $repair$
DECLARE
  gps_fn regprocedure := to_regprocedure('app_private.marketplace_autopickup_from_driver_location()');
  alert_fn regprocedure := to_regprocedure('public.enqueue_admin_marketplace_pending_alerts(uuid)');
  original text;
  anchor text := $old$    select j.id, r.details
    from public.jobs j
    join public.service_requests r
      on r.project_id=j.project_id and r.id=j.service_request_id
    where j.project_id=new.project_id
      and j.assigned_driver_user_id=new.driver_user_id
      and j.assigned_vehicle_id=new.vehicle_id
      and j.status='en_route'
      and j.test_deleted_at is null
    order by j.created_at desc
    limit 2$old$;
  replacement text := $new$    select source_job.id, r.details
    from public.jobs source_job
    join public.service_requests r
      on r.project_id=source_job.project_id and r.id=source_job.service_request_id
    where source_job.project_id=new.project_id
      and source_job.assigned_driver_user_id=new.driver_user_id
      and source_job.assigned_vehicle_id=new.vehicle_id
      and source_job.status='en_route'
      and source_job.test_deleted_at is null
    order by source_job.created_at desc
    limit 2$new$;
BEGIN
  IF gps_fn IS NULL OR alert_fn IS NULL THEN
    RAISE EXCEPTION 'TUKTUK_GPS_ALERT_REPAIR_ABORT: expected functions missing';
  END IF;
  IF NOT (SELECT p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
          FROM pg_proc p WHERE p.oid=gps_fn::oid) THEN
    RAISE EXCEPTION 'TUKTUK_GPS_ALERT_REPAIR_ABORT: GPS privilege contract changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgname='marketplace_autopickup_driver_location'
      AND c.relname='marketplace_driver_locations'
      AND t.tgenabled='O') THEN
    RAISE EXCEPTION 'TUKTUK_GPS_ALERT_REPAIR_ABORT: GPS trigger absent';
  END IF;
  IF (SELECT p.prosecdef OR pg_get_userbyid(p.proowner)<>'postgres'
      FROM pg_proc p WHERE p.oid=alert_fn::oid)
     OR NOT has_function_privilege('service_role', alert_fn, 'EXECUTE')
     OR has_function_privilege('anon', alert_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', alert_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'TUKTUK_GPS_ALERT_REPAIR_ABORT: alerts privilege contract changed';
  END IF;
  original := pg_get_functiondef(gps_fn::oid);
  IF length(original)-length(replace(original,anchor,''))<>length(anchor) THEN
    RAISE EXCEPTION 'TUKTUK_GPS_ALERT_REPAIR_ABORT: original GPS fragment missing or repeated';
  END IF;
  EXECUTE replace(original, anchor, replacement);
  IF position('from public.jobs source_job' in pg_get_functiondef(gps_fn::oid))=0
     OR position('    select j.id, r.details' in pg_get_functiondef(gps_fn::oid))<>0 THEN
    RAISE EXCEPTION 'TUKTUK_GPS_ALERT_REPAIR_ABORT: GPS patch not installed';
  END IF;
END;
$repair$;

-- Solo el proceso privado service_role tiene EXECUTE: sin GRANT amplio.
ALTER FUNCTION public.enqueue_admin_marketplace_pending_alerts(uuid) SECURITY DEFINER;

DO $verify$
DECLARE
  gps_fn regprocedure := to_regprocedure('app_private.marketplace_autopickup_from_driver_location()');
  alert_fn regprocedure := to_regprocedure('public.enqueue_admin_marketplace_pending_alerts(uuid)');
  location_rpc regprocedure := to_regprocedure('public.update_my_marketplace_driver_location(text,numeric,numeric,numeric,numeric,numeric,timestamptz)');
BEGIN
  IF NOT (SELECT p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
          FROM pg_proc p WHERE p.oid=alert_fn::oid)
     OR NOT has_function_privilege('service_role',alert_fn,'EXECUTE')
     OR has_function_privilege('anon',alert_fn,'EXECUTE')
     OR has_function_privilege('authenticated',alert_fn,'EXECUTE')
     OR NOT (pg_get_functiondef(alert_fn::oid) LIKE '%SET search_path TO ''''%')
     OR NOT (pg_get_functiondef(location_rpc::oid) LIKE '%TUKTUK_GPS_CLOCK_SKEW_1H_FIX_20261104%')
     OR NOT (pg_get_functiondef(gps_fn::oid) LIKE '%from public.jobs source_job%')
  THEN
    RAISE EXCEPTION 'TUKTUK_GPS_ALERT_REPAIR_ABORT: postflight security contract failed';
  END IF;
END;
$verify$;
