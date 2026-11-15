-- Impulsa: ignore archived test jobs, prioritize a compatible promoter before normal radar waves.
-- Preserve fresh GPS, hard radar limits, financial eligibility, active-job exclusion and general dispatch.
CREATE OR REPLACE FUNCTION app_private.marketplace_promo_preferred_eligible(target_job_id uuid, target_driver_user_id uuid, target_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.jobs j
    JOIN public.service_requests req ON req.project_id=j.project_id AND req.id=j.service_request_id
    JOIN app_private.marketplace_driver_promo_settings cfg ON cfg.project_id=j.project_id AND cfg.profiles_enabled AND cfg.priority_enabled AND cfg.priority_seconds>0
    JOIN public.project_marketplace_dispatch_settings radar ON radar.project_id=j.project_id AND radar.enabled
    JOIN app_private.resolve_marketplace_promo_profile(target_code) p ON p.project_id=j.project_id AND p.driver_user_id=target_driver_user_id
    JOIN public.project_marketplace_financial_settings fin ON fin.project_id=j.project_id
    WHERE j.id=target_job_id AND j.status='published' AND NOT j.is_test AND j.test_deleted_at IS NULL
      AND req.scheduled_for IS NULL
      AND p.category_code=coalesce(req.vehicle_category_code,j.pricing_vehicle_category_code)
      AND j.service_code=ANY(p.service_codes)
      AND app_private.marketplace_driver_can_receive_job(j.project_id,p.driver_user_id,p.vehicle_id,j.id)
      AND EXISTS(SELECT 1 FROM public.marketplace_driver_locations l WHERE l.project_id=j.project_id
        AND l.driver_user_id=p.driver_user_id AND l.vehicle_id=p.vehicle_id
        AND l.captured_at >= now()-interval '300 seconds' AND l.captured_at <= now()+interval '30 seconds')
      AND NOT EXISTS(SELECT 1 FROM public.jobs busy WHERE busy.project_id=j.project_id AND busy.assigned_driver_user_id=p.driver_user_id
        AND busy.test_deleted_at IS NULL AND busy.status IN ('accepted','en_route','pickup','in_progress','incident'))
      AND (NOT app_private.wallet_job_charge_enabled(j.project_id,j.id,fin.commission_enabled) OR app_private.has_active_marketplace_work_trial(p.driver_user_id)
        OR app_private.wallet_can_finance(j.project_id,p.driver_user_id,j.id,round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,p.driver_user_id,j.commission_rate_snapshot),2)))
      AND EXISTS(SELECT 1 FROM app_private.marketplace_promo_base_candidate_state(j.project_id,p.driver_user_id,p.vehicle_id,j.id) b WHERE b.allowed OR b.eligible_from IS NOT NULL)
  )
$function$;

CREATE OR REPLACE FUNCTION app_private.marketplace_dispatch_candidate_state(target_project_id uuid, target_driver_user_id uuid, target_vehicle_id text, target_job_id uuid)
 RETURNS TABLE(policy_enabled boolean, allowed boolean, distance_km numeric, radius_stage integer, radius_limit_km numeric, rating_average numeric, rating_count bigint, rating_preferred boolean, eligible_from timestamp with time zone, rating_score numeric, tie_breaker text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT b.policy_enabled,(b.allowed OR EXISTS (
      SELECT 1 FROM app_private.marketplace_driver_promo_attribution a
      WHERE a.project_id=target_project_id AND a.job_id=target_job_id
        AND a.driver_user_id=target_driver_user_id AND a.phase='preferred'
        AND a.priority_until>now()
        AND app_private.marketplace_promo_preferred_eligible(a.job_id,a.driver_user_id,a.source_code)
    )) AND app_private.marketplace_promo_allows(target_project_id,target_driver_user_id,target_job_id),
    b.distance_km,b.radius_stage,b.radius_limit_km,b.rating_average,b.rating_count,b.rating_preferred,b.eligible_from,b.rating_score,b.tie_breaker
  FROM app_private.marketplace_promo_base_candidate_state(target_project_id,target_driver_user_id,target_vehicle_id,target_job_id) b
$function$;

-- Synchronize only staged, disabled Impulsa projects; never activate billing.
UPDATE public.project_marketplace_financial_settings f
SET commission_rate=p.general_rate, updated_at=now()
FROM app_private.marketplace_impulsa_policy p
WHERE p.project_id=f.project_id AND NOT p.enabled AND NOT f.commission_enabled
  AND p.general_rate=0.15 AND p.own_rate=0.10 AND p.commercial_rate=0.05
  AND f.commission_rate IS DISTINCT FROM p.general_rate;
