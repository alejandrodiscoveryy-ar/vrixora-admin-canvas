-- Incremental administration RPCs for the existing smart_pricing_v1 schema.
-- No tables, columns, data, RLS policies, or existing grants are changed.

do $$
begin
  if to_regclass('public.marketplace_pricing_tariffs') is null
    or to_regclass('public.marketplace_pricing_adjustments') is null
    or to_regprocedure('app_private.validate_smart_pricing_tariff_overlap()') is null
    or to_regprocedure('app_private.audit_smart_pricing_change()') is null then
    raise exception 'SMART_PRICING_V1_PREREQUISITES_MISSING';
  end if;
end;
$$;

create or replace function public.admin_get_marketplace_pricing_dashboard(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  select jsonb_build_object(
    'can_manage', app_private.has_project_permission(target_project_id, 'marketplace.manage'),
    'settings', coalesce((select to_jsonb(s) from public.project_marketplace_pricing_settings s where s.project_id=target_project_id), '{}'::jsonb),
    'exchange', coalesce((select to_jsonb(e) from public.project_exchange_settings e where e.project_id=target_project_id), '{}'::jsonb),
    'vehicle_categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order, c.code) from public.vehicle_categories c where c.project_id=target_project_id), '[]'::jsonb),
    'tariffs', coalesce((select jsonb_agg(to_jsonb(t) order by t.service_code,t.vehicle_category_code) from public.marketplace_pricing_tariffs t where t.project_id=target_project_id and t.status='active' and t.effective_from<=now() and (t.effective_to is null or t.effective_to>now())), '[]'::jsonb),
    'adjustments', coalesce((select jsonb_agg(to_jsonb(a) order by a.priority,a.code) from (select distinct on (project_id,code) * from public.marketplace_pricing_adjustments where project_id=target_project_id order by project_id,code,version desc) a), '[]'::jsonb),
    'legacy_publication_ttl_minutes', coalesce((select jsonb_object_agg(r.service_code,r.publication_ttl_minutes) from public.marketplace_pricing_rules r where r.project_id=target_project_id and r.active), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_publish_marketplace_pricing_tariff(
  target_project_id uuid, target_service_code text, target_vehicle_category_code text,
  target_base_price_usd numeric, target_minimum_price_usd numeric, target_per_km_price_usd numeric,
  target_per_extra_passenger_price_usd numeric, target_per_stop_price_usd numeric
) returns public.marketplace_pricing_tariffs
language plpgsql security definer set search_path = '' as $$
declare actor uuid; previous public.marketplace_pricing_tariffs%rowtype; result public.marketplace_pricing_tariffs%rowtype; effective_at timestamptz; next_version text;
begin
  actor := app_private.require_project_permission(target_project_id, 'marketplace.manage');
  if target_base_price_usd is null or target_minimum_price_usd is null or target_per_km_price_usd is null or target_per_extra_passenger_price_usd is null or target_per_stop_price_usd is null or target_base_price_usd < 0 or target_minimum_price_usd < 0 or target_per_km_price_usd < 0 or target_per_extra_passenger_price_usd < 0 or target_per_stop_price_usd < 0 then raise exception 'INVALID_USD_TARIFF_AMOUNT' using errcode='22023'; end if;
  if not exists(select 1 from public.service_types where project_id=target_project_id and code=target_service_code and active) then raise exception 'MARKETPLACE_SERVICE_NOT_FOUND' using errcode='P0002'; end if;
  if not exists(select 1 from public.vehicle_categories where project_id=target_project_id and code=target_vehicle_category_code and active) then raise exception 'VEHICLE_CATEGORY_NOT_FOUND' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('smart-pricing-tariff:'||target_project_id::text||':'||target_service_code||':'||target_vehicle_category_code, 0));
  effective_at := now();
  select * into previous from public.marketplace_pricing_tariffs where project_id=target_project_id and service_code=target_service_code and vehicle_category_code=target_vehicle_category_code and status='active' and effective_from<=effective_at and (effective_to is null or effective_to>effective_at) order by effective_from desc,created_at desc limit 1 for update;
  if found then
    update public.marketplace_pricing_tariffs set status='retired',effective_to=effective_at,updated_by=actor,updated_at=effective_at where id=previous.id;
  end if;
  next_version := 'admin-' || to_char(effective_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS');
  insert into public.marketplace_pricing_tariffs(project_id,service_code,vehicle_category_code,version,status,currency,base_price_usd,minimum_price_usd,per_km_price_usd,per_extra_passenger_price_usd,per_stop_price_usd,effective_from,effective_to,metadata,created_by,updated_by)
  values(target_project_id,target_service_code,target_vehicle_category_code,next_version,'active','USD',target_base_price_usd,target_minimum_price_usd,target_per_km_price_usd,target_per_extra_passenger_price_usd,target_per_stop_price_usd,effective_at,null,coalesce(previous.metadata,'{}'::jsonb)||jsonb_build_object('admin_origin','vrixora_admin'),actor,actor) returning * into result;
  return result;
end;
$$;

create or replace function public.admin_publish_marketplace_pricing_adjustment(target_project_id uuid,target_code text,target_adjustment_value numeric,target_enabled boolean)
returns public.marketplace_pricing_adjustments
language plpgsql security definer set search_path = '' as $$
declare actor uuid; previous public.marketplace_pricing_adjustments%rowtype; result public.marketplace_pricing_adjustments%rowtype; effective_at timestamptz;
begin
  actor := app_private.require_project_permission(target_project_id, 'marketplace.manage');
  if target_adjustment_value is null or target_adjustment_value < 0 then raise exception 'INVALID_USD_ADJUSTMENT_VALUE' using errcode='22023'; end if;
  select * into previous from public.marketplace_pricing_adjustments where project_id=target_project_id and code=target_code order by version desc limit 1 for update;
  if not found then raise exception 'MARKETPLACE_PRICING_ADJUSTMENT_NOT_FOUND' using errcode='P0002'; end if;
  effective_at := now();
  update public.marketplace_pricing_adjustments set status='retired',effective_to=effective_at,updated_by=actor,updated_at=effective_at where project_id=target_project_id and code=target_code and status='active' and effective_from<=effective_at and (effective_to is null or effective_to>effective_at);
  insert into public.marketplace_pricing_adjustments(project_id,code,version,name,rule_kind,status,service_code,vehicle_category_codes,adjustment_type,adjustment_value,priority,stack_group,weekdays,local_time_start,local_time_end,effective_from,effective_to,condition_config,created_by,updated_by)
  values(target_project_id,previous.code,previous.version+1,previous.name,previous.rule_kind,case when target_enabled then 'active' else 'retired' end,previous.service_code,previous.vehicle_category_codes,previous.adjustment_type,target_adjustment_value,previous.priority,previous.stack_group,previous.weekdays,previous.local_time_start,previous.local_time_end,effective_at,null,previous.condition_config,actor,actor) returning * into result;
  return result;
end;
$$;

revoke all on function public.admin_get_marketplace_pricing_dashboard(uuid) from public, anon;
revoke all on function public.admin_publish_marketplace_pricing_tariff(uuid,text,text,numeric,numeric,numeric,numeric,numeric) from public, anon;
revoke all on function public.admin_publish_marketplace_pricing_adjustment(uuid,text,numeric,boolean) from public, anon;
grant execute on function public.admin_get_marketplace_pricing_dashboard(uuid) to authenticated;
grant execute on function public.admin_publish_marketplace_pricing_tariff(uuid,text,text,numeric,numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.admin_publish_marketplace_pricing_adjustment(uuid,text,numeric,boolean) to authenticated;
