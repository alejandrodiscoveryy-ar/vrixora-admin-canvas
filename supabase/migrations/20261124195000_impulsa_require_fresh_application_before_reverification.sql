-- Tras suspensión Impulsa, una reinscripción nueva es obligatoria antes de recuperar la verificación.
CREATE OR REPLACE FUNCTION public.admin_set_marketplace_driver_identity_review_v1(target_project_id uuid, target_driver_user_id uuid, target_verified boolean, target_reason text, target_front_asset_id uuid DEFAULT NULL::uuid, target_back_asset_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.driver_profiles%rowtype; legal_name text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if target_verified is null or char_length(btrim(coalesce(target_reason,''))) not between 5 and 300 then
    raise exception 'INVALID_REVIEW' using errcode='22023';
  end if;
  select * into d from public.driver_profiles where project_id=target_project_id and user_id=target_driver_user_id for update;
  if not found then raise exception 'DRIVER_NOT_FOUND' using errcode='P0002'; end if;
  if target_verified then
    -- Un conductor suspendido de Impulsa no puede recuperar su insignia
    -- con la revisión anterior; necesita nueva solicitud y consentimiento.
    if exists (
      select 1 from app_private.marketplace_driver_promo_profiles promo
      where promo.project_id=target_project_id
        and promo.driver_user_id=target_driver_user_id
        and promo.revoked_at is not null
    ) and not exists (
      select 1 from app_private.marketplace_impulsa_applications a
      join app_private.marketplace_driver_promo_profiles promo
        on promo.project_id=a.project_id and promo.driver_user_id=a.driver_user_id
      where a.project_id=target_project_id
        and a.driver_user_id=target_driver_user_id
        and a.status='pending'
        and a.consent_accepted_at > promo.revoked_at
        and a.consent_public_profile is true
        and a.consent_photo is true
    ) then
      raise exception 'IMPULSA_NEW_APPLICATION_REQUIRED' using errcode='22023';
    end if;
    select display_name into legal_name from public.profiles where id=target_driver_user_id;
    if d.status='suspended' or d.suspended_at is not null
      or nullif(btrim(legal_name),'') is null
      or d.identity_document_type is null
      or d.identity_document_type not in ('national_id','driver_license')
      or d.identity_front_asset_id is null or d.identity_back_asset_id is null
      or target_front_asset_id is distinct from d.identity_front_asset_id
      or target_back_asset_id is distinct from d.identity_back_asset_id
      or not exists(select 1 from public.media_assets m where m.project_id=d.project_id
        and m.id=d.identity_front_asset_id and m.owner_user_id=d.user_id
        and m.asset_kind='identity_front' and m.storage_bucket='marketplace-identity' and m.status='available')
      or not exists(select 1 from public.media_assets m where m.project_id=d.project_id
        and m.id=d.identity_back_asset_id and m.owner_user_id=d.user_id
        and m.asset_kind='identity_back' and m.storage_bucket='marketplace-identity' and m.status='available')
    then raise exception 'IDENTITY_DOCUMENTS_NOT_REVIEWABLE' using errcode='22023'; end if;
    insert into app_private.marketplace_driver_identity_reviews(
      project_id,driver_user_id,verified_at,verified_by,identity_front_asset_id,
      identity_back_asset_id,identity_document_type,display_name,revoked_at)
      values(d.project_id,d.user_id,now(),auth.uid(),d.identity_front_asset_id,
        d.identity_back_asset_id,d.identity_document_type,legal_name,null)
    on conflict(project_id,driver_user_id) do update set verified_at=excluded.verified_at,
      verified_by=excluded.verified_by,identity_front_asset_id=excluded.identity_front_asset_id,
      identity_back_asset_id=excluded.identity_back_asset_id,
      identity_document_type=excluded.identity_document_type,display_name=excluded.display_name,revoked_at=null;
  else
    update app_private.marketplace_driver_identity_reviews set revoked_at=coalesce(revoked_at,now())
      where project_id=d.project_id and driver_user_id=d.user_id;
    update app_private.marketplace_driver_promo_profiles set revoked_at=coalesce(revoked_at,now())
      where project_id=d.project_id and driver_user_id=d.user_id;
    update app_private.marketplace_driver_promo_attribution set phase='fleet',released_at=now(),release_reason='revoked'
      where project_id=d.project_id and driver_user_id=d.user_id and phase='preferred';
  end if;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    values(d.project_id,auth.uid(),case when target_verified then 'admin_verify_driver_identity' else 'admin_revoke_driver_identity' end,
      'driver_profile',d.user_id::text,jsonb_build_object('reason',btrim(target_reason)));
  return jsonb_build_object('verified',app_private.marketplace_driver_identity_verified_v1(d.project_id,d.user_id));
end $function$

