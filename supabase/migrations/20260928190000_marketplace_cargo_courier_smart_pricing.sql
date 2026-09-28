-- Extends smart_pricing_v1 to cargo and courier while preserving passenger behavior.
CREATE OR REPLACE FUNCTION app_private.calculate_marketplace_customer_quote_smart_v1(
  target_project_id uuid,
  target_service_code text,
  target_vehicle_category_code text,
  target_passenger_count integer,
  target_scheduled_for timestamp with time zone,
  target_details jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
declare
  cfg public.project_marketplace_pricing_settings%rowtype;
  tariff public.marketplace_pricing_tariffs%rowtype;
  exchange_cfg public.project_exchange_settings%rowtype;
  rule record;
  details_value jsonb := coalesce(target_details,'{}'::jsonb);
  distance_text text;
  distance_km numeric;
  distance_source text;
  stop_text text;
  stop_count integer := 0;
  effective_at timestamptz := coalesce(target_scheduled_for,now());
  local_effective timestamp;
  local_date date;
  local_time time;
  local_dow smallint;
  base_component numeric;
  distance_component numeric;
  passenger_component numeric;
  stop_component numeric;
  structural_before_min numeric;
  structural_subtotal numeric;
  raw_dynamic_usd numeric := 0;
  capped_dynamic_raw_usd numeric := 0;
  exempt_dynamic_usd numeric := 0;
  dynamic_cap_usd numeric := 0;
  capped_dynamic_applied_usd numeric := 0;
  applied_dynamic_usd numeric := 0;
  cap_factor numeric := 1;
  raw_amount numeric;
  rule_cap_exempt boolean;
  adjustments_raw jsonb := '[]'::jsonb;
  adjustments_applied jsonb := '[]'::jsonb;
  used_stack_groups text[] := '{}'::text[];
  rule_eligible boolean;
  selected_rate numeric;
  selected_source text;
  selected_rate_updated_at timestamptz;
  fallback_used boolean := false;
  fallback_reason text;
  rate_selected_at timestamptz := now();
  total_usd numeric;
  cup_before_rounding numeric;
  final_cup numeric;
  minimum_cup numeric;
  ttl_minutes integer := 30;
  pricing_version text;
begin
  if target_service_code not in ('passenger','cargo','courier') then
    raise exception 'SMART_PRICING_SERVICE_UNSUPPORTED' using errcode='22023';
  end if;

  if target_service_code = 'passenger'
     and target_vehicle_category_code not in ('motorcycle','bicitaxi','tricycle','light_car') then
    raise exception 'PASSENGER_VEHICLE_CATEGORY_INVALID' using errcode='22023';
  end if;

  if target_service_code in ('cargo','courier')
     and not exists (
       select 1
       from public.vehicle_categories c
       where c.project_id=target_project_id
         and c.code=target_vehicle_category_code
         and c.active
     ) then
    raise exception 'VEHICLE_CATEGORY_NOT_FOUND' using errcode='P0002';
  end if;

  if target_service_code = 'passenger'
     and coalesce(target_passenger_count,0) <= 0 then
    raise exception 'PASSENGER_COUNT_REQUIRED' using errcode='22023';
  end if;

  if jsonb_typeof(details_value) <> 'object' then
    raise exception 'CUSTOMER_REQUEST_DETAILS_MUST_BE_OBJECT' using errcode='22023';
  end if;

  if octet_length(details_value::text) > 16384 then
    raise exception 'CUSTOMER_REQUEST_DETAILS_TOO_LARGE' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.service_types s
    where s.project_id=target_project_id
      and s.code=target_service_code
      and s.active
  ) then
    raise exception 'MARKETPLACE_SERVICE_NOT_AVAILABLE' using errcode='22023';
  end if;

  select * into cfg
  from public.project_marketplace_pricing_settings s
  where s.project_id=target_project_id;

  if not found or not cfg.engine_enabled then
    raise exception 'SMART_PRICING_ENGINE_DISABLED' using errcode='22023';
  end if;

  if cfg.base_currency <> 'USD' or cfg.charge_currency <> 'CUP' then
    raise exception 'SMART_PRICING_CURRENCY_CONFIG_INVALID' using errcode='22023';
  end if;

  distance_text := nullif(btrim(details_value->>'estimated_distance_km'),'');
  distance_source := nullif(btrim(details_value->>'distance_source'),'');

  if distance_text is null or distance_text !~ '^[0-9]+([.][0-9]+)?$' then
    raise exception 'SMART_PRICING_DISTANCE_REQUIRED' using errcode='22023';
  end if;

  distance_km := distance_text::numeric;
  if distance_km <= 0 or distance_km > 5000 then
    raise exception 'ESTIMATED_DISTANCE_INVALID' using errcode='22023';
  end if;

  if distance_source <> 'provider' then
    raise exception 'SMART_PRICING_VERIFIED_DISTANCE_REQUIRED' using errcode='22023';
  end if;

  stop_text := nullif(btrim(details_value->>'stop_count'),'');
  if stop_text is not null then
    if stop_text !~ '^[0-9]+$' then
      raise exception 'STOP_COUNT_INVALID' using errcode='22023';
    end if;
    stop_count := stop_text::integer;
    if stop_count > 20 then
      raise exception 'STOP_COUNT_INVALID' using errcode='22023';
    end if;
  end if;

  select * into tariff
  from public.marketplace_pricing_tariffs t
  where t.project_id=target_project_id
    and t.service_code=target_service_code
    and t.vehicle_category_code=target_vehicle_category_code
    and t.status='active'
    and t.currency='USD'
    and t.effective_from <= effective_at
    and (t.effective_to is null or t.effective_to > effective_at)
  order by t.effective_from desc,t.created_at desc
  limit 1;

  if not found then
    raise exception 'SMART_PRICING_TARIFF_NOT_CONFIGURED' using errcode='P0002';
  end if;

  local_effective := timezone(cfg.timezone,effective_at);
  local_date := local_effective::date;
  local_time := local_effective::time;
  local_dow := extract(dow from local_effective)::smallint;

  base_component := tariff.base_price_usd;
  distance_component := distance_km * tariff.per_km_price_usd;
  passenger_component :=
    case
      when target_service_code='passenger'
        then greatest(coalesce(target_passenger_count,0)-1,0) * tariff.per_extra_passenger_price_usd
      else 0
    end;
  stop_component := stop_count * tariff.per_stop_price_usd;

  structural_before_min :=
    base_component + distance_component + passenger_component + stop_component;
  structural_subtotal := greatest(tariff.minimum_price_usd,structural_before_min);

  for rule in
    select r.*
    from public.marketplace_pricing_adjustments r
    where r.project_id=target_project_id
      and r.service_code=target_service_code
      and r.status='active'
      and r.effective_from <= effective_at
      and (r.effective_to is null or r.effective_to > effective_at)
      and (
        cardinality(r.vehicle_category_codes)=0
        or target_vehicle_category_code=any(r.vehicle_category_codes)
      )
    order by r.priority asc,r.code asc,r.version desc
  loop
    rule_eligible := true;

    if cardinality(rule.weekdays)>0 and not (local_dow=any(rule.weekdays)) then
      rule_eligible := false;
    elsif cardinality(rule.weekdays)=0 and rule.rule_kind='weekend' and local_dow not in (0,6) then
      rule_eligible := false;
    end if;

    if rule_eligible then
      if rule.local_time_start is null and rule.local_time_end is null then
        null;
      elsif rule.local_time_start is null or rule.local_time_end is null then
        rule_eligible := false;
      elsif rule.local_time_start = rule.local_time_end then
        null;
      elsif rule.local_time_start < rule.local_time_end then
        if not (local_time >= rule.local_time_start and local_time < rule.local_time_end) then
          rule_eligible := false;
        end if;
      else
        if not (local_time >= rule.local_time_start or local_time < rule.local_time_end) then
          rule_eligible := false;
        end if;
      end if;
    end if;

    if rule_eligible and rule.rule_kind='holiday' then
      if not (
        rule.condition_config ? 'dates'
        and jsonb_typeof(rule.condition_config->'dates')='array'
        and (rule.condition_config->'dates') ? local_date::text
      ) then
        rule_eligible := false;
      end if;
    end if;

    if rule_eligible and rule.rule_kind='distance_band' then
      if rule.condition_config ? 'min_distance_km'
         and distance_km < (rule.condition_config->>'min_distance_km')::numeric then
        rule_eligible := false;
      end if;
      if rule.condition_config ? 'max_distance_km'
         and distance_km >= (rule.condition_config->>'max_distance_km')::numeric then
        rule_eligible := false;
      end if;
    end if;

    if rule_eligible and rule.rule_kind='high_demand' then
      if not coalesce((rule.condition_config->>'manual_active')::boolean,false) then
        rule_eligible := false;
      end if;
    end if;

    if rule_eligible and rule.rule_kind='special_zone' then
      if not app_private.smart_pricing_special_zone_matches(rule.condition_config,details_value) then
        rule_eligible := false;
      end if;
    elsif rule_eligible and rule.rule_kind='custom' then
      if not coalesce((rule.condition_config->>'apply_globally')::boolean,false) then
        rule_eligible := false;
      end if;
    end if;

    if rule_eligible and rule.stack_group is not null then
      if rule.stack_group=any(used_stack_groups) then
        rule_eligible := false;
      else
        used_stack_groups := array_append(used_stack_groups,rule.stack_group);
      end if;
    end if;

    if rule_eligible then
      raw_amount :=
        case rule.adjustment_type
          when 'percent' then structural_subtotal * rule.adjustment_value
          when 'fixed_usd' then rule.adjustment_value
          else 0
        end;

      rule_cap_exempt := coalesce((rule.condition_config->>'cap_exempt')::boolean,false);

      raw_dynamic_usd := raw_dynamic_usd + raw_amount;
      if rule_cap_exempt then
        exempt_dynamic_usd := exempt_dynamic_usd + raw_amount;
      else
        capped_dynamic_raw_usd := capped_dynamic_raw_usd + raw_amount;
      end if;

      adjustments_raw := adjustments_raw || jsonb_build_array(
        jsonb_build_object(
          'id',rule.id,
          'code',rule.code,
          'version',rule.version,
          'name',rule.name,
          'rule_kind',rule.rule_kind,
          'adjustment_type',rule.adjustment_type,
          'adjustment_value',rule.adjustment_value,
          'priority',rule.priority,
          'stack_group',rule.stack_group,
          'cap_exempt',rule_cap_exempt,
          'raw_amount_usd',round(raw_amount,6)
        )
      );
    end if;
  end loop;

  dynamic_cap_usd := structural_subtotal * cfg.max_dynamic_adjustment_ratio;
  capped_dynamic_applied_usd := least(capped_dynamic_raw_usd,dynamic_cap_usd);
  applied_dynamic_usd := capped_dynamic_applied_usd + exempt_dynamic_usd;

  if capped_dynamic_raw_usd > 0 then
    cap_factor := capped_dynamic_applied_usd / capped_dynamic_raw_usd;
  end if;

  if jsonb_array_length(adjustments_raw)>0 then
    select coalesce(
      jsonb_agg(
        elem || jsonb_build_object(
          'applied_amount_usd',
          round(
            case
              when coalesce((elem->>'cap_exempt')::boolean,false)
                then (elem->>'raw_amount_usd')::numeric
              else (elem->>'raw_amount_usd')::numeric * cap_factor
            end,
            6
          )
        )
      ),
      '[]'::jsonb
    )
    into adjustments_applied
    from jsonb_array_elements(adjustments_raw) elem;
  end if;

  total_usd := structural_subtotal + applied_dynamic_usd;

  select * into exchange_cfg
  from public.project_exchange_settings e
  where e.project_id=target_project_id;

  if not found
     or exchange_cfg.base_currency <> 'USD'
     or exchange_cfg.charge_currency <> 'CUP' then
    raise exception 'USD_CUP_EXCHANGE_SETTINGS_INVALID' using errcode='22023';
  end if;

  if exchange_cfg.rate_mode='manual' then
    if exchange_cfg.current_rate is null or exchange_cfg.current_rate <= 0 then
      raise exception 'USD_CUP_EXCHANGE_RATE_INVALID' using errcode='22023';
    end if;
    selected_rate := exchange_cfg.current_rate;
    selected_source := exchange_cfg.rate_source;
    selected_rate_updated_at := exchange_cfg.rate_updated_at;
  elsif exchange_cfg.rate_mode='automatic' then
    if exchange_cfg.last_auto_sync_status='ok' then
      if exchange_cfg.current_rate is null or exchange_cfg.current_rate <= 0 then
        raise exception 'USD_CUP_EXCHANGE_RATE_INVALID' using errcode='22023';
      end if;
      selected_rate := exchange_cfg.current_rate;
      selected_source := exchange_cfg.rate_source;
      selected_rate_updated_at := exchange_cfg.rate_updated_at;
    else
      if exchange_cfg.fallback_rate is null or exchange_cfg.fallback_rate <= 0 then
        raise exception 'USD_CUP_EXCHANGE_FALLBACK_RATE_INVALID' using errcode='22023';
      end if;
      selected_rate := exchange_cfg.fallback_rate;
      selected_source := 'fallback';
      selected_rate_updated_at := exchange_cfg.updated_at;
      fallback_used := true;
      fallback_reason := 'automatic_sync_unavailable';
    end if;
  else
    raise exception 'USD_CUP_EXCHANGE_MODE_INVALID' using errcode='22023';
  end if;

  cup_before_rounding := total_usd * selected_rate;

  if cfg.rounding_mode <> 'up' or cfg.rounding_increment <= 0 then
    raise exception 'SMART_PRICING_ROUNDING_CONFIG_INVALID' using errcode='22023';
  end if;

  final_cup := ceil(cup_before_rounding/cfg.rounding_increment)*cfg.rounding_increment;
  minimum_cup := final_cup;
  pricing_version := cfg.engine_version||':'||tariff.version;

  select coalesce(r.publication_ttl_minutes,30)
  into ttl_minutes
  from public.marketplace_pricing_rules r
  where r.project_id=target_project_id
    and r.service_code=target_service_code
    and r.active
  limit 1;

  ttl_minutes := coalesce(ttl_minutes,30);

  return jsonb_build_object(
    'recommended_price',final_cup,
    'minimum_price',minimum_cup,
    'low_price_warning_threshold',minimum_cup,
    'currency','CUP',
    'pricing_version',pricing_version,
    'publication_ttl_minutes',ttl_minutes,
    'pricing_engine_version',cfg.engine_version,
    'pricing_tariff_id',tariff.id,
    'pricing_vehicle_category_code',target_vehicle_category_code,
    'pricing_total_usd',total_usd,
    'exchange_rate_snapshot',selected_rate,
    'exchange_rate_source_snapshot',selected_source,
    'exchange_rate_updated_at_snapshot',selected_rate_updated_at,
    'exchange_rate_fallback_used',fallback_used,
    'cup_before_rounding',cup_before_rounding,
    'rounding_mode_snapshot',cfg.rounding_mode,
    'rounding_increment_snapshot',cfg.rounding_increment,
    'pricing_breakdown',jsonb_build_object(
      'engine_version',cfg.engine_version,
      'pricing_version',pricing_version,
      'tariff_id',tariff.id,
      'tariff_version',tariff.version,
      'service_code',target_service_code,
      'vehicle_category_code',target_vehicle_category_code,
      'pricing_effective_at',effective_at,
      'timezone',cfg.timezone,
      'local_effective_at',local_effective,
      'distance_km',distance_km,
      'distance_source',distance_source,
      'passenger_count',target_passenger_count,
      'stop_count',stop_count,
      'components_usd',jsonb_build_object(
        'base',round(base_component,6),
        'distance',round(distance_component,6),
        'extra_passengers',round(passenger_component,6),
        'stops',round(stop_component,6),
        'structural_before_minimum',round(structural_before_min,6),
        'minimum_price_usd',tariff.minimum_price_usd,
        'structural_subtotal',round(structural_subtotal,6)
      ),
      'adjustments',adjustments_applied,
      'dynamic_adjustment_raw_usd',round(raw_dynamic_usd,6),
      'dynamic_adjustment_capped_raw_usd',round(capped_dynamic_raw_usd,6),
      'dynamic_adjustment_exempt_usd',round(exempt_dynamic_usd,6),
      'dynamic_adjustment_cap_ratio',cfg.max_dynamic_adjustment_ratio,
      'dynamic_adjustment_cap_usd',round(dynamic_cap_usd,6),
      'dynamic_adjustment_applied_usd',round(applied_dynamic_usd,6),
      'dynamic_cap_applied',capped_dynamic_raw_usd>capped_dynamic_applied_usd,
      'total_usd',round(total_usd,6),
      'exchange_rate',selected_rate,
      'exchange_rate_source',selected_source,
      'exchange_rate_updated_at',selected_rate_updated_at,
      'exchange_rate_fallback_used',fallback_used,
      'exchange_rate_fallback_reason',fallback_reason,
      'last_auto_sync_status',exchange_cfg.last_auto_sync_status,
      'exchange_rate_selected_at',rate_selected_at,
      'cup_before_rounding',round(cup_before_rounding,6),
      'rounding_mode',cfg.rounding_mode,
      'rounding_increment',cfg.rounding_increment,
      'final_cup',final_cup,
      'minimum_price',minimum_cup,
      'low_price_warning_threshold',minimum_cup
    )
  );
end;
$function$;


-- Keep the existing administration contract, but limit this release to the
-- three supported services and force cargo/courier extra-passenger pricing to 0.
create or replace function public.admin_publish_marketplace_pricing_tariff(
  target_project_id uuid, target_service_code text, target_vehicle_category_code text,
  target_base_price_usd numeric, target_minimum_price_usd numeric, target_per_km_price_usd numeric,
  target_per_extra_passenger_price_usd numeric, target_per_stop_price_usd numeric
) returns public.marketplace_pricing_tariffs
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  previous public.marketplace_pricing_tariffs%rowtype;
  result public.marketplace_pricing_tariffs%rowtype;
  effective_at timestamptz;
  next_version text;
  normalized_extra_passenger numeric;
begin
  actor := app_private.require_project_permission(target_project_id, 'marketplace.manage');

  if target_service_code not in ('passenger','cargo','courier') then
    raise exception 'MARKETPLACE_PRICING_SERVICE_UNSUPPORTED' using errcode='22023';
  end if;

  normalized_extra_passenger :=
    case when target_service_code='passenger'
      then target_per_extra_passenger_price_usd
      else 0
    end;

  if target_base_price_usd is null
     or target_minimum_price_usd is null
     or target_per_km_price_usd is null
     or normalized_extra_passenger is null
     or target_per_stop_price_usd is null
     or target_base_price_usd < 0
     or target_minimum_price_usd < 0
     or target_per_km_price_usd < 0
     or normalized_extra_passenger < 0
     or target_per_stop_price_usd < 0 then
    raise exception 'INVALID_USD_TARIFF_AMOUNT' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.service_types
    where project_id=target_project_id
      and code=target_service_code
      and active
  ) then
    raise exception 'MARKETPLACE_SERVICE_NOT_FOUND' using errcode='P0002';
  end if;

  if not exists(
    select 1
    from public.vehicle_categories
    where project_id=target_project_id
      and code=target_vehicle_category_code
      and active
  ) then
    raise exception 'VEHICLE_CATEGORY_NOT_FOUND' using errcode='P0002';
  end if;

  if target_service_code='passenger'
     and target_vehicle_category_code not in ('motorcycle','bicitaxi','tricycle','light_car') then
    raise exception 'PASSENGER_VEHICLE_CATEGORY_INVALID' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'smart-pricing-tariff:'||target_project_id::text||':'||target_service_code||':'||target_vehicle_category_code,
      0
    )
  );

  effective_at := now();

  select * into previous
  from public.marketplace_pricing_tariffs
  where project_id=target_project_id
    and service_code=target_service_code
    and vehicle_category_code=target_vehicle_category_code
    and status='active'
    and effective_from<=effective_at
    and (effective_to is null or effective_to>effective_at)
  order by effective_from desc,created_at desc
  limit 1
  for update;

  if found then
    update public.marketplace_pricing_tariffs
    set status='retired',
        effective_to=effective_at,
        updated_by=actor,
        updated_at=effective_at
    where id=previous.id;
  end if;

  next_version := 'admin-' || to_char(effective_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS');

  insert into public.marketplace_pricing_tariffs(
    project_id,service_code,vehicle_category_code,version,status,currency,
    base_price_usd,minimum_price_usd,per_km_price_usd,
    per_extra_passenger_price_usd,per_stop_price_usd,
    effective_from,effective_to,metadata,created_by,updated_by
  )
  values(
    target_project_id,target_service_code,target_vehicle_category_code,
    next_version,'active','USD',
    target_base_price_usd,target_minimum_price_usd,target_per_km_price_usd,
    normalized_extra_passenger,target_per_stop_price_usd,
    effective_at,null,
    coalesce(previous.metadata,'{}'::jsonb)||jsonb_build_object('admin_origin','vrixora_admin'),
    actor,actor
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.admin_publish_marketplace_pricing_tariff(
  uuid,text,text,numeric,numeric,numeric,numeric,numeric
) from public, anon;

grant execute on function public.admin_publish_marketplace_pricing_tariff(
  uuid,text,text,numeric,numeric,numeric,numeric,numeric
) to authenticated;
-- Expose the active pricing catalog needed by Vrixora Admin.
create or replace function public.admin_get_marketplace_pricing_dashboard(target_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');

  select jsonb_build_object(
    'can_manage',
      app_private.has_project_permission(target_project_id, 'marketplace.manage'),
    'settings',
      coalesce((
        select to_jsonb(s)
        from public.project_marketplace_pricing_settings s
        where s.project_id=target_project_id
      ), '{}'::jsonb),
    'exchange',
      coalesce((
        select to_jsonb(e)
        from public.project_exchange_settings e
        where e.project_id=target_project_id
      ), '{}'::jsonb),
    'service_types',
      coalesce((
        select jsonb_agg(to_jsonb(s) order by s.sort_order, s.code)
        from public.service_types s
        where s.project_id=target_project_id
          and s.active
      ), '[]'::jsonb),
    'vehicle_categories',
      coalesce((
        select jsonb_agg(to_jsonb(c) order by c.sort_order, c.code)
        from public.vehicle_categories c
        where c.project_id=target_project_id
          and c.active
      ), '[]'::jsonb),
    'tariffs',
      coalesce((
        select jsonb_agg(to_jsonb(t) order by t.service_code,t.vehicle_category_code)
        from public.marketplace_pricing_tariffs t
        where t.project_id=target_project_id
          and t.status='active'
          and t.effective_from<=now()
          and (t.effective_to is null or t.effective_to>now())
      ), '[]'::jsonb),
    'adjustments',
      coalesce((
        select jsonb_agg(to_jsonb(a) order by a.priority,a.code)
        from (
          select distinct on (project_id,code) *
          from public.marketplace_pricing_adjustments
          where project_id=target_project_id
          order by project_id,code,version desc
        ) a
      ), '[]'::jsonb),
    'legacy_publication_ttl_minutes',
      coalesce((
        select jsonb_object_agg(r.service_code,r.publication_ttl_minutes)
        from public.marketplace_pricing_rules r
        where r.project_id=target_project_id
          and r.active
      ), '{}'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.admin_get_marketplace_pricing_dashboard(uuid)
from public, anon;

grant execute on function public.admin_get_marketplace_pricing_dashboard(uuid)
to authenticated;


-- Smart quote preview v2: passenger, cargo and courier.
create or replace function public.preview_marketplace_customer_quote_v2(
  target_service_code text,
  target_vehicle_category_code text,
  target_passenger_count integer,
  target_distance_km numeric,
  target_stop_count integer,
  target_scheduled_for timestamptz DEFAULT NULL
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  pid uuid;
begin
  if target_service_code not in ('passenger','cargo','courier') then
    raise exception 'SMART_PRICING_SERVICE_UNSUPPORTED' using errcode='22023';
  end if;

  if target_distance_km is null
     or target_distance_km <= 0
     or target_distance_km > 5000 then
    raise exception 'ROUTE_QUOTE_INPUT_INVALID' using errcode='22023';
  end if;

  if target_stop_count is null
     or target_stop_count < 0
     or target_stop_count > 20 then
    raise exception 'ROUTE_QUOTE_INPUT_INVALID' using errcode='22023';
  end if;

  select p.id
  into pid
  from public.projects p
  where p.slug='tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND' using errcode='P0002';
  end if;

  return app_private.calculate_marketplace_customer_quote_smart_v1(
    pid,
    target_service_code,
    target_vehicle_category_code,
    target_passenger_count,
    target_scheduled_for,
    jsonb_build_object(
      'estimated_distance_km', target_distance_km,
      'distance_source', 'provider',
      'stop_count', target_stop_count
    )
  );
end;
$$;


-- Smart quote preview v3: preserves destination coordinates used by special-zone rules.
create or replace function public.preview_marketplace_customer_quote_v3(
  target_service_code text,
  target_vehicle_category_code text,
  target_passenger_count integer,
  target_distance_km numeric,
  target_stop_count integer,
  target_destination_lat numeric,
  target_destination_lon numeric,
  target_scheduled_for timestamptz DEFAULT NULL
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  pid uuid;
begin
  if target_service_code not in ('passenger','cargo','courier') then
    raise exception 'SMART_PRICING_SERVICE_UNSUPPORTED' using errcode='22023';
  end if;

  if target_distance_km is null
     or target_distance_km<=0
     or target_distance_km>5000
     or target_stop_count is null
     or target_stop_count<0
     or target_stop_count>20
     or target_destination_lat is null
     or abs(target_destination_lat)>90
     or target_destination_lon is null
     or abs(target_destination_lon)>180 then
    raise exception 'ROUTE_QUOTE_INPUT_INVALID' using errcode='22023';
  end if;

  select p.id
  into pid
  from public.projects p
  where p.slug='tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND' using errcode='P0002';
  end if;

  return app_private.calculate_marketplace_customer_quote_smart_v1(
    pid,
    target_service_code,
    target_vehicle_category_code,
    target_passenger_count,
    target_scheduled_for,
    jsonb_build_object(
      'estimated_distance_km',target_distance_km,
      'distance_source','provider',
      'stop_count',target_stop_count,
      'route_destination',jsonb_build_object(
        'lat',target_destination_lat,
        'lon',target_destination_lon
      )
    )
  );
end;
$$;


-- Customer request v2: expand the smart-pricing path without changing passenger behavior.
create or replace function public.create_marketplace_customer_request_v2(
  target_session_id uuid,
  target_session_token text,
  target_service_code text,
  target_origin_text text,
  target_destination_text text,
  target_scheduled_for timestamptz,
  target_passenger_count integer,
  target_cargo_weight_kg numeric,
  target_cargo_volume_m3 numeric,
  target_cargo_length_cm numeric,
  target_cargo_width_cm numeric,
  target_cargo_height_cm numeric,
  target_required_body_type text,
  target_notes text,
  target_details jsonb,
  target_vehicle_category_code text,
  target_idempotency_key uuid
)
returns table(
  job_id uuid,
  service_request_id uuid,
  status text,
  recommended_price numeric,
  minimum_price numeric,
  low_price_warning_threshold numeric,
  currency text,
  pricing_version text,
  pricing_breakdown jsonb,
  server_time timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare
  pid uuid;
  cid uuid;
  normalized_service text := nullif(btrim(target_service_code),'');
  normalized_origin text := nullif(btrim(target_origin_text),'');
  normalized_destination text := nullif(btrim(target_destination_text),'');
  normalized_body_type text := nullif(btrim(target_required_body_type),'');
  normalized_notes text := nullif(btrim(target_notes),'');
  normalized_category text := nullif(btrim(target_vehicle_category_code),'');
  details_value jsonb := coalesce(target_details,'{}'::jsonb);
  quote jsonb;
  payload jsonb;
  payload_digest text;
  op public.marketplace_customer_request_operations%rowtype;
  request_row public.service_requests%rowtype;
  job_row public.jobs%rowtype;
  commission_rate numeric(8,6);
begin
  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;

  if normalized_service not in ('passenger','cargo','courier') then
    raise exception 'SMART_PRICING_SERVICE_UNSUPPORTED' using errcode='22023';
  end if;

  if normalized_service='passenger'
     and normalized_category not in ('motorcycle','bicitaxi','tricycle','light_car') then
    raise exception 'PASSENGER_VEHICLE_CATEGORY_INVALID' using errcode='22023';
  end if;

  cid := app_private.resolve_marketplace_customer_session(
    target_session_id,target_session_token
  );

  select p.id
  into pid
  from public.projects p
  where p.slug='tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND' using errcode='P0002';
  end if;

  if normalized_service in ('cargo','courier')
     and not exists(
       select 1
       from public.vehicle_categories c
       where c.project_id=pid
         and c.code=normalized_category
         and c.active
     ) then
    raise exception 'VEHICLE_CATEGORY_NOT_FOUND' using errcode='P0002';
  end if;

  if normalized_origin is null or char_length(normalized_origin)>240 then
    raise exception 'ORIGIN_INVALID' using errcode='22023';
  end if;

  if normalized_destination is null or char_length(normalized_destination)>240 then
    raise exception 'DESTINATION_INVALID' using errcode='22023';
  end if;

  if normalized_notes is not null and char_length(normalized_notes)>1000 then
    raise exception 'NOTES_TOO_LONG' using errcode='22023';
  end if;

  if target_scheduled_for is not null
     and target_scheduled_for < now()-interval '5 minutes' then
    raise exception 'SCHEDULED_TIME_INVALID' using errcode='22023';
  end if;

  if target_passenger_count is not null
     and target_passenger_count<=0 then
    raise exception 'PASSENGER_COUNT_INVALID' using errcode='22023';
  end if;

  if normalized_service='passenger'
     and coalesce(target_passenger_count,0)<=0 then
    raise exception 'PASSENGER_COUNT_REQUIRED' using errcode='22023';
  end if;

  if normalized_service='cargo'
     and greatest(
       coalesce(target_cargo_weight_kg,0),
       coalesce(target_cargo_volume_m3,0),
       coalesce(target_cargo_length_cm,0),
       coalesce(target_cargo_width_cm,0),
       coalesce(target_cargo_height_cm,0)
     )<=0 then
    raise exception 'CARGO_REQUIREMENTS_REQUIRED' using errcode='22023';
  end if;

  if coalesce(target_cargo_weight_kg,0)<0
     or coalesce(target_cargo_volume_m3,0)<0
     or coalesce(target_cargo_length_cm,0)<0
     or coalesce(target_cargo_width_cm,0)<0
     or coalesce(target_cargo_height_cm,0)<0 then
    raise exception 'CARGO_REQUIREMENTS_INVALID' using errcode='22023';
  end if;

  payload := jsonb_build_object(
    'service_code',normalized_service,
    'vehicle_category_code',normalized_category,
    'origin_text',normalized_origin,
    'destination_text',normalized_destination,
    'scheduled_for',target_scheduled_for,
    'passenger_count',target_passenger_count,
    'cargo_weight_kg',target_cargo_weight_kg,
    'cargo_volume_m3',target_cargo_volume_m3,
    'cargo_length_cm',target_cargo_length_cm,
    'cargo_width_cm',target_cargo_width_cm,
    'cargo_height_cm',target_cargo_height_cm,
    'required_body_type',normalized_body_type,
    'notes',normalized_notes,
    'details',details_value
  );

  payload_digest := encode(
    extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tuktuk:customer-request:'||pid::text||':'||cid::text||':'||
      target_idempotency_key::text,
      0
    )
  );

  select *
  into op
  from public.marketplace_customer_request_operations o
  where o.project_id=pid
    and o.customer_id=cid
    and o.idempotency_key=target_idempotency_key
  for update;

  if found then
    if op.operation_kind <> 'create_request'
       or op.payload_hash <> payload_digest then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
        using errcode='22023';
    end if;

    select *
    into job_row
    from public.jobs j
    where j.project_id=pid
      and j.id=op.job_id;

    if not found then
      raise exception 'IDEMPOTENCY_RESULT_NOT_FOUND';
    end if;

    return query
    select
      job_row.id,
      job_row.service_request_id,
      job_row.status,
      job_row.recommended_price,
      (job_row.pricing_breakdown->>'minimum_price')::numeric,
      (job_row.pricing_breakdown->>'low_price_warning_threshold')::numeric,
      job_row.currency,
      job_row.pricing_version,
      job_row.pricing_breakdown,
      now();

    return;
  end if;

  quote := app_private.calculate_marketplace_customer_quote_smart_v1(
    pid,
    normalized_service,
    normalized_category,
    target_passenger_count,
    target_scheduled_for,
    details_value
  );

  select s.commission_rate
  into commission_rate
  from public.project_marketplace_financial_settings s
  where s.project_id=pid;

  if commission_rate is null then
    raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode='P0002';
  end if;

  insert into public.service_requests(
    project_id,customer_id,service_code,origin_text,destination_text,
    scheduled_for,passenger_count,cargo_weight_kg,cargo_volume_m3,
    cargo_length_cm,cargo_width_cm,cargo_height_cm,required_body_type,
    notes,details,vehicle_category_code
  )
  values(
    pid,cid,normalized_service,normalized_origin,normalized_destination,
    target_scheduled_for,target_passenger_count,target_cargo_weight_kg,
    target_cargo_volume_m3,target_cargo_length_cm,target_cargo_width_cm,
    target_cargo_height_cm,normalized_body_type,normalized_notes,details_value,
    normalized_category
  )
  returning *
  into request_row;

  insert into public.jobs(
    project_id,service_request_id,service_code,status,
    recommended_price,final_price,currency,price_warning_acknowledged,
    pricing_version,pricing_breakdown,commission_rate_snapshot,
    pricing_engine_version,pricing_tariff_id,pricing_vehicle_category_code,
    pricing_total_usd,exchange_rate_snapshot,exchange_rate_source_snapshot,
    exchange_rate_updated_at_snapshot,exchange_rate_fallback_used,
    cup_before_rounding,rounding_mode_snapshot,rounding_increment_snapshot
  )
  values(
    pid,request_row.id,normalized_service,'requested',
    (quote->>'recommended_price')::numeric,
    (quote->>'recommended_price')::numeric,
    quote->>'currency',
    false,
    quote->>'pricing_version',
    quote->'pricing_breakdown',
    commission_rate,
    quote->>'pricing_engine_version',
    (quote->>'pricing_tariff_id')::uuid,
    quote->>'pricing_vehicle_category_code',
    (quote->>'pricing_total_usd')::numeric,
    (quote->>'exchange_rate_snapshot')::numeric,
    quote->>'exchange_rate_source_snapshot',
    (quote->>'exchange_rate_updated_at_snapshot')::timestamptz,
    (quote->>'exchange_rate_fallback_used')::boolean,
    (quote->>'cup_before_rounding')::numeric,
    quote->>'rounding_mode_snapshot',
    (quote->>'rounding_increment_snapshot')::numeric
  )
  returning *
  into job_row;

  insert into public.marketplace_customer_request_operations(
    project_id,customer_id,operation_kind,idempotency_key,payload_hash,job_id
  )
  values(
    pid,cid,'create_request',target_idempotency_key,payload_digest,job_row.id
  );

  return query
  select
    job_row.id,
    request_row.id,
    job_row.status,
    job_row.recommended_price,
    (quote->>'minimum_price')::numeric,
    (quote->>'low_price_warning_threshold')::numeric,
    job_row.currency,
    job_row.pricing_version,
    job_row.pricing_breakdown,
    now();
end;
$$;


-- Publication v2: passenger, cargo and courier are now all smart-priced.
-- Tourism and any other legacy service continue through the existing legacy branch.
create or replace function public.publish_marketplace_customer_job_v2(
  target_session_id uuid,
  target_session_token text,
  target_job_id uuid,
  target_final_price numeric,
  target_price_warning_acknowledged boolean,
  target_idempotency_key uuid
)
returns table(
  job_id uuid,
  status text,
  recommended_price numeric,
  final_price numeric,
  minimum_price numeric,
  low_price_warning_threshold numeric,
  price_warning_required boolean,
  price_warning_acknowledged boolean,
  currency text,
  pricing_version text,
  pricing_breakdown jsonb,
  published_at timestamptz,
  expires_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare
  pid uuid;
  cid uuid;
  job_row public.jobs%rowtype;
  request_row public.service_requests%rowtype;
  op public.marketplace_customer_request_operations%rowtype;
  quote jsonb;
  final_value numeric(14,2);
  minimum_value numeric(14,2);
  warning_threshold numeric(14,2);
  warning_required boolean;
  warning_ack boolean := coalesce(target_price_warning_acknowledged,false);
  ttl_minutes integer;
  commission_rate numeric(8,6);
  payload jsonb;
  payload_digest text;
  smart_service boolean := false;
begin
  if target_job_id is null then
    raise exception 'JOB_ID_REQUIRED' using errcode='22023';
  end if;

  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;

  cid := app_private.resolve_marketplace_customer_session(
    target_session_id,target_session_token
  );

  select p.id
  into pid
  from public.projects p
  where p.slug='tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND' using errcode='P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tuktuk:customer-publish:'||pid::text||':'||cid::text||':'||
      target_idempotency_key::text,
      0
    )
  );

  select *
  into op
  from public.marketplace_customer_request_operations o
  where o.project_id=pid
    and o.customer_id=cid
    and o.idempotency_key=target_idempotency_key
  for update;

  if found then
    select *
    into job_row
    from public.jobs j
    where j.project_id=pid
      and j.id=op.job_id;

    if not found then
      raise exception 'IDEMPOTENCY_RESULT_NOT_FOUND';
    end if;

    if op.operation_kind <> 'publish_job'
       or op.job_id <> target_job_id then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
        using errcode='22023';
    end if;

    minimum_value := (job_row.pricing_breakdown->>'minimum_price')::numeric;
    warning_threshold :=
      (job_row.pricing_breakdown->>'low_price_warning_threshold')::numeric;
    warning_required := job_row.final_price < warning_threshold;

    return query
    select
      job_row.id,job_row.status,job_row.recommended_price,job_row.final_price,
      minimum_value,warning_threshold,warning_required,
      job_row.price_warning_acknowledged,job_row.currency,job_row.pricing_version,
      job_row.pricing_breakdown,job_row.published_at,job_row.expires_at,now();

    return;
  end if;

  select *
  into job_row
  from public.jobs j
  where j.project_id=pid
    and j.id=target_job_id
  for update;

  if not found then
    raise exception 'JOB_NOT_FOUND' using errcode='P0002';
  end if;

  select *
  into request_row
  from public.service_requests r
  where r.project_id=pid
    and r.id=job_row.service_request_id;

  if not found or request_row.customer_id <> cid then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;

  if request_row.scheduled_for is not null
     and request_row.scheduled_for < now()-interval '5 minutes' then
    raise exception 'SCHEDULED_TIME_EXPIRED' using errcode='22023';
  end if;

  if job_row.status <> 'requested' then
    raise exception 'JOB_NOT_REQUESTED' using errcode='22023';
  end if;

  if not app_private.marketplace_job_transition_allowed(
    'requested','published','customer'
  ) then
    raise exception 'INVALID_JOB_TRANSITION' using errcode='22023';
  end if;

  smart_service := request_row.service_code in ('passenger','cargo','courier');

  if smart_service then
    if request_row.vehicle_category_code is null then
      if request_row.service_code='passenger' then
        raise exception 'PASSENGER_VEHICLE_CATEGORY_REQUIRED' using errcode='22023';
      else
        raise exception 'VEHICLE_CATEGORY_REQUIRED' using errcode='22023';
      end if;
    end if;

    quote := app_private.calculate_marketplace_customer_quote_smart_v1(
      pid,
      request_row.service_code,
      request_row.vehicle_category_code,
      request_row.passenger_count,
      request_row.scheduled_for,
      request_row.details
    );

    final_value := (quote->>'recommended_price')::numeric;
    minimum_value := final_value;
    warning_threshold := final_value;
    warning_required := false;
    warning_ack := false;
  else
    if target_final_price is null or target_final_price <= 0 then
      raise exception 'FINAL_PRICE_INVALID' using errcode='22023';
    end if;

    final_value := round(target_final_price,2);

    quote := app_private.calculate_marketplace_customer_quote(
      pid,
      request_row.service_code,
      request_row.passenger_count,
      request_row.cargo_weight_kg,
      request_row.cargo_volume_m3,
      request_row.details
    );

    if job_row.pricing_version is distinct from (quote->>'pricing_version') then
      raise exception 'PRICE_QUOTE_STALE' using errcode='22023';
    end if;

    minimum_value := (quote->>'minimum_price')::numeric;
    warning_threshold := (quote->>'low_price_warning_threshold')::numeric;

    if final_value < minimum_value then
      raise exception 'FINAL_PRICE_BELOW_MINIMUM' using errcode='22023';
    end if;

    warning_required := final_value < warning_threshold;

    if warning_required and not warning_ack then
      raise exception 'PRICE_WARNING_ACKNOWLEDGEMENT_REQUIRED' using errcode='22023';
    end if;
  end if;

  ttl_minutes := (quote->>'publication_ttl_minutes')::integer;

  select s.commission_rate
  into commission_rate
  from public.project_marketplace_financial_settings s
  where s.project_id=pid;

  if commission_rate is null then
    raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode='P0002';
  end if;

  payload := jsonb_build_object(
    'job_id',target_job_id,
    'final_price',
      case when smart_service then final_value else round(target_final_price,2) end,
    'price_warning_acknowledged',warning_ack
  );

  payload_digest := encode(
    extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex'
  );

  update public.jobs
  set
    status='published',
    recommended_price=(quote->>'recommended_price')::numeric,
    final_price=final_value,
    currency=quote->>'currency',
    pricing_version=quote->>'pricing_version',
    pricing_breakdown=quote->'pricing_breakdown',
    commission_rate_snapshot=commission_rate,
    price_warning_acknowledged=
      case when warning_required then warning_ack else false end,
    pricing_engine_version=
      case when smart_service then quote->>'pricing_engine_version'
           else pricing_engine_version end,
    pricing_tariff_id=
      case when smart_service then (quote->>'pricing_tariff_id')::uuid
           else pricing_tariff_id end,
    pricing_vehicle_category_code=
      case when smart_service then quote->>'pricing_vehicle_category_code'
           else pricing_vehicle_category_code end,
    pricing_total_usd=
      case when smart_service then (quote->>'pricing_total_usd')::numeric
           else pricing_total_usd end,
    exchange_rate_snapshot=
      case when smart_service then (quote->>'exchange_rate_snapshot')::numeric
           else exchange_rate_snapshot end,
    exchange_rate_source_snapshot=
      case when smart_service then quote->>'exchange_rate_source_snapshot'
           else exchange_rate_source_snapshot end,
    exchange_rate_updated_at_snapshot=
      case when smart_service
           then (quote->>'exchange_rate_updated_at_snapshot')::timestamptz
           else exchange_rate_updated_at_snapshot end,
    exchange_rate_fallback_used=
      case when smart_service then (quote->>'exchange_rate_fallback_used')::boolean
           else exchange_rate_fallback_used end,
    cup_before_rounding=
      case when smart_service then (quote->>'cup_before_rounding')::numeric
           else cup_before_rounding end,
    rounding_mode_snapshot=
      case when smart_service then quote->>'rounding_mode_snapshot'
           else rounding_mode_snapshot end,
    rounding_increment_snapshot=
      case when smart_service then (quote->>'rounding_increment_snapshot')::numeric
           else rounding_increment_snapshot end,
    published_at=now(),
    expires_at=now()+make_interval(mins=>ttl_minutes),
    state_version=state_version+1
  where project_id=pid
    and id=target_job_id
  returning *
  into job_row;

  insert into public.job_events(
    project_id,job_id,from_status,to_status,action,actor_kind,
    customer_id,operation_idempotency_key,metadata
  )
  values(
    pid,job_row.id,'requested','published','publish','customer',
    cid,target_idempotency_key,
    jsonb_build_object(
      'recommended_price',job_row.recommended_price,
      'final_price',job_row.final_price,
      'currency',job_row.currency,
      'pricing_version',job_row.pricing_version,
      'pricing_engine_version',job_row.pricing_engine_version,
      'pricing_vehicle_category_code',job_row.pricing_vehicle_category_code,
      'price_warning_required',warning_required,
      'price_warning_acknowledged',job_row.price_warning_acknowledged
    )
  );

  insert into public.marketplace_customer_request_operations(
    project_id,customer_id,operation_kind,idempotency_key,payload_hash,job_id
  )
  values(
    pid,cid,'publish_job',target_idempotency_key,payload_digest,job_row.id
  );

  return query
  select
    job_row.id,job_row.status,job_row.recommended_price,job_row.final_price,
    minimum_value,warning_threshold,warning_required,
    job_row.price_warning_acknowledged,job_row.currency,job_row.pricing_version,
    job_row.pricing_breakdown,job_row.published_at,job_row.expires_at,now();
end;
$$;
-- Preserve production execution boundaries explicitly, including clean database replays.
revoke all on function app_private.calculate_marketplace_customer_quote_smart_v1(
  uuid,text,text,integer,timestamptz,jsonb
) from public, anon, authenticated;

revoke all on function public.preview_marketplace_customer_quote_v2(
  text,text,integer,numeric,integer,timestamptz
) from public, anon, authenticated;
grant execute on function public.preview_marketplace_customer_quote_v2(
  text,text,integer,numeric,integer,timestamptz
) to service_role;

revoke all on function public.preview_marketplace_customer_quote_v3(
  text,text,integer,numeric,integer,numeric,numeric,timestamptz
) from public, anon, authenticated;
grant execute on function public.preview_marketplace_customer_quote_v3(
  text,text,integer,numeric,integer,numeric,numeric,timestamptz
) to service_role;

revoke all on function public.create_marketplace_customer_request_v2(
  uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,
  text,text,jsonb,text,uuid
) from public, anon, authenticated;
grant execute on function public.create_marketplace_customer_request_v2(
  uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,
  text,text,jsonb,text,uuid
) to service_role;

revoke all on function public.publish_marketplace_customer_job_v2(
  uuid,text,uuid,numeric,boolean,uuid
) from public, anon, authenticated;
grant execute on function public.publish_marketplace_customer_job_v2(
  uuid,text,uuid,numeric,boolean,uuid
) to service_role;
