-- Candidate for isolated database validation, not automatically applied.
-- Review against deployed schema; preserve existing promo and dispatch contracts.
begin;

create table if not exists app_private.marketplace_driver_identity_reviews (
  project_id uuid not null,
  driver_user_id uuid not null,
  verified_at timestamptz not null default now(),
  verified_by uuid not null,
  identity_front_asset_id uuid not null,
  identity_back_asset_id uuid not null,
  identity_document_type text not null,
  display_name text not null,
  revoked_at timestamptz,
  primary key (project_id, driver_user_id),
  foreign key (project_id, driver_user_id)
    references public.driver_profiles(project_id,user_id)
);
alter table app_private.marketplace_driver_identity_reviews enable row level security;
revoke all on app_private.marketplace_driver_identity_reviews from public, anon, authenticated;

-- Current, explicitly reviewed documents and legal name must still match.
-- Active registration alone is NOT verification. No private fields are public.
create or replace function app_private.marketplace_driver_identity_verified_v1(pid uuid, uid uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(
    select 1 from app_private.marketplace_driver_identity_reviews r
    join public.driver_profiles d on d.project_id=r.project_id and d.user_id=r.driver_user_id
    join public.profiles p on p.id=d.user_id
    join public.media_assets f on f.project_id=d.project_id and f.id=d.identity_front_asset_id
      and f.owner_user_id=d.user_id and f.asset_kind='identity_front'
      and f.storage_bucket='marketplace-identity' and f.status='available'
    join public.media_assets b on b.project_id=d.project_id and b.id=d.identity_back_asset_id
      and b.owner_user_id=d.user_id and b.asset_kind='identity_back'
      and b.storage_bucket='marketplace-identity' and b.status='available'
    where r.project_id=pid and r.driver_user_id=uid and r.revoked_at is null
      and d.status<>'suspended' and d.suspended_at is null
      and r.identity_front_asset_id=d.identity_front_asset_id
      and r.identity_back_asset_id=d.identity_back_asset_id
      and r.identity_document_type=d.identity_document_type
      and r.display_name=p.display_name
  )
$$;
revoke all on function app_private.marketplace_driver_identity_verified_v1(uuid,uuid) from public,anon,authenticated;

create or replace function public.admin_get_marketplace_driver_identity_review_v1(
  target_project_id uuid,target_driver_user_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r app_private.marketplace_driver_identity_reviews%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  select * into r from app_private.marketplace_driver_identity_reviews
    where project_id=target_project_id and driver_user_id=target_driver_user_id;
  return jsonb_build_object('verified',app_private.marketplace_driver_identity_verified_v1(target_project_id,target_driver_user_id),
    'verified_at',r.verified_at,'promo_active',exists(select 1 from app_private.marketplace_driver_promo_profiles p where p.project_id=target_project_id and p.driver_user_id=target_driver_user_id and p.revoked_at is null));
end $$;
revoke all on function public.admin_get_marketplace_driver_identity_review_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_get_marketplace_driver_identity_review_v1(uuid,uuid) to authenticated;

create or replace function public.admin_set_marketplace_driver_identity_review_v1(
  target_project_id uuid,target_driver_user_id uuid,target_verified boolean,
  target_reason text,target_front_asset_id uuid default null,target_back_asset_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
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
  end if;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    values(d.project_id,auth.uid(),case when target_verified then 'admin_verify_driver_identity' else 'admin_revoke_driver_identity' end,
      'driver_profile',d.user_id::text,jsonb_build_object('reason',btrim(target_reason)));
  return jsonb_build_object('verified',app_private.marketplace_driver_identity_verified_v1(d.project_id,d.user_id));
end $$;
revoke all on function public.admin_set_marketplace_driver_identity_review_v1(uuid,uuid,boolean,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_set_marketplace_driver_identity_review_v1(uuid,uuid,boolean,text,uuid,uuid) to authenticated;

-- Only an authorized administrator can activate a new promotional profile.
-- The administrator attests that the driver's actual publication authorization
-- has been documented. No administrative approval is silently treated as consent.
create or replace function public.admin_activate_marketplace_promo_card_v1(
  target_project_id uuid,target_driver_user_id uuid,target_authorization_confirmed boolean,
  target_authorization_reference text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.driver_profiles%rowtype; p app_private.marketplace_driver_promo_profiles%rowtype;
  legal_name text; photo uuid; reference text:=btrim(coalesce(target_authorization_reference,''));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if not exists(select 1 from public.projects where id=target_project_id and slug='tuktuk-control') then
    raise exception 'PROMO_PROJECT_INVALID' using errcode='22023'; end if;
  select * into d from public.driver_profiles where project_id=target_project_id and user_id=target_driver_user_id for update;
  if not found then raise exception 'DRIVER_NOT_FOUND' using errcode='P0002'; end if;
  if not app_private.marketplace_driver_identity_verified_v1(d.project_id,d.user_id) then
    raise exception 'IDENTITY_NOT_VERIFIED' using errcode='22023'; end if;
  if d.status<>'active' or d.suspended_at is not null or d.activated_at is null
    or not exists(select 1 from app_private.marketplace_driver_promo_settings s where s.project_id=d.project_id and s.profiles_enabled)
    or not exists(select 1 from public.driver_vehicle_assignments a
      join public.vehicles v on v.project_id=a.project_id and v.id=a.vehicle_id
      join public.vehicle_services vs on vs.project_id=v.project_id and vs.vehicle_id=v.id and vs.enabled
      join public.list_marketplace_published_modalities('tuktuk-control') pub on pub.service_code=vs.service_code and pub.vehicle_category_code=v.category_code
      where a.project_id=d.project_id and a.driver_user_id=d.user_id and a.is_active
        and v.marketplace_status='active' and v.deleted_at is null)
  then raise exception 'PROMO_SERVICE_NOT_ACTIVE' using errcode='22023'; end if;
  select * into p from app_private.marketplace_driver_promo_profiles where project_id=d.project_id and driver_user_id=d.user_id;
  if p.code is not null and p.revoked_at is null then
    return jsonb_build_object('enabled',true,'code',p.code);
  end if;
  if target_authorization_confirmed is distinct from true or char_length(reference) not between 5 and 300 then
    raise exception 'DOCUMENTED_AUTHORIZATION_REQUIRED' using errcode='22023'; end if;
  select left(btrim(display_name),80) into legal_name from public.profiles where id=d.user_id;
  if nullif(legal_name,'') is null then raise exception 'PUBLIC_NAME_INVALID' using errcode='22023'; end if;
  select m.id into photo from public.media_assets m where m.project_id=d.project_id and m.id=d.photo_asset_id
    and m.owner_user_id=d.user_id and m.asset_kind='driver_photo' and m.storage_bucket='marketplace-media' and m.status='available';
  insert into app_private.marketplace_driver_promo_profiles(project_id,driver_user_id,public_name,consent_photo_asset_id,consent_version)
    values(d.project_id,d.user_id,legal_name,photo,'mi-tuktuk-v1')
  on conflict(project_id,driver_user_id) do update set
    code=replace(gen_random_uuid()::text,'-',''),public_name=excluded.public_name,
    consent_photo_asset_id=excluded.consent_photo_asset_id,consented_at=now(),revoked_at=null
  returning * into p;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    values(d.project_id,auth.uid(),'admin_activate_driver_promo','driver_profile',d.user_id::text,
      jsonb_build_object('authorization_reference',reference,'photo_authorized',photo is not null));
  return jsonb_build_object('enabled',true,'code',p.code);
end $$;
revoke all on function public.admin_activate_marketplace_promo_card_v1(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.admin_activate_marketplace_promo_card_v1(uuid,uuid,boolean,text) to authenticated;

-- Read the existing, already activated profile. No draft or publish-on-share.
-- Previously authorized profiles remain valid; only new activation requires
-- the administrative workflow. The public resolution contract stays intact.
create or replace function public.prepare_my_marketplace_promo_card_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; d public.driver_profiles%rowtype;
  p app_private.marketplace_driver_promo_profiles%rowtype;
  v public.vehicles%rowtype; services text[]; card_photo uuid; card_photo_path text;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  select * into d from public.driver_profiles where project_id=pid and user_id=actor;
  if not found or d.status<>'active' or d.suspended_at is not null or d.activated_at is null
    or not exists(select 1 from app_private.marketplace_driver_promo_settings s where s.project_id=pid and s.profiles_enabled)
    then return jsonb_build_object('enabled',false); end if;
  select * into p from app_private.marketplace_driver_promo_profiles where project_id=pid and driver_user_id=actor;
  if not found or p.revoked_at is not null then return jsonb_build_object('enabled',false); end if;
  select vv.* into v from public.driver_vehicle_assignments a
    join public.vehicles vv on vv.project_id=a.project_id and vv.id=a.vehicle_id
    where a.project_id=pid and a.driver_user_id=actor and a.is_active
      and vv.deleted_at is null and vv.marketplace_status='active'
    order by vv.id limit 1;
  if not found then return jsonb_build_object('enabled',false); end if;
  select array_agg(distinct vs.service_code order by vs.service_code) into services
    from public.vehicle_services vs
    join public.list_marketplace_published_modalities('tuktuk-control') pub
      on pub.service_code=vs.service_code and pub.vehicle_category_code=v.category_code
    where vs.project_id=pid and vs.vehicle_id=v.id and vs.enabled;
  if coalesce(cardinality(services),0)=0 then return jsonb_build_object('enabled',false); end if;
  if p.consent_photo_asset_id=d.photo_asset_id then
    select m.id,m.storage_path into card_photo,card_photo_path from public.media_assets m
      where m.project_id=pid and m.id=d.photo_asset_id and m.owner_user_id=actor
        and m.asset_kind='driver_photo' and m.storage_bucket='marketplace-media' and m.status='available';
  end if;
  if card_photo_path is null then card_photo:=null; end if;
  return jsonb_build_object('enabled',true,'published',true,'can_publish',true,
    'code',p.code,'public_name',p.public_name,'category_code',v.category_code,'service_codes',services,
    'photo_asset_id',card_photo,'photo_path',card_photo_path,'photo_authorized',card_photo is not null,
    'identity_verified',app_private.marketplace_driver_identity_verified_v1(pid,actor));
end $$;
revoke all on function public.prepare_my_marketplace_promo_card_v1() from public,anon,authenticated;
grant execute on function public.prepare_my_marketplace_promo_card_v1() to authenticated;

-- Prevent old clients from bypassing administrative approval. Existing
-- nonrevoked profiles keep their code; revocation is always allowed.
create or replace function public.set_my_marketplace_promo_profile(target_public_name text,target_consent boolean,target_share_photo boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; d public.driver_profiles%rowtype; p app_private.marketplace_driver_promo_profiles%rowtype;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  select * into d from public.driver_profiles where project_id=pid and user_id=actor for update;
  if not found then raise exception 'DRIVER_PROFILE_NOT_FOUND' using errcode='42501'; end if;
  if target_consent is false then
    update app_private.marketplace_driver_promo_profiles set revoked_at=coalesce(revoked_at,now()) where project_id=pid and driver_user_id=actor;
    update app_private.marketplace_driver_promo_attribution set phase='fleet',released_at=now(),release_reason='revoked'
      where project_id=pid and driver_user_id=actor and phase='preferred';
    return jsonb_build_object('enabled',false);
  end if;
  select * into p from app_private.marketplace_driver_promo_profiles where project_id=pid and driver_user_id=actor;
  if not found or p.revoked_at is not null or target_consent is distinct from true or d.status<>'active'
    or d.suspended_at is not null or d.activated_at is null
    or not exists(select 1 from app_private.marketplace_driver_promo_settings s where s.project_id=pid and s.profiles_enabled)
    then raise exception 'ADMIN_PROMO_APPROVAL_REQUIRED' using errcode='42501'; end if;
  -- Older clients may load the already approved profile, but cannot replace its
  -- administratively reviewed public identity or authorize a different photo.
  return jsonb_build_object('enabled',true,'code',p.code,'public_name',p.public_name,
    'photo_authorized',p.consent_photo_asset_id is not null and p.consent_photo_asset_id=d.photo_asset_id);
end $$;

create or replace function public.revoke_my_marketplace_promo_card_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  return public.set_my_marketplace_promo_profile(null,false,false);
end $$;
revoke all on function public.revoke_my_marketplace_promo_card_v1() from public,anon,authenticated;
grant execute on function public.revoke_my_marketplace_promo_card_v1() to authenticated;
commit;
