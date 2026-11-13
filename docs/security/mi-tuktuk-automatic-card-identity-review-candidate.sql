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

create table if not exists app_private.marketplace_driver_promo_drafts (
  project_id uuid not null,
  driver_user_id uuid not null,
  code text not null default replace(gen_random_uuid()::text,'-','')
    check (code ~ '^[0-9a-f]{32}$'),
  primary key(project_id,driver_user_id),
  unique(code),
  foreign key (project_id,driver_user_id)
    references public.driver_profiles(project_id,user_id)
);
alter table app_private.marketplace_driver_promo_drafts enable row level security;
revoke all on app_private.marketplace_driver_promo_drafts from public, anon, authenticated;

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
    'verified_at',r.verified_at);
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

-- Private card preparation does not publish anything or assert consent.
-- Only registered drivers in the project, with a real assigned vehicle and
-- published service, obtain a draft; existing public profiles keep their code.
create or replace function public.prepare_my_marketplace_promo_card_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; d public.driver_profiles%rowtype;
  p app_private.marketplace_driver_promo_profiles%rowtype;
  draft app_private.marketplace_driver_promo_drafts%rowtype;
  v public.vehicles%rowtype; services text[]; card_name text; card_code text;
  card_photo uuid; card_photo_path text; is_published boolean:=false; can_publish boolean:=false;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  select * into d from public.driver_profiles where project_id=pid and user_id=actor for update;
  if not found or d.status='suspended' or d.suspended_at is not null then
    return jsonb_build_object('enabled',false);
  end if;
  select vv.* into v from public.driver_vehicle_assignments a
    join public.vehicles vv on vv.project_id=a.project_id and vv.id=a.vehicle_id
    where a.project_id=pid and a.driver_user_id=actor and a.is_active
      and vv.deleted_at is null and vv.marketplace_status in ('active','onboarding')
    order by vv.id limit 1;
  if not found or (d.status<>'active' and not coalesce(app_private.marketplace_onboarding_requirements_complete(actor,v.id),false)) then
    return jsonb_build_object('enabled',false);
  end if;
  select array_agg(distinct vs.service_code order by vs.service_code) into services
    from public.vehicle_services vs
    join public.list_marketplace_published_modalities('tuktuk-control') pub
      on pub.service_code=vs.service_code and pub.vehicle_category_code=v.category_code
    where vs.project_id=pid and vs.vehicle_id=v.id and vs.enabled;
  if coalesce(cardinality(services),0)=0 then return jsonb_build_object('enabled',false); end if;
  can_publish:=d.status='active' and d.activated_at is not null and v.marketplace_status='active'
    and exists(select 1 from app_private.marketplace_driver_promo_settings s where s.project_id=pid and s.profiles_enabled);
  select * into p from app_private.marketplace_driver_promo_profiles where project_id=pid and driver_user_id=actor;
  is_published:=can_publish and p.code is not null and p.revoked_at is null;
  if p.code is not null and p.revoked_at is null then
    card_code:=p.code; card_name:=p.public_name;
    if p.consent_photo_asset_id=d.photo_asset_id then card_photo:=d.photo_asset_id; end if;
  else
    select left(btrim(display_name),80) into card_name from public.profiles where id=actor;
    if nullif(card_name,'') is null then return jsonb_build_object('enabled',false); end if;
    insert into app_private.marketplace_driver_promo_drafts(project_id,driver_user_id)
      values(pid,actor) on conflict(project_id,driver_user_id) do nothing;
    select * into draft from app_private.marketplace_driver_promo_drafts where project_id=pid and driver_user_id=actor;
    -- Old revoked public QR must remain invalid. Reserve a different draft code.
    if p.revoked_at is not null and draft.code=p.code then
      update app_private.marketplace_driver_promo_drafts set code=replace(gen_random_uuid()::text,'-','')
        where project_id=pid and driver_user_id=actor returning * into draft;
    end if;
    card_code:=draft.code; card_photo:=d.photo_asset_id;
  end if;
  select m.storage_path into card_photo_path from public.media_assets m
    where m.project_id=pid and m.id=card_photo and m.owner_user_id=actor
      and m.asset_kind='driver_photo' and m.storage_bucket='marketplace-media' and m.status='available';
  if card_photo_path is null then card_photo:=null; end if;
  return jsonb_build_object('enabled',true,'published',is_published,'can_publish',can_publish,
    'code',card_code,'public_name',card_name,'category_code',v.category_code,'service_codes',services,
    'photo_asset_id',card_photo,'photo_path',card_photo_path,'photo_authorized',card_photo is not null,
    'identity_verified',app_private.marketplace_driver_identity_verified_v1(pid,actor));
end $$;
revoke all on function public.prepare_my_marketplace_promo_card_v1() from public,anon,authenticated;
grant execute on function public.prepare_my_marketplace_promo_card_v1() to authenticated;

-- The first deliberate share/download/copy action publishes the already
-- prepared QR. Validate the exact reviewed name/photo/code before publication.
create or replace function public.publish_my_marketplace_promo_card_v1(
  target_code text,target_public_name text,target_photo_asset_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; prepared jsonb;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  prepared:=public.prepare_my_marketplace_promo_card_v1();
  if prepared->>'can_publish' is distinct from 'true'
    or prepared->>'code' is distinct from target_code
    or prepared->>'public_name' is distinct from target_public_name
    or nullif(prepared->>'photo_asset_id','')::uuid is distinct from target_photo_asset_id
  then raise exception 'PROMO_CARD_CHANGED_OR_UNAVAILABLE' using errcode='22023'; end if;
  if prepared->>'published'='true' then return prepared; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  insert into app_private.marketplace_driver_promo_profiles(
    project_id,driver_user_id,code,public_name,consent_photo_asset_id,consent_version)
    values(pid,actor,target_code,target_public_name,target_photo_asset_id,'mi-tuktuk-v1')
  on conflict(project_id,driver_user_id) do update set code=excluded.code,public_name=excluded.public_name,
    consent_photo_asset_id=excluded.consent_photo_asset_id,consented_at=now(),revoked_at=null;
  return public.prepare_my_marketplace_promo_card_v1();
end $$;
revoke all on function public.publish_my_marketplace_promo_card_v1(text,text,uuid) from public,anon,authenticated;
grant execute on function public.publish_my_marketplace_promo_card_v1(text,text,uuid) to authenticated;
-- Serialize the new UI's revocation with first publication. Existing
-- clients retain the old RPC contract and existing public links.
create or replace function public.revoke_my_marketplace_promo_card_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  perform 1 from public.driver_profiles where project_id=pid and user_id=actor for update;
  if not found then raise exception 'DRIVER_PROFILE_NOT_FOUND' using errcode='42501'; end if;
  return public.set_my_marketplace_promo_profile(null,false,false);
end $$;
revoke all on function public.revoke_my_marketplace_promo_card_v1() from public,anon,authenticated;
grant execute on function public.revoke_my_marketplace_promo_card_v1() to authenticated;
commit;
