-- Impulsa: reutilizar consentimiento expreso del conductor ya registrado en su
-- solicitud y la verificación documental existente. Sin acta/folio adicional.
-- Mantener endpoints antiguos compatibles, pero nunca admitir activación
-- basada únicamente en lo que declara un administrador.

create or replace function app_private.marketplace_impulsa_current_consent_v1(
  target_project_id uuid, target_driver_user_id uuid
) returns boolean
language sql stable security invoker
set search_path to ''
as $$
  select exists (
    select 1
    from app_private.marketplace_impulsa_applications a
    join public.driver_profiles d
      on d.project_id=a.project_id and d.user_id=a.driver_user_id
    join public.profiles u on u.id=d.user_id
    left join app_private.marketplace_driver_promo_profiles promo
      on promo.project_id=a.project_id and promo.driver_user_id=a.driver_user_id
    where a.project_id=target_project_id
      and a.driver_user_id=target_driver_user_id
      and a.status in ('pending','approved')
      and a.consent_version='impulsa-self-service-v1'
      and a.consent_public_profile is true
      and a.consent_photo is true
      and a.consent_accepted_at is not null
      and a.submitted_display_name = btrim(u.display_name)
      and a.submitted_photo_asset_id is not null
      and a.submitted_photo_asset_id = d.photo_asset_id
      and a.identity_front_asset_id = d.identity_front_asset_id
      and a.identity_back_asset_id = d.identity_back_asset_id
      and a.identity_document_type is not distinct from d.identity_document_type
      -- Nunca reactivar un perfil revocado usando consentimiento anterior.
      and (promo.revoked_at is null or a.consent_accepted_at > promo.revoked_at)
  )
$$;
revoke all on function app_private.marketplace_impulsa_current_consent_v1(uuid,uuid)
  from public,anon,authenticated;

-- Consulta sin efectos secundarios; no llamar a la función de activación
-- para comprobar si ya hay un enlace, porque eso podría crear uno.
create or replace function public.admin_get_marketplace_promo_card_state_v2(
  target_project_id uuid, target_driver_user_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path to ''
as $function$
declare
  p app_private.marketplace_driver_promo_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if not exists (
    select 1 from public.projects
    where id=target_project_id and slug='tuktuk-control'
  ) then raise exception 'PROMO_PROJECT_INVALID' using errcode='22023'; end if;

  select * into p
  from app_private.marketplace_driver_promo_profiles
  where project_id=target_project_id and driver_user_id=target_driver_user_id;

  return jsonb_build_object(
    'enabled',coalesce(p.code is not null and p.revoked_at is null,false),
    'code',case when p.revoked_at is null then p.code else null end,
    'consent_ready',app_private.marketplace_impulsa_current_consent_v1(
       target_project_id,target_driver_user_id
    )
  );
end;
$function$;
revoke all on function public.admin_get_marketplace_promo_card_state_v2(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.admin_get_marketplace_promo_card_state_v2(uuid,uuid)
  to authenticated;

-- Única activación administrativa. La solicitud fue aceptada por el propio
-- conductor (perfil y foto actuales); la identidad fue revisada por Admin.
create or replace function public.admin_activate_marketplace_promo_card_v2(
  target_project_id uuid, target_driver_user_id uuid
) returns jsonb
language plpgsql security definer
set search_path to ''
as $function$
declare
  d public.driver_profiles%rowtype;
  p app_private.marketplace_driver_promo_profiles%rowtype;
  a app_private.marketplace_impulsa_applications%rowtype;
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
  select * into a from app_private.marketplace_impulsa_applications
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
  ) values(d.project_id,d.user_id,legal_name,photo,'mi-tuktuk-v1',a.consent_accepted_at)
  on conflict(project_id,driver_user_id) do update set
    code=replace(gen_random_uuid()::text,'-',''),
    public_name=excluded.public_name,
    consent_photo_asset_id=excluded.consent_photo_asset_id,
    consent_version=excluded.consent_version,
    consented_at=a.consent_accepted_at,
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
      'consent_source',a.consent_version,
      'consent_accepted_at',a.consent_accepted_at,
      'photo_authorized',true,
      'identity_verified',true
    )
  );

  return jsonb_build_object('enabled',true,'code',p.code);
end;
$function$;
revoke all on function public.admin_activate_marketplace_promo_card_v2(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.admin_activate_marketplace_promo_card_v2(uuid,uuid)
  to authenticated;

-- Compatibilidad con la función antigua: sus campos de acta/folio se ignoran.
-- Nunca se podrán usar para omitir el consentimiento del conductor.
create or replace function public.admin_activate_marketplace_promo_card_v1(
  target_project_id uuid, target_driver_user_id uuid,
  target_authorization_confirmed boolean,
  target_authorization_reference text
) returns jsonb
language plpgsql security definer
set search_path to ''
as $function$
declare p app_private.marketplace_driver_promo_profiles%rowtype;
begin
  -- El frontend antiguo consulta el perfil pasando false y sin referencia:
  -- debe continuar siendo una lectura sin efectos secundarios.
  if target_authorization_confirmed is distinct from true then
    if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
    perform app_private.require_project_permission(target_project_id,'marketplace.manage');
    select * into p from app_private.marketplace_driver_promo_profiles
      where project_id=target_project_id and driver_user_id=target_driver_user_id;
    if p.code is not null and p.revoked_at is null then
      return jsonb_build_object('enabled',true,'code',p.code);
    end if;
    raise exception 'IMPULSA_CONSENT_REQUIRED' using errcode='22023';
  end if;
  return public.admin_activate_marketplace_promo_card_v2(
    target_project_id,target_driver_user_id
  );
end;
$function$;
revoke all on function public.admin_activate_marketplace_promo_card_v1(
  uuid,uuid,boolean,text
) from public,anon,authenticated;
grant execute on function public.admin_activate_marketplace_promo_card_v1(
  uuid,uuid,boolean,text
) to authenticated;
