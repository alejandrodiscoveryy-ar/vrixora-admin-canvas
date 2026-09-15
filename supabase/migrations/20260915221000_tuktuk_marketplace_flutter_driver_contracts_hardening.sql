-- B9.1: correct driver creation, private media reads, empty service arrays and referral totals.

create or replace function app_private.marketplace_media_path_is_owned(target_bucket text,target_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.media_assets a join public.projects p on p.id=a.project_id and p.slug='tuktuk-control'
    where a.owner_user_id=auth.uid() and a.storage_bucket=target_bucket and a.storage_path=target_path
      and a.status in ('pending','available')
  );
$$;
revoke all on function app_private.marketplace_media_path_is_owned(text,text),app_private.marketplace_media_path_is_prepared(text,text) from public,anon;
grant execute on function app_private.marketplace_media_path_is_owned(text,text),app_private.marketplace_media_path_is_prepared(text,text) to authenticated;

drop policy if exists "marketplace media owner reads prepared assets" on storage.objects;
create policy "marketplace media owner reads owned assets"
on storage.objects for select to authenticated
using (bucket_id='marketplace-media' and app_private.marketplace_media_path_is_owned(bucket_id,name));

create or replace function public.save_my_marketplace_driver_onboarding(target_display_name text,target_phone text,target_photo_asset_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; photo uuid:=target_photo_asset_id; d public.driver_profiles%rowtype; driver_exists boolean;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if nullif(btrim(target_display_name),'') is null or nullif(btrim(target_phone),'') !~ '^\\+[1-9][0-9]{7,14}$' then raise exception 'INVALID_DRIVER_PROFILE' using errcode='22023'; end if;
 select id into pid from public.projects where slug='tuktuk-control';
 if not exists(select 1 from public.profiles where id=actor) then raise exception 'PROFILE_NOT_FOUND' using errcode='P0002'; end if;
 if photo is not null and not exists(select 1 from public.media_assets a where a.project_id=pid and a.id=photo and a.owner_user_id=actor and a.asset_kind='driver_photo' and a.status='available') then raise exception 'INVALID_DRIVER_PHOTO' using errcode='22023'; end if;
 select * into d from public.driver_profiles where project_id=pid and user_id=actor for update;
 driver_exists:=found;
 if driver_exists and d.status='suspended' then raise exception 'DRIVER_SUSPENDED' using errcode='42501'; end if;
 update public.profiles set display_name=btrim(target_display_name),phone=btrim(target_phone) where id=actor;
 if not driver_exists then
   insert into public.driver_profiles(project_id,user_id,status,photo_asset_id) values(pid,actor,'incomplete',photo);
 else
   update public.driver_profiles set photo_asset_id=coalesce(photo,d.photo_asset_id) where project_id=pid and user_id=actor;
 end if;
 return public.get_my_marketplace_onboarding();
end;
$$;

create or replace function public.save_my_marketplace_vehicle_onboarding(
 target_vehicle_id text,target_category_code text,target_propulsion_code text,target_category_other_description text,target_brand text,target_model text,target_year integer,target_passenger_capacity integer,target_cargo_capacity_kg numeric,target_cargo_volume_m3 numeric,target_cargo_length_cm numeric,target_cargo_width_cm numeric,target_cargo_height_cm numeric,target_body_type text,target_main_photo_asset_id uuid,target_service_codes text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; v public.vehicles%rowtype; normalized_services text[]:=coalesce(target_service_codes,'{}'::text[]);
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if; select id into pid from public.projects where slug='tuktuk-control';
 select * into v from public.vehicles where project_id=pid and id=target_vehicle_id and owner_user_id=actor for update; if not found then raise exception 'VEHICLE_NOT_FOUND_OR_NOT_OWNED' using errcode='42501'; end if;
 if target_category_code is null or not exists(select 1 from public.vehicle_categories c where c.project_id=pid and c.code=target_category_code and c.active) or target_propulsion_code is null or not exists(select 1 from public.propulsion_types p where p.project_id=pid and p.code=target_propulsion_code and p.active) then raise exception 'INVALID_VEHICLE_CATALOG_VALUE' using errcode='22023'; end if;
 if target_category_code='other' and nullif(btrim(target_category_other_description),'') is null then raise exception 'OTHER_CATEGORY_DESCRIPTION_REQUIRED' using errcode='22023'; end if;
 if (target_brand is not null and nullif(btrim(target_brand),'') is null) or (target_model is not null and nullif(btrim(target_model),'') is null) or coalesce(target_year,0)<0 or coalesce(target_passenger_capacity,0)<0 or coalesce(target_cargo_capacity_kg,0)<0 or coalesce(target_cargo_volume_m3,0)<0 or coalesce(target_cargo_length_cm,0)<0 or coalesce(target_cargo_width_cm,0)<0 or coalesce(target_cargo_height_cm,0)<0 then raise exception 'INVALID_VEHICLE_ONBOARDING' using errcode='22023'; end if;
 if cardinality(normalized_services)<>(select count(distinct x) from unnest(normalized_services) x) or exists(select 1 from unnest(normalized_services) x left join public.service_types s on s.project_id=pid and s.code=x and s.active where s.code is null) then raise exception 'INVALID_VEHICLE_SERVICES' using errcode='22023'; end if;
 if target_main_photo_asset_id is not null and not exists(select 1 from public.media_assets a where a.project_id=pid and a.id=target_main_photo_asset_id and a.owner_user_id=actor and a.asset_kind='vehicle_photo' and a.status='available') then raise exception 'INVALID_VEHICLE_PHOTO' using errcode='22023'; end if;
 insert into public.driver_profiles(project_id,user_id,status) values(pid,actor,'incomplete') on conflict do nothing;
 update public.vehicles set category_code=target_category_code,propulsion_code=target_propulsion_code,category_other_description=nullif(btrim(target_category_other_description),''),brand=nullif(btrim(target_brand),''),model=nullif(btrim(target_model),''),year=target_year,passenger_capacity=target_passenger_capacity,cargo_capacity_kg=target_cargo_capacity_kg,cargo_volume_m3=target_cargo_volume_m3,cargo_length_cm=target_cargo_length_cm,cargo_width_cm=target_cargo_width_cm,cargo_height_cm=target_cargo_height_cm,body_type=nullif(btrim(target_body_type),''),main_photo_asset_id=target_main_photo_asset_id,marketplace_status=case when marketplace_status='suspended' then 'suspended' else 'pending_activation' end where project_id=pid and id=target_vehicle_id and owner_user_id=actor;
 insert into public.driver_vehicle_assignments(project_id,driver_user_id,vehicle_id) values(pid,actor,target_vehicle_id) on conflict do nothing;
 delete from public.vehicle_services where project_id=pid and vehicle_id=target_vehicle_id;
 insert into public.vehicle_services(project_id,vehicle_id,service_code,enabled) select pid,target_vehicle_id,x,true from unnest(normalized_services) x;
 return public.get_my_marketplace_onboarding();
end;
$$;

create or replace function public.get_my_referral_program(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); settings public.project_referral_settings%rowtype; code text; base text; campaign public.referral_campaigns%rowtype;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if; select * into settings from public.project_referral_settings where project_id=target_project_id;
 if settings.reward_mode is distinct from 'marketplace_wallet_credit' then
   code:=app_private.p0d_ensure_referral_code(target_project_id,actor); campaign:=app_private.p1_current_referral_campaign(target_project_id);
   return jsonb_build_object('enabled',campaign.id is not null,'campaign_id',campaign.id,'campaign_name',campaign.name,'qualification_mode',campaign.qualification_mode,'reward_days',campaign.reward_days,'code',code,'link',case when settings.share_base_url is null then null else settings.share_base_url||case when position('?' in settings.share_base_url)>0 then '&' else '?' end||'ref='||code end,'referred_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'qualified_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and r.qualified_at is not null and not r.is_test),'earned_rewards',(select count(*) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status in ('earned','applied') and not l.is_test),'applied_rewards',(select count(*) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status='applied' and not l.is_test),'earned_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status in ('earned','applied') and not l.is_test),'applied_days',(select coalesce(sum(l.reward_days),0) from public.referral_reward_ledger l where l.project_id=target_project_id and l.referrer_user_id=actor and l.status='applied' and not l.is_test));
 end if;
 code:=app_private.p0d_ensure_referral_code(target_project_id,actor); select share_base_url into base from public.project_referral_settings where project_id=target_project_id;
 return jsonb_build_object('enabled',settings.reward_enabled,'reward_mode','marketplace_wallet_credit','reward_enabled',settings.reward_enabled,'reward_amount',settings.reward_amount,'reward_currency',settings.reward_currency,'reward_rule_version',settings.reward_rule_version,'qualification_mode','first_valid_job','reward_days',0,'code',code,'link',case when base is null then null else base||case when position('?' in base)>0 then '&' else '?' end||'ref='||code end,'referred_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and not r.is_test),'qualified_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=actor and r.qualified_at is not null and not r.is_test),'rewarded_count',(select count(distinct reward.referred_user_id) from (select mr.referred_user_id from public.marketplace_referral_rewards mr where mr.project_id=target_project_id and mr.referrer_user_id=actor union select lt.referred_user_id from public.marketplace_legacy_referral_reward_transitions lt where lt.project_id=target_project_id and lt.referrer_user_id=actor) reward));
end;
$$;

revoke all on function public.save_my_marketplace_driver_onboarding(text,text,uuid),public.save_my_marketplace_vehicle_onboarding(text,text,text,text,text,text,integer,integer,numeric,numeric,numeric,numeric,numeric,text,uuid,text[]),public.get_my_referral_program(uuid) from public,anon;
grant execute on function public.save_my_marketplace_driver_onboarding(text,text,uuid),public.save_my_marketplace_vehicle_onboarding(text,text,text,text,text,text,integer,integer,numeric,numeric,numeric,numeric,numeric,text,uuid,text[]),public.get_my_referral_program(uuid) to authenticated;
