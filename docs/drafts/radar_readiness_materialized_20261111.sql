-- BORRADOR EXCLUSIVAMENTE PARA REVISION. NO APLICADO A SUPABASE.
-- Antes de usarlo: generar una migracion oficial con la herramienta Supabase,
-- revisar permisos y dependencias, y obtener autorizacion expresa del propietario.
--
-- Objetivo: hacer que PostgreSQL evalúe el CTE "work" una sola vez y
-- reutilice los indicadores, sin cambiar firmas, campos o criterios.
--
-- Se verifica la identidad exacta de la funcion existente para impedir
-- sobrescrituras accidentales si su codigo cambio despues de la auditoria.
DO $radar_performance$
DECLARE
  target regprocedure := to_regprocedure('public.admin_get_marketplace_radar_readiness(uuid)');
  src text;
  old_fragment text := 'with work as (';
  new_fragment text := 'with work as materialized (';
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'RADAR_READINESS_FUNCTION_MISSING';
  END IF;

  SELECT pg_get_functiondef(target) INTO src;

  IF md5(src) <> 'ebbb7bb8ba5fab8de02bec80f352bb11' THEN
    RAISE EXCEPTION 'RADAR_READINESS_SOURCE_CHANGED_REAUDIT_REQUIRED';
  END IF;

  IF length(src) - length(replace(src, old_fragment, '')) <> length(old_fragment) THEN
    RAISE EXCEPTION 'RADAR_READINESS_EXPECTED_CTE_NOT_UNIQUE';
  END IF;

  IF position('SECURITY DEFINER' IN src) = 0
     OR position('SET search_path TO' IN src) = 0 THEN
    RAISE EXCEPTION 'RADAR_READINESS_SECURITY_CONTRACT_CHANGED';
  END IF;

  EXECUTE replace(src, old_fragment, new_fragment);
END
$radar_performance$;

-- Validacion posterior al despliegue (solo lectura):
-- SELECT position('with work as materialized (' IN pg_get_functiondef(
--   'public.admin_get_marketplace_radar_readiness(uuid)'::regprocedure
-- )) > 0 AS optimization_present;
--
-- Reversion: crear migracion correctiva separada, con verificacion de la nueva
-- definicion, reemplazando 'with work as materialized (' por 'with work as ('.
-- NO ejecutar reversiones automaticas ni cambios directos sin autorizacion.
