-- Correccion del error 42702 ya aplicada en Supabase.
create or replace function public.admin_update_marketplace_driver_vehicle_full_v1(
  target_project_id uuid, target_driver_user_id uuid, target_vehicle_id text,
  target_category_code text, target_propulsion_code text,
  target_category_other_description text, target_brand text, target_model text,
  target_year integer, target_registration text, target_passenger_capacity integer,
  target_cargo_capacity_kg numeric, target_cargo_volume_m3 numeric,
  target_cargo_length_cm numeric, target_cargo_width_cm numeric, target_cargo_height_cm numeric,
  target_body_type text, target_main_photo_asset_id uuid, target_service_codes text[],
  target_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  old_vehicle public.vehicles%rowtype;
  new_vehicle public.vehicles%rowtype;
  cleaned_services text[] := coalesce(target_service_codes, '{}'::text[]);
  old_services text[];
  why text := nullif(btrim(target_reason), '');
  category_change boolean;
  is_working boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id, 'marketplace.manage');
  -- Serializar con Trabajar/Descansar: ambos flujos bloquean la asignación.
  select a.accepting_jobs into is_working from public.driver_vehicle_assignments a
    where a.project_id=target_project_id and a.driver_user_id=target_driver_user_id
      and a.vehicle_id=target_vehicle_id for update;
  if not found then raise exception 'VEHICLE_ASSIGNMENT_NOT_FOUND' using errcode='P0002'; end if;
  if is_working then raise exception 'VEHICLE_WORKING_BLOCKS_EDIT' using errcode='23514'; end if;
  select vv.* into old_vehicle from public.vehicles vv
    where vv.project_id=target_project_id and vv.id=target_vehicle_id
      and vv.owner_user_id=target_driver_user_id and vv.deleted_at is null
      and exists(select 1 from public.driver_vehicle_assignments a
        where a.project_id=vv.project_id and a.vehicle_id=vv.id
          and a.driver_user_id=target_driver_user_id)
    for update;
  if not found then raise exception 'VEHICLE_NOT_FOUND_OR_NOT_OWNED' using errcode='P0002'; end if;

  -- Bloqueo de cambios operativos mientras haya asignaciones vivas.
  if exists(select 1 from public.jobs j
      left join public.marketplace_incident_resolutions r
        on r.project_id=j.project_id and r.job_id=j.id
      where j.project_id=target_project_id
      and j.assigned_vehicle_id=target_vehicle_id
      and j.assigned_driver_user_id=target_driver_user_id
      and j.test_deleted_at is null
      and (j.status in ('accepted','en_route','pickup','in_progress','completed')
        or (j.status='incident' and r.id is null))) then
    raise exception 'ACTIVE_JOB_BLOCKS_VEHICLE_EDIT' using errcode='23514';
  end if;
  if not exists(select 1 from public.vehicle_categories c where c.project_id=target_project_id
       and c.code=target_category_code and c.active)
    or not exists(select 1 from public.propulsion_types p where p.project_id=target_project_id
       and p.code=target_propulsion_code and p.active) then
    raise exception 'INVALID_VEHICLE_CATALOG_VALUE' using errcode='22023';
  end if;
  if target_category_code='other' and nullif(btrim(target_category_other_description),'') is null then
    raise exception 'OTHER_CATEGORY_DESCRIPTION_REQUIRED' using errcode='22023';
  end if;
  if length(btrim(coalesce(target_brand,''))) not between 2 and 100
     or length(btrim(coalesce(target_model,''))) not between 1 and 100
     or length(concat_ws(' ',btrim(target_brand),btrim(target_model))) > 80
     or length(coalesce(target_registration,'')) > 32
     or length(coalesce(target_category_other_description,'')) > 160
     or length(coalesce(target_body_type,'')) > 160
     or length(coalesce(why,'')) not between 5 and 300
     or (target_year is not null and target_year not between 1886 and 2200)
     or (target_passenger_capacity is not null and target_passenger_capacity < 0)
     or (target_cargo_capacity_kg is not null and (target_cargo_capacity_kg < 0 or target_cargo_capacity_kg::text in ('NaN','Infinity','-Infinity')))
     or (target_cargo_volume_m3 is not null and (target_cargo_volume_m3 < 0 or target_cargo_volume_m3::text in ('NaN','Infinity','-Infinity')))
     or (target_cargo_length_cm is not null and (target_cargo_length_cm < 0 or target_cargo_length_cm::text in ('NaN','Infinity','-Infinity')))
     or (target_cargo_width_cm is not null and (target_cargo_width_cm < 0 or target_cargo_width_cm::text in ('NaN','Infinity','-Infinity')))
     or (target_cargo_height_cm is not null and (target_cargo_height_cm < 0 or target_cargo_height_cm::text in ('NaN','Infinity','-Infinity'))) then
    raise exception 'INVALID_VEHICLE_EDIT' using errcode='22023';
  end if;
  if cardinality(cleaned_services)=0
     or cardinality(cleaned_services)<>(select count(distinct requested.service_code) from unnest(cleaned_services) as requested(service_code))
     or exists (select 1 from unnest(cleaned_services) as requested(service_code) left join public.service_types s
       on s.project_id=target_project_id and s.code=requested.service_code and s.active where s.code is null) then
    raise exception 'INVALID_VEHICLE_SERVICES' using errcode='22023';
  end if;
  -- La capacidad de una moto de pasajeros no puede derivarse de la del triciclo anterior.
  if target_category_code='motorcycle' and target_passenger_capacity is distinct from 1 then
    raise exception 'MOTORCYCLE_PASSENGERS_MUST_BE_ONE' using errcode='22023';
  end if;
  if cleaned_services && array['passenger','tourism']::text[]
      and coalesce(target_passenger_capacity,0)<1 then
    raise exception 'PASSENGER_CAPACITY_REQUIRED' using errcode='22023';
  end if;
  if 'cargo'=any(cleaned_services) and coalesce(target_cargo_capacity_kg,0)<=0 then
    raise exception 'CARGO_CAPACITY_REQUIRED' using errcode='22023';
  end if;
  -- No permitir retirar la foto que exige el alta operativa del conductor.
  if target_main_photo_asset_id is null then
    raise exception 'VEHICLE_PHOTO_REQUIRED' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.media_assets m where m.project_id=target_project_id
      and m.id=target_main_photo_asset_id and m.owner_user_id=target_driver_user_id
      and m.asset_kind='vehicle_photo' and m.storage_bucket='marketplace-media'
      and m.status='available') then
    raise exception 'INVALID_VEHICLE_PHOTO' using errcode='22023';
  end if;

  select coalesce(array_agg(s.service_code order by s.service_code),'{}'::text[])
     into old_services from public.vehicle_services s
     where s.project_id=target_project_id and s.vehicle_id=target_vehicle_id and s.enabled;
  category_change := old_vehicle.category_code is distinct from target_category_code;
  update public.vehicles set
    name=btrim(concat_ws(' ',target_brand,target_model)),
    category_code=target_category_code, propulsion_code=target_propulsion_code,
    category_other_description=case when target_category_code='other'
      then nullif(btrim(target_category_other_description),'') else null end,
    brand=btrim(target_brand),model=btrim(target_model),year=target_year,
    registration=nullif(btrim(target_registration),''),
    passenger_capacity=target_passenger_capacity,cargo_capacity_kg=target_cargo_capacity_kg,
    cargo_volume_m3=target_cargo_volume_m3,cargo_length_cm=target_cargo_length_cm,
    cargo_width_cm=target_cargo_width_cm,cargo_height_cm=target_cargo_height_cm,
    body_type=nullif(btrim(target_body_type),''),main_photo_asset_id=target_main_photo_asset_id,
    updated_at=now()
    where project_id=target_project_id and id=target_vehicle_id returning * into new_vehicle;

  -- Mantener sincronizados nombre y matrícula en vehículos antiguos de Control,
  -- igual que save_my_marketplace_vehicle_profile, sin crear entidades nuevas.
  update public.sync_entities set
    payload=jsonb_set(
      jsonb_set(payload,'{name}',to_jsonb(new_vehicle.name),true),
      '{registration}',to_jsonb(coalesce(new_vehicle.registration,'')),true
    ) || jsonb_build_object('updatedAt',now()),
    updated_at=now()
    where user_id=target_driver_user_id and entity_type='vehicle'
      and entity_id=target_vehicle_id and deleted_at is null;

  -- Deshabilitar servicios sin borrarlos; habilitar los elegidos en la misma transacción.
  update public.vehicle_services set enabled=false
    where project_id=target_project_id and vehicle_id=target_vehicle_id
      and not (service_code=any(cleaned_services));
  insert into public.vehicle_services(project_id,vehicle_id,service_code,enabled)
    select target_project_id,target_vehicle_id,s,true from unnest(cleaned_services) s
    on conflict (project_id,vehicle_id,service_code) do update set enabled=true;

  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_project_id,auth.uid(),'admin_edit_driver_vehicle_full','driver_vehicle',target_vehicle_id,
    jsonb_build_object('driver_user_id',target_driver_user_id,'reason',why,
      'category_changed',category_change,
      'old',jsonb_build_object('vehicle',to_jsonb(old_vehicle)-'project_id'-'owner_user_id',
                               'services',to_jsonb(old_services)),
      'new',jsonb_build_object('vehicle',to_jsonb(new_vehicle)-'project_id'-'owner_user_id',
                               'services',to_jsonb(cleaned_services))));
  return jsonb_build_object('id',new_vehicle.id,'category_code',new_vehicle.category_code,
     'services',to_jsonb(cleaned_services),'updated',true);
end;
$function$;
revoke all on function public.admin_update_marketplace_driver_vehicle_full_v1(
  uuid,uuid,text,text,text,text,text,text,integer,text,integer,numeric,numeric,numeric,numeric,numeric,
  text,uuid,text[],text) from public,anon;
grant execute on function public.admin_update_marketplace_driver_vehicle_full_v1(
  uuid,uuid,text,text,text,text,text,text,integer,text,integer,numeric,numeric,numeric,numeric,numeric,
  text,uuid,text[],text) to authenticated;
