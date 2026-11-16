-- Record the start of the actual availability session. No speculative backfill.
-- Existing open shifts remain unknown until the next genuine state transition.
BEGIN;
ALTER TABLE public.driver_vehicle_assignments ADD COLUMN IF NOT EXISTS working_since timestamptz;

CREATE OR REPLACE FUNCTION app_private.track_marketplace_working_since()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce(NEW.is_active AND NEW.accepting_jobs, false) THEN
    NEW.working_since := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.working_since := statement_timestamp();
  ELSIF NOT coalesce(OLD.is_active AND OLD.accepting_jobs, false) THEN
    NEW.working_since := statement_timestamp();
  ELSE
    -- Heartbeats, jobs and edits must not restart a working session.
    NEW.working_since := OLD.working_since;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.track_marketplace_working_since() FROM PUBLIC, anon, authenticated;
-- Sort after the existing availability guard so we record the final state.
DROP TRIGGER IF EXISTS zz_driver_vehicle_assignments_working_since ON public.driver_vehicle_assignments;
CREATE TRIGGER zz_driver_vehicle_assignments_working_since
BEFORE INSERT OR UPDATE ON public.driver_vehicle_assignments
FOR EACH ROW EXECUTE FUNCTION app_private.track_marketplace_working_since();

CREATE OR REPLACE FUNCTION public.admin_get_marketplace_operational_map(target_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  can_customers boolean;
  result jsonb;
begin
  perform app_private.require_project_permission(
    target_project_id,
    'marketplace.view'
  );

  -- No eliminar ubicaciones antiguas al consultar el mapa.

  can_customers := app_private.has_project_permission(
    target_project_id,
    'customers.view'
  );

  with selected_assignments as (
    select distinct on (a.driver_user_id)
      a.driver_user_id,
      a.vehicle_id,
      a.accepting_jobs,
      case when a.accepting_jobs and a.is_active then a.working_since end as working_since,
      a.is_available,
      p.display_name as driver_display_name,
      v.name as vehicle_name,
      v.category_code as vehicle_category_code,
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
      a.vehicle_category_code,
      a.accepting_jobs,
      a.working_since,
      a.is_available,
      a.job_id,
      a.job_status,
      case when freshness.location_fresh then l.latitude end as latitude,
      case when freshness.location_fresh then l.longitude end as longitude,
      coalesce(l.latitude,s.coverage_latitude) as last_latitude,
      coalesce(l.longitude,s.coverage_longitude) as last_longitude,
      coalesce(l.accuracy_m,case when s.coverage_latitude is not null then 1500::numeric end) as last_accuracy_m,
      case when freshness.location_fresh then l.accuracy_m end as accuracy_m,
      case when freshness.location_fresh then l.heading_degrees end as heading_degrees,
      case when freshness.location_fresh then l.speed_mps end as speed_mps,
      coalesce(l.captured_at,s.coverage_captured_at) as captured_at,
      freshness.freshness_seconds,
      freshness.location_fresh
    from selected_assignments a
    left join public.marketplace_driver_locations l
      on l.project_id = target_project_id
     and l.driver_user_id = a.driver_user_id
     and l.vehicle_id = a.vehicle_id
    left join app_private.marketplace_driver_presence_v2 s
      on s.project_id=target_project_id and s.driver_user_id=a.driver_user_id and s.vehicle_id=a.vehicle_id
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
      case when j.status='published' and j.assigned_driver_user_id is null and j.expires_at<=now() then 'expired' else j.status end as status,
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
        when sr.details #>> '{estimated_distance_km}'
          ~ '^[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{estimated_distance_km}')::numeric
      end as estimated_distance_km,
      case
        when sr.details #>> '{route_duration_seconds}'
          ~ '^[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{route_duration_seconds}')::numeric
      end as route_duration_seconds,
      case
        when can_customers then c.id
      end as customer_id,
      case
        when can_customers then c.display_name
      end as customer_display_name,
      j.assigned_driver_user_id,
      j.assigned_vehicle_id,
      p.display_name as driver_display_name,
      v.name as vehicle_name,
      coalesce(v.category_code,sr.vehicle_category_code,j.pricing_vehicle_category_code) as vehicle_category_code,
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
      (
        select count(*)
        from drivers
        where coalesce(accepting_jobs, false)
           or job_id is not null
      ),
      'drivers_with_fresh_location',
      (select count(*) from drivers where location_fresh),
      'inactive_drivers',
      (
        select count(*)
        from drivers
        where not coalesce(accepting_jobs, false)
          and job_id is null
      ),
      'active_jobs',
      (select count(*) from active_jobs where status<>'expired')
    ),
    'drivers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'driver_user_id', d.driver_user_id,
          'driver_display_name', d.driver_display_name,
          'vehicle_id', d.vehicle_id,
          'vehicle_name', d.vehicle_name,
          'vehicle_category_code', d.vehicle_category_code,
          'accepting_jobs', d.accepting_jobs,
          'working_since', d.working_since,
          'is_available', d.is_available,
          'active_job_id', d.job_id,
          'active_job_status', d.job_status,
          'latitude', d.latitude,
          'longitude', d.longitude,
          'last_latitude', d.last_latitude,
          'last_longitude', d.last_longitude,
          'last_accuracy_m', d.last_accuracy_m,
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
          'estimated_distance_km', j.estimated_distance_km,
          'route_duration_seconds', j.route_duration_seconds,
          'customer_id', j.customer_id,
          'customer_display_name', j.customer_display_name,
          'driver_user_id', j.assigned_driver_user_id,
          'vehicle_id', j.assigned_vehicle_id,
          'driver_display_name', j.driver_display_name,
          'vehicle_name', j.vehicle_name,
          'vehicle_category_code', j.vehicle_category_code,
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
NOTIFY pgrst, 'reload schema';
COMMIT;
