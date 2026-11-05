-- SOLO LECTURA. Verificacion de la reparacion aplicada 5 nov 2026.
-- No vuelve a aplicar la migracion ni modifica la base de datos.
SELECT now() AS comprobado_en,
  position('from public.jobs source_job' in pg_get_functiondef('app_private.marketplace_autopickup_from_driver_location()'::regprocedure)) > 0 AS gps_funcion_corregida,
  (SELECT p.prosecdef FROM pg_proc p WHERE p.oid='public.enqueue_admin_marketplace_pending_alerts(uuid)'::regprocedure) AS alertas_ejecutan_con_permisos_del_propietario,
  has_function_privilege('service_role','public.enqueue_admin_marketplace_pending_alerts(uuid)','EXECUTE') AS servicio_puede_ejecutar_alertas,
  has_function_privilege('authenticated','public.enqueue_admin_marketplace_pending_alerts(uuid)','EXECUTE') AS usuarios_tienen_acceso_indebido,
  has_table_privilege('service_role','public.jobs','SELECT') AS permiso_amplio_en_carreras,
  (SELECT version FROM supabase_migrations.schema_migrations WHERE name='repair_gps_arrival_alias_and_pending_alert_execution_20261105' ORDER BY version DESC LIMIT 1) AS version_aplicada;

SELECT now() AS comprobado_en,
       count(*) FILTER (WHERE a.is_active AND a.is_available AND a.accepting_jobs) AS trabajando_en_registros,
       count(*) FILTER (WHERE a.is_active AND a.is_available AND a.accepting_jobs
                         AND l.captured_at >= now()-interval '5 minutes') AS ubicacion_reciente,
       count(*) FILTER (WHERE a.is_active AND a.is_available AND a.accepting_jobs
                         AND l.driver_user_id IS NULL) AS sin_ubicacion
FROM public.driver_vehicle_assignments a
LEFT JOIN public.marketplace_driver_locations l
  ON l.project_id=a.project_id AND l.driver_user_id=a.driver_user_id AND l.vehicle_id=a.vehicle_id;
