create table if not exists public.marketplace_driver_locations (
  project_id uuid not null,
  driver_user_id uuid not null,
  vehicle_id text not null,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_m numeric(10,2) null check (
    accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 5000)
  ),
  heading_degrees numeric(6,2) null check (
    heading_degrees is null or (heading_degrees >= 0 and heading_degrees < 360)
  ),
  speed_mps numeric(10,3) null check (
    speed_mps is null or (speed_mps >= 0 and speed_mps <= 100)
  ),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, driver_user_id),
  foreign key (project_id, driver_user_id, vehicle_id)
    references public.driver_vehicle_assignments(project_id, driver_user_id, vehicle_id)
    on delete cascade
);

comment on table public.marketplace_driver_locations is
  'Ultima ubicacion operativa conocida del conductor. V1 no conserva historial de recorrido.';

alter table public.marketplace_driver_locations enable row level security;

revoke all on table public.marketplace_driver_locations
from public, anon, authenticated;


create or replace function public.update_my_marketplace_driver_location(
  target_vehicle_id text,
  target_latitude numeric,
  target_longitude numeric,
  target_accuracy_m numeric default null,
  target_heading_degrees numeric default null,
  target_speed_mps numeric default null,
  target_captured_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  pid uuid;
  captured timestamptz := coalesce(target_captured_at, now());
  active_job boolean;
  result public.marketplace_driver_locations%rowtype;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  if target_vehicle_id is null
     or nullif(btrim(target_vehicle_id), '') is null
     or target_latitude is null
     or target_longitude is null
     or target_latitude not between -90 and 90
     or target_longitude not between -180 and 180
     or (
       target_accuracy_m is not null
       and (target_accuracy_m < 0 or target_accuracy_m > 5000)
     )
     or (
       target_heading_degrees is not null
       and (target_heading_degrees < 0 or target_heading_degrees >= 360)
     )
     or (
       target_speed_mps is not null
       and (target_speed_mps < 0 or target_speed_mps > 100)
     ) then
    raise exception 'DRIVER_LOCATION_INVALID'
      using errcode = '22023';
  end if;

  if captured > now() + interval '5 minutes'
     or captured < now() - interval '10 minutes' then
    raise exception 'DRIVER_LOCATION_TIMESTAMP_INVALID'
      using errcode = '22023';
  end if;

  select p.id
    into strict pid
  from public.projects p
  where p.slug = 'tuktuk-control';

  delete from public.marketplace_driver_locations l
  where l.project_id = pid
    and l.captured_at < now() - interval '15 minutes';

  select exists (
    select 1
    from public.jobs j
    left join public.marketplace_incident_resolutions ir
      on ir.project_id = j.project_id
     and ir.job_id = j.id
    where j.project_id = pid
      and j.assigned_driver_user_id = actor
      and j.assigned_vehicle_id = target_vehicle_id
      and j.test_deleted_at is null
      and (
        j.status in ('accepted','en_route','pickup','in_progress')
        or (j.status = 'incident' and ir.id is null)
      )
  )
  into active_job;

  if not exists (
    select 1
    from public.driver_vehicle_assignments a
    join public.driver_profiles d
      on d.project_id = a.project_id
     and d.user_id = a.driver_user_id
    join public.vehicles v
      on v.project_id = a.project_id
     and v.id = a.vehicle_id
    where a.project_id = pid
      and a.driver_user_id = actor
      and a.vehicle_id = target_vehicle_id
      and a.is_active
      and d.status = 'active'
      and d.activated_at is not null
      and d.suspended_at is null
      and v.marketplace_status = 'active'
      and v.deleted_at is null
      and (a.accepting_jobs or active_job)
  ) then
    raise exception 'DRIVER_LOCATION_NOT_ALLOWED'
      using errcode = '42501';
  end if;

  insert into public.marketplace_driver_locations(
    project_id,
    driver_user_id,
    vehicle_id,
    latitude,
    longitude,
    accuracy_m,
    heading_degrees,
    speed_mps,
    captured_at,
    received_at,
    updated_at
  )
  values(
    pid,
    actor,
    target_vehicle_id,
    target_latitude,
    target_longitude,
    target_accuracy_m,
    target_heading_degrees,
    target_speed_mps,
    captured,
    now(),
    now()
  )
  on conflict (project_id, driver_user_id) do update
  set vehicle_id = excluded.vehicle_id,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      accuracy_m = excluded.accuracy_m,
      heading_degrees = excluded.heading_degrees,
      speed_mps = excluded.speed_mps,
      captured_at = excluded.captured_at,
      received_at = now(),
      updated_at = now()
  where excluded.captured_at >= public.marketplace_driver_locations.captured_at;

  select l.*
    into result
  from public.marketplace_driver_locations l
  where l.project_id = pid
    and l.driver_user_id = actor;

  return jsonb_build_object(
    'driver_user_id', result.driver_user_id,
    'vehicle_id', result.vehicle_id,
    'latitude', result.latitude,
    'longitude', result.longitude,
    'accuracy_m', result.accuracy_m,
    'heading_degrees', result.heading_degrees,
    'speed_mps', result.speed_mps,
    'captured_at', result.captured_at,
    'server_time', now()
  );
end;
$function$;

revoke all on function public.update_my_marketplace_driver_location(
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  timestamptz
) from public, anon;

grant execute on function public.update_my_marketplace_driver_location(
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  timestamptz
) to authenticated;



create or replace function public.clear_my_marketplace_driver_location()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  pid uuid;
  removed boolean;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  select p.id
    into strict pid
  from public.projects p
  where p.slug = 'tuktuk-control';

  delete from public.marketplace_driver_locations l
  where l.project_id = pid
    and l.driver_user_id = actor;

  removed := found;
  return removed;
end;
$function$;

revoke all on function public.clear_my_marketplace_driver_location()
from public, anon;

grant execute on function public.clear_my_marketplace_driver_location()
to authenticated;
create or replace function public.admin_get_marketplace_operational_map(
  target_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  can_customers boolean;
  result jsonb;
begin
  perform app_private.require_project_permission(
    target_project_id,
    'marketplace.view'
  );

  delete from public.marketplace_driver_locations l
  where l.project_id = target_project_id
    and l.captured_at < now() - interval '15 minutes';

  can_customers := app_private.has_project_permission(
    target_project_id,
    'customers.view'
  );

  with selected_assignments as (
    select distinct on (a.driver_user_id)
      a.driver_user_id,
      a.vehicle_id,
      a.accepting_jobs,
      a.is_available,
      p.display_name as driver_display_name,
      v.name as vehicle_name,
      active_job.job_id,
      active_job.status as job_status
    from public.driver_vehicle_assignments a
    join public.driver_profiles d
      on d.project_id = a.project_id
     and d.user_id = a.driver_user_id
    left join public.profiles p
      on p.id = a.driver_user_id
    join public.vehicles v
      on v.project_id = a.project_id
     and v.id = a.vehicle_id
    left join lateral (
      select
        j.id as job_id,
        j.status
      from public.jobs j
      left join public.marketplace_incident_resolutions ir
        on ir.project_id = j.project_id
       and ir.job_id = j.id
      where j.project_id = a.project_id
        and j.assigned_driver_user_id = a.driver_user_id
        and j.assigned_vehicle_id = a.vehicle_id
        and j.test_deleted_at is null
        and (
          j.status in (
            'accepted',
            'en_route',
            'pickup',
            'in_progress'
          )
          or (
            j.status = 'incident'
            and ir.id is null
          )
        )
      order by j.updated_at desc, j.id desc
      limit 1
    ) active_job on true
    where a.project_id = target_project_id
      and a.is_active
      and d.status = 'active'
      and d.activated_at is not null
      and d.suspended_at is null
      and v.marketplace_status = 'active'
      and v.deleted_at is null
      and (
        a.accepting_jobs
        or active_job.job_id is not null
      )
    order by
      a.driver_user_id,
      (active_job.job_id is not null) desc,
      a.accepting_jobs desc,
      a.updated_at desc
  ),
  drivers as (
    select
      a.driver_user_id,
      a.driver_display_name,
      a.vehicle_id,
      a.vehicle_name,
      a.accepting_jobs,
      a.is_available,
      a.job_id,
      a.job_status,
      case when freshness.location_fresh then l.latitude end as latitude,
      case when freshness.location_fresh then l.longitude end as longitude,
      case when freshness.location_fresh then l.accuracy_m end as accuracy_m,
      case when freshness.location_fresh then l.heading_degrees end as heading_degrees,
      case when freshness.location_fresh then l.speed_mps end as speed_mps,
      l.captured_at,
      freshness.freshness_seconds,
      freshness.location_fresh
    from selected_assignments a
    left join public.marketplace_driver_locations l
      on l.project_id = target_project_id
     and l.driver_user_id = a.driver_user_id
     and l.vehicle_id = a.vehicle_id
    cross join lateral (
      select
        case
          when a.job_id is not null then 120
          else 300
        end as freshness_seconds,
        (
          l.captured_at is not null
          and l.captured_at >= now() - (
            case
              when a.job_id is not null then interval '120 seconds'
              else interval '300 seconds'
            end
          )
        ) as location_fresh
    ) freshness
  ),
  active_jobs as (
    select
      j.id as job_id,
      j.status,
      j.service_code,
      sr.origin_text,
      sr.destination_text,
      case
        when sr.details #>> '{route_origin,lat}'
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{route_origin,lat}')::numeric
      end as origin_lat,
      case
        when sr.details #>> '{route_origin,lon}'
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{route_origin,lon}')::numeric
      end as origin_lon,
      case
        when sr.details #>> '{route_destination,lat}'
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{route_destination,lat}')::numeric
      end as destination_lat,
      case
        when sr.details #>> '{route_destination,lon}'
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{route_destination,lon}')::numeric
      end as destination_lon,
      case
        when can_customers then c.display_name
      end as customer_display_name,
      j.assigned_driver_user_id,
      j.assigned_vehicle_id,
      p.display_name as driver_display_name,
      v.name as vehicle_name,
      j.created_at,
      j.updated_at
    from public.jobs j
    join public.service_requests sr
      on sr.project_id = j.project_id
     and sr.id = j.service_request_id
    join public.customers c
      on c.project_id = sr.project_id
     and c.id = sr.customer_id
    left join public.profiles p
      on p.id = j.assigned_driver_user_id
    left join public.vehicles v
      on v.project_id = j.project_id
     and v.id = j.assigned_vehicle_id
    left join public.marketplace_incident_resolutions ir
      on ir.project_id = j.project_id
     and ir.job_id = j.id
    where j.project_id = target_project_id
      and coalesce(j.is_test, false) = false
      and j.test_deleted_at is null
      and (
        j.status in (
          'published',
          'accepted',
          'en_route',
          'pickup',
          'in_progress'
        )
        or (
          j.status = 'incident'
          and ir.id is null
        )
      )
  )
  select jsonb_build_object(
    'server_time', now(),
    'freshness_seconds', 300,
    'summary', jsonb_build_object(
      'working_drivers',
      (select count(*) from drivers),
      'drivers_with_fresh_location',
      (select count(*) from drivers where location_fresh),
      'active_jobs',
      (select count(*) from active_jobs)
    ),
    'drivers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'driver_user_id', d.driver_user_id,
          'driver_display_name', d.driver_display_name,
          'vehicle_id', d.vehicle_id,
          'vehicle_name', d.vehicle_name,
          'accepting_jobs', d.accepting_jobs,
          'is_available', d.is_available,
          'active_job_id', d.job_id,
          'active_job_status', d.job_status,
          'latitude', d.latitude,
          'longitude', d.longitude,
          'accuracy_m', d.accuracy_m,
          'heading_degrees', d.heading_degrees,
          'speed_mps', d.speed_mps,
          'captured_at', d.captured_at,
          'freshness_seconds', d.freshness_seconds,
          'location_fresh', d.location_fresh
        )
        order by d.driver_display_name nulls last, d.driver_user_id
      )
      from drivers d
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'job_id', j.job_id,
          'status', j.status,
          'service_code', j.service_code,
          'origin_text', j.origin_text,
          'destination_text', j.destination_text,
          'origin_lat', j.origin_lat,
          'origin_lon', j.origin_lon,
          'destination_lat', j.destination_lat,
          'destination_lon', j.destination_lon,
          'customer_display_name', j.customer_display_name,
          'driver_user_id', j.assigned_driver_user_id,
          'vehicle_id', j.assigned_vehicle_id,
          'driver_display_name', j.driver_display_name,
          'vehicle_name', j.vehicle_name,
          'created_at', j.created_at,
          'updated_at', j.updated_at
        )
        order by j.created_at desc, j.job_id desc
      )
      from active_jobs j
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$function$;

revoke all on function public.admin_get_marketplace_operational_map(uuid)
from public, anon;

grant execute on function public.admin_get_marketplace_operational_map(uuid)
to authenticated;