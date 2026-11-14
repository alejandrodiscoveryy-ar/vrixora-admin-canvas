-- Avoid expensive planning of one large join in the public promotion read.
-- Preserve the exact eligibility, consent, published services and photo rules.
begin;
create or replace function app_private.resolve_marketplace_promo_profile(target_code text)
returns table(project_id uuid, driver_user_id uuid, public_name text, photo_asset_id uuid, vehicle_id text, category_code text, service_codes text[])
language plpgsql stable security definer set search_path='' as $$
declare
  selected record;
  candidate record;
  published_services text[];
begin
  if target_code is null or target_code !~ '^[0-9a-f]{32}$' then return; end if;
  select p.project_id as pid, p.driver_user_id as uid, p.public_name as name,
    p.consent_photo_asset_id as consent_photo, d.photo_asset_id as current_photo
  into selected
  from app_private.marketplace_driver_promo_profiles p
  join app_private.marketplace_driver_promo_settings s on s.project_id=p.project_id and s.profiles_enabled
  join public.projects pr on pr.id=p.project_id and pr.slug='tuktuk-control'
  join public.driver_profiles d on d.project_id=p.project_id and d.user_id=p.driver_user_id
  where p.code=target_code and p.revoked_at is null
    and d.status='active' and d.suspended_at is null and d.activated_at is not null;
  if not found then return; end if;

  for candidate in
    select v.id as vid,v.category_code as category
    from public.driver_vehicle_assignments a
    join public.vehicles v on v.project_id=a.project_id and v.id=a.vehicle_id
      and v.marketplace_status='active' and v.deleted_at is null
    where a.project_id=selected.pid and a.driver_user_id=selected.uid and a.is_active
    order by v.id
  loop
    select array_agg(distinct vs.service_code order by vs.service_code)
      into published_services
    from public.vehicle_services vs
    join public.list_marketplace_published_modalities('tuktuk-control') pub
      on pub.service_code=vs.service_code and pub.vehicle_category_code=candidate.category
    where vs.project_id=selected.pid and vs.vehicle_id=candidate.vid and vs.enabled;
    if coalesce(cardinality(published_services),0)=0 then continue; end if;

    project_id:=selected.pid;
    driver_user_id:=selected.uid;
    public_name:=selected.name;
    photo_asset_id:=null;
    if selected.consent_photo=selected.current_photo and exists(
      select 1 from public.media_assets m where m.id=selected.current_photo
        and m.project_id=selected.pid and m.owner_user_id=selected.uid
        and m.asset_kind='driver_photo' and m.status='available' and m.storage_bucket='marketplace-media'
    ) then photo_asset_id:=selected.current_photo; end if;
    vehicle_id:=candidate.vid;
    category_code:=candidate.category;
    service_codes:=published_services;
    return next;
    return;
  end loop;
end $$;

-- Read the alias in the same verified profile lookup, rather than resolving
-- the entire profile twice. Existing callers retain their JSON fields.
create or replace function public.resolve_marketplace_promo_profile_v1(target_code text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('public_name',p.public_name,'category_code',p.category_code,
    'service_codes',p.service_codes,'photo_asset_id',p.photo_asset_id,
    'verified',v.verified,'promo_alias',case when v.verified then
      (select a.alias from app_private.marketplace_driver_promo_aliases a
       where a.promo_code=target_code and a.is_primary) end)
  from app_private.resolve_marketplace_promo_profile(target_code) p
  cross join lateral (select app_private.marketplace_driver_identity_verified_v1(p.project_id,p.driver_user_id) as verified) v
$$;
commit;
