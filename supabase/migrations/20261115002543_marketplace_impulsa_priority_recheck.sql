-- Recheck the exclusive promoter before granting an offer or acceptance; general radar resumes after timeout.
CREATE OR REPLACE FUNCTION app_private.marketplace_dispatch_candidate_state(target_project_id uuid, target_driver_user_id uuid, target_vehicle_id text, target_job_id uuid)
 RETURNS TABLE(policy_enabled boolean, allowed boolean, distance_km numeric, radius_stage integer, radius_limit_km numeric, rating_average numeric, rating_count bigint, rating_preferred boolean, eligible_from timestamp with time zone, rating_score numeric, tie_breaker text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT b.policy_enabled,
    CASE WHEN EXISTS (
      SELECT 1 FROM app_private.marketplace_driver_promo_attribution a
      JOIN app_private.marketplace_driver_promo_settings s ON s.project_id=a.project_id
        AND s.profiles_enabled AND s.priority_enabled
      WHERE a.project_id=target_project_id AND a.job_id=target_job_id
        AND a.phase='preferred' AND a.priority_until>now()
    ) THEN EXISTS (
      SELECT 1 FROM app_private.marketplace_driver_promo_attribution a
      WHERE a.project_id=target_project_id AND a.job_id=target_job_id
        AND a.driver_user_id=target_driver_user_id AND a.phase='preferred'
        AND a.priority_until>now()
        AND app_private.marketplace_promo_preferred_eligible(a.job_id,a.driver_user_id,a.source_code)
    ) ELSE b.allowed END,
    b.distance_km,b.radius_stage,b.radius_limit_km,b.rating_average,b.rating_count,b.rating_preferred,b.eligible_from,b.rating_score,b.tie_breaker
  FROM app_private.marketplace_promo_base_candidate_state(target_project_id,target_driver_user_id,target_vehicle_id,target_job_id) b
$function$;
