\set ON_ERROR_STOP on
-- Disposable Postgres only: actual dispatch functions, synthetic jobs, no network or production wallets.
CREATE SCHEMA app_private;
CREATE TABLE public.jobs(id uuid PRIMARY KEY,project_id uuid,service_request_id uuid,status text,is_test boolean DEFAULT false,test_deleted_at timestamptz,service_code text DEFAULT 'passenger',pricing_vehicle_category_code text DEFAULT 'tricycle',final_price numeric DEFAULT 3900,commission_rate_snapshot numeric DEFAULT .10,published_at timestamptz,created_at timestamptz DEFAULT now(),assigned_driver_user_id uuid);
CREATE TABLE public.service_requests(id uuid,project_id uuid,scheduled_for timestamptz,vehicle_category_code text,details jsonb);
CREATE TABLE public.project_marketplace_dispatch_settings(project_id uuid PRIMARY KEY,enabled boolean DEFAULT true,apply_to_test_jobs boolean DEFAULT false,tie_breaker text DEFAULT 'rating_then_distance',radius_search_enabled boolean DEFAULT true,radius_1_enabled boolean DEFAULT true,radius_1_km numeric DEFAULT 1,radius_2_enabled boolean DEFAULT true,radius_2_km numeric DEFAULT 2,radius_3_enabled boolean DEFAULT true,radius_3_km numeric DEFAULT 6,expansion_enabled boolean DEFAULT true,expansion_seconds integer DEFAULT 30,allow_outside_max_radius boolean DEFAULT false,preferred_min_rating numeric DEFAULT 4,rating_priority_enabled boolean DEFAULT true,preferred_min_rating_enabled boolean DEFAULT true,minimum_rating_count_enabled boolean DEFAULT true,minimum_rating_count integer DEFAULT 5,allow_below_preferred boolean DEFAULT true);
CREATE TABLE public.project_marketplace_financial_settings(project_id uuid PRIMARY KEY,commission_enabled boolean,commission_rate numeric,updated_at timestamptz DEFAULT now());
CREATE TABLE public.marketplace_driver_locations(project_id uuid,driver_user_id uuid,vehicle_id text,latitude numeric,longitude numeric,captured_at timestamptz);
CREATE TABLE public.marketplace_customer_ratings(id uuid,project_id uuid,driver_user_id uuid,job_id uuid,stars integer);
CREATE TABLE app_private.marketplace_driver_promo_settings(project_id uuid PRIMARY KEY,profiles_enabled boolean,priority_enabled boolean,priority_seconds integer);
CREATE TABLE app_private.marketplace_driver_promo_attribution(job_id uuid PRIMARY KEY,project_id uuid,service_request_id uuid,driver_user_id uuid,source_code text,phase text DEFAULT 'pending',priority_until timestamptz,released_at timestamptz,release_reason text);
CREATE TABLE app_private.marketplace_impulsa_policy(project_id uuid PRIMARY KEY,enabled boolean,general_rate numeric,own_rate numeric,commercial_rate numeric);
CREATE TABLE app_private.marketplace_impulsa_job_policy(job_id uuid,project_id uuid,promoter_user_id uuid,general_rate numeric,own_rate numeric);
CREATE TABLE app_private.fixture_profiles(project_id uuid,driver_user_id uuid,code text,vehicle_id text,category_code text,service_codes text[],available boolean DEFAULT true,can_finance boolean DEFAULT true);
CREATE TABLE app_private.fixture_waves(job_id uuid);
CREATE FUNCTION app_private.resolve_marketplace_promo_profile(text) RETURNS TABLE(project_id uuid,driver_user_id uuid,vehicle_id text,category_code text,service_codes text[]) LANGUAGE sql STABLE AS $$ SELECT project_id,driver_user_id,vehicle_id,category_code,service_codes FROM app_private.fixture_profiles WHERE code=$1 $$;
CREATE FUNCTION app_private.marketplace_driver_can_receive_job(uuid,uuid,text,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM app_private.fixture_profiles WHERE project_id=$1 AND driver_user_id=$2 AND vehicle_id=$3 AND available) $$;
CREATE FUNCTION app_private.wallet_job_charge_enabled(uuid,uuid,boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $3 $$;
CREATE FUNCTION app_private.has_active_marketplace_work_trial(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION app_private.wallet_can_finance(uuid,uuid,uuid,numeric) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM app_private.fixture_profiles WHERE project_id=$1 AND driver_user_id=$2 AND can_finance) $$;
CREATE FUNCTION app_private.enqueue_marketplace_job_offer_wave(uuid) RETURNS integer LANGUAGE sql AS $$ INSERT INTO app_private.fixture_waves VALUES($1) RETURNING 1 $$;
CREATE FUNCTION pg_temp.check_true(b boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',message; END IF; END $$;
INSERT INTO public.project_marketplace_financial_settings(project_id,commission_enabled,commission_rate) VALUES('10000000-0000-0000-0000-000000000001',false,.10);
INSERT INTO app_private.marketplace_impulsa_policy VALUES('10000000-0000-0000-0000-000000000001',false,.15,.10,.05);
INSERT INTO public.project_marketplace_dispatch_settings(project_id) VALUES('10000000-0000-0000-0000-000000000001');
INSERT INTO app_private.marketplace_driver_promo_settings VALUES('10000000-0000-0000-0000-000000000001',true,true,30);
INSERT INTO app_private.fixture_profiles(project_id,driver_user_id,code,vehicle_id,category_code,service_codes) VALUES
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','promoter','v1','tricycle',ARRAY['passenger']),
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','fleet','v2','tricycle',ARRAY['passenger']);
INSERT INTO public.jobs(id,project_id,status,is_test,test_deleted_at,assigned_driver_user_id) VALUES
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','en_route',true,now(),'20000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','en_route',true,now(),'20000000-0000-0000-0000-000000000001');
CREATE OR REPLACE FUNCTION app_private.marketplace_haversine_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
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

    select
      l.latitude,
      l.longitude
    into
      v_driver_lat,
      v_driver_lon
    from public.marketplace_driver_locations l
    where l.project_id = target_project_id
      and l.driver_user_id = target_driver_user_id
      and l.vehicle_id = target_vehicle_id
      and l.captured_at >= now() - interval '300 seconds'
    order by l.captured_at desc
    limit 1;

    if not found then
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

    v_distance_km := app_private.marketplace_haversine_km(
      v_origin_lat,
      v_origin_lon,
      v_driver_lat,
      v_driver_lon
    );

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

    if not coalesce(v_settings.expansion_enabled, true) then
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
    v_distance_km,
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

CREATE OR REPLACE FUNCTION app_private.marketplace_promo_allows(target_project_id uuid, target_driver_user_id uuid, target_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT NOT EXISTS(
    SELECT 1 FROM app_private.marketplace_driver_promo_attribution a
    JOIN app_private.marketplace_driver_promo_settings s ON s.project_id=a.project_id AND s.profiles_enabled AND s.priority_enabled
    WHERE a.project_id=target_project_id AND a.job_id=target_job_id AND a.phase='preferred'
      AND a.priority_until>now() AND a.driver_user_id<>target_driver_user_id
  )
$function$;

CREATE OR REPLACE FUNCTION app_private.impulsa_effective_rate(target_project_id uuid, target_job_id uuid, target_driver_user_id uuid, target_general_rate numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT coalesce((SELECT s.own_rate FROM app_private.marketplace_impulsa_job_policy s
 WHERE s.project_id=target_project_id AND s.job_id=target_job_id AND s.promoter_user_id=target_driver_user_id
 AND s.general_rate=target_general_rate),target_general_rate)
$function$;

\i supabase/migrations/20261115002454_marketplace_impulsa_priority_and_staged_rate.sql
\i supabase/migrations/20261115002543_marketplace_impulsa_priority_recheck.sql
CREATE OR REPLACE FUNCTION app_private.marketplace_promo_on_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE attr app_private.marketplace_driver_promo_attribution%ROWTYPE; seconds integer;
BEGIN
  IF OLD.status<>'requested' OR NEW.status<>'published' THEN RETURN NEW; END IF;
  SELECT * INTO attr FROM app_private.marketplace_driver_promo_attribution a WHERE a.job_id=NEW.id AND a.project_id=NEW.project_id FOR UPDATE;
  IF NOT FOUND OR attr.phase<>'pending' THEN RETURN NEW; END IF;
  SELECT cfg.priority_seconds INTO seconds FROM app_private.marketplace_driver_promo_settings cfg WHERE cfg.project_id=NEW.project_id;
  IF app_private.marketplace_promo_preferred_eligible(NEW.id,attr.driver_user_id,attr.source_code) THEN
    UPDATE app_private.marketplace_driver_promo_attribution SET phase='preferred',priority_until=now()+make_interval(secs=>seconds) WHERE job_id=NEW.id;
  ELSE
    UPDATE app_private.marketplace_driver_promo_attribution SET phase='fleet',released_at=now(),release_reason='initially_ineligible' WHERE job_id=NEW.id;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION app_private.marketplace_promo_release_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE pending record; total integer:=0; reason text;
BEGIN
  FOR pending IN
    SELECT a.job_id,a.driver_user_id,a.source_code,a.priority_until
    FROM app_private.marketplace_driver_promo_attribution a
    JOIN public.jobs j ON j.id=a.job_id AND j.project_id=a.project_id
    WHERE a.phase='preferred' AND j.status='published'
    ORDER BY a.job_id FOR UPDATE OF j SKIP LOCKED
  LOOP
    reason:=CASE WHEN pending.priority_until<=now() THEN 'timeout'
      WHEN NOT app_private.marketplace_promo_preferred_eligible(pending.job_id,pending.driver_user_id,pending.source_code) THEN 'ineligible'
      ELSE NULL END;
    IF reason IS NOT NULL THEN
      UPDATE app_private.marketplace_driver_promo_attribution a SET phase='fleet',released_at=now(),release_reason=reason
      WHERE a.job_id=pending.job_id AND a.phase='preferred';
      IF FOUND THEN
        total:=total+1;
        PERFORM app_private.enqueue_marketplace_job_offer_wave(pending.job_id);
      END IF;
    END IF;
  END LOOP;
  RETURN total;
END $function$;

CREATE TRIGGER promo_publish AFTER UPDATE OF status ON public.jobs FOR EACH ROW EXECUTE FUNCTION app_private.marketplace_promo_on_publish();
CREATE FUNCTION pg_temp.publish_promo(category text DEFAULT 'tricycle', promo boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001'; j uuid:=gen_random_uuid(); sr uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.service_requests VALUES(sr,pid,NULL,category,'{"route_origin":{"lat":23.1,"lon":-82.4}}');
 INSERT INTO public.jobs(id,project_id,service_request_id,status,commission_rate_snapshot) VALUES(j,pid,sr,'requested',.15);
 IF promo THEN INSERT INTO app_private.marketplace_driver_promo_attribution(job_id,project_id,service_request_id,driver_user_id,source_code) VALUES(j,pid,sr,'20000000-0000-0000-0000-000000000001','promoter'); END IF;
 UPDATE public.jobs SET status='published',published_at=now() WHERE id=j;
 RETURN j;
END $$;

DO $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001'; promoter uuid:='20000000-0000-0000-0000-000000000001'; fleet uuid:='20000000-0000-0000-0000-000000000002'; j uuid; busy uuid:=gen_random_uuid(); other uuid;
BEGIN
 PERFORM pg_temp.check_true((SELECT commission_rate=.15 AND NOT commission_enabled FROM public.project_marketplace_financial_settings WHERE project_id=pid),'staged rate 15%, billing still disabled');
 PERFORM pg_temp.check_true((SELECT NOT enabled AND own_rate=.10 AND commercial_rate=.05 FROM app_private.marketplace_impulsa_policy WHERE project_id=pid),'Impulsa disabled with 10/5 rates');
 PERFORM pg_temp.check_true((SELECT count(*)=2 AND bool_and(commission_rate_snapshot=.10) FROM public.jobs WHERE test_deleted_at IS NOT NULL),'historic rates and archived jobs unchanged');
 INSERT INTO public.marketplace_driver_locations VALUES(pid,promoter,'v1',23.111,-82.4,now()),(pid,fleet,'v2',23.101,-82.4,now());
 j:=pg_temp.publish_promo();
 PERFORM pg_temp.check_true((SELECT NOT allowed AND radius_stage=2 AND eligible_from>now() FROM app_private.marketplace_promo_base_candidate_state(pid,promoter,'v1',j)),'normal radar delays stage 2');
 PERFORM pg_temp.check_true((SELECT phase='preferred' AND priority_until=now()+interval '30 seconds' FROM app_private.marketplace_driver_promo_attribution WHERE job_id=j),'archived jobs ignored and exclusive window starts');
 PERFORM pg_temp.check_true((SELECT allowed FROM app_private.marketplace_dispatch_candidate_state(pid,promoter,'v1',j)),'promoter immediately eligible');
 PERFORM pg_temp.check_true((SELECT NOT allowed FROM app_private.marketplace_dispatch_candidate_state(pid,fleet,'v2',j)),'closer fleet driver excluded during priority');
 INSERT INTO public.jobs(id,project_id,status,assigned_driver_user_id) VALUES(busy,pid,'en_route',promoter);
 PERFORM pg_temp.check_true((SELECT NOT allowed FROM app_private.marketplace_dispatch_candidate_state(pid,promoter,'v1',j)),'active real job prevents priority acceptance');
 PERFORM pg_temp.check_true(app_private.marketplace_promo_release_due()=1,'ineligible priority released');
 PERFORM pg_temp.check_true((SELECT phase='fleet' AND release_reason='ineligible' FROM app_private.marketplace_driver_promo_attribution WHERE job_id=j),'attribution retained when released');
 PERFORM pg_temp.check_true((SELECT allowed FROM app_private.marketplace_dispatch_candidate_state(pid,fleet,'v2',j)),'fleet eligible after release');
 PERFORM pg_temp.check_true(EXISTS(SELECT 1 FROM app_private.fixture_waves WHERE job_id=j),'release enqueues general wave');
 UPDATE public.jobs SET status='settled' WHERE id=busy;
 j:=pg_temp.publish_promo();
 UPDATE app_private.marketplace_driver_promo_attribution SET priority_until=now()-interval '1 second' WHERE job_id=j;
 PERFORM pg_temp.check_true((SELECT allowed FROM app_private.marketplace_dispatch_candidate_state(pid,fleet,'v2',j)),'expiry permits normal radar before reconciler');
 PERFORM pg_temp.check_true(app_private.marketplace_promo_release_due()=1,'timeout reconciled');
 PERFORM pg_temp.check_true((SELECT phase='fleet' AND release_reason='timeout' FROM app_private.marketplace_driver_promo_attribution WHERE job_id=j),'timeout reason saved');
 UPDATE public.marketplace_driver_locations SET captured_at=now()-interval '301 seconds' WHERE driver_user_id=promoter;
 j:=pg_temp.publish_promo();
 PERFORM pg_temp.check_true((SELECT phase='fleet' AND release_reason='initially_ineligible' FROM app_private.marketplace_driver_promo_attribution WHERE job_id=j),'stale GPS not prioritized');
 UPDATE public.marketplace_driver_locations SET captured_at=now(),latitude=23.2 WHERE driver_user_id=promoter;
 j:=pg_temp.publish_promo();
 PERFORM pg_temp.check_true((SELECT phase='fleet' FROM app_private.marketplace_driver_promo_attribution WHERE job_id=j),'hard maximum radius preserved');
 UPDATE public.marketplace_driver_locations SET latitude=23.111 WHERE driver_user_id=promoter;
 j:=pg_temp.publish_promo('auto');
 PERFORM pg_temp.check_true((SELECT phase='fleet' FROM app_private.marketplace_driver_promo_attribution WHERE job_id=j),'incompatible vehicle not prioritized');
 UPDATE app_private.fixture_profiles SET available=false WHERE driver_user_id=promoter;
 j:=pg_temp.publish_promo();
 PERFORM pg_temp.check_true((SELECT phase='fleet' FROM app_private.marketplace_driver_promo_attribution WHERE job_id=j),'unavailable promoter not prioritized');
 UPDATE app_private.fixture_profiles SET available=true WHERE driver_user_id=promoter;
 j:=pg_temp.publish_promo('tricycle',false);
 PERFORM pg_temp.check_true((SELECT allowed FROM app_private.marketplace_dispatch_candidate_state(pid,fleet,'v2',j)),'ordinary dispatch unchanged');
 PERFORM pg_temp.check_true((SELECT NOT allowed FROM app_private.marketplace_dispatch_candidate_state(pid,promoter,'v1',j)),'ordinary stage 2 still delayed');
 INSERT INTO app_private.marketplace_impulsa_job_policy VALUES(j,pid,promoter,.15,.10);
 PERFORM pg_temp.check_true(app_private.impulsa_effective_rate(pid,j,promoter,.15)=.10,'own client commission 10%');
 PERFORM pg_temp.check_true(app_private.impulsa_effective_rate(pid,j,fleet,.15)=.15,'another driver commission 15%');
 RAISE NOTICE 'Impulsa priority, archived jobs, radius, GPS, busy recheck, expiry, fleet fallback and staged rates passed';
END $$;
