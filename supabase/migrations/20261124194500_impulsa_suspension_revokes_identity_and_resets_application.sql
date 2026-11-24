-- La suspensión administrativa de Impulsa revoca también la verificación de identidad.
-- La solicitud anterior se conserva para auditoría, pero pasa a 'withdrawn':
-- no puede reutilizarse para autorizar la reactivación.
create or replace function public.admin_deactivate_marketplace_promo_card_v1(
  target_project_id uuid, target_driver_user_id uuid, target_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  p app_private.marketplace_driver_promo_profiles%rowtype;
  reason text := btrim(coalesce(target_reason,''));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if char_length(reason) not between 5 and 300 then raise exception 'INVALID_REASON' using errcode='22023'; end if;
  select * into p from app_private.marketplace_driver_promo_profiles
    where project_id=target_project_id and driver_user_id=target_driver_user_id for update;
  if not found then return jsonb_build_object('enabled',false,'verified',false); end if;

  perform public.admin_set_marketplace_driver_identity_review_v1(
    target_project_id,target_driver_user_id,false,reason,null,null);

  update app_private.marketplace_impulsa_applications
    set status='withdrawn',reviewed_at=null,reviewed_by=null,review_reason=reason
    where project_id=target_project_id and driver_user_id=target_driver_user_id
      and status in ('approved','pending');

  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    values(target_project_id,auth.uid(),'admin_deactivate_driver_promo','driver_profile',
      target_driver_user_id::text,
      jsonb_build_object('reason',reason,'identity_revoked',true,'new_application_required',true));

  return jsonb_build_object('enabled',false,'verified',false,'new_application_required',true);
end $fn$;

revoke all on function public.admin_deactivate_marketplace_promo_card_v1(uuid,uuid,text) from public,anon;
grant execute on function public.admin_deactivate_marketplace_promo_card_v1(uuid,uuid,text) to authenticated;
