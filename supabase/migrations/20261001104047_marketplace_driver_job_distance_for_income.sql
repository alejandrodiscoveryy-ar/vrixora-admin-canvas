-- Expose pricing distance to the authenticated assigned driver.
-- Existing clients ignore the extra field. No job data is modified.

drop function if exists public.list_my_marketplace_jobs(
  text,
  integer,
  timestamptz,
  uuid
);

create function public.list_my_marketplace_jobs(
  target_scope text,
  target_limit integer default 50,
  target_before_created_at timestamptz default null,
  target_before_job_id uuid default null
)
returns table(
  job_id uuid,
  status text,
  service_code text,
  origin_text text,
  destination_text text,
  scheduled_for timestamptz,
  passenger_count integer,
  cargo_weight_kg numeric,
  cargo_volume_m3 numeric,
  cargo_length_cm numeric,
  cargo_width_cm numeric,
  cargo_height_cm numeric,
  required_body_type text,
  final_price numeric,
  currency text,
  vehicle_id text,
  billing_mode text,
  commission_amount_snapshot numeric,
  trial_started_at_snapshot timestamptz,
  trial_ends_at_snapshot timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  incident_from_status text,
  incident_opened_at timestamptz,
  incident_reason text,
  incident_resolution text,
  incident_resolved_at timestamptz,
  next_driver_action text,
  origin_lat numeric,
  origin_lon numeric,
  destination_lat numeric,
  destination_lon numeric,
  distance_km numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  pid uuid;
  safe_limit integer :=
    least(greatest(coalesce(target_limit, 50), 1), 100);
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  if target_scope not in ('active', 'scheduled', 'history') then
    raise exception 'INVALID_MARKETPLACE_JOB_SCOPE'
      using errcode = '22023';
  end if;

  if (target_before_created_at is null)
     <> (target_before_job_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR'
      using errcode = '22023';
  end if;

  select id
  into pid
  from public.projects
  where slug = 'tuktuk-control';

  return query
  select
    j.id,
    j.status,
    j.service_code,
    r.origin_text,
    r.destination_text,
    r.scheduled_for,
    r.passenger_count,
    r.cargo_weight_kg,
    r.cargo_volume_m3,
    r.cargo_length_cm,
    r.cargo_width_cm,
    r.cargo_height_cm,
    r.required_body_type,
    j.final_price,
    j.currency,
    a.vehicle_id,
    a.billing_mode,
    a.commission_amount_snapshot,
    a.trial_started_at_snapshot,
    a.trial_ends_at_snapshot,
    a.accepted_at,
    a.completed_at,
    a.cancelled_at,
    j.published_at,
    j.expires_at,
    j.created_at,
    j.updated_at,
    j.incident_from_status,
    j.incident_opened_at,
    j.incident_reason,
    ir.resolution,
    ir.resolved_at,
    case j.status
      when 'accepted' then 'start_en_route'
      when 'en_route' then 'mark_pickup'
      when 'pickup' then 'start_service'
      when 'in_progress' then 'complete_service'
      else null
    end,
    case
      when j.status in ('accepted','en_route','pickup','in_progress')
       and r.details #>> '{route_origin,lat}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.details #>> '{route_origin,lat}')::numeric
    end,
    case
      when j.status in ('accepted','en_route','pickup','in_progress')
       and r.details #>> '{route_origin,lon}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.details #>> '{route_origin,lon}')::numeric
    end,
    case
      when j.status in ('accepted','en_route','pickup','in_progress')
       and r.details #>> '{route_destination,lat}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.details #>> '{route_destination,lat}')::numeric
    end,
    case
      when j.status in ('accepted','en_route','pickup','in_progress')
       and r.details #>> '{route_destination,lon}' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (r.details #>> '{route_destination,lon}')::numeric
    end,
    case
      when (j.pricing_breakdown ->> 'distance_km') ~ '^[0-9]+([.][0-9]+)?$'
      then (j.pricing_breakdown ->> 'distance_km')::numeric
    end
  from public.jobs j
  join public.job_assignments a
    on a.project_id = j.project_id
   and a.job_id = j.id
   and a.driver_user_id = actor
  join public.service_requests r
    on r.project_id = j.project_id
   and r.id = j.service_request_id
  left join lateral (
    select x.resolution, x.resolved_at
    from public.marketplace_incident_resolutions x
    where x.project_id = j.project_id
      and x.job_id = j.id
    order by x.resolved_at desc
    limit 1
  ) ir on true
  where j.project_id = pid
    and j.assigned_driver_user_id = actor
    and (
      target_before_created_at is null
      or (j.created_at, j.id)
         < (target_before_created_at, target_before_job_id)
    )
    and (
      (
        target_scope = 'active'
        and (
          (
            j.status = 'accepted'
            and (
              r.scheduled_for is null
              or r.scheduled_for <= now()
            )
          )
          or j.status in ('en_route','pickup','in_progress','completed')
          or (j.status = 'incident' and ir.resolved_at is null)
        )
      )
      or (
        target_scope = 'scheduled'
        and j.status = 'accepted'
        and r.scheduled_for > now()
      )
      or (
        target_scope = 'history'
        and (
          j.status in ('settled','cancelled_by_customer','cancelled_by_driver')
          or (j.status = 'incident' and ir.resolved_at is not null)
        )
      )
    )
  order by j.created_at desc, j.id desc
  limit safe_limit;
end;
$$;

revoke all on function public.list_my_marketplace_jobs(
  text,
  integer,
  timestamptz,
  uuid
) from public, anon;

grant execute on function public.list_my_marketplace_jobs(
  text,
  integer,
  timestamptz,
  uuid
) to authenticated;