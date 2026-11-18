-- TukTuk dispatch continuity. A grey GPS pin is visual information only.
-- In the enabled radius/expansion policy, an on-duty driver with no FIX <=5m
-- was previously unconditionally rejected from ALL job offer waves.
-- With an older last-known position INSIDE a radius, allow the candidate
-- to receive a job at that normal radius stage. GPS age does not block offers.
-- This last position is not current location: reported distance_km remains
-- NULL to avoid inventing a real-time distance. Dispatch only uses it as an
-- approximate inclusion signal. If no position exists, the already-enabled
-- out-of-radius final wave is a fallback after all radius stages.
-- Existing working state, finance, modality, permissions, notification
-- dedupe, eligibility, job acceptance and assignments are unchanged.
-- Does not change GPS validity, driver's working state, or price.
CREATE OR REPLACE FUNCTION app_private.marketplace_promo_base_candidate_state(target_project_id uuid, target_driver_user_id uuid, target_vehicle_id text, target_job_id uuid)
 RETURNS TABLE(policy_enabled boolean, allowed boolean, distance_km numeric, radius_stage integer, radius_limit_km numeric, rating_average numeric, rating_count bigint, rating_preferred boolean, eligible_from timestamp with time zone, rating_score numeric, tie_breaker text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.jobs%rowtype;
  v_details jsonb;
  v_settings public.project_marketplace_dispatch_settings%rowtype;
  v_has_settings boolean := false;

  v_base_time timestamptz;

  v_origin_lat_text text;
  v_origin_lon_text text;
  v_origin_lat numeric;
  v_origin_lon numeric;

  v_driver_lat numeric;
  v_driver_lon numeric;
  v_driver_gps_fresh boolean := false;
  v_distance_km numeric;

  v_radii numeric[] := array[]::numeric[];
  v_radius_count integer := 0;
  v_stage integer;
  v_radius_limit numeric;
  v_radius_from timestamptz;

  v_rating_average numeric;
  v_rating_count bigint := 0;
  v_rating_preferred boolean := true;
  v_rating_score numeric;

  v_eligible_from timestamptz;
  v_tie_breaker text := 'rating_then_distance';

  idx integer;
begin
  if target_project_id is null
     or target_driver_user_id is null
     or target_vehicle_id is null
     or target_job_id is null then
    return query
    select
      false,
      false,
      null::numeric,
      null::integer,
      null::numeric,
      null::numeric,
      0::bigint,
      true,
      null::timestamptz,
      4.0::numeric,
      'rating_then_distance'::text;
    return;
  end if;

  select j.*
    into v_job
  from public.jobs j
  where j.project_id = target_project_id
    and j.id = target_job_id;

  if not found then
    return query
    select
      false,
      false,
      null::numeric,
      null::integer,
      null::numeric,
      null::numeric,
      0::bigint,
      true,
      null::timestamptz,
      4.0::numeric,
      'rating_then_distance'::text;
    return;
  end if;

  v_base_time := coalesce(v_job.published_at, v_job.created_at, now());

  select r.details
    into v_details
  from public.service_requests r
  where r.project_id = target_project_id
    and r.id = v_job.service_request_id;

  v_details := coalesce(v_details, '{}'::jsonb);

  select s.*
    into v_settings
  from public.project_marketplace_dispatch_settings s
  where s.project_id = target_project_id;

  v_has_settings := found;

  if v_has_settings then
    v_tie_breaker := coalesce(
      v_settings.tie_breaker,
      'rating_then_distance'
    );
  end if;

  if not v_has_settings
     or not coalesce(v_settings.enabled, false)
     or (
       v_job.is_test
       and not coalesce(v_settings.apply_to_test_jobs, false)
     ) then

    return query
    select
      false,
      true,
      null::numeric,
      0::integer,
      null::numeric,
      null::numeric,
      0::bigint,
      true,
      v_base_time,
      coalesce(v_settings.preferred_min_rating, 4.0::numeric),
      v_tie_breaker;

    return;
  end if;

  if coalesce(v_settings.radius_search_enabled, true) then
    v_origin_lat_text := v_details #>> '{route_origin,lat}';
    v_origin_lon_text := v_details #>> '{route_origin,lon}';

    if v_origin_lat_text is null
       or v_origin_lon_text is null
       or v_origin_lat_text !~ '^-?[0-9]+(\.[0-9]+)?$'
       or v_origin_lon_text !~ '^-?[0-9]+(\.[0-9]+)?$' then

      return query
      select
        true,
        false,
        null::numeric,
        null::integer,
        null::numeric,
        null::numeric,
        0::bigint,
        true,
        null::timestamptz,
        coalesce(v_settings.preferred_min_rating, 4.0::numeric),
        v_tie_breaker;

      return;
    end if;

    v_origin_lat := v_origin_lat_text::numeric;
    v_origin_lon := v_origin_lon_text::numeric;

    if v_origin_lat < -90
       or v_origin_lat > 90
       or v_origin_lon < -180
       or v_origin_lon > 180 then

      return query
      select
        true,
        false,
        null::numeric,
        null::integer,
        null::numeric,
        null::numeric,
        0::bigint,
        true,
        null::timestamptz,
        coalesce(v_settings.preferred_min_rating, 4.0::numeric),
        v_tie_breaker;

      return;
    end if;

    -- Use the NEWEST position available to dispatch. Exact accepted GPS is
    -- preferred; if the driver has since gone off-duty, use the last retained
    -- precise fix or coarse coverage. Do not assume a stale fix is live.
    -- All sources are scoped to the exact driver/vehicle and project.
    select last_known.latitude,last_known.longitude,last_known.is_fresh
      into v_driver_lat,v_driver_lon,v_driver_gps_fresh
    from (
      select l.latitude,l.longitude,l.captured_at,
             (l.captured_at >= now() - interval '300 seconds') as is_fresh,
             0 as source_priority
      from public.marketplace_driver_locations l
      where l.project_id = target_project_id
        and l.driver_user_id = target_driver_user_id
        and l.vehicle_id = target_vehicle_id

      union all

      select h.latitude,h.longitude,h.captured_at,
             false as is_fresh,1 as source_priority
      from app_private.marketplace_driver_last_confirmed_gps_v1 h
      where h.project_id = target_project_id
        and h.driver_user_id = target_driver_user_id
        and h.vehicle_id = target_vehicle_id

      union all

      select p.coverage_latitude,p.coverage_longitude,
             p.coverage_captured_at,false as is_fresh,2 as source_priority
      from app_private.marketplace_driver_presence_v2 p
      where p.project_id = target_project_id
        and p.driver_user_id = target_driver_user_id
        and p.vehicle_id = target_vehicle_id
    ) last_known
    where last_known.latitude between -90 and 90
      and last_known.longitude between -180 and 180
      and last_known.captured_at <= now() + interval '5 minutes'
    order by last_known.captured_at desc,last_known.source_priority
    limit 1;

    if not found then
      v_driver_lat := null;
      v_driver_lon := null;
      v_driver_gps_fresh := false;
    end if;

    if v_driver_lat is not null and v_driver_lon is not null then
      v_distance_km := app_private.marketplace_haversine_km(
        v_origin_lat,
        v_origin_lon,
        v_driver_lat,
        v_driver_lon
      );
    else
      v_distance_km := null;
    end if;

    if coalesce(v_settings.radius_1_enabled, false) then
      v_radii := array_append(v_radii, v_settings.radius_1_km);
    end if;

    if coalesce(v_settings.radius_2_enabled, false) then
      v_radii := array_append(v_radii, v_settings.radius_2_km);
    end if;

    if coalesce(v_settings.radius_3_enabled, false) then
      v_radii := array_append(v_radii, v_settings.radius_3_km);
    end if;

    v_radius_count := coalesce(array_length(v_radii, 1), 0);

    if v_radius_count = 0 then
      return query
      select
        true,
        false,
        v_distance_km,
        null::integer,
        null::numeric,
        null::numeric,
        0::bigint,
        true,
        null::timestamptz,
        coalesce(v_settings.preferred_min_rating, 4.0::numeric),
        v_tie_breaker;

      return;
    end if;

    if v_distance_km is null then
      -- No location at all. Do not guess a position. Use the final wave
      -- only when expansion and outside-radius offers are enabled.
      if coalesce(v_settings.expansion_enabled, true)
         and coalesce(v_settings.allow_outside_max_radius, false) then
        v_stage := v_radius_count + 1;
        v_radius_limit := null;
        v_radius_from :=
          v_base_time + make_interval(
            secs => v_radius_count * v_settings.expansion_seconds
          );
      else
        return query
        select
          true, false, null::numeric, null::integer, null::numeric,
          null::numeric, 0::bigint, true, null::timestamptz,
          coalesce(v_settings.preferred_min_rating, 4.0::numeric),
          v_tie_breaker;
        return;
      end if;
    elsif not coalesce(v_settings.expansion_enabled, true) then
      if v_distance_km <= v_radii[1] then
        v_stage := 1;
        v_radius_limit := v_radii[1];
        v_radius_from := v_base_time;
      else
        return query
        select
          true,
          false,
          v_distance_km,
          1::integer,
          v_radii[1],
          null::numeric,
          0::bigint,
          true,
          null::timestamptz,
          coalesce(v_settings.preferred_min_rating, 4.0::numeric),
          v_tie_breaker;

        return;
      end if;
    else
      v_stage := null;

      for idx in 1..v_radius_count loop
        if v_distance_km <= v_radii[idx] then
          v_stage := idx;
          v_radius_limit := v_radii[idx];
          exit;
        end if;
      end loop;

      if v_stage is null then
        if coalesce(v_settings.allow_outside_max_radius, false) then
          v_stage := v_radius_count + 1;
          v_radius_limit := null;
          v_radius_from :=
            v_base_time
            + make_interval(
                secs => v_radius_count * v_settings.expansion_seconds
              );
        else
          return query
          select
            true,
            false,
            v_distance_km,
            v_radius_count,
            v_radii[v_radius_count],
            null::numeric,
            0::bigint,
            true,
            null::timestamptz,
            coalesce(v_settings.preferred_min_rating, 4.0::numeric),
            v_tie_breaker;

          return;
        end if;
      else
        v_radius_from :=
          v_base_time
          + make_interval(
              secs => (v_stage - 1) * v_settings.expansion_seconds
            );
      end if;
    end if;
  else
    v_distance_km := null;
    v_stage := 0;
    v_radius_limit := null;
    v_radius_from := v_base_time;
  end if;

  select
    avg(r.stars::numeric),
    count(r.id)::bigint
  into
    v_rating_average,
    v_rating_count
  from public.marketplace_customer_ratings r
  join public.jobs rating_job
    on rating_job.project_id = r.project_id
   and rating_job.id = r.job_id
  where r.project_id = target_project_id
    and r.driver_user_id = target_driver_user_id
    and rating_job.status = 'settled'
    and not rating_job.is_test
    and rating_job.test_deleted_at is null;

  v_rating_count := coalesce(v_rating_count, 0);

  if v_rating_count = 0
     or (
       coalesce(v_settings.minimum_rating_count_enabled, true)
       and v_rating_count < v_settings.minimum_rating_count
     ) then
    v_rating_score := coalesce(
      v_settings.preferred_min_rating,
      4.0::numeric
    );
  else
    v_rating_score := v_rating_average;
  end if;

  if coalesce(v_settings.rating_priority_enabled, true)
     and coalesce(v_settings.preferred_min_rating_enabled, true) then

    if v_rating_count = 0
       or (
         coalesce(v_settings.minimum_rating_count_enabled, true)
         and v_rating_count < v_settings.minimum_rating_count
       ) then
      v_rating_preferred := true;
    else
      v_rating_preferred :=
        v_rating_average >= v_settings.preferred_min_rating;
    end if;

    if not v_rating_preferred then
      if not coalesce(v_settings.allow_below_preferred, true) then
        return query
        select
          true,
          false,
          v_distance_km,
          v_stage,
          v_radius_limit,
          v_rating_average,
          v_rating_count,
          false,
          null::timestamptz,
          v_rating_score,
          v_tie_breaker;

        return;
      end if;

      v_eligible_from :=
        v_radius_from
        + make_interval(secs => v_settings.expansion_seconds);
    else
      v_eligible_from := v_radius_from;
    end if;
  else
    v_rating_preferred := true;
    v_eligible_from := v_radius_from;
  end if;

  return query
  select
    true,
    now() >= v_eligible_from,
    -- A stale fix can establish the approximate search area, not actual
    -- realtime distance. Never include its distance as a GPS measurement.
    case when v_driver_gps_fresh then v_distance_km else null::numeric end,
    v_stage,
    v_radius_limit,
    v_rating_average,
    v_rating_count,
    v_rating_preferred,
    v_eligible_from,
    v_rating_score,
    v_tie_breaker;
end;
$function$;
