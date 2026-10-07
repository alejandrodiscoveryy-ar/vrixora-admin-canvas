-- TukTuk Marketplace
-- Progressive dispatch engine: configurable radius waves, driver reputation,
-- durable push waves, listing consistency, and atomic acceptance enforcement.
-- The master switch defaults OFF, so applying this migration is behavior-preserving
-- until an administrator explicitly enables the policy.

create or replace function app_private.marketplace_haversine_km(
  lat1 numeric,
  lon1 numeric,
  lat2 numeric,
  lon2 numeric
)
returns numeric
language plpgsql
immutable
strict
set search_path = ''
as $function$
declare
  a double precision;
begin
  a :=
    power(
      sin(
        radians((lat2 - lat1)::double precision) / 2.0
      ),
      2
    )
    +
    cos(radians(lat1::double precision))
    * cos(radians(lat2::double precision))
    * power(
        sin(
          radians((lon2 - lon1)::double precision) / 2.0
        ),
        2
      );

  a := least(1.0::double precision, greatest(0.0::double precision, a));

  return (
    6371.0088::double precision
    * 2.0
    * atan2(
        sqrt(a),
        sqrt(greatest(0.0::double precision, 1.0::double precision - a))
      )
  )::numeric;
end;
$function$;


create or replace function app_private.marketplace_dispatch_candidate_state(
  target_project_id uuid,
  target_driver_user_id uuid,
  target_vehicle_id text,
  target_job_id uuid
)
returns table(
  policy_enabled boolean,
  allowed boolean,
  distance_km numeric,
  radius_stage integer,
  radius_limit_km numeric,
  rating_average numeric,
  rating_count bigint,
  rating_preferred boolean,
  eligible_from timestamptz,
  rating_score numeric,
  tie_breaker text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
    select false,false,null::numeric,null::integer,null::numeric,null::numeric,
           0::bigint,true,null::timestamptz,4.0::numeric,'rating_then_distance'::text;
    return;
  end if;

  select j.* into v_job
  from public.jobs j
  where j.project_id = target_project_id
    and j.id = target_job_id;

  if not found then
    return query
    select false,false,null::numeric,null::integer,null::numeric,null::numeric,
           0::bigint,true,null::timestamptz,4.0::numeric,'rating_then_distance'::text;
    return;
  end if;

  v_base_time := coalesce(v_job.published_at, v_job.created_at, now());

  select r.details into v_details
  from public.service_requests r
  where r.project_id = target_project_id
    and r.id = v_job.service_request_id;

  v_details := coalesce(v_details, '{}'::jsonb);

  select s.* into v_settings
  from public.project_marketplace_dispatch_settings s
  where s.project_id = target_project_id;

  v_has_settings := found;

  if v_has_settings then
    v_tie_breaker := coalesce(v_settings.tie_breaker,'rating_then_distance');
  end if;

  if not v_has_settings
     or not coalesce(v_settings.enabled, false)
     or (v_job.is_test and not coalesce(v_settings.apply_to_test_jobs, false)) then
    return query
    select false,true,null::numeric,0::integer,null::numeric,null::numeric,
           0::bigint,true,v_base_time,
           coalesce(v_settings.preferred_min_rating,4.0::numeric),v_tie_breaker;
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
      select true,false,null::numeric,null::integer,null::numeric,null::numeric,
             0::bigint,true,null::timestamptz,
             coalesce(v_settings.preferred_min_rating,4.0::numeric),v_tie_breaker;
      return;
    end if;

    v_origin_lat := v_origin_lat_text::numeric;
    v_origin_lon := v_origin_lon_text::numeric;

    if v_origin_lat < -90 or v_origin_lat > 90
       or v_origin_lon < -180 or v_origin_lon > 180 then
      return query
      select true,false,null::numeric,null::integer,null::numeric,null::numeric,
             0::bigint,true,null::timestamptz,
             coalesce(v_settings.preferred_min_rating,4.0::numeric),v_tie_breaker;
      return;
    end if;

    select l.latitude,l.longitude
      into v_driver_lat,v_driver_lon
    from public.marketplace_driver_locations l
    where l.project_id = target_project_id
      and l.driver_user_id = target_driver_user_id
      and l.vehicle_id = target_vehicle_id
      and l.captured_at >= now() - interval '300 seconds'
    order by l.captured_at desc
    limit 1;

    if not found then
      return query
      select true,false,null::numeric,null::integer,null::numeric,null::numeric,
             0::bigint,true,null::timestamptz,
             coalesce(v_settings.preferred_min_rating,4.0::numeric),v_tie_breaker;
      return;
    end if;

    v_distance_km := app_private.marketplace_haversine_km(
      v_origin_lat,v_origin_lon,v_driver_lat,v_driver_lon
    );

    if coalesce(v_settings.radius_1_enabled,false) then
      v_radii := array_append(v_radii,v_settings.radius_1_km);
    end if;
    if coalesce(v_settings.radius_2_enabled,false) then
      v_radii := array_append(v_radii,v_settings.radius_2_km);
    end if;
    if coalesce(v_settings.radius_3_enabled,false) then
      v_radii := array_append(v_radii,v_settings.radius_3_km);
    end if;

    v_radius_count := coalesce(array_length(v_radii,1),0);

    if v_radius_count = 0 then
      return query
      select true,false,v_distance_km,null::integer,null::numeric,null::numeric,
             0::bigint,true,null::timestamptz,
             coalesce(v_settings.preferred_min_rating,4.0::numeric),v_tie_breaker;
      return;
    end if;

    if not coalesce(v_settings.expansion_enabled,true) then
      if v_distance_km <= v_radii[1] then
        v_stage := 1;
        v_radius_limit := v_radii[1];
        v_radius_from := v_base_time;
      else
        return query
        select true,false,v_distance_km,1::integer,v_radii[1],null::numeric,
               0::bigint,true,null::timestamptz,
               coalesce(v_settings.preferred_min_rating,4.0::numeric),v_tie_breaker;
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
        if coalesce(v_settings.allow_outside_max_radius,false) then
          v_stage := v_radius_count + 1;
          v_radius_limit := null;
          v_radius_from := v_base_time
            + make_interval(secs => v_radius_count * v_settings.expansion_seconds);
        else
          return query
          select true,false,v_distance_km,v_radius_count,v_radii[v_radius_count],
                 null::numeric,0::bigint,true,null::timestamptz,
                 coalesce(v_settings.preferred_min_rating,4.0::numeric),v_tie_breaker;
          return;
        end if;
      else
        v_radius_from := v_base_time
          + make_interval(secs => (v_stage - 1) * v_settings.expansion_seconds);
      end if;
    end if;
  else
    v_distance_km := null;
    v_stage := 0;
    v_radius_limit := null;
    v_radius_from := v_base_time;
  end if;

  select avg(r.stars::numeric),count(r.id)::bigint
    into v_rating_average,v_rating_count
  from public.marketplace_customer_ratings r
  join public.jobs rating_job
    on rating_job.project_id=r.project_id
   and rating_job.id=r.job_id
  where r.project_id=target_project_id
    and r.driver_user_id=target_driver_user_id
    and rating_job.status='settled'
    and not rating_job.is_test
    and rating_job.test_deleted_at is null;

  v_rating_count := coalesce(v_rating_count,0);

  if v_rating_count = 0
     or (
       coalesce(v_settings.minimum_rating_count_enabled,true)
       and v_rating_count < v_settings.minimum_rating_count
     ) then
    v_rating_score := coalesce(v_settings.preferred_min_rating,4.0::numeric);
  else
    v_rating_score := v_rating_average;
  end if;

  if coalesce(v_settings.rating_priority_enabled,true)
     and coalesce(v_settings.preferred_min_rating_enabled,true) then
    if v_rating_count = 0
       or (
         coalesce(v_settings.minimum_rating_count_enabled,true)
         and v_rating_count < v_settings.minimum_rating_count
       ) then
      v_rating_preferred := true;
    else
      v_rating_preferred := v_rating_average >= v_settings.preferred_min_rating;
    end if;

    if not v_rating_preferred then
      if not coalesce(v_settings.allow_below_preferred,true) then
        return query
        select true,false,v_distance_km,v_stage,v_radius_limit,v_rating_average,
               v_rating_count,false,null::timestamptz,v_rating_score,v_tie_breaker;
        return;
      end if;
      v_eligible_from := v_radius_from
        + make_interval(secs => v_settings.expansion_seconds);
    else
      v_eligible_from := v_radius_from;
    end if;
  else
    v_rating_preferred := true;
    v_eligible_from := v_radius_from;
  end if;

  return query
  select true,now() >= v_eligible_from,v_distance_km,v_stage,v_radius_limit,
         v_rating_average,v_rating_count,v_rating_preferred,v_eligible_from,
         v_rating_score,v_tie_breaker;
end;
$function$;

create or replace function app_private.marketplace_dispatch_policy_allows(
  target_project_id uuid,
  target_driver_user_id uuid,
  target_vehicle_id text,
  target_job_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select state.allowed
    from app_private.marketplace_dispatch_candidate_state(
      target_project_id,target_driver_user_id,target_vehicle_id,target_job_id
    ) state
    limit 1
  ), false);
$function$;

create or replace function app_private.enqueue_marketplace_job_offer_wave(
  target_job_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_id uuid;
  candidate record;
  inserted_rows integer;
  enqueued_count integer := 0;
begin
  select j.project_id into v_project_id
  from public.jobs j
  where j.id = target_job_id
    and j.status = 'published'
    and j.test_deleted_at is null
    and (j.expires_at is null or j.expires_at > now());

  if not found then return 0; end if;

  for candidate in
    with candidate_rows as (
      select a.driver_user_id,state.distance_km,state.rating_score,state.tie_breaker
      from public.driver_vehicle_assignments a
      cross join lateral app_private.marketplace_dispatch_candidate_state(
        v_project_id,a.driver_user_id,a.vehicle_id,target_job_id
      ) state
      where a.project_id = v_project_id
        and app_private.marketplace_driver_can_receive_job(
          v_project_id,a.driver_user_id,a.vehicle_id,target_job_id
        )
        and state.allowed
    ),
    candidates as (
      select c.driver_user_id,min(c.distance_km) as distance_km,
             max(c.rating_score) as rating_score,max(c.tie_breaker) as tie_breaker
      from candidate_rows c
      group by c.driver_user_id
    )
    select c.*
    from candidates c
    order by
      case when c.tie_breaker='rating_then_distance' then c.rating_score end desc nulls last,
      case when c.tie_breaker='rating_then_distance' then c.distance_km end asc nulls last,
      case when c.tie_breaker='distance_then_rating' then c.distance_km end asc nulls last,
      case when c.tie_breaker='distance_then_rating' then c.rating_score end desc nulls last,
      c.driver_user_id
  loop
    insert into public.notification_outbox(
      project_id,user_id,kind,notification_date,dedupe_key,title,body,data
    ) values (
      v_project_id,candidate.driver_user_id,'marketplace_job_available',
      current_date,'marketplace-job:' || target_job_id::text,
      'Nueva solicitud disponible',
      'Abre Trabajos para ver una solicitud disponible.',
      jsonb_build_object('event_type','marketplace_job_available','job_id',target_job_id)
    )
    on conflict (project_id,user_id,kind,dedupe_key) do nothing;

    get diagnostics inserted_rows = row_count;
    enqueued_count := enqueued_count + inserted_rows;
  end loop;

  if enqueued_count > 0 then
    begin
      perform net.http_post(
        url := 'https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/send-push-notifications',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-tuktuk-dispatch-secret',(
            select decrypted_secret
            from vault.decrypted_secrets
            where name='tuktuk_push_dispatch_secret'
            limit 1
          )
        ),
        body := jsonb_build_object(
          'limit',100,'max_batches',10,'concurrency',8,'time_budget_ms',45000
        ),
        timeout_milliseconds := 5000
      );
    exception when others then null;
    end;
  end if;

  return enqueued_count;
end;
$function$;

create or replace function app_private.enqueue_marketplace_job_offers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status <> 'requested' or new.status <> 'published' then
    return new;
  end if;
  perform app_private.enqueue_marketplace_job_offer_wave(new.id);
  return new;
end;
$function$;

create or replace function app_private.dispatch_marketplace_offer_waves()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  pending_job record;
  inserted_count integer;
  total_inserted integer := 0;
begin
  for pending_job in
    select j.id
    from public.jobs j
    join public.project_marketplace_dispatch_settings settings
      on settings.project_id=j.project_id
     and settings.enabled
    where j.status='published'
      and j.test_deleted_at is null
      and (j.expires_at is null or j.expires_at > now())
      and (not j.is_test or settings.apply_to_test_jobs)
    order by coalesce(j.published_at,j.created_at),j.id
  loop
    inserted_count := app_private.enqueue_marketplace_job_offer_wave(pending_job.id);
    total_inserted := total_inserted + coalesce(inserted_count,0);
  end loop;
  return total_inserted;
end;
$function$;

create or replace function app_private.enforce_marketplace_dispatch_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
begin
  if old.status='published'
     and new.status='accepted'
     and new.assigned_driver_user_id is not null
     and new.assigned_vehicle_id is not null
     and actor is not null
     and actor=new.assigned_driver_user_id
     and not app_private.marketplace_dispatch_policy_allows(
       new.project_id,new.assigned_driver_user_id,new.assigned_vehicle_id,new.id
     ) then
    raise exception 'JOB_NOT_AVAILABLE';
  end if;
  return new;
end;
$function$;

drop trigger if exists marketplace_enforce_dispatch_policy on public.jobs;

create trigger marketplace_enforce_dispatch_policy
before update of status,assigned_driver_user_id,assigned_vehicle_id
on public.jobs
for each row
execute function app_private.enforce_marketplace_dispatch_acceptance();

create or replace function public.list_my_marketplace_available_jobs(
  target_vehicle_id text,
  target_limit integer default 50,
  target_before_created_at timestamptz default null,
  target_before_job_id uuid default null
)
returns table(
  job_id uuid,service_code text,origin_text text,destination_text text,
  scheduled_for timestamptz,passenger_count integer,cargo_weight_kg numeric,
  cargo_volume_m3 numeric,cargo_length_cm numeric,cargo_width_cm numeric,
  cargo_height_cm numeric,required_body_type text,recommended_price numeric,
  final_price numeric,currency text,expires_at timestamptz,created_at timestamptz,
  billing_mode text,commission_rate numeric,commission_amount numeric,
  available_balance numeric,missing_balance numeric,can_accept boolean,is_test boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid:=auth.uid();
  pid uuid;
  safe_limit integer:=least(greatest(coalesce(target_limit,50),1),100);
  balance numeric;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if (target_before_created_at is null)<>(target_before_job_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023';
  end if;

  select id into pid from public.projects where slug='tuktuk-control';

  if not exists(
    select 1 from public.driver_profiles d
    where d.project_id=pid and d.user_id=actor
      and d.status='active' and d.activated_at is not null and d.suspended_at is null
  )
  or not app_private.marketplace_onboarding_requirements_complete(actor,target_vehicle_id)
  or not exists(
    select 1
    from public.driver_vehicle_assignments a
    join public.vehicles v on v.project_id=a.project_id and v.id=a.vehicle_id
    where a.project_id=pid and a.driver_user_id=actor
      and a.vehicle_id=target_vehicle_id
      and a.is_active and a.is_available
      and v.marketplace_status='active' and v.deleted_at is null
  ) then
    raise exception 'MARKETPLACE_WORK_ACCESS_DENIED' using errcode='42501';
  end if;

  balance:=coalesce(app_private.marketplace_wallet_available_balance(pid,actor),0);

  return query
  select
    j.id,j.service_code,r.origin_text,r.destination_text,r.scheduled_for,
    r.passenger_count,r.cargo_weight_kg,r.cargo_volume_m3,r.cargo_length_cm,
    r.cargo_width_cm,r.cargo_height_cm,r.required_body_type,j.recommended_price,
    j.final_price,j.currency,j.expires_at,j.created_at,
    case
      when j.is_test and j.test_force_wallet_commission then 'wallet_commission'
      when app_private.has_active_marketplace_work_trial(actor) then 'trial_free'
      when app_private.has_confirmed_marketplace_initial_deposit(actor) then 'wallet_commission'
      else null
    end,
    case
      when j.is_test and j.test_force_wallet_commission then j.commission_rate_snapshot
      when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
      when app_private.has_confirmed_marketplace_initial_deposit(actor) then j.commission_rate_snapshot
      else j.commission_rate_snapshot
    end,
    case
      when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)
      when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
      when app_private.has_confirmed_marketplace_initial_deposit(actor) then round(j.final_price*j.commission_rate_snapshot,2)
      else round(j.final_price*j.commission_rate_snapshot,2)
    end,
    balance,
    greatest(
      0::numeric,
      (case
        when j.is_test and j.test_force_wallet_commission then round(j.final_price*j.commission_rate_snapshot,2)
        when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
        when app_private.has_confirmed_marketplace_initial_deposit(actor) then round(j.final_price*j.commission_rate_snapshot,2)
        else round(j.final_price*j.commission_rate_snapshot,2)
      end)-balance
    ),
    case
      when j.is_test and j.test_force_wallet_commission
        then balance>=round(j.final_price*j.commission_rate_snapshot,2)
      when app_private.has_active_marketplace_work_trial(actor) then true
      when app_private.has_confirmed_marketplace_initial_deposit(actor)
        then balance>=round(j.final_price*j.commission_rate_snapshot,2)
      else false
    end,
    j.is_test
  from public.jobs j
  join public.service_requests r
    on r.project_id=j.project_id and r.id=j.service_request_id
  where j.project_id=pid
    and j.status='published'
    and j.test_deleted_at is null
    and (not j.is_test or j.test_driver_user_id=actor)
    and (j.expires_at is null or j.expires_at>now())
    and app_private.marketplace_dispatch_policy_allows(pid,actor,target_vehicle_id,j.id)
    and (
      app_private.has_active_marketplace_work_trial(actor)
      or app_private.has_confirmed_marketplace_initial_deposit(actor)
      or (j.is_test and j.test_driver_user_id=actor and j.test_force_wallet_commission)
    )
    and exists(
      select 1 from public.vehicle_services s
      where s.project_id=pid and s.vehicle_id=target_vehicle_id
        and s.service_code=j.service_code and s.enabled
    )
    and exists(
      select 1
      from public.vehicles v
      where v.project_id=pid and v.id=target_vehicle_id
        and (
          coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code) is null
          or v.category_code=coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code)
        )
        and (r.passenger_count is null or v.passenger_capacity>=r.passenger_count)
        and (r.cargo_weight_kg is null or v.cargo_capacity_kg>=r.cargo_weight_kg)
        and (r.cargo_volume_m3 is null or v.cargo_volume_m3>=r.cargo_volume_m3)
        and (r.cargo_length_cm is null or v.cargo_length_cm>=r.cargo_length_cm)
        and (r.cargo_width_cm is null or v.cargo_width_cm>=r.cargo_width_cm)
        and (r.cargo_height_cm is null or v.cargo_height_cm>=r.cargo_height_cm)
        and (r.required_body_type is null or lower(btrim(v.body_type))=lower(btrim(r.required_body_type)))
    )
    and (target_before_created_at is null or (j.created_at,j.id)<(target_before_created_at,target_before_job_id))
  order by j.created_at desc,j.id desc
  limit safe_limit;
end;
$function$;

revoke all
on function app_private.marketplace_haversine_km(numeric,numeric,numeric,numeric),
  app_private.marketplace_dispatch_candidate_state(uuid,uuid,text,uuid),
  app_private.marketplace_dispatch_policy_allows(uuid,uuid,text,uuid),
  app_private.enqueue_marketplace_job_offer_wave(uuid),
  app_private.dispatch_marketplace_offer_waves(),
  app_private.enforce_marketplace_dispatch_acceptance()
from public, anon, authenticated;

revoke all
on function app_private.enqueue_marketplace_job_offers()
from public, anon, authenticated;

do $block$
declare
  existing_job_id bigint;
begin
  select j.jobid into existing_job_id
  from cron.job j
  where j.jobname='marketplace-dispatch-waves'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'marketplace-dispatch-waves',
    '5 seconds',
    'select app_private.dispatch_marketplace_offer_waves();'
  );
end;
$block$;
