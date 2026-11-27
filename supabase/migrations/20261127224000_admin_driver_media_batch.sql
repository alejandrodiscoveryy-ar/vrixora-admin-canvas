-- Lightweight permission-checked media lookup; no writes to operational data.
CREATE OR REPLACE FUNCTION public.admin_get_marketplace_driver_media_batch_v1(target_project_id uuid, target_driver_user_ids uuid[], include_vehicles boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  PERFORM app_private.require_project_permission(target_project_id, 'marketplace.view');
  IF target_driver_user_ids IS NULL OR cardinality(target_driver_user_ids) > 25 OR array_position(target_driver_user_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'DRIVER_MEDIA_REQUEST_INVALID' USING ERRCODE='22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'driver_user_id', d.user_id,
      'driver', jsonb_build_object('photo_asset_id', d.photo_asset_id),
      'account', jsonb_build_object('avatar_url', p.avatar_url),
      'vehicles', CASE WHEN include_vehicles THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', v.id, 'main_photo_asset_id', v.main_photo_asset_id) ORDER BY a.created_at, v.id)
        FROM public.driver_vehicle_assignments a
        JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id
        WHERE a.project_id=d.project_id AND a.driver_user_id=d.user_id
      ), '[]'::jsonb) ELSE '[]'::jsonb END
    ) ORDER BY d.user_id)
    FROM public.driver_profiles d
    LEFT JOIN public.profiles p ON p.id=d.user_id
    WHERE d.project_id=target_project_id AND d.user_id=ANY(target_driver_user_ids)
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_get_marketplace_driver_media_batch_v1(uuid,uuid[],boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_marketplace_driver_media_batch_v1(uuid,uuid[],boolean) TO authenticated;
