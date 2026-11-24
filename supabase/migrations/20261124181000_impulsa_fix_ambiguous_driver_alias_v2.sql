-- Fix para SQLSTATE 42702 observado en PostgREST el 24-11-2026.
-- La variable PL/pgSQL "a" colisionaba con el alias "a" de
-- public.driver_vehicle_assignments dentro del EXISTS operativo.
-- Solo se renombra la variable local que guarda el consentimiento,
-- conservando todas las comprobaciones de identidad, foto y permisos.

create or replace function public.admin_activate_marketplace_promo_card_v2(
  target_project_id uuid, target_driver_user_id uuid
) returns jsonb
language plpgsql security definer
set search_path to ''
as $function$
declare
  d public.driver_profiles%rowtype;
  p app_private.marketplace_driver_promo_profiles%rowtype;
  v_consent app_private.marketplace_impulsa_applications%rowtype;
  legal_name text;
  photo uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if not exists (
    select 1 from public.projects
    where id=target_project_id and slug='tuktuk-control'
  ) then raise exception 'PROMO_PROJECT_INVALID' using errcode='22023'; end if;

  -- Misma secuencia de locks que el flujo de aprobación Impulsa:
  -- solicitud -> perfil conductor -> perfil promocional.
  select * into v_consent from app_private.marketplace_impulsa_applications
    where project_id=target_project_id and driver_user_id=target_driver_user_id
    for update;
  select * into d from public.driver_profiles
    where project_id=target_project_id and user_id=target_driver_user_id
    for update;
  if not found then raise exception 'DRIVER_NOT_FOUND' using errcode='P0002'; end if;

  if not app_private.marketplace_driver_identity_verified_v1(
    d.project_id,d.user_id
  ) then
    raise exception 'IDENTITY_NOT_VERIFIED' using errcode='22023';
  end if;

  if d.status<>'active' or d.suspended_at is not null or d.activated_at is null
    or not exists (
      select 1 from app_private.marketplace_driver_promo_settings s
      where s.project_id=d.project_id and s.profiles_enabled
    )
    or not exists (
      select 1 from public.driver_vehicle_assignments a
      join public.vehicles v
        on v.project_id=a.project_id and v.id=a.vehicle_id
      join public.vehicle_services vs
        on vs.project_id=v.project_id and vs.vehicle_id=v.id and vs.enabled
      join public.list_marketplace_published_modalities('tuktuk-control') pub
        on pub.service_code=vs.service_code
        and pub.vehicle_category_code=v.category_code
      where a.project_id=d.project_id and a.driver_user_id=d.user_id
        and a.is_active and v.marketplace_status='active'
        and v.deleted_at is null
    )
  then raise exception 'PROMO_SERVICE_NOT_ACTIVE' using errcode='22023'; end if;

  select * into p from app_private.marketplace_driver_promo_profiles
    where project_id=d.project_id and driver_user_id=d.user_id
    for update;
  if p.code is not null and p.revoked_at is null then
    return jsonb_build_object('enabled',true,'code',p.code);
  end if;

  if not app_private.marketplace_impulsa_current_consent_v1(
    d.project_id,d.user_id
  ) then
    raise exception 'IMPULSA_CONSENT_REQUIRED' using errcode='22023';
  end if;

  select left(btrim(display_name),80) into legal_name
    from public.profiles where id=d.user_id;
  if nullif(legal_name,'') is null then
    raise exception 'PUBLIC_NAME_INVALID' using errcode='22023';
  end if;

  select m.id into photo from public.media_assets m
    where m.project_id=d.project_id and m.id=d.photo_asset_id
      and m.owner_user_id=d.user_id and m.asset_kind='driver_photo'
      and m.storage_bucket='marketplace-media' and m.status='available';
  if photo is null then
    raise exception 'PROMO_PHOTO_NOT_AVAILABLE' using errcode='22023';
  end if;

  insert into app_private.marketplace_driver_promo_profiles(
    project_id,driver_user_id,public_name,consent_photo_asset_id,consent_version,consented_at
  ) values(d.project_id,d.user_id,legal_name,photo,'mi-tuktuk-v1',v_consent.consent_accepted_at)
  on conflict(project_id,driver_user_id) do update set
    code=replace(gen_random_uuid()::text,'-',''),
    public_name=excluded.public_name,
    consent_photo_asset_id=excluded.consent_photo_asset_id,
    consent_version=excluded.consent_version,
    consented_at=v_consent.consent_accepted_at,
    revoked_at=null
  returning * into p;

  -- La aprobación desde la ficha 360 debe cerrar también el trámite
  -- pendiente de Impulsa, sin exigir al conductor otro consentimiento.
  update app_private.marketplace_impulsa_applications
    set status='approved',reviewed_at=coalesce(reviewed_at,now()),
      reviewed_by=coalesce(reviewed_by,auth.uid()),
      review_reason=coalesce(review_reason,'Perfil activado con consentimiento existente')
    where project_id=d.project_id and driver_user_id=d.user_id
      and status='pending';

  insert into public.audit_events(
    project_id,actor_id,action,entity_type,entity_id,metadata
  ) values (
    d.project_id,auth.uid(),'admin_activate_driver_promo',
    'driver_profile',d.user_id::text,
    jsonb_build_object(
      'consent_source',v_consent.consent_version,
      'consent_accepted_at',v_consent.consent_accepted_at,
      'photo_authorized',true,
      'identity_verified',true
    )
  );

  return jsonb_build_object('enabled',true,'code',p.code);
end;
$function$;
