-- TUKTUK Smart Pricing V3, Fase 2B. PROPUESTA SIN APLICAR.
-- Los perfiles guardados aqui son BORRADORES y el motor actual de cotizacion
-- NO consulta esta tabla. No se activan nuevos recargos ni se tocan tarifas.
CREATE TABLE IF NOT EXISTS public.marketplace_pricing_temporal_drafts_v3 (
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    service_code text NOT NULL DEFAULT 'passenger' CHECK (service_code='passenger'),
    vehicle_category_code text NOT NULL CHECK (vehicle_category_code IN ('motorcycle','bicitaxi','tricycle','light_car')),
    evening_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (evening_pct BETWEEN 0 AND 40),
    night_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (night_pct BETWEEN 0 AND 40),
    dawn_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (dawn_pct BETWEEN 0 AND 40),
    weekend_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (weekend_pct BETWEEN 0 AND 40),
    holiday_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (holiday_pct BETWEEN 0 AND 40),
    max_combined_pct numeric(5,2) NOT NULL DEFAULT 40 CHECK (max_combined_pct BETWEEN 0 AND 40),
    holiday_dates date[] NOT NULL DEFAULT '{}',
    updated_by uuid REFERENCES auth.users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id,service_code,vehicle_category_code),
    CONSTRAINT marketplace_temporal_v3_stack_ceiling CHECK (
      greatest(evening_pct,night_pct,dawn_pct) + weekend_pct + holiday_pct <= max_combined_pct
    ),
    CONSTRAINT marketplace_temporal_v3_holiday_limit CHECK (cardinality(holiday_dates) <= 60)
);
ALTER TABLE public.marketplace_pricing_temporal_drafts_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_pricing_temporal_drafts_v3 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_marketplace_temporal_drafts_v3(target_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
    PERFORM app_private.require_project_permission(target_project_id,'marketplace.view');
    RETURN COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.vehicle_category_code)
      FROM public.marketplace_pricing_temporal_drafts_v3 p
      WHERE p.project_id=target_project_id AND p.service_code='passenger'
    ),'[]'::jsonb);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_save_marketplace_temporal_draft_v3(
  target_project_id uuid,
  target_vehicle_category_code text,
  target_evening_pct numeric,
  target_night_pct numeric,
  target_dawn_pct numeric,
  target_weekend_pct numeric,
  target_holiday_pct numeric,
  target_max_combined_pct numeric,
  target_holiday_dates date[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  actor uuid;
  result_row public.marketplace_pricing_temporal_drafts_v3%rowtype;
BEGIN
  actor := app_private.require_project_permission(target_project_id,'marketplace.manage');
  IF target_vehicle_category_code NOT IN ('motorcycle','bicitaxi','tricycle','light_car')
     OR target_vehicle_category_code IS NULL THEN
    RAISE EXCEPTION 'TEMPORAL_V3_CATEGORY_INVALID' USING ERRCODE='22023';
  END IF;
  IF target_evening_pct IS NULL OR target_night_pct IS NULL OR target_dawn_pct IS NULL
     OR target_weekend_pct IS NULL OR target_holiday_pct IS NULL OR target_max_combined_pct IS NULL
     OR target_evening_pct NOT BETWEEN 0 AND 40
     OR target_night_pct NOT BETWEEN 0 AND 40
     OR target_dawn_pct NOT BETWEEN 0 AND 40
     OR target_weekend_pct NOT BETWEEN 0 AND 40
     OR target_holiday_pct NOT BETWEEN 0 AND 40
     OR target_max_combined_pct NOT BETWEEN 0 AND 40
     OR greatest(target_evening_pct,target_night_pct,target_dawn_pct) + target_weekend_pct + target_holiday_pct > target_max_combined_pct
     OR cardinality(coalesce(target_holiday_dates,'{}'::date[])) > 60 THEN
    RAISE EXCEPTION 'TEMPORAL_V3_DRAFT_OUTSIDE_GUARDRAILS' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.marketplace_pricing_temporal_drafts_v3 AS p (
    project_id,service_code,vehicle_category_code,evening_pct,night_pct,dawn_pct,
    weekend_pct,holiday_pct,max_combined_pct,holiday_dates,updated_by,updated_at
  ) VALUES (
    target_project_id,'passenger',target_vehicle_category_code,target_evening_pct,target_night_pct,target_dawn_pct,
    target_weekend_pct,target_holiday_pct,target_max_combined_pct,coalesce(target_holiday_dates,'{}'::date[]),actor,now()
  ) ON CONFLICT(project_id,service_code,vehicle_category_code)
    DO UPDATE SET evening_pct=excluded.evening_pct,night_pct=excluded.night_pct,dawn_pct=excluded.dawn_pct,
      weekend_pct=excluded.weekend_pct,holiday_pct=excluded.holiday_pct,
      max_combined_pct=excluded.max_combined_pct,holiday_dates=excluded.holiday_dates,
      updated_by=excluded.updated_by,updated_at=now()
    RETURNING * INTO result_row;
  RETURN to_jsonb(result_row);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_list_marketplace_temporal_drafts_v3(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_save_marketplace_temporal_draft_v3(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,date[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_marketplace_temporal_drafts_v3(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_marketplace_temporal_draft_v3(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,date[]) TO authenticated;
