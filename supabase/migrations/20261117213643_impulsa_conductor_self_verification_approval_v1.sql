-- Applied to Supabase TukTuk on 2026-11-17 via migration 20261117213643.
-- Preserve permissions, approval workflow and personal consent history.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25s';
-- CANDIDATE ONLY: review and test in disposable DB before generating/deploying migration.
-- Driver requests access to Impulsa; only authorized Administration may approve.
-- Explicit consent is recorded before identity verification and publicity.
create table if not exists app_private.marketplace_impulsa_applications (
  project_id uuid not null,
  driver_user_id uuid not null,
  status text not null default 'pending' check(status in ('pending','rejected','approved','withdrawn')),
  consent_version text not null,
  consent_accepted_at timestamptz not null,
  consent_public_profile boolean not null check(consent_public_profile),
  consent_photo boolean not null check(consent_photo),
  submitted_display_name text not null,
  submitted_photo_asset_id uuid,
  identity_front_asset_id uuid not null,
  identity_back_asset_id uuid not null,
  identity_document_type text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_reason text,
  primary key (project_id,driver_user_id),
  foreign key (project_id,driver_user_id)
    references public.driver_profiles(project_id,user_id)
);
alter table app_private.marketplace_impulsa_applications enable row level security;
revoke all on app_private.marketplace_impulsa_applications from public, anon, authenticated;

create or replace function public.get_my_marketplace_impulsa_application_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); pid uuid; d public.driver_profiles%rowtype;
  a app_private.marketplace_impulsa_applications%rowtype;
  is_verified boolean:=false; is_active boolean:=false;
  documents_ready boolean:=false;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  select * into d from public.driver_profiles
    where project_id=pid and user_id=actor;
  if not found then return jsonb_build_object('status','not_registered','documents_ready',false,'verified',false,'promo_active',false); end if;
  select exists(
    select 1 from public.media_assets f
    join public.media_assets b on b.project_id=f.project_id and b.owner_user_id=f.owner_user_id
    where f.project_id=pid and f.owner_user_id=actor
      and f.id=d.identity_front_asset_id and b.id=d.identity_back_asset_id
      and f.asset_kind='identity_front' and b.asset_kind='identity_back'
      and f.storage_bucket='marketplace-identity' and b.storage_bucket='marketplace-identity'
      and f.status='available' and b.status='available'
  ) into documents_ready;
  select app_private.marketplace_driver_identity_verified_v1(pid,actor) into is_verified;
  select exists(
    select 1 from app_private.marketplace_driver_promo_profiles p
    where p.project_id=pid and p.driver_user_id=actor and p.revoked_at is null
  ) into is_active;
  select * into a from app_private.marketplace_impulsa_applications
    where project_id=pid and driver_user_id=actor;
  return jsonb_build_object(
    'status',case when is_active and is_verified then 'active'
      when a.status='approved' then 'not_requested'
      when a.status is not null then a.status else 'not_requested' end,
    'documents_ready',documents_ready,'verified',is_verified,
    'promo_active',is_active and is_verified,
    'submitted_at',a.submitted_at,
    'consent_version',a.consent_version,
    'identity_type_known',d.identity_document_type in ('national_id','driver_license')
  );
end $$;
revoke all on function public.get_my_marketplace_impulsa_application_v1() from public,anon,authenticated;
grant execute on function public.get_my_marketplace_impulsa_application_v1() to authenticated;

create or replace function public.request_my_marketplace_impulsa_verification_v1(
  target_accept_terms boolean, target_authorize_public_profile boolean,
  target_authorize_photo boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); pid uuid; d public.driver_profiles%rowtype;
  existing app_private.marketplace_impulsa_applications%rowtype;
  public_name text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if target_accept_terms is distinct from true
      or target_authorize_public_profile is distinct from true
      or target_authorize_photo is distinct from true then
    raise exception 'CONSENT_REQUIRED' using errcode='22023';
  end if;
  select id into pid from public.projects where slug='tuktuk-control';
  select * into d from public.driver_profiles
    where project_id=pid and user_id=actor for update;
  if not found or d.status<>'active' or d.suspended_at is not null
    or d.activated_at is null then
    raise exception 'DRIVER_NOT_ACTIVE' using errcode='22023';
  end if;
  select btrim(display_name) into public_name from public.profiles where id=actor;
  if nullif(public_name,'') is null or d.identity_front_asset_id is null
     or d.identity_back_asset_id is null
     or not exists(
        select 1 from public.media_assets f
        join public.media_assets b on b.project_id=f.project_id and b.owner_user_id=f.owner_user_id
        where f.project_id=pid and f.owner_user_id=actor
          and f.id=d.identity_front_asset_id and b.id=d.identity_back_asset_id
          and f.asset_kind='identity_front' and b.asset_kind='identity_back'
          and f.storage_bucket='marketplace-identity' and b.storage_bucket='marketplace-identity'
          and f.status='available' and b.status='available'
     ) then raise exception 'IDENTITY_DOCUMENTS_REQUIRED' using errcode='22023'; end if;
  if app_private.marketplace_driver_identity_verified_v1(pid,actor)
    and exists(select 1 from app_private.marketplace_driver_promo_profiles p
      where p.project_id=pid and p.driver_user_id=actor and p.revoked_at is null) then
    return jsonb_build_object('status','active');
  end if;
  select * into existing from app_private.marketplace_impulsa_applications
    where project_id=pid and driver_user_id=actor for update;
  if found and existing.status='pending'
    and existing.identity_front_asset_id is not distinct from d.identity_front_asset_id
    and existing.identity_back_asset_id is not distinct from d.identity_back_asset_id
    and existing.identity_document_type is not distinct from d.identity_document_type
    and existing.submitted_photo_asset_id is not distinct from d.photo_asset_id
    and existing.submitted_display_name is not distinct from public_name then
    return jsonb_build_object('status','pending');
  end if;
  -- Consent is for the CURRENT public name/photo only. Changes require
  -- a fresh driver request; admins cannot authorize new photos silently.
  insert into app_private.marketplace_impulsa_applications (
    project_id,driver_user_id,status,consent_version,consent_accepted_at,
    consent_public_profile,consent_photo,submitted_display_name,
    submitted_photo_asset_id,identity_front_asset_id,identity_back_asset_id,
    identity_document_type,submitted_at,reviewed_at,reviewed_by,review_reason
  ) values (
    pid,actor,'pending','impulsa-self-service-v1',now(),true,true,public_name,
    d.photo_asset_id,d.identity_front_asset_id,d.identity_back_asset_id,
    d.identity_document_type,now(),null,null,null
  ) on conflict(project_id,driver_user_id) do update set
    status='pending',consent_version=excluded.consent_version,
    consent_accepted_at=excluded.consent_accepted_at,
    consent_public_profile=true,consent_photo=true,
    submitted_display_name=excluded.submitted_display_name,
    submitted_photo_asset_id=excluded.submitted_photo_asset_id,
    identity_front_asset_id=excluded.identity_front_asset_id,
    identity_back_asset_id=excluded.identity_back_asset_id,
    identity_document_type=excluded.identity_document_type,
    submitted_at=now(),reviewed_at=null,reviewed_by=null,review_reason=null;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    values(pid,actor,'impulsa_application_submitted','driver_profile',actor::text,
      jsonb_build_object('consent_version','impulsa-self-service-v1','photo_consent',true));
  return jsonb_build_object('status','pending');
end $$;
revoke all on function public.request_my_marketplace_impulsa_verification_v1(boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.request_my_marketplace_impulsa_verification_v1(boolean,boolean,boolean) to authenticated;

-- Withdrawal before administrative approval revokes the pending request.
-- This never revokes an already active commercial profile.
create or replace function public.withdraw_my_marketplace_impulsa_application_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  update app_private.marketplace_impulsa_applications
    set status='withdrawn',reviewed_at=null,reviewed_by=null,
      review_reason=null
    where project_id=pid and driver_user_id=actor and status='pending';
  if not found then raise exception 'NO_PENDING_APPLICATION' using errcode='22023'; end if;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    values(pid,actor,'impulsa_application_withdrawn','driver_profile',actor::text,
      jsonb_build_object('source','driver'));
  return jsonb_build_object('status','withdrawn');
end $$;
revoke all on function public.withdraw_my_marketplace_impulsa_application_v1() from public,anon,authenticated;
grant execute on function public.withdraw_my_marketplace_impulsa_application_v1() to authenticated;

create or replace function public.admin_get_marketplace_impulsa_application_v1(
  target_project_id uuid,target_driver_user_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a app_private.marketplace_impulsa_applications%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  select * into a from app_private.marketplace_impulsa_applications
    where project_id=target_project_id and driver_user_id=target_driver_user_id;
  return jsonb_build_object('status',coalesce(a.status,'not_requested'),
    'submitted_at',a.submitted_at,'consent_version',a.consent_version,
    'document_type',a.identity_document_type,'reviewed_at',a.reviewed_at);
end $$;
revoke all on function public.admin_get_marketplace_impulsa_application_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_get_marketplace_impulsa_application_v1(uuid,uuid) to authenticated;

-- One atomic administrative decision: document review + verified state +
-- commercial activation. Any failure rolls back ALL three changes.
create or replace function public.admin_decide_marketplace_impulsa_application_v1(
  target_project_id uuid,target_driver_user_id uuid,target_approve boolean,
  target_reason text,target_document_type text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a app_private.marketplace_impulsa_applications%rowtype;
  d public.driver_profiles%rowtype; current_name text; activated jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if target_approve is null or char_length(btrim(coalesce(target_reason,''))) not between 5 and 300 then
    raise exception 'REVIEW_REASON_REQUIRED' using errcode='22023';
  end if;
  select * into a from app_private.marketplace_impulsa_applications
    where project_id=target_project_id and driver_user_id=target_driver_user_id
    for update;
  if not found or a.status<>'pending' then
    raise exception 'APPLICATION_NOT_PENDING' using errcode='22023';
  end if;
  if target_approve is false then
    update app_private.marketplace_impulsa_applications
      set status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),
      review_reason=btrim(target_reason)
      where project_id=target_project_id and driver_user_id=target_driver_user_id;
    insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
      values(target_project_id,auth.uid(),'impulsa_application_rejected','driver_profile',
        target_driver_user_id::text,jsonb_build_object('reason',btrim(target_reason)));
    return jsonb_build_object('status','rejected');
  end if;
  select * into d from public.driver_profiles
    where project_id=target_project_id and user_id=target_driver_user_id for update;
  select btrim(display_name) into current_name from public.profiles where id=target_driver_user_id;
  if d.user_id is null or d.status<>'active' or d.suspended_at is not null
    or d.activated_at is null or d.identity_front_asset_id is distinct from a.identity_front_asset_id
    or d.identity_back_asset_id is distinct from a.identity_back_asset_id
    or d.photo_asset_id is distinct from a.submitted_photo_asset_id
    or (a.identity_document_type is not null and d.identity_document_type is distinct from a.identity_document_type)
    or current_name is distinct from a.submitted_display_name
    or a.consent_version<>'impulsa-self-service-v1'
    or a.consent_public_profile is distinct from true
    or a.consent_photo is distinct from true then
      raise exception 'APPLICATION_DATA_CHANGED_RESUBMIT' using errcode='22023';
  end if;
  if not app_private.marketplace_driver_identity_verified_v1(target_project_id,target_driver_user_id) then
    perform public.admin_set_marketplace_driver_identity_review_v2(
      target_project_id,target_driver_user_id,true,btrim(target_reason),
      a.identity_front_asset_id,a.identity_back_asset_id,
      coalesce(d.identity_document_type,target_document_type));
  end if;
  activated:=public.admin_activate_marketplace_promo_card_v1(
    target_project_id,target_driver_user_id,true,
    'Consentimiento Impulsa v1 '||a.submitted_at::text);
  if activated->>'enabled' is distinct from 'true' then
    raise exception 'IMPULSA_ACTIVATION_FAILED' using errcode='22023';
  end if;
  update app_private.marketplace_impulsa_applications
    set status='approved',reviewed_at=now(),reviewed_by=auth.uid(),
      review_reason=btrim(target_reason)
    where project_id=target_project_id and driver_user_id=target_driver_user_id;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    values(target_project_id,auth.uid(),'impulsa_application_approved','driver_profile',
      target_driver_user_id::text,jsonb_build_object('consent_version',a.consent_version));
  return jsonb_build_object('status','approved','promo_active',true);
end $$;
revoke all on function public.admin_decide_marketplace_impulsa_application_v1(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.admin_decide_marketplace_impulsa_application_v1(uuid,uuid,boolean,text,text) to authenticated;

