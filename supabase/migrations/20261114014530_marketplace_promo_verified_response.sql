CREATE OR REPLACE FUNCTION public.resolve_marketplace_promo_profile_v1(target_code text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 SELECT jsonb_build_object('public_name',p.public_name,'category_code',p.category_code,'service_codes',p.service_codes,'photo_asset_id',p.photo_asset_id,'verified',app_private.marketplace_driver_identity_verified_v1(p.project_id,p.driver_user_id)) FROM app_private.resolve_marketplace_promo_profile(target_code) p
$function$;
