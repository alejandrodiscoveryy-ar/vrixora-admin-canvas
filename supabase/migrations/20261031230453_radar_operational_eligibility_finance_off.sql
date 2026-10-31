-- TukTuk / Radar: los candidatos tecnicos se determinan por estado operativo,
-- perfil, GPS y las reglas de despacho existentes (radio, expansion, prioridad
-- y compatibilidad). No confundir la seleccion con la facturacion.
-- Las comisiones siguen gobernadas por project_marketplace_financial_settings.

DO $radar_fix$
DECLARE
  src text;
  fragment text;
  replacement text;
BEGIN
  -- 1. Las notificaciones reales no deben requerir prueba gratuita ni deposito
  -- cuando la plataforma ha desactivado el cobro de comisiones.
  SELECT pg_get_functiondef(
    'app_private.marketplace_driver_can_receive_job(uuid,uuid,text,uuid)'::regprocedure
  ) INTO src;
  IF src IS NULL THEN RAISE EXCEPTION 'RADAR_ELIGIBILITY_FUNCTION_NOT_FOUND'; END IF;

  fragment := $old$
        and (
          app_private.has_active_marketplace_work_trial(d.user_id)
          or app_private.has_confirmed_marketplace_initial_deposit(d.user_id)
          or (j.is_test and not j.test_force_wallet_commission)
          or (j.is_test and app_private.marketplace_test_job_targets_driver(j.project_id,j.id,d.user_id) and j.test_force_wallet_commission)
        )
$old$;
  replacement := $new$
        and (
          exists (
            select 1 from public.project_marketplace_financial_settings financial
            where financial.project_id = j.project_id
              and financial.commission_enabled is false
          )
          or app_private.has_active_marketplace_work_trial(d.user_id)
          or app_private.has_confirmed_marketplace_initial_deposit(d.user_id)
          or (j.is_test and not j.test_force_wallet_commission)
          or (j.is_test and app_private.marketplace_test_job_targets_driver(j.project_id,j.id,d.user_id) and j.test_force_wallet_commission)
        )
$new$;
  IF length(src) - length(replace(src, fragment, '')) <> length(fragment) THEN
    RAISE EXCEPTION 'RADAR_ELIGIBILITY_SOURCE_CHANGED';
  END IF;
  src := replace(src, fragment, replacement);

  -- El conductor ha de mantener Trabajar y aceptar solicitudes.
  fragment := '        and a.is_active and a.is_available';
  replacement := '        and a.is_active and a.accepting_jobs and a.is_available';
  IF length(src) - length(replace(src, fragment, '')) <> length(fragment) THEN
    RAISE EXCEPTION 'RADAR_ACCEPTING_JOBS_SOURCE_CHANGED';
  END IF;
  EXECUTE replace(src, fragment, replacement);

  -- 2. Disponibilidad real: GPS + perfil/vehiculo, nunca vigencia de prueba
  -- ni deposito. Mantener campos legacy para no romper un frontend en cache.
  SELECT pg_get_functiondef(
    'public.admin_get_marketplace_radar_readiness(uuid)'::regprocedure
  ) INTO src;
  IF src IS NULL THEN RAISE EXCEPTION 'RADAR_READINESS_FUNCTION_NOT_FOUND'; END IF;

  fragment := $old$
      app_private.marketplace_onboarding_requirements_complete(a.driver_user_id,a.vehicle_id)
       and (app_private.has_active_marketplace_work_trial(a.driver_user_id)
         or app_private.has_confirmed_marketplace_initial_deposit(a.driver_user_id)) as commercially_ready,
$old$;
  replacement := $new$
      app_private.marketplace_onboarding_requirements_complete(a.driver_user_id,a.vehicle_id)
        as onboarding_complete,
      (app_private.has_active_marketplace_work_trial(a.driver_user_id)
        or app_private.has_confirmed_marketplace_initial_deposit(a.driver_user_id))
        as legacy_commercial_access,
$new$;
  IF length(src) - length(replace(src, fragment, '')) <> length(fragment) THEN
    RAISE EXCEPTION 'RADAR_READINESS_WORK_SOURCE_CHANGED';
  END IF;
  src := replace(src, fragment, replacement);

  fragment := $old$
      'commercially_ready',count(distinct driver_user_id) filter(where commercially_ready and profile_active),
      'commercially_blocked',count(distinct driver_user_id) filter(where not commercially_ready or not profile_active),
      'radar_reachable',count(distinct driver_user_id) filter(where commercially_ready and profile_active and gps_recent),
$old$;
  replacement := $new$
      'profile_ready',count(distinct driver_user_id) filter(where onboarding_complete and profile_active),
      'profile_blocked',count(distinct driver_user_id) filter(where not onboarding_complete or not profile_active),
      'commercially_ready',count(distinct driver_user_id) filter(where onboarding_complete and legacy_commercial_access and profile_active),
      'commercially_blocked',count(distinct driver_user_id) filter(where not onboarding_complete or not legacy_commercial_access or not profile_active),
      'radar_reachable',count(distinct driver_user_id) filter(where onboarding_complete and profile_active and gps_recent),
$new$;
  IF length(src) - length(replace(src, fragment, '')) <> length(fragment) THEN
    RAISE EXCEPTION 'RADAR_READINESS_COUNTS_SOURCE_CHANGED';
  END IF;
  EXECUTE replace(src, fragment, replacement);
END;
$radar_fix$;
