-- TukTuk Marketplace Block 9 bridge: authenticated Flutter driver contracts.
-- Server-first: no Marketplace table is exposed to the Data API.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-media', 'marketplace-media', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app_private.marketplace_media_path_is_prepared(target_bucket text, target_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.media_assets a
    join public.projects p on p.id=a.project_id and p.slug='tuktuk-control'
    where a.owner_user_id=auth.uid() and a.storage_bucket=target_bucket
      and a.storage_path=target_path and a.status='pending'
  );
$$;
revoke all on function app_private.marketplace_media_path_is_prepared(text,text) from public,anon,authenticated;

create policy "marketplace media insert only when prepared"
on storage.objects for insert to authenticated
with check (bucket_id='marketplace-media' and app_private.marketplace_media_path_is_prepared(bucket_id,name));
create policy "marketplace media owner reads prepared assets"
on storage.objects for select to authenticated
using (bucket_id='marketplace-media' and app_private.marketplace_media_path_is_prepared(bucket_id,name));

create or replace function public.prepare_my_marketplace_media_upload(
  target_asset_kind text, target_mime_type text, target_byte_size bigint,
  target_extension text, target_sha256 text, target_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; kind text:=lower(btrim(target_asset_kind));
  mime text:=lower(btrim(target_mime_type)); ext text:=lower(btrim(target_extension));
  expected_ext text; asset public.media_assets%rowtype; path text;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
 if kind not in ('driver_photo','vehicle_photo') then raise exception 'INVALID_MEDIA_ASSET_KIND' using errcode='22023'; end if;
 if mime not in ('image/jpeg','image/png','image/webp') or target_byte_size is null or target_byte_size<1 or target_byte_size>5242880 then raise exception 'INVALID_MEDIA_UPLOAD' using errcode='22023'; end if;
 expected_ext:=case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
 if ext<>expected_ext or target_sha256 !~ '^[0-9a-fA-F]{64}$' then raise exception 'INVALID_MEDIA_UPLOAD' using errcode='22023'; end if;
 select id into pid from public.projects where slug='tuktuk-control';
 path:=actor::text||'/'||target_idempotency_key::text||'.'||expected_ext;
 select * into asset from public.media_assets where project_id=pid and storage_bucket='marketplace-media' and storage_path=path for update;
 if found then
   if asset.owner_user_id<>actor or asset.asset_kind<>kind or asset.mime_type<>mime or asset.byte_size<>target_byte_size or asset.sha256<>lower(target_sha256) then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION' using errcode='22023'; end if;
   return jsonb_build_object('asset_id',asset.id,'storage_bucket',asset.storage_bucket,'storage_path',asset.storage_path,'status',asset.status);
 end if;
 insert into public.media_assets(project_id,owner_user_id,asset_kind,storage_bucket,storage_path,mime_type,byte_size,sha256,status)
 values(pid,actor,kind,'marketplace-media',path,mime,target_byte_size,lower(target_sha256),'pending') returning * into asset;
 return jsonb_build_object('asset_id',asset.id,'storage_bucket',asset.storage_bucket,'storage_path',asset.storage_path,'status',asset.status);
end;
$$;

create or replace function public.finalize_my_marketplace_media_upload(target_asset_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); asset public.media_assets%rowtype;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select a.* into asset from public.media_assets a join public.projects p on p.id=a.project_id and p.slug='tuktuk-control' where a.id=target_asset_id and a.owner_user_id=actor for update;
 if not found then raise exception 'MARKETPLACE_MEDIA_ASSET_NOT_FOUND' using errcode='P0002'; end if;
 if asset.status='available' then return jsonb_build_object('asset_id',asset.id,'storage_bucket',asset.storage_bucket,'storage_path',asset.storage_path,'status',asset.status); end if;
 if asset.status<>'pending' or not exists(select 1 from storage.objects o where o.bucket_id=asset.storage_bucket and o.name=asset.storage_path) then raise exception 'MARKETPLACE_MEDIA_OBJECT_NOT_FOUND' using errcode='P0002'; end if;
 update public.media_assets set status='available' where id=asset.id returning * into asset;
 return jsonb_build_object('asset_id',asset.id,'storage_bucket',asset.storage_bucket,'storage_path',asset.storage_path,'status',asset.status);
end;
$$;

create or replace function public.save_my_marketplace_driver_onboarding(target_display_name text,target_phone text,target_photo_asset_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; photo uuid:=target_photo_asset_id; d public.driver_profiles%rowtype;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if nullif(btrim(target_display_name),'') is null or nullif(btrim(target_phone),'') !~ '^\\+[1-9][0-9]{7,14}$' then raise exception 'INVALID_DRIVER_PROFILE' using errcode='22023'; end if;
 select id into pid from public.projects where slug='tuktuk-control';
 if not exists(select 1 from public.profiles where id=actor) then raise exception 'PROFILE_NOT_FOUND' using errcode='P0002'; end if;
 if photo is not null and not exists(select 1 from public.media_assets a where a.project_id=pid and a.id=photo and a.owner_user_id=actor and a.asset_kind='driver_photo' and a.status='available') then raise exception 'INVALID_DRIVER_PHOTO' using errcode='22023'; end if;
 select * into d from public.driver_profiles where project_id=pid and user_id=actor for update;
 if found and d.status='suspended' then raise exception 'DRIVER_SUSPENDED' using errcode='42501'; end if;
 update public.profiles set display_name=btrim(target_display_name),phone=btrim(target_phone) where id=actor;
 if not found then insert into public.driver_profiles(project_id,user_id,status,photo_asset_id) values(pid,actor,'incomplete',photo); else update public.driver_profiles set photo_asset_id=coalesce(photo,d.photo_asset_id) where project_id=pid and user_id=actor; end if;
 return public.get_my_marketplace_onboarding();
end;
$$;

create or replace function public.save_my_marketplace_vehicle_onboarding(
 target_vehicle_id text,target_category_code text,target_propulsion_code text,target_category_other_description text,target_brand text,target_model text,target_year integer,target_passenger_capacity integer,target_cargo_capacity_kg numeric,target_cargo_volume_m3 numeric,target_cargo_length_cm numeric,target_cargo_width_cm numeric,target_cargo_height_cm numeric,target_body_type text,target_main_photo_asset_id uuid,target_service_codes text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; v public.vehicles%rowtype; service_code text; normalized_services text[]:=coalesce(target_service_codes,'{}'::text[]);
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select id into pid from public.projects where slug='tuktuk-control';
 select * into v from public.vehicles where project_id=pid and id=target_vehicle_id and owner_user_id=actor for update;
 if not found then raise exception 'VEHICLE_NOT_FOUND_OR_NOT_OWNED' using errcode='42501'; end if;
 if target_category_code is null or not exists(select 1 from public.vehicle_categories c where c.project_id=pid and c.code=target_category_code and c.active) or target_propulsion_code is null or not exists(select 1 from public.propulsion_types p where p.project_id=pid and p.code=target_propulsion_code and p.active) then raise exception 'INVALID_VEHICLE_CATALOG_VALUE' using errcode='22023'; end if;
 if target_category_code='other' and nullif(btrim(target_category_other_description),'') is null then raise exception 'OTHER_CATEGORY_DESCRIPTION_REQUIRED' using errcode='22023'; end if;
 if (target_brand is not null and nullif(btrim(target_brand),'') is null) or (target_model is not null and nullif(btrim(target_model),'') is null) or coalesce(target_year,0)<0 or coalesce(target_passenger_capacity,0)<0 or coalesce(target_cargo_capacity_kg,0)<0 or coalesce(target_cargo_volume_m3,0)<0 or coalesce(target_cargo_length_cm,0)<0 or coalesce(target_cargo_width_cm,0)<0 or coalesce(target_cargo_height_cm,0)<0 then raise exception 'INVALID_VEHICLE_ONBOARDING' using errcode='22023'; end if;
 if array_length(normalized_services,1) is distinct from (select count(distinct x) from unnest(normalized_services) x) or exists(select 1 from unnest(normalized_services) x left join public.service_types s on s.project_id=pid and s.code=x and s.active where s.code is null) then raise exception 'INVALID_VEHICLE_SERVICES' using errcode='22023'; end if;
 if target_main_photo_asset_id is not null and not exists(select 1 from public.media_assets a where a.project_id=pid and a.id=target_main_photo_asset_id and a.owner_user_id=actor and a.asset_kind='vehicle_photo' and a.status='available') then raise exception 'INVALID_VEHICLE_PHOTO' using errcode='22023'; end if;
 insert into public.driver_profiles(project_id,user_id,status) values(pid,actor,'incomplete') on conflict do nothing;
 update public.vehicles set category_code=target_category_code,propulsion_code=target_propulsion_code,category_other_description=nullif(btrim(target_category_other_description),''),brand=nullif(btrim(target_brand),''),model=nullif(btrim(target_model),''),year=target_year,passenger_capacity=target_passenger_capacity,cargo_capacity_kg=target_cargo_capacity_kg,cargo_volume_m3=target_cargo_volume_m3,cargo_length_cm=target_cargo_length_cm,cargo_width_cm=target_cargo_width_cm,cargo_height_cm=target_cargo_height_cm,body_type=nullif(btrim(target_body_type),''),main_photo_asset_id=target_main_photo_asset_id,marketplace_status=case when marketplace_status='suspended' then 'suspended' else 'pending_activation' end where project_id=pid and id=target_vehicle_id and owner_user_id=actor;
 insert into public.driver_vehicle_assignments(project_id,driver_user_id,vehicle_id) values(pid,actor,target_vehicle_id) on conflict do nothing;
 delete from public.vehicle_services where project_id=pid and vehicle_id=target_vehicle_id;
 insert into public.vehicle_services(project_id,vehicle_id,service_code,enabled) select pid,target_vehicle_id,x,true from unnest(normalized_services) x;
 return public.get_my_marketplace_onboarding();
end;
$$;

create or replace function public.get_my_marketplace_onboarding()
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if; select id into pid from public.projects where slug='tuktuk-control';
 return jsonb_build_object('server_time',now(),'display_name',(select p.display_name from public.profiles p where p.id=actor),'phone',(select p.phone from public.profiles p where p.id=actor),'driver_profile_exists',exists(select 1 from public.driver_profiles d where d.project_id=pid and d.user_id=actor),'driver_status',(select d.status from public.driver_profiles d where d.project_id=pid and d.user_id=actor),'driver_photo_asset_id',(select d.photo_asset_id from public.driver_profiles d where d.project_id=pid and d.user_id=actor),'driver_suspended',exists(select 1 from public.driver_profiles d where d.project_id=pid and d.user_id=actor and d.status='suspended'), 'vehicles',coalesce((select jsonb_agg(jsonb_build_object('vehicle_id',v.id,'name',v.name,'registration',v.registration,'category_code',v.category_code,'propulsion_code',v.propulsion_code,'category_other_description',v.category_other_description,'brand',v.brand,'model',v.model,'year',v.year,'passenger_capacity',v.passenger_capacity,'cargo_capacity_kg',v.cargo_capacity_kg,'cargo_volume_m3',v.cargo_volume_m3,'cargo_length_cm',v.cargo_length_cm,'cargo_width_cm',v.cargo_width_cm,'cargo_height_cm',v.cargo_height_cm,'body_type',v.body_type,'main_photo_asset_id',v.main_photo_asset_id,'marketplace_status',v.marketplace_status,'is_active',a.is_active,'is_available',a.is_available,'services',coalesce((select jsonb_agg(s.service_code order by s.service_code) from public.vehicle_services s where s.project_id=pid and s.vehicle_id=v.id and s.enabled),'[]'::jsonb),'onboarding_complete',app_private.marketplace_onboarding_requirements_complete(actor,v.id)) order by v.created_at,v.id) from public.vehicles v left join public.driver_vehicle_assignments a on a.project_id=v.project_id and a.vehicle_id=v.id and a.driver_user_id=actor where v.project_id=pid and v.owner_user_id=actor and v.deleted_at is null),'[]'::jsonb),'vehicle_categories',(select coalesce(jsonb_agg(jsonb_build_object('code',c.code,'name',c.name,'sort_order',c.sort_order) order by c.sort_order,c.code),'[]'::jsonb) from public.vehicle_categories c where c.project_id=pid and c.active),'propulsion_types',(select coalesce(jsonb_agg(jsonb_build_object('code',p.code,'name',p.name,'sort_order',p.sort_order) order by p.sort_order,p.code),'[]'::jsonb) from public.propulsion_types p where p.project_id=pid and p.active),'service_types',(select coalesce(jsonb_agg(jsonb_build_object('code',s.code,'name',s.name,'sort_order',s.sort_order) order by s.sort_order,s.code),'[]'::jsonb) from public.service_types s where s.project_id=pid and s.active),'assets',(select coalesce(jsonb_agg(jsonb_build_object('asset_id',a.id,'asset_kind',a.asset_kind,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'status',a.status) order by a.created_at desc),'[]'::jsonb) from public.media_assets a where a.project_id=pid and a.owner_user_id=actor));
end;
$$;

create or replace function public.list_my_marketplace_jobs(target_scope text,target_limit integer default 50,target_before_created_at timestamptz default null,target_before_job_id uuid default null)
returns table(job_id uuid,status text,service_code text,origin_text text,destination_text text,scheduled_for timestamptz,passenger_count integer,cargo_weight_kg numeric,cargo_volume_m3 numeric,cargo_length_cm numeric,cargo_width_cm numeric,cargo_height_cm numeric,required_body_type text,final_price numeric,currency text,vehicle_id text,billing_mode text,commission_amount_snapshot numeric,trial_started_at_snapshot timestamptz,trial_ends_at_snapshot timestamptz,accepted_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,published_at timestamptz,expires_at timestamptz,created_at timestamptz,updated_at timestamptz,incident_from_status text,incident_opened_at timestamptz,incident_reason text,incident_resolution text,incident_resolved_at timestamptz,next_driver_action text) language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; safe_limit integer:=least(greatest(coalesce(target_limit,50),1),100);
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if; if target_scope not in ('active','scheduled','history') then raise exception 'INVALID_MARKETPLACE_JOB_SCOPE' using errcode='22023'; end if; if (target_before_created_at is null)<>(target_before_job_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if; select id into pid from public.projects where slug='tuktuk-control';
 return query select j.id,j.status,j.service_code,r.origin_text,r.destination_text,r.scheduled_for,r.passenger_count,r.cargo_weight_kg,r.cargo_volume_m3,r.cargo_length_cm,r.cargo_width_cm,r.cargo_height_cm,r.required_body_type,j.final_price,j.currency,a.vehicle_id,a.billing_mode,a.commission_amount_snapshot,a.trial_started_at_snapshot,a.trial_ends_at_snapshot,a.accepted_at,a.completed_at,a.cancelled_at,j.published_at,j.expires_at,j.created_at,j.updated_at,j.incident_from_status,j.incident_opened_at,j.incident_reason,ir.resolution,ir.resolved_at,case j.status when 'accepted' then 'start_en_route' when 'en_route' then 'mark_pickup' when 'pickup' then 'start_service' when 'in_progress' then 'complete_service' else null end from public.jobs j join public.job_assignments a on a.project_id=j.project_id and a.job_id=j.id and a.driver_user_id=actor join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id left join lateral (select x.resolution,x.resolved_at from public.marketplace_incident_resolutions x where x.project_id=j.project_id and x.job_id=j.id order by x.resolved_at desc limit 1) ir on true where j.project_id=pid and j.assigned_driver_user_id=actor and (target_before_created_at is null or (j.created_at,j.id)<(target_before_created_at,target_before_job_id)) and ((target_scope='active' and ((j.status='accepted' and (r.scheduled_for is null or r.scheduled_for<=now())) or j.status in ('en_route','pickup','in_progress','completed') or (j.status='incident' and ir.resolved_at is null))) or (target_scope='scheduled' and j.status='accepted' and r.scheduled_for>now()) or (target_scope='history' and (j.status in ('settled','cancelled_by_customer','cancelled_by_driver') or (j.status='incident' and ir.resolved_at is not null)))) order by j.created_at desc,j.id desc limit safe_limit;
end;
$$;

-- Keep the public referral signatures. Wallet mode never creates legacy days; every
-- other project continues through the established legacy helper/campaign contracts.
create or replace function public.claim_referral_code(target_project_id uuid,target_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); referrer uuid; existing public.referral_relationships%rowtype; wallet_mode boolean; result uuid;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select reward_mode='marketplace_wallet_credit' into wallet_mode from public.project_referral_settings where project_id=target_project_id;
 if not coalesce(wallet_mode,false) then return app_private.p1_register_referral(target_project_id,actor,target_code,'referral_link',actor); end if;
 select c.user_id into referrer from public.project_referral_codes c where c.project_id=target_project_id and c.code=upper(btrim(target_code)); if not found then raise exception 'REFERRAL_CODE_NOT_FOUND' using errcode='P0002'; end if;
 if referrer=actor then raise exception 'SELF_REFERRAL_NOT_ALLOWED' using errcode='22023'; end if;
 select * into existing from public.referral_relationships r where r.project_id=target_project_id and r.referred_user_id=actor and not r.is_test for update;
 if found then if existing.referrer_user_id=referrer then return existing.id; end if; raise exception 'REFERRAL_RELATIONSHIP_LOCKED' using errcode='22023'; end if;
 if app_private.marketplace_referral_relationship_locked(target_project_id,actor) then raise exception 'REFERRAL_RELATIONSHIP_LOCKED' using errcode='22023'; end if;
 insert into public.referral_relationships(project_id,referrer_user_id,referred_user_id,referral_code,source,is_test,created_by,updated_by,reward_days)
 values(target_project_id,referrer,actor,upper(btrim(target_code)),'referral_link',false,actor,actor,null) returning id into result;
 return result;
end;
$$;

create or replace function public.get_my_referral_program(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); settings public.project_referral_settings%rowtype; code text; base text; campaign public.referral_campaigns%rowtype;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select * into settings from public.project_referral_settings where project_id=target_project_id;
 if settings.reward_mode is distinct from 'marketplace_wallet_credit' then
   code:=app_private.p0d_ensure_referral_code(target_project_id,actor); campaign:=app_private.p1_current_referral_campaign(target_project_id);
   return jsonb_build_object('enabled',campaign.id is not null,'campaign_id',campaign.id,'campaign_name',campaign.name,'qualification_mode',campaign.qualification_mode,'reward_days',campaign.reward_days,'code',code,'link',case when settings.share_base_url is null then null else settings.share_base_url||case when position('?' in settings.share_base_url)>0 then '&' else '?' end||'ref='||code end,'referred_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'qualified_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and r.qualified_at is not null and not r.is_test),'earned_rewards',(select count(*) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status in ('earned','applied') and not l.is_test),'applied_rewards',(select count(*) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status='applied' and not l.is_test),'earned_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status in ('earned','applied') and not l.is_test),'applied_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status='applied' and not l.is_test));
 end if;
 code:=app_private.p0d_ensure_referral_code(target_project_id,actor); select share_base_url into base from public.project_referral_settings where project_id=target_project_id;
 return jsonb_build_object('enabled',settings.reward_enabled,'reward_mode','marketplace_wallet_credit','reward_enabled',settings.reward_enabled,'reward_amount',settings.reward_amount,'reward_currency',settings.reward_currency,'reward_rule_version',settings.reward_rule_version,'qualification_mode','first_valid_job','reward_days',0,'code',code,'link',case when base is null then null else base||case when position('?' in base)>0 then '&' else '?' end||'ref='||code end,'referred_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'qualified_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and r.qualified_at is not null and not r.is_test),'rewarded_count',((select count(*) from public.marketplace_referral_rewards r where r.project_id=target_project_id and r.referrer_user_id=actor)+(select count(*) from public.marketplace_legacy_referral_reward_transitions t where t.project_id=target_project_id and t.referrer_user_id=actor)),'earned_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status in ('earned','applied') and not l.is_test),'applied_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status='applied' and not l.is_test));
end;
$$;

create or replace function public.get_my_referrals(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); wallet_mode boolean;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select reward_mode='marketplace_wallet_credit' into wallet_mode from public.project_referral_settings where project_id=target_project_id;
 if not coalesce(wallet_mode,false) then return coalesce((select jsonb_agg(jsonb_build_object('relationship_id',r.id,'name',coalesce(nullif(p.display_name,''),'Usuario'),'status',case when l.status='applied' then 'rewarded' when l.status='earned' then 'qualified' when r.qualified_at is not null then 'qualified' else 'registered' end,'reward_days',coalesce(l.reward_days,r.reward_days),'created_at',r.created_at,'qualified_at',r.qualified_at) order by r.created_at desc) from public.referral_relationships r join public.profiles p on p.id=r.referred_user_id left join public.referral_reward_ledger l on l.relationship_id=r.id and not l.is_test where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'[]'::jsonb); end if;
 return coalesce((select jsonb_agg(jsonb_build_object('relationship_id',r.id,'name',coalesce(nullif(p.display_name,''),'Usuario'),'status',case when mr.id is not null or lt.legacy_reward_id is not null then 'rewarded' when r.qualified_at is not null then 'qualified' else 'registered' end,'reward_days',coalesce(ll.reward_days,0),'legacy_days_applied',coalesce(ll.status='applied',false),'legacy_reward_status',ll.status,'reward_amount',coalesce(mr.reward_amount_snapshot,lt.reward_amount_snapshot),'reward_currency',coalesce(mr.reward_currency_snapshot,lt.reward_currency_snapshot),'reward_source',case when mr.id is not null then 'marketplace_referral_reward' when lt.legacy_reward_id is not null then 'legacy_referral_transition' else null end,'qualification_job_id',mr.qualification_job_id,'rewarded_at',coalesce(mr.qualified_at,lt.migrated_at),'created_at',r.created_at,'qualified_at',r.qualified_at) order by r.created_at desc) from public.referral_relationships r join public.profiles p on p.id=r.referred_user_id left join public.marketplace_referral_rewards mr on mr.project_id=r.project_id and mr.relationship_id=r.id left join public.marketplace_legacy_referral_reward_transitions lt on lt.project_id=r.project_id and lt.relationship_id=r.id left join public.referral_reward_ledger ll on ll.relationship_id=r.id and not ll.is_test where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'[]'::jsonb);
end;
$$;

revoke all on function public.prepare_my_marketplace_media_upload(text,text,bigint,text,text,uuid),public.finalize_my_marketplace_media_upload(uuid),public.save_my_marketplace_driver_onboarding(text,text,uuid),public.save_my_marketplace_vehicle_onboarding(text,text,text,text,text,text,integer,integer,numeric,numeric,numeric,numeric,numeric,text,uuid,text[]),public.get_my_marketplace_onboarding(),public.list_my_marketplace_jobs(text,integer,timestamptz,uuid) from public,anon;
grant execute on function public.prepare_my_marketplace_media_upload(text,text,bigint,text,text,uuid),public.finalize_my_marketplace_media_upload(uuid),public.save_my_marketplace_driver_onboarding(text,text,uuid),public.save_my_marketplace_vehicle_onboarding(text,text,text,text,text,text,integer,integer,numeric,numeric,numeric,numeric,numeric,text,uuid,text[]),public.get_my_marketplace_onboarding(),public.list_my_marketplace_jobs(text,integer,timestamptz,uuid) to authenticated;
revoke all on function public.claim_referral_code(uuid,text),public.get_my_referral_program(uuid),public.get_my_referrals(uuid) from public,anon;
grant execute on function public.claim_referral_code(uuid,text),public.get_my_referral_program(uuid),public.get_my_referrals(uuid) to authenticated;
