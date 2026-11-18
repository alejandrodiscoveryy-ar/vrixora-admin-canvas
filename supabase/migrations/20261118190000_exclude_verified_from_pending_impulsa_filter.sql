-- Solicitudes de verificación Impulsa: un conductor ya verificado no vuelve
-- a aparecer como pendiente por una solicitud histórica sin cerrar.
-- Sin borrar, modificar ni aprobar solicitudes anteriores.
create or replace function public.admin_list_marketplace_pending_impulsa_verifications_v1(
  target_project_id uuid,
  target_driver_user_ids uuid[]
) returns table(driver_user_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if coalesce(array_length(target_driver_user_ids,1),0) > 200 then
    raise exception 'TOO_MANY_DRIVERS' using errcode='22023';
  end if;
  return query
    select a.driver_user_id
    from app_private.marketplace_impulsa_applications a
    where a.project_id=target_project_id
      and a.status='pending'
      and a.driver_user_id=any(coalesce(target_driver_user_ids,array[]::uuid[]))
      and app_private.marketplace_driver_identity_verified_v1(a.project_id,a.driver_user_id) = false;
end $$;

revoke all on function public.admin_list_marketplace_pending_impulsa_verifications_v1(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.admin_list_marketplace_pending_impulsa_verifications_v1(uuid,uuid[]) to authenticated;
