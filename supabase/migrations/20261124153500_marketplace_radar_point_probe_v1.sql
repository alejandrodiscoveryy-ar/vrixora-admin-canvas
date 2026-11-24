-- Prueba manual del radar sin crear carreras, clientes, comisiones ni asignaciones.
-- Tocar un punto -> consultar conductores Trabajando/disponibles por radios ->
-- confirmar -> aviso app_announcement identificable como simulacro.
-- Nunca alterar apply_to_test_jobs ni las reglas del despacho comercial.

create table if not exists app_private.marketplace_radar_point_probe_runs_v1 (
  project_id uuid not null references public.projects(id),
  run_id uuid not null,
  created_by uuid not null,
  center_lat numeric not null,
  center_lon numeric not null,
  recipient_count integer not null check (recipient_count between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (project_id,run_id)
);
create index if not exists marketplace_radar_point_probe_recent_v1
  on app_private.marketplace_radar_point_probe_runs_v1(project_id,created_at desc);
alter table app_private.marketplace_radar_point_probe_runs_v1 enable row level security;
revoke all on app_private.marketplace_radar_point_probe_runs_v1 from public,anon,authenticated;

create or replace function public.admin_preview_marketplace_radar_point_probe_v1(
  target_project_id uuid,
  target_lat numeric,
  target_lon numeric
) returns jsonb
language plpgsql stable security definer
set search_path to ''
as $function$
declare
  v_settings public.project_marketplace_dispatch_settings%rowtype;
  v_radii numeric[] := array[]::numeric[];
  v_drivers jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'settings.manage');
  if target_lat is null or target_lon is null
    or target_lat not between 18 and 24.5 or target_lon not between -85.5 and -73
  then
    raise exception 'RADAR_PROBE_POINT_OUTSIDE_CUBA' using errcode='22023';
  end if;
  select * into v_settings
    from public.project_marketplace_dispatch_settings
    where project_id=target_project_id;
  if not found or not coalesce(v_settings.enabled,false)
    or not coalesce(v_settings.radius_search_enabled,false)
  then
    raise exception 'RADAR_PROBE_SEARCH_DISABLED' using errcode='22023';
  end if;
  if v_settings.radius_1_enabled then v_radii:=array_append(v_radii,v_settings.radius_1_km); end if;
  if v_settings.radius_2_enabled then v_radii:=array_append(v_radii,v_settings.radius_2_km); end if;
  if v_settings.radius_3_enabled then v_radii:=array_append(v_radii,v_settings.radius_3_km); end if;
  if array_length(v_radii,1) is null then
    raise exception 'RADAR_PROBE_NO_RADIUS' using errcode='22023';
  end if;

  with locations as (
    select distinct on (a.driver_user_id)
      a.driver_user_id, v.category_code, coalesce(nullif(btrim(p.display_name),''),'Conductor') as display_name,
      pos.latitude, pos.longitude, pos.captured_at, pos.is_live,
      app_private.marketplace_haversine_km(
        target_lat,target_lon,pos.latitude,pos.longitude
      ) as km
    from public.driver_vehicle_assignments a
    join public.driver_profiles d
      on d.project_id=a.project_id and d.user_id=a.driver_user_id
    join public.vehicles v
      on v.project_id=a.project_id and v.id=a.vehicle_id
    left join public.profiles p on p.id=a.driver_user_id
    join lateral (
      select q.latitude,q.longitude,q.captured_at,q.is_live
      from (
        select l.latitude,l.longitude,l.captured_at,
          (l.captured_at >= now()-interval '5 minutes') as is_live,0 as source_priority
        from public.marketplace_driver_locations l
        where l.project_id=a.project_id and l.driver_user_id=a.driver_user_id and l.vehicle_id=a.vehicle_id
        union all
        select h.latitude,h.longitude,h.captured_at,false as is_live,1 as source_priority
        from app_private.marketplace_driver_last_confirmed_gps_v1 h
        where h.project_id=a.project_id and h.driver_user_id=a.driver_user_id and h.vehicle_id=a.vehicle_id
        union all
        select s.coverage_latitude,s.coverage_longitude,s.coverage_captured_at,false as is_live,2 as source_priority
        from app_private.marketplace_driver_presence_v2 s
        where s.project_id=a.project_id and s.driver_user_id=a.driver_user_id and s.vehicle_id=a.vehicle_id
      ) q
      where q.latitude between 18 and 24.5 and q.longitude between -85.5 and -73
        and q.captured_at <= now()+interval '5 minutes'
      order by q.captured_at desc,q.source_priority
      limit 1
    ) pos on true
    where a.project_id=target_project_id
      and a.is_active and a.accepting_jobs and a.is_available
      and d.status='active' and d.activated_at is not null and d.suspended_at is null
      and v.marketplace_status='active' and v.deleted_at is null
    order by a.driver_user_id,a.vehicle_id
  ),
  staged as (
    select *,case
      when km<=v_radii[1] then 1
      when km<=v_radii[2] then 2
      when km<=v_radii[3] then 3
      else null
    end as stage
    from locations
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'driverUserId',driver_user_id,
      'displayName',display_name,
      'category',category_code,
      'lat',latitude,'lon',longitude,
      'distanceKm',round(km,2),
      'stage',stage,
      'gpsRecent',is_live,
      'capturedAt',captured_at
    ) order by stage,km,driver_user_id),'[]'::jsonb)
    into v_drivers
  from staged where stage is not null;

  if jsonb_array_length(v_drivers)>500 then
    raise exception 'RADAR_PROBE_AUDIENCE_TOO_LARGE' using errcode='22023';
  end if;
  return jsonb_build_object(
    'checkedAt',now(),
    'centerLat',target_lat,'centerLon',target_lon,
    'radiiKm',to_jsonb(v_radii),
    'count',jsonb_array_length(v_drivers),
    'drivers',v_drivers,
    'note','Posiciones confirmadas o historicas; esta es una prueba de cobertura, no una carrera real.'
  );
end;
$function$;

create or replace function public.admin_send_marketplace_radar_point_probe_v1(
  target_project_id uuid,
  target_lat numeric,
  target_lon numeric,
  target_run_id uuid
) returns jsonb
language plpgsql security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_preview jsonb;
  v_n integer;
  v_inserted integer;
  v_prior app_private.marketplace_radar_point_probe_runs_v1%rowtype;
  v_row record;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'settings.manage');
  if v_actor is null or target_run_id is null then
    raise exception 'RADAR_PROBE_AUTH_REQUIRED' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.marketplace_test_mode m
    where m.project_id=target_project_id and m.enabled
  ) then
    raise exception 'RADAR_PROBE_TEST_MODE_DISABLED' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('radar-point-probe:'||target_project_id::text,0)
  );
  select * into v_prior
  from app_private.marketplace_radar_point_probe_runs_v1
  where project_id=target_project_id and run_id=target_run_id;
  if found then
    if v_prior.center_lat is distinct from target_lat
      or v_prior.center_lon is distinct from target_lon
      or v_prior.created_by is distinct from v_actor
    then
      raise exception 'RADAR_PROBE_IDEMPOTENCY_MISMATCH' using errcode='22023';
    end if;
    return jsonb_build_object('runId',target_run_id,'count',v_prior.recipient_count,'replayed',true);
  end if;
  if exists(
    select 1 from app_private.marketplace_radar_point_probe_runs_v1
    where project_id=target_project_id and created_at>now()-interval '60 seconds'
  ) then
    raise exception 'RADAR_PROBE_COOLDOWN_60_SECONDS' using errcode='22023';
  end if;
  v_preview:=public.admin_preview_marketplace_radar_point_probe_v1(
    target_project_id,target_lat,target_lon
  );
  v_n:=(v_preview->>'count')::integer;
  if v_n<1 then raise exception 'RADAR_PROBE_NO_DRIVERS_IN_RADAR' using errcode='22023'; end if;
  insert into app_private.marketplace_radar_point_probe_runs_v1(
    project_id,run_id,created_by,center_lat,center_lon,recipient_count
  ) values(target_project_id,target_run_id,v_actor,target_lat,target_lon,v_n);

  insert into public.notification_outbox (
    project_id,user_id,kind,notification_date,dedupe_key,title,body,data
  )
  select target_project_id,
    (recipient->>'driverUserId')::uuid,
    'app_announcement',current_date,
    'radar-point-test:'||target_run_id::text,
    'PRUEBA · Radar TukTuk',
    'Tu vehículo figura dentro del radar de una prueba. No es una carrera real ni requiere aceptación.',
    jsonb_build_object(
      'event_type','radar_point_test',
      'radar_test',true,
      'radar_run_id',target_run_id::text,
      'radar_stage',(recipient->>'stage')::integer,
      'radar_distance_km',recipient->>'distanceKm',
      'target_audience','client'
    )
  from jsonb_array_elements(v_preview->'drivers') recipient
  on conflict(project_id,user_id,kind,dedupe_key) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_n then
    raise exception 'RADAR_PROBE_RECIPIENT_COUNT_MISMATCH' using errcode='40001';
  end if;

  -- Despertar el worker de avisos actual, sin crear canales ni cron nuevos.
  begin
    perform net.http_post(
      url:='https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/send-push-notifications',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-tuktuk-dispatch-secret',(
          select decrypted_secret from vault.decrypted_secrets
          where name='tuktuk_push_dispatch_secret' limit 1
        )
      ),
      body:=jsonb_build_object('limit',100,'max_batches',5,'concurrency',8,'time_budget_ms',45000),
      timeout_milliseconds:=5000
    );
  exception when others then
    raise warning 'RADAR_PROBE_WORKER_WAKE_FAILED: %',SQLSTATE;
  end;
  return jsonb_build_object(
    'runId',target_run_id,'count',v_n,'replayed',false,
    'drivers',v_preview->'drivers'
  );
end;
$function$;

create or replace function public.admin_get_marketplace_radar_point_probe_status_v1(
  target_project_id uuid,
  target_run_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path to ''
as $function$
declare
  v_run app_private.marketplace_radar_point_probe_runs_v1%rowtype;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'settings.manage');
  select * into v_run from app_private.marketplace_radar_point_probe_runs_v1
  where project_id=target_project_id and run_id=target_run_id;
  if not found then raise exception 'RADAR_PROBE_RUN_NOT_FOUND' using errcode='22023'; end if;
  return (
    select jsonb_build_object(
      'runId',target_run_id,'count',v_run.recipient_count,
      'sent',count(*) filter(where delivery_status='sent'),
      'failed',count(*) filter(where delivery_status='failed'),
      'skipped',count(*) filter(where delivery_status='skipped'),
      'pending',count(*) filter(where delivery_status in ('pending','processing')),
      'recipients',coalesce(jsonb_agg(jsonb_build_object(
        'driverUserId',user_id,'status',delivery_status,'sentAt',sent_at,'openedAt',read_at
      ) order by user_id),'[]'::jsonb)
    )
    from public.notification_outbox
    where project_id=target_project_id and kind='app_announcement'
      and dedupe_key='radar-point-test:'||target_run_id::text
  );
end;
$function$;

revoke all on function public.admin_preview_marketplace_radar_point_probe_v1(uuid,numeric,numeric) from public,anon,authenticated;
revoke all on function public.admin_send_marketplace_radar_point_probe_v1(uuid,numeric,numeric,uuid) from public,anon,authenticated;
revoke all on function public.admin_get_marketplace_radar_point_probe_status_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_preview_marketplace_radar_point_probe_v1(uuid,numeric,numeric) to authenticated;
grant execute on function public.admin_send_marketplace_radar_point_probe_v1(uuid,numeric,numeric,uuid) to authenticated;
grant execute on function public.admin_get_marketplace_radar_point_probe_status_v1(uuid,uuid) to authenticated;
