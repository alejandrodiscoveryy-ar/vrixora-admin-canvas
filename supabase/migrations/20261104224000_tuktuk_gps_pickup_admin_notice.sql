-- TUKTUK 2026-11-04: llegada GPS o manual, una sola transicion,
-- notificacion privada a Admin. PREPARADO PARA REVISION: NO APLICAR SIN APROBACION.
-- No altera precios, cancelaciones, liquidacion, ni calificacion.

-- El conductor actualiza su GPS con la RPC existente. Dos lecturas diferentes,
-- dentro del radio de 90 m y separadas >=12 s confirman la llegada.
create or replace function app_private.marketplace_autopickup_from_driver_location()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare
  j record;
  pickup_lat double precision;
  pickup_lon double precision;
  old_dist double precision;
  new_dist double precision;
  dlat double precision;
  dlon double precision;
  a double precision;
  updated_job uuid;
begin
  -- Solo la actualizacion de una posicion REAL, reciente y con precision aceptable.
  if tg_op <> 'UPDATE'
     or new.project_id <> 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid
     or new.vehicle_id is distinct from old.vehicle_id
     or new.captured_at <= old.captured_at
     or new.captured_at - old.captured_at < interval '12 seconds'
     or new.captured_at - old.captured_at > interval '55 seconds'
     or old.captured_at < now() - interval '60 seconds'
     or new.captured_at < now() - interval '45 seconds'
     or new.captured_at > now() + interval '15 seconds'
     or old.accuracy_m is null or old.accuracy_m > 35
     or new.accuracy_m is null or new.accuracy_m > 35 then
    return new;
  end if;

  for j in
    select j.id, r.details
    from public.jobs j
    join public.service_requests r
      on r.project_id=j.project_id and r.id=j.service_request_id
    where j.project_id=new.project_id
      and j.assigned_driver_user_id=new.driver_user_id
      and j.assigned_vehicle_id=new.vehicle_id
      and j.status='en_route'
      and j.test_deleted_at is null
    order by j.created_at desc
    limit 2
  loop
    if coalesce(j.details #>> '{route_origin,lat}','') !~ '^-?[0-9]+([.][0-9]+)?$'
       or coalesce(j.details #>> '{route_origin,lon}','') !~ '^-?[0-9]+([.][0-9]+)?$' then
      continue;
    end if;
    pickup_lat := (j.details #>> '{route_origin,lat}')::double precision;
    pickup_lon := (j.details #>> '{route_origin,lon}')::double precision;
    if pickup_lat not between -90 and 90 or pickup_lon not between -180 and 180 then
      continue;
    end if;

    -- Haversine en metros, sin PostGIS y sin aproximar latitudes altas.
    dlat := radians(old.latitude::double precision - pickup_lat);
    dlon := radians(old.longitude::double precision - pickup_lon);
    a := power(sin(dlat/2),2) + cos(radians(pickup_lat)) *
         cos(radians(old.latitude::double precision)) * power(sin(dlon/2),2);
    old_dist := 2 * 6371000 * asin(least(1.0,sqrt(greatest(0.0,a))));
    dlat := radians(new.latitude::double precision - pickup_lat);
    dlon := radians(new.longitude::double precision - pickup_lon);
    a := power(sin(dlat/2),2) + cos(radians(pickup_lat)) *
         cos(radians(new.latitude::double precision)) * power(sin(dlon/2),2);
    new_dist := 2 * 6371000 * asin(least(1.0,sqrt(greatest(0.0,a))));
    if old_dist > 90 or new_dist > 90 then continue; end if;

    if not app_private.marketplace_job_transition_allowed('en_route','pickup','driver') then
      return new;
    end if;

    updated_job := null;
    update public.jobs
       set status='pickup', state_version=state_version+1
     where id=j.id and project_id=new.project_id and status='en_route'
       and assigned_driver_user_id=new.driver_user_id
       and assigned_vehicle_id=new.vehicle_id
       and test_deleted_at is null
     returning id into updated_job;

    if updated_job is not null then
      insert into public.job_events(
        project_id,job_id,from_status,to_status,action,
        actor_kind,actor_user_id,operation_idempotency_key,metadata
      ) values(
        new.project_id,updated_job,'en_route','pickup','mark_pickup',
        'system',new.driver_user_id,gen_random_uuid(),
        jsonb_build_object('arrival_source','gps','accuracy_m',new.accuracy_m,
          'distance_m',round(new_dist::numeric,1),'captured_at',new.captured_at)
      );
    end if;
    exit;
  end loop;
  return new;
end;
$function$;

-- El disparador no cambia la RPC GPS ni sus protecciones de autenticacion,
-- precision, timestamps o autorizacion del vehiculo.
drop trigger if exists marketplace_autopickup_driver_location on public.marketplace_driver_locations;
create trigger marketplace_autopickup_driver_location
  after update of latitude, longitude, captured_at
  on public.marketplace_driver_locations
  for each row execute function app_private.marketplace_autopickup_from_driver_location();

-- Un solo evento de llegada: SOLO al entrar a pickup. La alerta no depende
-- de que el conductor pulse el boton; aplica tambien al GPS automatico.
create or replace function app_private.admin_marketplace_pickup_event()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare total_inserted integer := 0;
begin
  if new.project_id <> 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid
     or new.status <> 'pickup' or old.status='pickup'
     or new.is_test or new.test_deleted_at is not null then
    return new;
  end if;

  insert into public.notification_outbox(
    project_id,user_id,kind,notification_date,dedupe_key,title,body,data
  )
  select new.project_id,recipient.user_id,'admin_marketplace_pickup',current_date,
    'admin-op:pickup:' || new.id::text,
    'Recogida confirmada',
    'El conductor confirmó la llegada. Abre la ficha de la carrera.',
    jsonb_build_object(
      'kind','admin_marketplace_pickup','event_type','admin_marketplace_pickup',
      'target_audience','admin','project_id',new.project_id,
      'url','/admin/proyectos/' || new.project_id::text || '/trabajos',
      'job_id',new.id::text,'stage','pickup')
  from (
    select p.owner_id as user_id from public.projects p where p.id=new.project_id
    union
    select m.user_id from public.project_members m
    join public.project_role_permissions rp on rp.role_code=m.role
    where m.project_id=new.project_id and rp.permission_code='marketplace.view'
  ) recipient
  where exists (
    select 1 from public.push_device_tokens t
    where t.project_id=new.project_id and t.user_id=recipient.user_id
      and t.app_scope='admin' and t.platform='web' and t.enabled
  )
  on conflict (project_id,user_id,kind,dedupe_key) do nothing;

  get diagnostics total_inserted = row_count;
  if total_inserted > 0 then
    perform app_private.kick_admin_operational_push();
  end if;
  return new;
end;
$function$;

drop trigger if exists admin_marketplace_pickup_event on public.jobs;
create trigger admin_marketplace_pickup_event
  after update of status on public.jobs
  for each row execute function app_private.admin_marketplace_pickup_event();

-- Los disparadores son internos. No exponer funciones SECURITY DEFINER.
revoke all on function app_private.marketplace_autopickup_from_driver_location(),
  app_private.admin_marketplace_pickup_event()
  from PUBLIC, anon, authenticated;
