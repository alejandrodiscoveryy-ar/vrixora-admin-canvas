-- TUKTUK Ficha 360 Premium: migration proposed for review only, NOT DEPLOYED.
-- Production deployment requires separate authorization.
create or replace function public.admin_get_marketplace_driver_management_v1(
  target_project_id uuid, target_driver_user_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  d public.driver_profiles%rowtype;
  p public.profiles%rowtype;
  v public.vehicles%rowtype;
  active_assignment boolean := false;
  vehicle_id text;
  checks jsonb;
  assets jsonb;
  alerts jsonb;
  a_total integer;
  a_accepted integer;
  a_unaccepted integer;
  a_open integer;
  a_cancelled integer;
  a_reminders integer;
  a_first timestamptz;
  audit_log jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.manage');
  select * into d from public.driver_profiles
  where project_id = target_project_id and user_id = target_driver_user_id;
  if not found then raise exception 'DRIVER_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into p from public.profiles where id = target_driver_user_id;
  select vv, a.is_active into v, active_assignment
  from public.vehicles vv
  join public.driver_vehicle_assignments a
    on a.project_id = vv.project_id and a.vehicle_id = vv.id
   and a.driver_user_id = target_driver_user_id
  where vv.project_id = target_project_id and vv.deleted_at is null
  order by a.is_active desc, vv.created_at desc, vv.id limit 1;
  vehicle_id := v.id;

  checks := jsonb_build_array(
    jsonb_build_object('key','not_suspended','label','Conductor sin suspensión','ok',d.status <> 'suspended' and d.suspended_at is null),
    jsonb_build_object('key','display_name','label','Nombre y apellidos','ok', coalesce(nullif(btrim(p.display_name),'') is not null,false)),
    jsonb_build_object('key','phone','label','Teléfono internacional válido','ok',coalesce(p.phone ~ '^[+][1-9][0-9]{7,14}$',false)),
    jsonb_build_object('key','driver_photo','label','Fotografía del conductor','ok',exists(
      select 1 from public.media_assets a where a.project_id=target_project_id and a.id=d.photo_asset_id
      and a.owner_user_id=target_driver_user_id and a.asset_kind='driver_photo' and a.status='available')),
    jsonb_build_object('key','document_type','label','Carnet o licencia seleccionados',
      'ok',not d.identity_docs_required or not d.identity_document_type_required or coalesce(d.identity_document_type in ('national_id','driver_license'),false)),
    jsonb_build_object('key','identity_front','label','Documento: frente','ok',not d.identity_docs_required or exists(
      select 1 from public.media_assets a where a.project_id=target_project_id and a.id=d.identity_front_asset_id
      and a.owner_user_id=target_driver_user_id and a.asset_kind='identity_front'
      and a.storage_bucket='marketplace-identity' and a.status='available')),
    jsonb_build_object('key','identity_back','label','Documento: dorso','ok',not d.identity_docs_required or exists(
      select 1 from public.media_assets a where a.project_id=target_project_id and a.id=d.identity_back_asset_id
      and a.owner_user_id=target_driver_user_id and a.asset_kind='identity_back'
      and a.storage_bucket='marketplace-identity' and a.status='available')),
    jsonb_build_object('key','active_vehicle','label','Vehículo operativo asociado','ok',coalesce(active_assignment,false) and vehicle_id is not null and v.marketplace_status <> 'suspended'),
    jsonb_build_object('key','category','label','Categoría del vehículo','ok',coalesce(nullif(btrim(v.category_code),'') is not null,false)),
    jsonb_build_object('key','propulsion','label','Propulsión del vehículo','ok',coalesce(nullif(btrim(v.propulsion_code),'') is not null,false)),
    jsonb_build_object('key','brand','label','Marca del vehículo','ok',coalesce(nullif(btrim(v.brand),'') is not null,false)),
    jsonb_build_object('key','model','label','Modelo del vehículo','ok',coalesce(nullif(btrim(v.model),'') is not null,false)),
    jsonb_build_object('key','vehicle_photo','label','Fotografía del vehículo','ok',exists(
      select 1 from public.media_assets a where a.project_id=target_project_id and a.id=v.main_photo_asset_id
      and a.owner_user_id=target_driver_user_id and a.asset_kind='vehicle_photo' and a.status='available')),
    jsonb_build_object('key','service','label','Al menos una modalidad activa','ok',exists(
      select 1 from public.vehicle_services vs join public.service_types st
       on st.project_id=vs.project_id and st.code=vs.service_code and st.active
       where vs.project_id=target_project_id and vs.vehicle_id=vehicle_id and vs.enabled)),
    jsonb_build_object('key','passenger_capacity','label','Capacidad para pasajeros/turismo','ok',
       not exists(select 1 from public.vehicle_services vs where vs.project_id=target_project_id
        and vs.vehicle_id=vehicle_id and vs.enabled and vs.service_code in ('passenger','tourism')) or coalesce(v.passenger_capacity,0)>0),
    jsonb_build_object('key','cargo_capacity','label','Capacidad para carga','ok',
       not exists(select 1 from public.vehicle_services vs where vs.project_id=target_project_id
        and vs.vehicle_id=vehicle_id and vs.enabled and vs.service_code='cargo') or greatest(
       coalesce(v.cargo_capacity_kg,0),coalesce(v.cargo_volume_m3,0),coalesce(v.cargo_length_cm,0),
       coalesce(v.cargo_width_cm,0),coalesce(v.cargo_height_cm,0))>0)
  );

  -- Only linked, available assets. Never expose raw storage paths in this RPC.
  select coalesce(jsonb_agg(jsonb_build_object('id',ma.id,'kind',x.kind,'label',x.label)
    order by x.ordering), '[]'::jsonb) into assets
  from (
    select d.photo_asset_id id,'driver_photo' kind,'Foto del conductor' label,1 ordering
    union all select d.identity_front_asset_id,'identity_front','Identidad: frente',2
    union all select d.identity_back_asset_id,'identity_back','Identidad: dorso',3
    union all select v.main_photo_asset_id,'vehicle_photo','Foto del vehículo',4
  ) x join public.media_assets ma on ma.id=x.id and ma.project_id=target_project_id
     and ma.owner_user_id=target_driver_user_id and ma.asset_kind=x.kind
     and ma.status='available'
     and ma.storage_bucket=case when x.kind like 'identity_%' then 'marketplace-identity' else 'marketplace-media' end;

  -- One opportunity per job, regardless of reminder count; delivery_status sent means
  -- dispatch was recorded, NOT that the phone showed or the driver read it.
  with opportunities as (
    select j.id job_id,j.service_code,j.status job_status,j.assigned_driver_user_id,
      min(n.sent_at) first_sent,max(n.sent_at) last_sent,count(*)::integer deliveries,
      count(*) filter (where n.data->>'reminder_index' ~ '^[1-9][0-9]*$')::integer reminders,
      case when j.assigned_driver_user_id=target_driver_user_id then 'accepted'
           when j.status='published' and (j.expires_at is null or j.expires_at > now()) then 'pending'
           when j.status like 'cancelled%' then 'cancelled'
           when j.assigned_driver_user_id is not null then 'accepted_other'
           when j.status='expired' or (j.expires_at is not null and j.expires_at<=now()) then 'expired'
           else 'other' end outcome
    from public.notification_outbox n
    join public.jobs j on j.project_id=n.project_id
     and j.id::text=(n.data->>'job_id')
    where n.project_id=target_project_id and n.user_id=target_driver_user_id
      and n.kind='marketplace_job_available' and n.delivery_status='sent'
      and n.sent_at is not null and not j.is_test and j.test_deleted_at is null
    group by j.id,j.service_code,j.status,j.assigned_driver_user_id,j.expires_at
  )
  select count(*)::integer,
    count(*) filter (where outcome='accepted')::integer,
    count(*) filter (where outcome in ('accepted_other','expired'))::integer,
    count(*) filter (where outcome='pending')::integer,
    count(*) filter (where outcome='cancelled')::integer,
    coalesce(sum(reminders),0)::integer,min(first_sent)
  into a_total,a_accepted,a_unaccepted,a_open,a_cancelled,a_reminders,a_first
  from opportunities;

  with opportunities as (
    select j.id job_id,j.service_code,j.status job_status,j.assigned_driver_user_id,
      min(n.sent_at) first_sent,max(n.sent_at) last_sent,count(*)::integer deliveries,
      count(*) filter (where n.data->>'reminder_index' ~ '^[1-9][0-9]*$')::integer reminders,
      case when j.assigned_driver_user_id=target_driver_user_id then 'accepted'
           when j.status='published' and (j.expires_at is null or j.expires_at > now()) then 'pending'
           when j.status like 'cancelled%' then 'cancelled'
           when j.assigned_driver_user_id is not null then 'accepted_other'
           when j.status='expired' or (j.expires_at is not null and j.expires_at<=now()) then 'expired'
           else 'other' end outcome
    from public.notification_outbox n
    join public.jobs j on j.project_id=n.project_id
      and j.id::text=(n.data->>'job_id')
    where n.project_id=target_project_id and n.user_id=target_driver_user_id
      and n.kind='marketplace_job_available' and n.delivery_status='sent'
      and n.sent_at is not null and not j.is_test and j.test_deleted_at is null
    group by j.id,j.service_code,j.status,j.assigned_driver_user_id,j.expires_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('job_id',x.job_id,'service_code',x.service_code,
     'first_sent',x.first_sent,'last_sent',x.last_sent,'deliveries',x.deliveries,
     'reminders',x.reminders,'outcome',x.outcome,'job_status',x.job_status)
     order by x.last_sent desc), '[]'::jsonb) into alerts
  from (select * from opportunities order by last_sent desc limit 30) x;

  select coalesce(jsonb_agg(jsonb_build_object('action',log.action,'at',log.created_at,
    'reason',log.metadata->>'reason','actor_id',log.actor_id) order by log.created_at desc),'[]'::jsonb)
    into audit_log from (select a.action,a.created_at,a.metadata,a.actor_id from public.audit_events a
      where a.project_id=target_project_id and
      ((a.entity_type='driver_profile' and a.entity_id=target_driver_user_id::text)
       or (a.entity_type='driver_vehicle' and a.metadata->>'driver_user_id'=target_driver_user_id::text))
      order by a.created_at desc limit 30) log;

  return jsonb_build_object(
    'audit_events',audit_log,
    'driver',jsonb_build_object('display_name',p.display_name,'phone',p.phone,
      'status',d.status,'identity_type',d.identity_document_type,'vehicle_id',vehicle_id,
      'vehicle_brand',v.brand,'vehicle_model',v.model,'registration',v.registration),
    'checklist',checks,
    'onboarding_complete',coalesce(app_private.marketplace_onboarding_requirements_complete(target_driver_user_id,vehicle_id),false),
    'document_assets',assets,
    'notifications',jsonb_build_object('total',coalesce(a_total,0),'accepted',coalesce(a_accepted,0),
       'not_accepted',coalesce(a_unaccepted,0),'pending',coalesce(a_open,0),
       'cancelled',coalesce(a_cancelled,0),'reminders',coalesce(a_reminders,0),
       'first_recorded',a_first,'events',alerts)
  );
end;
$function$;
revoke all on function public.admin_get_marketplace_driver_management_v1(uuid,uuid) from public,anon;
grant execute on function public.admin_get_marketplace_driver_management_v1(uuid,uuid) to authenticated;

create or replace function public.admin_update_marketplace_driver_contact_v1(
  target_project_id uuid,target_driver_user_id uuid,target_display_name text,target_phone text,
  target_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  old_profile public.profiles%rowtype;
  new_profile public.profiles%rowtype;
  why text:=nullif(btrim(target_reason),'');
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.driver_profiles where project_id=target_project_id
      and user_id=target_driver_user_id) then
    raise exception 'DRIVER_NOT_FOUND' using errcode='P0002';
  end if;
  if length(btrim(coalesce(target_display_name,''))) not between 2 and 120
     or coalesce(target_phone,'') !~ '^[+][1-9][0-9]{7,14}$'
     or length(coalesce(why,'')) not between 5 and 300 then
    raise exception 'INVALID_DRIVER_EDIT' using errcode='22023';
  end if;
  select * into old_profile from public.profiles where id=target_driver_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode='P0002'; end if;
  update public.profiles set display_name=btrim(target_display_name),phone=target_phone,
    updated_at=now() where id=target_driver_user_id returning * into new_profile;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_project_id,auth.uid(),'admin_edit_driver_contact','driver_profile',target_driver_user_id::text,
   jsonb_build_object('reason',why,'old',jsonb_build_object('display_name',old_profile.display_name,
    'phone',old_profile.phone),'new',jsonb_build_object('display_name',new_profile.display_name,'phone',new_profile.phone)));
  return jsonb_build_object('display_name',new_profile.display_name,'phone',new_profile.phone);
end;
$function$;
revoke all on function public.admin_update_marketplace_driver_contact_v1(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.admin_update_marketplace_driver_contact_v1(uuid,uuid,text,text,text) to authenticated;

create or replace function public.admin_update_marketplace_driver_vehicle_info_v1(
  target_project_id uuid,target_driver_user_id uuid,target_vehicle_id text,
  target_brand text,target_model text,target_registration text,target_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  previous public.vehicles%rowtype;
  updated public.vehicles%rowtype;
  why text:=nullif(btrim(target_reason),'');
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if length(btrim(coalesce(target_brand,''))) not between 2 and 100
    or length(btrim(coalesce(target_model,''))) not between 1 and 100
    or length(coalesce(target_registration,'')) > 25
    or length(coalesce(why,'')) not between 5 and 300 then
    raise exception 'INVALID_VEHICLE_EDIT' using errcode='22023';
  end if;
  select * into previous from public.vehicles v where v.project_id=target_project_id
    and v.id=target_vehicle_id and v.owner_user_id=target_driver_user_id and v.deleted_at is null
    and exists(select 1 from public.driver_vehicle_assignments a
      where a.project_id=v.project_id and a.vehicle_id=v.id and a.driver_user_id=target_driver_user_id)
    for update;
  if not found then raise exception 'VEHICLE_NOT_FOUND_OR_NOT_OWNED' using errcode='P0002'; end if;
  update public.vehicles set brand=btrim(target_brand),model=btrim(target_model),
    registration=nullif(btrim(target_registration),''),updated_at=now()
  where project_id=target_project_id and id=target_vehicle_id returning * into updated;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_project_id,auth.uid(),'admin_edit_driver_vehicle','driver_vehicle',target_vehicle_id,
    jsonb_build_object('driver_user_id',target_driver_user_id,'reason',why,
      'old',jsonb_build_object('brand',previous.brand,'model',previous.model,'registration',previous.registration),
      'new',jsonb_build_object('brand',updated.brand,'model',updated.model,'registration',updated.registration)));
  return jsonb_build_object('id',updated.id,'brand',updated.brand,'model',updated.model,'registration',updated.registration);
end;
$function$;
revoke all on function public.admin_update_marketplace_driver_vehicle_info_v1(uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.admin_update_marketplace_driver_vehicle_info_v1(uuid,uuid,text,text,text,text,text) to authenticated;

create or replace function public.admin_log_marketplace_driver_document_access_v1(
  target_project_id uuid,target_driver_user_id uuid,target_asset_id uuid
) returns boolean language plpgsql security definer set search_path='' as $function$
declare
  asset_kind text;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select a.asset_kind into asset_kind from public.media_assets a
  join public.driver_profiles d on d.project_id=a.project_id and d.user_id=a.owner_user_id
  where a.project_id=target_project_id and a.owner_user_id=target_driver_user_id
    and a.id=target_asset_id and a.status='available'
    and (
      (a.asset_kind='driver_photo' and d.photo_asset_id=a.id and a.storage_bucket='marketplace-media')
      or (a.asset_kind='identity_front' and d.identity_front_asset_id=a.id and a.storage_bucket='marketplace-identity')
      or (a.asset_kind='identity_back' and d.identity_back_asset_id=a.id and a.storage_bucket='marketplace-identity')
      or (a.asset_kind='vehicle_photo' and a.storage_bucket='marketplace-media' and exists(
        select 1 from public.vehicles v join public.driver_vehicle_assignments dva
         on dva.project_id=v.project_id and dva.vehicle_id=v.id
        where v.project_id=target_project_id and v.owner_user_id=target_driver_user_id
          and v.deleted_at is null and v.main_photo_asset_id=a.id and dva.driver_user_id=target_driver_user_id
      ))
    );
  if asset_kind is null then raise exception 'DOCUMENT_NOT_AUTHORIZED' using errcode='42501'; end if;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    values(target_project_id,auth.uid(),'admin_view_driver_document','driver_profile',target_driver_user_id::text,
      jsonb_build_object('asset_id',target_asset_id,'asset_kind',asset_kind));
  return true;
end;
$function$;
revoke all on function public.admin_log_marketplace_driver_document_access_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.admin_log_marketplace_driver_document_access_v1(uuid,uuid,uuid) to authenticated;
