-- TUKTUK Smart Pricing V3 / Fase 3A: PROPUESTA, NO EJECUTAR AUTOMATICAMENTE.
-- Permite BORRADORES aislados por servicio: pasajeros, carga y mensajeria.
-- NUNCA modifica tarifas publicadas ni activa recargos en cotizaciones.
-- Requiere revision y autorizacion independiente antes de aplicar en Supabase remoto.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$
DECLARE
  v_pid uuid;
  v_expected int;
  v_service_check text;
  v_category_check text;
BEGIN
  SELECT id INTO v_pid FROM public.projects WHERE slug='tuktuk-control';
  IF v_pid IS NULL THEN RAISE EXCEPTION 'Proyecto TUKTUK no encontrado'; END IF;
  SELECT pg_get_constraintdef(oid) INTO v_service_check FROM pg_constraint
    WHERE conrelid='public.marketplace_pricing_temporal_drafts_v3'::regclass
      AND conname='marketplace_pricing_temporal_drafts_v3_service_code_check';
  SELECT pg_get_constraintdef(oid) INTO v_category_check FROM pg_constraint
    WHERE conrelid='public.marketplace_pricing_temporal_drafts_v3'::regclass
      AND conname='marketplace_pricing_temporal_drafts_vehicle_category_code_check';
  IF v_service_check IS NULL OR v_service_check NOT LIKE '%service_code = ''passenger''%'
    OR v_category_check IS NULL OR v_category_check NOT LIKE '%motorcycle%'
    OR v_category_check NOT LIKE '%light_car%' THEN
    RAISE EXCEPTION 'Las restricciones existentes cambiaron. Migracion detenida.';
  END IF;
  SELECT count(*) INTO v_expected FROM public.marketplace_pricing_temporal_drafts_v3
   WHERE project_id=v_pid AND service_code='passenger'
     AND cardinality(holiday_dates)=13;
  IF v_expected<>4 THEN
    RAISE EXCEPTION 'Calendarios de pasajeros inesperados (%). Migracion detenida.',v_expected;
  END IF;
  SELECT count(*) INTO v_expected FROM public.marketplace_pricing_tariffs
    WHERE project_id=v_pid AND service_code='cargo' AND status='active';
  IF v_expected<>7 THEN RAISE EXCEPTION 'Cantidad de tarifas carga cambiada (%)',v_expected; END IF;
  SELECT count(*) INTO v_expected FROM public.marketplace_pricing_tariffs
    WHERE project_id=v_pid AND service_code='courier' AND status='active';
  IF v_expected<>8 THEN RAISE EXCEPTION 'Cantidad de tarifas mensajeria cambiada (%)',v_expected; END IF;
END;
$guard$;

ALTER TABLE public.marketplace_pricing_temporal_drafts_v3
  DROP CONSTRAINT marketplace_pricing_temporal_drafts_v3_service_code_check;
ALTER TABLE public.marketplace_pricing_temporal_drafts_v3
  ADD CONSTRAINT marketplace_pricing_temporal_drafts_v3_service_code_check
  CHECK (service_code IN ('passenger','cargo','courier'));
ALTER TABLE public.marketplace_pricing_temporal_drafts_v3
  DROP CONSTRAINT marketplace_pricing_temporal_drafts_vehicle_category_code_check;
ALTER TABLE public.marketplace_pricing_temporal_drafts_v3
  ADD CONSTRAINT marketplace_pricing_temporal_drafts_vehicle_category_code_check
  CHECK (
    (service_code='passenger' AND vehicle_category_code IN ('motorcycle','bicitaxi','tricycle','light_car'))
    OR (service_code='cargo' AND vehicle_category_code IN ('motorcycle','bicitaxi','tricycle','light_car','van','truck','other'))
    OR (service_code='courier' AND vehicle_category_code IN ('bicycle','motorcycle','bicitaxi','tricycle','light_car','van','truck','other'))
  );

-- Nuevas RPC. Las RPC anteriores (solo pasajeros) se conservan para compatibilidad.
CREATE OR REPLACE FUNCTION public.admin_list_marketplace_temporal_drafts_v3_service(
  target_project_id uuid, target_service_code text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  PERFORM app_private.require_project_permission(target_project_id,'marketplace.view');
  IF target_service_code IS NULL OR target_service_code NOT IN ('passenger','cargo','courier') THEN
    RAISE EXCEPTION 'TEMPORAL_V3_SERVICE_INVALID' USING ERRCODE='22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.vehicle_category_code)
    FROM public.marketplace_pricing_temporal_drafts_v3 p
    WHERE p.project_id=target_project_id AND p.service_code=target_service_code
  ),'[]'::jsonb);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_save_marketplace_temporal_draft_v3_service(
  target_project_id uuid,
  target_service_code text,
  target_vehicle_category_code text,
  target_evening_pct numeric,
  target_night_pct numeric,
  target_dawn_pct numeric,
  target_weekend_pct numeric,
  target_holiday_pct numeric,
  target_max_combined_pct numeric,
  target_holiday_dates date[] DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  actor uuid;
  result_row public.marketplace_pricing_temporal_drafts_v3%rowtype;
BEGIN
  actor := app_private.require_project_permission(target_project_id,'marketplace.manage');
  IF target_service_code IS NULL OR target_service_code NOT IN ('passenger','cargo','courier')
     OR target_vehicle_category_code IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.marketplace_pricing_tariffs t
       WHERE t.project_id=target_project_id AND t.service_code=target_service_code
         AND t.vehicle_category_code=target_vehicle_category_code AND t.status='active'
     ) THEN
    RAISE EXCEPTION 'TEMPORAL_V3_SERVICE_CATEGORY_INVALID' USING ERRCODE='22023';
  END IF;
  IF target_evening_pct IS NULL OR target_night_pct IS NULL OR target_dawn_pct IS NULL
     OR target_weekend_pct IS NULL OR target_holiday_pct IS NULL OR target_max_combined_pct IS NULL
     OR target_evening_pct NOT BETWEEN 0 AND 40 OR target_night_pct NOT BETWEEN 0 AND 40
     OR target_dawn_pct NOT BETWEEN 0 AND 40 OR target_weekend_pct NOT BETWEEN 0 AND 40
     OR target_holiday_pct NOT BETWEEN 0 AND 40 OR target_max_combined_pct NOT BETWEEN 0 AND 40
     OR GREATEST(target_evening_pct,target_night_pct,target_dawn_pct)
       + target_weekend_pct + target_holiday_pct > target_max_combined_pct
     OR cardinality(coalesce(target_holiday_dates,'{}'::date[]))>60 THEN
    RAISE EXCEPTION 'TEMPORAL_V3_DRAFT_OUTSIDE_GUARDRAILS' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.marketplace_pricing_temporal_drafts_v3 AS p (
    project_id,service_code,vehicle_category_code,evening_pct,night_pct,dawn_pct,
    weekend_pct,holiday_pct,max_combined_pct,holiday_dates,updated_by,updated_at
  ) VALUES (
    target_project_id,target_service_code,target_vehicle_category_code,
    target_evening_pct,target_night_pct,target_dawn_pct,
    target_weekend_pct,target_holiday_pct,target_max_combined_pct,
    coalesce(target_holiday_dates,'{}'::date[]),actor,now()
  ) ON CONFLICT(project_id,service_code,vehicle_category_code)
  DO UPDATE SET evening_pct=excluded.evening_pct, night_pct=excluded.night_pct,
    dawn_pct=excluded.dawn_pct, weekend_pct=excluded.weekend_pct,
    holiday_pct=excluded.holiday_pct,max_combined_pct=excluded.max_combined_pct,
    holiday_dates=excluded.holiday_dates,updated_by=excluded.updated_by,updated_at=now()
  RETURNING * INTO result_row;
  RETURN to_jsonb(result_row);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_list_marketplace_temporal_drafts_v3_service(uuid,text)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_save_marketplace_temporal_draft_v3_service(
  uuid,text,text,numeric,numeric,numeric,numeric,numeric,numeric,date[])
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_marketplace_temporal_drafts_v3_service(uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_marketplace_temporal_draft_v3_service(
  uuid,text,text,numeric,numeric,numeric,numeric,numeric,numeric,date[])
  TO authenticated;

-- Preparar 7+8 BORRADORES independientes, no afectan cobros.
WITH tuktuk AS (
  SELECT id FROM public.projects WHERE slug='tuktuk-control'
), cuban_calendar AS (
  SELECT d.holiday_dates
  FROM public.marketplace_pricing_temporal_drafts_v3 d
  JOIN tuktuk p ON p.id=d.project_id
  WHERE d.service_code='passenger'
  ORDER BY cardinality(d.holiday_dates) DESC LIMIT 1
)
INSERT INTO public.marketplace_pricing_temporal_drafts_v3 (
  project_id,service_code,vehicle_category_code,evening_pct,night_pct,dawn_pct,
  weekend_pct,holiday_pct,max_combined_pct,holiday_dates,updated_at
)
SELECT t.project_id,t.service_code,t.vehicle_category_code,
  CASE WHEN t.service_code='cargo' THEN 5 ELSE 10 END,
  CASE WHEN t.service_code='cargo' THEN 10 ELSE 15 END,
  CASE WHEN t.service_code='cargo' THEN 15 ELSE 20 END,
  5,10,
  CASE WHEN t.service_code='cargo' THEN 30 ELSE 35 END,
  COALESCE((SELECT holiday_dates FROM cuban_calendar),'{}'::date[]),now()
FROM public.marketplace_pricing_tariffs t
JOIN tuktuk p ON p.id=t.project_id
WHERE t.status='active' AND t.service_code IN ('cargo','courier')
ON CONFLICT (project_id, service_code, vehicle_category_code) DO NOTHING;

-- Comprobacion en la misma transaccion, de modo que un error revierte todo.
DO $verify$
DECLARE
  pid uuid;
  n_cargo integer;
  n_courier integer;
  n_passenger integer;
BEGIN
  SELECT id INTO pid FROM public.projects WHERE slug='tuktuk-control';
  SELECT count(*) FILTER (WHERE service_code='cargo'),
         count(*) FILTER (WHERE service_code='courier'),
         count(*) FILTER (WHERE service_code='passenger')
  INTO n_cargo,n_courier,n_passenger
  FROM public.marketplace_pricing_temporal_drafts_v3 WHERE project_id=pid;
  IF n_cargo<>7 OR n_courier<>8 OR n_passenger<>4 THEN
    RAISE EXCEPTION 'Borradores inesperados: carga %, mensajeria %, pasajeros %',n_cargo,n_courier,n_passenger;
  END IF;
END;
$verify$;
COMMIT;