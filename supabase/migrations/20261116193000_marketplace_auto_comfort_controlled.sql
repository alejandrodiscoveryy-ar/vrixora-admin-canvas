-- Confort: tarifa provisional idéntica a Auto; solo vehículos light_car aprobados por Admin.
-- Sin selección automática de conductores ni modificación del precio de Auto.
BEGIN;
INSERT INTO public.vehicle_categories(project_id,code,name,active,sort_order)
SELECT p.id,'comfort','Confort (auto)',true,15 FROM public.projects p WHERE p.slug='tuktuk-control'
ON CONFLICT (project_id,code) DO NOTHING;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_no_comfort_as_vehicle_type CHECK (category_code IS DISTINCT FROM 'comfort');

CREATE TABLE app_private.marketplace_comfort_vehicle_approvals(
  project_id uuid NOT NULL,
  vehicle_id text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid NOT NULL,
  revoked_at timestamptz,
  reason text NOT NULL,
  PRIMARY KEY(project_id,vehicle_id),
  FOREIGN KEY(project_id,vehicle_id) REFERENCES public.vehicles(project_id,id) ON DELETE CASCADE
);
ALTER TABLE app_private.marketplace_comfort_vehicle_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.marketplace_comfort_vehicle_approvals FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app_private.marketplace_vehicle_is_comfort_approved(pid uuid, vid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM app_private.marketplace_comfort_vehicle_approvals a
    JOIN public.vehicles v ON v.project_id=a.project_id AND v.id=a.vehicle_id
    JOIN public.vehicle_services svc ON svc.project_id=v.project_id AND svc.vehicle_id=v.id
      AND svc.service_code='passenger' AND svc.enabled
    WHERE a.project_id=pid AND a.vehicle_id=vid AND a.revoked_at IS NULL
      AND v.category_code='light_car' AND v.marketplace_status='active' AND v.deleted_at IS NULL)
$$;
REVOKE ALL ON FUNCTION app_private.marketplace_vehicle_is_comfort_approved(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_marketplace_vehicle_comfort_v1(
  target_project_id uuid,target_driver_user_id uuid,target_vehicle_id text,target_enabled boolean,target_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; v public.vehicles%rowtype; reason text:=btrim(coalesce(target_reason,''));
BEGIN
 actor:=app_private.require_project_permission(target_project_id,'marketplace.manage');
 IF target_enabled IS NULL OR length(reason) NOT BETWEEN 5 AND 300 THEN
   RAISE EXCEPTION 'INVALID_COMFORT_REVIEW' USING errcode='22023'; END IF;
 SELECT * INTO v FROM public.vehicles WHERE project_id=target_project_id AND id=target_vehicle_id
   AND owner_user_id=target_driver_user_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND' USING errcode='P0002'; END IF;
 IF target_enabled AND (v.category_code<>'light_car' OR v.marketplace_status<>'active'
   OR v.main_photo_asset_id IS NULL OR coalesce(v.passenger_capacity,0)<1 OR NOT EXISTS (
     SELECT 1 FROM public.vehicle_services s WHERE s.project_id=target_project_id
     AND s.vehicle_id=target_vehicle_id AND s.service_code='passenger' AND s.enabled)) THEN
   RAISE EXCEPTION 'COMFORT_REQUIRES_ACTIVE_PASSENGER_AUTO' USING errcode='22023'; END IF;
 IF target_enabled THEN
   INSERT INTO app_private.marketplace_comfort_vehicle_approvals(project_id,vehicle_id,approved_by,reason)
   VALUES(target_project_id,target_vehicle_id,actor,reason)
   ON CONFLICT(project_id,vehicle_id) DO UPDATE SET approved_at=now(),approved_by=excluded.approved_by,revoked_at=NULL,reason=excluded.reason;
 ELSE
   UPDATE app_private.marketplace_comfort_vehicle_approvals SET revoked_at=now(),reason=btrim(target_reason)
   WHERE project_id=target_project_id AND vehicle_id=target_vehicle_id AND revoked_at IS NULL;
 END IF;
 INSERT INTO public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
 VALUES(target_project_id,actor,'marketplace_comfort_vehicle_review','vehicles',target_vehicle_id,
   jsonb_build_object('enabled',target_enabled,'reason',reason,'driver_user_id',target_driver_user_id));
 RETURN jsonb_build_object('approved',app_private.marketplace_vehicle_is_comfort_approved(target_project_id,target_vehicle_id));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_marketplace_vehicle_comfort_v1(uuid,uuid,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_marketplace_vehicle_comfort_v1(uuid,uuid,text,boolean,text) TO authenticated;

INSERT INTO public.marketplace_pricing_tariffs(project_id,service_code,vehicle_category_code,version,status,currency,
 base_price_usd,minimum_price_usd,per_km_price_usd,per_extra_passenger_price_usd,per_stop_price_usd,effective_from,metadata)
SELECT t.project_id,'passenger','comfort','comfort-launch-auto-parity-v1','active','USD',
 t.base_price_usd,t.minimum_price_usd,t.per_km_price_usd,t.per_extra_passenger_price_usd,t.per_stop_price_usd,now(),
 jsonb_build_object('launch','auto_parity_pending_km_review','copied_from_tariff_id',t.id)
FROM public.marketplace_pricing_tariffs t
WHERE t.project_id=(SELECT id FROM public.projects WHERE slug='tuktuk-control')
 AND t.service_code='passenger' AND t.vehicle_category_code='light_car' AND t.status='active'
 AND t.effective_from<=now() AND (t.effective_to IS NULL OR t.effective_to>now());

INSERT INTO public.marketplace_modality_visibility(project_id,service_code,vehicle_category_code,is_published,changed_at)
SELECT p.id,'passenger','comfort',true,now() FROM public.projects p WHERE p.slug='tuktuk-control'
ON CONFLICT(project_id,service_code,vehicle_category_code) DO UPDATE SET is_published=true,changed_at=now();

CREATE OR REPLACE FUNCTION public.list_marketplace_published_modalities(target_project_slug text)
 RETURNS TABLE(service_code text, vehicle_category_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select distinct s.code, c.code
  from public.projects p
  join public.service_types s on s.project_id=p.id and s.active
  join public.vehicle_categories c on c.project_id=p.id and c.active
  join public.marketplace_pricing_tariffs t on t.project_id=p.id
    and t.service_code=s.code and t.vehicle_category_code=c.code
    and t.status='active' and t.effective_from <= now()
    and (t.effective_to is null or t.effective_to > now())
  left join public.marketplace_modality_visibility v on v.project_id=p.id
    and v.service_code=s.code and v.vehicle_category_code=c.code
  where p.slug=target_project_slug and s.code in ('passenger','cargo','courier')
    and (s.code <> 'passenger' or c.code in ('motorcycle','bicitaxi','tricycle','light_car','comfort'))
    and coalesce(v.is_published,true)
    and (c.code<>'comfort' or (s.code='passenger' and exists (
      select 1 from app_private.marketplace_comfort_vehicle_approvals ca
      join public.vehicles auto on auto.project_id=ca.project_id and auto.id=ca.vehicle_id
      join public.vehicle_services vs on vs.project_id=auto.project_id and vs.vehicle_id=auto.id and vs.service_code='passenger' and vs.enabled
      where ca.project_id=p.id and ca.revoked_at is null and auto.category_code='light_car'
        and auto.marketplace_status='active' and auto.deleted_at is null)))
  order by s.code,c.code;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_marketplace_modality_visibility(target_project_id uuid, target_service_code text, target_vehicle_category_code text, target_is_published boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;
begin
  actor := app_private.require_project_permission(target_project_id, 'marketplace.pricing.manage');
  if target_is_published is null or target_service_code not in ('passenger','cargo','courier') then
    raise exception 'MODALITY_PUBLICATION_INVALID' using errcode='22023';
  end if;
  if target_vehicle_category_code='comfort' and target_service_code<>'passenger' then
    raise exception 'COMFORT_PASSENGER_ONLY' using errcode='22023';
  end if;
  if target_service_code = 'passenger' and
     target_vehicle_category_code not in ('motorcycle','bicitaxi','tricycle','light_car','comfort') then
    raise exception 'PASSENGER_CATEGORY_INVALID' using errcode='22023';
  end if;
  if not exists(select 1 from public.service_types s where s.project_id=target_project_id and s.code=target_service_code and s.active)
     or not exists(select 1 from public.vehicle_categories c where c.project_id=target_project_id and c.code=target_vehicle_category_code and c.active) then
    raise exception 'MODALITY_NOT_FOUND' using errcode='P0002';
  end if;
  if target_is_published and not exists (
    select 1 from public.marketplace_pricing_tariffs t
    where t.project_id=target_project_id and t.service_code=target_service_code
      and t.vehicle_category_code=target_vehicle_category_code
      and t.status='active' and t.effective_from <= now()
      and (t.effective_to is null or t.effective_to > now())
  ) then
    raise exception 'MODALITY_TARIFF_NOT_CONFIGURED' using errcode='22023';
  end if;
  insert into public.marketplace_modality_visibility
    (project_id,service_code,vehicle_category_code,is_published,changed_by,changed_at)
  values (target_project_id,target_service_code,target_vehicle_category_code,target_is_published,actor,now())
  on conflict (project_id,service_code,vehicle_category_code)
  do update set is_published=excluded.is_published,changed_by=excluded.changed_by,changed_at=now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_marketplace_modality_visibility(target_project_id uuid)
 RETURNS TABLE(service_code text, vehicle_category_code text, is_published boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  return query
  select s.code, c.code, coalesce(v.is_published, true)
  from public.service_types s
  cross join public.vehicle_categories c
  left join public.marketplace_modality_visibility v on
       v.project_id=target_project_id and v.service_code=s.code and v.vehicle_category_code=c.code
  where s.project_id=target_project_id and c.project_id=target_project_id
    and s.active and c.active and s.code in ('passenger','cargo','courier')
    and (s.code <> 'passenger' or c.code in ('motorcycle','bicitaxi','tricycle','light_car','comfort'))
    and (c.code<>'comfort' or s.code='passenger')
  order by s.code,c.code;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_publish_marketplace_pricing_tariff(target_project_id uuid, target_service_code text, target_vehicle_category_code text, target_base_price_usd numeric, target_minimum_price_usd numeric, target_per_km_price_usd numeric, target_per_extra_passenger_price_usd numeric, target_per_stop_price_usd numeric)
 RETURNS marketplace_pricing_tariffs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
  previous public.marketplace_pricing_tariffs%rowtype;
  result public.marketplace_pricing_tariffs%rowtype;
  effective_at timestamptz;
  next_version text;
  normalized_extra_passenger numeric;
begin
  actor := app_private.require_project_permission(target_project_id, 'marketplace.pricing.manage');

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

  if target_vehicle_category_code='comfort' and target_service_code<>'passenger' then
    raise exception 'COMFORT_PASSENGER_ONLY' using errcode='22023';
  end if;

  if target_service_code='passenger'
     and target_vehicle_category_code not in ('motorcycle','bicitaxi','tricycle','light_car','comfort') then
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
$function$;

CREATE OR REPLACE FUNCTION app_private.calculate_marketplace_customer_quote_smart_v1(target_project_id uuid, target_service_code text, target_vehicle_category_code text, target_passenger_count integer, target_scheduled_for timestamp with time zone, target_details jsonb)
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

  if target_vehicle_category_code='comfort' and target_service_code<>'passenger' then
    raise exception 'COMFORT_PASSENGER_ONLY' using errcode='22023';
  end if;
  if target_service_code = 'passenger'
     and target_vehicle_category_code not in ('motorcycle','bicitaxi','tricycle','light_car','comfort') then
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

  local_effective := app_private.marketplace_havana_official_time(effective_at,cfg.timezone);
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

CREATE OR REPLACE FUNCTION public.create_marketplace_customer_request_v2(target_session_id uuid, target_session_token text, target_service_code text, target_origin_text text, target_destination_text text, target_scheduled_for timestamp with time zone, target_passenger_count integer, target_cargo_weight_kg numeric, target_cargo_volume_m3 numeric, target_cargo_length_cm numeric, target_cargo_width_cm numeric, target_cargo_height_cm numeric, target_required_body_type text, target_notes text, target_details jsonb, target_vehicle_category_code text, target_idempotency_key uuid)
 RETURNS TABLE(job_id uuid, service_request_id uuid, status text, recommended_price numeric, minimum_price numeric, low_price_warning_threshold numeric, currency text, pricing_version text, pricing_breakdown jsonb, server_time timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if normalized_category='comfort' and normalized_service<>'passenger' then
    raise exception 'COMFORT_PASSENGER_ONLY' using errcode='22023';
  end if;
  if normalized_service='passenger'
     and normalized_category not in ('motorcycle','bicitaxi','tricycle','light_car','comfort') then
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
$function$;

CREATE OR REPLACE FUNCTION app_private.marketplace_driver_can_receive_job(target_project_id uuid, target_driver_user_id uuid, target_vehicle_id text, target_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select target_project_id is not null
    and target_driver_user_id is not null
    and target_vehicle_id is not null
    and target_job_id is not null
    and exists(
      select 1
      from public.jobs j
      join public.service_requests r
        on r.project_id=j.project_id and r.id=j.service_request_id
      join public.driver_profiles d
        on d.project_id=j.project_id and d.user_id=target_driver_user_id
      join public.driver_vehicle_assignments a
        on a.project_id=j.project_id and a.driver_user_id=d.user_id
       and a.vehicle_id=target_vehicle_id
      join public.vehicles v
        on v.project_id=a.project_id and v.id=a.vehicle_id
      where j.project_id=target_project_id
        and j.id=target_job_id
        and j.status='published'
        and j.test_deleted_at is null
        and (not j.is_test or app_private.marketplace_test_job_targets_driver(j.project_id,j.id,target_driver_user_id))
        and (j.expires_at is null or j.expires_at>now())
        and d.status='active' and d.activated_at is not null and d.suspended_at is null
        and a.is_active and a.accepting_jobs and a.is_available
        and v.marketplace_status='active' and v.deleted_at is null
        and app_private.marketplace_onboarding_requirements_complete(d.user_id,v.id)
        and (j.is_test or app_private.wallet_debt(j.project_id,d.user_id)=0)
        and (
          exists (
            select 1 from public.project_marketplace_financial_settings financial
            where financial.project_id = j.project_id
              and financial.commission_enabled is false
          )
          or app_private.has_active_marketplace_work_trial(d.user_id)
          or app_private.has_confirmed_marketplace_initial_deposit(d.user_id)
          or app_private.wallet_transition_active(j.project_id)
          or (j.is_test and not j.test_force_wallet_commission)
          or (j.is_test and app_private.marketplace_test_job_targets_driver(j.project_id,j.id,d.user_id) and j.test_force_wallet_commission)
        )
        and (not app_private.wallet_transition_active(j.project_id) OR j.is_test OR NOT app_private.wallet_job_charge_enabled(j.project_id,j.id,(SELECT f.commission_enabled FROM public.project_marketplace_financial_settings f WHERE f.project_id=j.project_id)) OR app_private.wallet_can_finance(j.project_id,d.user_id,j.id,round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,d.user_id,j.commission_rate_snapshot),2)))
        and exists(
          select 1 from public.vehicle_services vs
          where vs.project_id=j.project_id
            and vs.vehicle_id=v.id
            and vs.service_code=j.service_code
            and vs.enabled
        )
        and (
          coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code) is null
          or v.category_code=coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code)
          or (v.category_code='light_car'
              and coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code)='comfort'
              and app_private.marketplace_vehicle_is_comfort_approved(v.project_id,v.id))
        )
        and (r.passenger_count is null or v.passenger_capacity>=r.passenger_count)
        and (r.cargo_weight_kg is null or v.cargo_capacity_kg>=r.cargo_weight_kg)
        and (r.cargo_volume_m3 is null or v.cargo_volume_m3>=r.cargo_volume_m3)
        and (r.cargo_length_cm is null or v.cargo_length_cm>=r.cargo_length_cm)
        and (r.cargo_width_cm is null or v.cargo_width_cm>=r.cargo_width_cm)
        and (r.cargo_height_cm is null or v.cargo_height_cm>=r.cargo_height_cm)
        and (
          r.required_body_type is null
          or lower(btrim(v.body_type))=lower(btrim(r.required_body_type))
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.list_my_marketplace_available_jobs(target_vehicle_id text, target_limit integer DEFAULT 50, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_job_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(job_id uuid, service_code text, origin_text text, destination_text text, scheduled_for timestamp with time zone, passenger_count integer, cargo_weight_kg numeric, cargo_volume_m3 numeric, cargo_length_cm numeric, cargo_width_cm numeric, cargo_height_cm numeric, required_body_type text, recommended_price numeric, final_price numeric, currency text, expires_at timestamp with time zone, created_at timestamp with time zone, billing_mode text, commission_rate numeric, commission_amount numeric, available_balance numeric, missing_balance numeric, can_accept boolean, is_test boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid:=auth.uid();
  pid uuid;
  safe_limit integer:=least(greatest(coalesce(target_limit,50),1),100);
  balance numeric;
  commission_charge_enabled boolean;
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
    join public.vehicles v
      on v.project_id=a.project_id and v.id=a.vehicle_id
    where a.project_id=pid and a.driver_user_id=actor
      and a.vehicle_id=target_vehicle_id
      and a.is_active and a.is_available
      and v.marketplace_status='active' and v.deleted_at is null
  )
  then
    raise exception 'MARKETPLACE_WORK_ACCESS_DENIED' using errcode='42501';
  end if;

  select s.commission_enabled into commission_charge_enabled from public.project_marketplace_financial_settings s where s.project_id=pid;
  if commission_charge_enabled is null then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'; end if;
  balance:=coalesce(app_private.marketplace_wallet_available_balance(pid,actor),0);

  return query
  select
    j.id,
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
    j.recommended_price,
    j.final_price,
    j.currency,
    j.expires_at,
    j.created_at,
    case
      when j.is_test and not j.test_force_wallet_commission then 'platform_free'
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled)
       and not (j.is_test and j.test_force_wallet_commission)
       and app_private.has_active_marketplace_work_trial(actor) then 'trial_free'
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then 'platform_free'
      when j.is_test and j.test_force_wallet_commission then 'wallet_commission'
      when app_private.has_active_marketplace_work_trial(actor) then 'trial_free'
      when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor) then 'wallet_commission'
      else null
    end,
    case
      when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then 0::numeric
      when j.is_test and j.test_force_wallet_commission then app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot)
      when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
      when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor) then app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot)
      else app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot)
    end,
    case
      when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then 0::numeric
      when j.is_test and j.test_force_wallet_commission then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
      when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor) then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      else round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
    end,
    balance,
    greatest(
      0::numeric,
      (case
        when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then 0::numeric
        when j.is_test and j.test_force_wallet_commission then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
        when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
        when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor) then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
        else round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      end)-balance
    ),
    case
      when j.is_test and not j.test_force_wallet_commission then true
      when app_private.wallet_debt(pid,actor)>0 then false
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then true
      when j.is_test and j.test_force_wallet_commission
        then balance>=round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      when app_private.has_active_marketplace_work_trial(actor) then true
      when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor)
        then app_private.wallet_can_finance(pid,actor,j.id,round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2))
      else false
    end,
    j.is_test
  from public.jobs j
  join public.service_requests r
    on r.project_id=j.project_id and r.id=j.service_request_id
  where j.project_id=pid
    and j.status='published'
    and j.test_deleted_at is null
    and (not j.is_test or app_private.marketplace_test_job_targets_driver(j.project_id,j.id,actor))
    and (j.expires_at is null or j.expires_at>now())
    and app_private.marketplace_dispatch_policy_allows(
      pid,
      actor,
      target_vehicle_id,
      j.id
    )
    and (
      not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled)
      or (j.is_test and not j.test_force_wallet_commission)
      or app_private.has_active_marketplace_work_trial(actor)
      or app_private.wallet_transition_active(pid)
      or app_private.has_confirmed_marketplace_initial_deposit(actor)
      or (j.is_test and app_private.marketplace_test_job_targets_driver(j.project_id,j.id,actor) and j.test_force_wallet_commission)
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
          or (v.category_code='light_car'
              and coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code)='comfort'
              and app_private.marketplace_vehicle_is_comfort_approved(v.project_id,v.id))
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

CREATE OR REPLACE FUNCTION public.get_my_marketplace_onboarding()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); pid uuid;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if; select id into pid from public.projects where slug='tuktuk-control';
 return jsonb_build_object('server_time',now(),'display_name',(select p.display_name from public.profiles p where p.id=actor),'phone',(select p.phone from public.profiles p where p.id=actor),'driver_profile_exists',exists(select 1 from public.driver_profiles d where d.project_id=pid and d.user_id=actor),'driver_status',(select d.status from public.driver_profiles d where d.project_id=pid and d.user_id=actor),'driver_photo_asset_id',(select d.photo_asset_id from public.driver_profiles d where d.project_id=pid and d.user_id=actor),'driver_suspended',exists(select 1 from public.driver_profiles d where d.project_id=pid and d.user_id=actor and d.status='suspended'), 'vehicles',coalesce((select jsonb_agg(jsonb_build_object('vehicle_id',v.id,'name',v.name,'registration',v.registration,'category_code',v.category_code,'propulsion_code',v.propulsion_code,'category_other_description',v.category_other_description,'brand',v.brand,'model',v.model,'year',v.year,'passenger_capacity',v.passenger_capacity,'cargo_capacity_kg',v.cargo_capacity_kg,'cargo_volume_m3',v.cargo_volume_m3,'cargo_length_cm',v.cargo_length_cm,'cargo_width_cm',v.cargo_width_cm,'cargo_height_cm',v.cargo_height_cm,'body_type',v.body_type,'color',v.color,'main_photo_asset_id',v.main_photo_asset_id,'marketplace_status',v.marketplace_status,'is_active',a.is_active,'is_available',a.is_available,'services',coalesce((select jsonb_agg(s.service_code order by s.service_code) from public.vehicle_services s where s.project_id=pid and s.vehicle_id=v.id and s.enabled),'[]'::jsonb),'onboarding_complete',app_private.marketplace_onboarding_requirements_complete(actor,v.id)) order by v.created_at,v.id) from public.vehicles v left join public.driver_vehicle_assignments a on a.project_id=v.project_id and a.vehicle_id=v.id and a.driver_user_id=actor where v.project_id=pid and v.owner_user_id=actor and v.deleted_at is null and v.id=(select vv.id from public.vehicles vv left join public.driver_vehicle_assignments aa on aa.project_id=vv.project_id and aa.vehicle_id=vv.id and aa.driver_user_id=actor where vv.project_id=pid and vv.owner_user_id=actor and vv.deleted_at is null order by case when vv.marketplace_status='active' and coalesce(aa.is_active,false) then 0 else 1 end,case when vv.marketplace_status='active' then 0 else 1 end,case when vv.id like 'marketplace-'||actor::text||'-%' then 0 else 1 end,vv.created_at,vv.id limit 1)),'[]'::jsonb),'vehicle_categories',(select coalesce(jsonb_agg(jsonb_build_object('code',c.code,'name',c.name,'sort_order',c.sort_order) order by c.sort_order,c.code),'[]'::jsonb) from public.vehicle_categories c where c.project_id=pid and c.active and c.code<>'comfort'),'propulsion_types',(select coalesce(jsonb_agg(jsonb_build_object('code',p.code,'name',p.name,'sort_order',p.sort_order) order by p.sort_order,p.code),'[]'::jsonb) from public.propulsion_types p where p.project_id=pid and p.active),'service_types',(select coalesce(jsonb_agg(jsonb_build_object('code',s.code,'name',s.name,'sort_order',s.sort_order) order by s.sort_order,s.code),'[]'::jsonb) from public.service_types s where s.project_id=pid and s.active),'assets',(select coalesce(jsonb_agg(jsonb_build_object('asset_id',a.id,'asset_kind',a.asset_kind,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'status',a.status) order by a.created_at desc),'[]'::jsonb) from public.media_assets a where a.project_id=pid and a.owner_user_id=actor));
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_marketplace_driver_vehicle_edit_v1(target_project_id uuid, target_driver_user_id uuid, target_vehicle_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.vehicles%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id, 'marketplace.manage');
  select vv.* into v from public.vehicles vv
   where vv.project_id = target_project_id
     and vv.id = target_vehicle_id
     and vv.owner_user_id = target_driver_user_id
     and vv.deleted_at is null
     and exists(select 1 from public.driver_vehicle_assignments a
       where a.project_id=vv.project_id and a.vehicle_id=vv.id
       and a.driver_user_id=target_driver_user_id);
  if not found then raise exception 'VEHICLE_NOT_FOUND_OR_NOT_OWNED' using errcode='P0002'; end if;
  return jsonb_build_object(
    'vehicle', jsonb_build_object(
      'id',v.id,'name',v.name,'category_code',v.category_code,
      'propulsion_code',v.propulsion_code,'category_other_description',v.category_other_description,
      'brand',v.brand,'model',v.model,'year',v.year,'registration',v.registration,
      'passenger_capacity',v.passenger_capacity,'cargo_capacity_kg',v.cargo_capacity_kg,
      'cargo_volume_m3',v.cargo_volume_m3,'cargo_length_cm',v.cargo_length_cm,
      'cargo_width_cm',v.cargo_width_cm,'cargo_height_cm',v.cargo_height_cm,
      'body_type',v.body_type,'main_photo_asset_id',v.main_photo_asset_id,
      'comfort_approved',app_private.marketplace_vehicle_is_comfort_approved(target_project_id,v.id)),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('code',c.code,'name',c.name) order by c.sort_order,c.code),'[]'::jsonb)
      from public.vehicle_categories c where c.project_id=target_project_id and c.active and c.code<>'comfort'),
    'propulsions', (select coalesce(jsonb_agg(jsonb_build_object('code',p.code,'name',p.name) order by p.code),'[]'::jsonb)
      from public.propulsion_types p where p.project_id=target_project_id and p.active),
    'service_types', (select coalesce(jsonb_agg(jsonb_build_object('code',s.code,'name',s.name) order by s.code),'[]'::jsonb)
      from public.service_types s where s.project_id=target_project_id and s.active),
    'services', (select coalesce(jsonb_agg(vs.service_code order by vs.service_code),'[]'::jsonb)
      from public.vehicle_services vs where vs.project_id=target_project_id
      and vs.vehicle_id=target_vehicle_id and vs.enabled),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label','Foto '||left(a.id::text,8)) order by a.id),'[]'::jsonb)
      from public.media_assets a where a.project_id=target_project_id
      and a.owner_user_id=target_driver_user_id and a.asset_kind='vehicle_photo'
      and a.storage_bucket='marketplace-media' and a.status='available'),
    'working', exists(
      select 1 from public.driver_vehicle_assignments a
      where a.project_id=target_project_id and a.driver_user_id=target_driver_user_id
        and a.vehicle_id=target_vehicle_id and a.accepting_jobs),
    'unpublished_modalities', (select coalesce(jsonb_agg(
        jsonb_build_object('service_code',m.service_code,'category_code',m.vehicle_category_code)),
        '[]'::jsonb)
      from public.marketplace_modality_visibility m
      where m.project_id=target_project_id and not m.is_published),
    'active_job', exists(
      select 1 from public.jobs j
      left join public.marketplace_incident_resolutions r
        on r.project_id=j.project_id and r.job_id=j.id
      where j.project_id=target_project_id
      and j.assigned_vehicle_id=target_vehicle_id
      and j.assigned_driver_user_id=target_driver_user_id
      and j.test_deleted_at is null
      and (j.status in ('accepted','en_route','pickup','in_progress','completed')
        or (j.status='incident' and r.id is null)))
  );
end;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
