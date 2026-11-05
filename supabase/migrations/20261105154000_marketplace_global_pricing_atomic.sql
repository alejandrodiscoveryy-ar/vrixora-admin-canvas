-- TUKTUK: ajuste global atomico, permiso exacto, historial y reversión.
-- NO cambia tarifas al aplicar esta migracion. Solo crea funciones.
-- Usa versiones y audit_events ya existentes: sin tablas nuevas ni cambios al motor smart_pricing_v1.

create or replace function app_private.marketplace_global_pricing_snapshot(
  target_project_id uuid, target_scope text
) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  with eligible as (
    select t.id,t.service_code,t.vehicle_category_code,t.version,
           t.base_price_usd,t.minimum_price_usd,t.per_km_price_usd,
           t.per_extra_passenger_price_usd,t.per_stop_price_usd,t.updated_at
    from public.marketplace_pricing_tariffs t
    where t.project_id = target_project_id
      and t.status = 'active'
      and t.effective_from <= clock_timestamp()
      and (t.effective_to is null or t.effective_to > clock_timestamp())
      and t.service_code in ('passenger','cargo','courier')
      and (target_scope = 'all' or t.service_code = target_scope)
  ), snapshot as (
    select coalesce(jsonb_agg(
      jsonb_build_array(id,service_code,vehicle_category_code,version,
        base_price_usd,minimum_price_usd,per_km_price_usd,
        per_extra_passenger_price_usd,per_stop_price_usd,updated_at)
      order by service_code,vehicle_category_code
    ),'[]'::jsonb) as rows from eligible
  )
  select jsonb_build_object('fingerprint',md5(rows::text),
    'count',jsonb_array_length(rows), 'entries',rows) from snapshot;
$$;

create or replace function public.admin_preview_marketplace_global_adjustment(
  target_project_id uuid, target_scope text, target_reduction_percent integer
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.pricing.manage');
  if target_scope not in ('all','passenger','cargo','courier') or target_scope is null
     or target_reduction_percent is null or target_reduction_percent < 1 or target_reduction_percent > 40
     or (target_reduction_percent % 5) <> 0 then
    raise exception 'GLOBAL_PRICING_INVALID_INPUT' using errcode='22023';
  end if;
  result := app_private.marketplace_global_pricing_snapshot(target_project_id,target_scope);
  if (result->>'count')::integer = 0 then
    raise exception 'GLOBAL_PRICING_NO_ACTIVE_TARIFFS' using errcode='P0002';
  end if;
  return result || jsonb_build_object('scope',target_scope,'reduction_percent',target_reduction_percent);
end;
$$;

create or replace function public.admin_apply_marketplace_global_adjustment(
  target_project_id uuid, target_scope text, target_reduction_percent integer,
  expected_fingerprint text
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid;
  batch_id uuid := gen_random_uuid();
  current_row public.marketplace_pricing_tariffs%rowtype;
  new_id uuid;
  effective_at timestamptz;
  snapshot jsonb;
  affected integer := 0;
begin
  actor := app_private.require_project_permission(target_project_id,'marketplace.pricing.manage');
  if target_scope not in ('all','passenger','cargo','courier') or target_scope is null
     or target_reduction_percent is null or target_reduction_percent < 1 or target_reduction_percent > 40
     or (target_reduction_percent % 5) <> 0
     or expected_fingerprint is null or expected_fingerprint !~ '^[0-9a-f]{32}$' then
    raise exception 'GLOBAL_PRICING_INVALID_INPUT' using errcode='22023';
  end if;

  -- Bloqueo breve de escritura de tarifas, sin bloquear las lecturas de cotizaciones.
  perform pg_catalog.set_config('lock_timeout','5000',true);
  lock table public.marketplace_pricing_tariffs in share row exclusive mode;
  snapshot := app_private.marketplace_global_pricing_snapshot(target_project_id,target_scope);
  if (snapshot->>'count')::integer = 0 then
    raise exception 'GLOBAL_PRICING_NO_ACTIVE_TARIFFS' using errcode='P0002';
  end if;
  if snapshot->>'fingerprint' is distinct from expected_fingerprint then
    raise exception 'GLOBAL_PRICING_STALE_PREVIEW' using errcode='40001';
  end if;

  effective_at := clock_timestamp();
  for current_row in
    select * from public.marketplace_pricing_tariffs t
    where t.project_id=target_project_id and t.status='active'
      and t.effective_from<=clock_timestamp() and (t.effective_to is null or t.effective_to>clock_timestamp())
      and t.service_code in ('passenger','cargo','courier')
      and (target_scope='all' or t.service_code=target_scope)
    order by t.service_code,t.vehicle_category_code for update
  loop
    if current_row.base_price_usd is null or current_row.minimum_price_usd is null
       or current_row.per_km_price_usd is null or current_row.per_extra_passenger_price_usd is null
       or current_row.per_stop_price_usd is null then
      raise exception 'GLOBAL_PRICING_TARIFF_INCOMPLETE' using errcode='22023';
    end if;
    update public.marketplace_pricing_tariffs
      set status='retired',effective_to=effective_at,
          updated_at=effective_at,updated_by=actor
    where id=current_row.id;

    insert into public.marketplace_pricing_tariffs(
      project_id,service_code,vehicle_category_code,version,status,currency,
      base_price_usd,minimum_price_usd,per_km_price_usd,
      per_extra_passenger_price_usd,per_stop_price_usd,
      effective_from,effective_to,metadata,created_by,updated_by
    ) values (
      target_project_id,current_row.service_code,current_row.vehicle_category_code,
      'global-'||batch_id::text,'active','USD',
      round(current_row.base_price_usd*(100-target_reduction_percent)/100,6),
      round(current_row.minimum_price_usd*(100-target_reduction_percent)/100,6),
      round(current_row.per_km_price_usd*(100-target_reduction_percent)/100,6),
      round(current_row.per_extra_passenger_price_usd*(100-target_reduction_percent)/100,6),
      round(current_row.per_stop_price_usd*(100-target_reduction_percent)/100,6),
      effective_at,null,
      coalesce(current_row.metadata,'{}'::jsonb) || jsonb_build_object(
        'global_batch_id',batch_id::text,'global_action','apply',
        'global_previous_tariff_id',current_row.id::text,
        'global_reduction_percent',target_reduction_percent),
      actor,actor
    ) returning id into new_id;
    affected := affected + 1;
  end loop;
  if affected <> (snapshot->>'count')::integer then
    raise exception 'GLOBAL_PRICING_COUNT_MISMATCH' using errcode='40001';
  end if;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_project_id,actor,'marketplace_global_apply','marketplace_pricing_batch',batch_id::text,
    jsonb_build_object('scope',target_scope,'reduction_percent',target_reduction_percent,
      'count',affected,'fingerprint_before',expected_fingerprint));
  return jsonb_build_object('batch_id',batch_id,'count',affected,'action','apply');
end;
$$;

create or replace function public.admin_revert_marketplace_global_adjustment(
  target_project_id uuid, target_batch_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid;
  summary_event public.audit_events%rowtype;
  adjustment public.marketplace_pricing_tariffs%rowtype;
  original public.marketplace_pricing_tariffs%rowtype;
  current_id uuid;
  affected integer := 0;
  effective_at timestamptz;
begin
  actor := app_private.require_project_permission(target_project_id,'marketplace.pricing.manage');
  if target_batch_id is null then
    raise exception 'GLOBAL_PRICING_INVALID_BATCH' using errcode='22023';
  end if;
  perform pg_catalog.set_config('lock_timeout','5000',true);
  lock table public.marketplace_pricing_tariffs in share row exclusive mode;
  select * into summary_event from public.audit_events
    where project_id=target_project_id and entity_type='marketplace_pricing_batch'
      and entity_id=target_batch_id::text and action='marketplace_global_apply'
    order by id desc limit 1;
  if not found then raise exception 'GLOBAL_PRICING_BATCH_NOT_FOUND' using errcode='P0002'; end if;
  if exists(select 1 from public.audit_events
    where project_id=target_project_id and entity_type='marketplace_pricing_batch'
      and entity_id=target_batch_id::text and action='marketplace_global_revert') then
    raise exception 'GLOBAL_PRICING_ALREADY_REVERTED' using errcode='22023';
  end if;
  effective_at := clock_timestamp();
  for adjustment in
    select * from public.marketplace_pricing_tariffs t
    where t.project_id=target_project_id and t.metadata->>'global_batch_id'=target_batch_id::text
      and t.metadata->>'global_action'='apply'
      and t.version='global-'||target_batch_id::text
    order by t.service_code,t.vehicle_category_code
  loop
    select t.id into current_id from public.marketplace_pricing_tariffs t
    where t.project_id=target_project_id and t.service_code=adjustment.service_code
      and t.vehicle_category_code=adjustment.vehicle_category_code
      and t.status='active' and t.effective_from<=now()
      and (t.effective_to is null or t.effective_to>now())
    order by t.effective_from desc limit 1 for update;
    if current_id is distinct from adjustment.id then
      raise exception 'GLOBAL_PRICING_REVERT_CONFLICT' using errcode='40001';
    end if;
    select * into original from public.marketplace_pricing_tariffs
      where id=(adjustment.metadata->>'global_previous_tariff_id')::uuid
        and project_id=target_project_id and service_code=adjustment.service_code
        and vehicle_category_code=adjustment.vehicle_category_code;
    if not found then
      raise exception 'GLOBAL_PRICING_ORIGINAL_NOT_FOUND' using errcode='P0002';
    end if;
    update public.marketplace_pricing_tariffs
      set status='retired',effective_to=effective_at,
          updated_at=effective_at,updated_by=actor
    where id=adjustment.id;
    insert into public.marketplace_pricing_tariffs(
      project_id,service_code,vehicle_category_code,version,status,currency,
      base_price_usd,minimum_price_usd,per_km_price_usd,
      per_extra_passenger_price_usd,per_stop_price_usd,
      effective_from,effective_to,metadata,created_by,updated_by
    ) values (
      target_project_id,original.service_code,original.vehicle_category_code,
      'revert-'||target_batch_id::text,'active','USD',
      original.base_price_usd,original.minimum_price_usd,original.per_km_price_usd,
      original.per_extra_passenger_price_usd,original.per_stop_price_usd,
      effective_at,null,
      coalesce(original.metadata,'{}'::jsonb) - 'global_batch_id' - 'global_action'
        - 'global_previous_tariff_id' - 'global_reduction_percent'
        || jsonb_build_object('global_reversal_of',target_batch_id::text),
      actor,actor
    );
    affected := affected+1;
  end loop;
  if affected=0 or affected<>(summary_event.metadata->>'count')::integer then
    raise exception 'GLOBAL_PRICING_REVERT_COUNT_MISMATCH' using errcode='40001';
  end if;
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_project_id,actor,'marketplace_global_revert','marketplace_pricing_batch',target_batch_id::text,
    jsonb_build_object('count',affected,'applied_event_id',summary_event.id));
  return jsonb_build_object('batch_id',target_batch_id,'count',affected,'action','revert');
end;
$$;

create or replace function public.admin_list_marketplace_global_adjustments(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.pricing.manage');
  select coalesce(jsonb_agg(jsonb_build_object(
    'batch_id',e.entity_id,'scope',e.metadata->>'scope',
    'reduction_percent',(e.metadata->>'reduction_percent')::integer,
    'count',(e.metadata->>'count')::integer,
    'created_at',e.created_at,
    'reverted',exists(select 1 from public.audit_events r
      where r.project_id=e.project_id and r.entity_type='marketplace_pricing_batch'
        and r.entity_id=e.entity_id and r.action='marketplace_global_revert')
  ) order by e.created_at desc),'[]'::jsonb)
  into result from (
    select * from public.audit_events where project_id=target_project_id
      and entity_type='marketplace_pricing_batch' and action='marketplace_global_apply'
    order by created_at desc limit 20
  ) e;
  return result;
end;
$$;

revoke all on function app_private.marketplace_global_pricing_snapshot(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_preview_marketplace_global_adjustment(uuid,text,integer) from public,anon;
revoke all on function public.admin_apply_marketplace_global_adjustment(uuid,text,integer,text) from public,anon;
revoke all on function public.admin_revert_marketplace_global_adjustment(uuid,uuid) from public,anon;
revoke all on function public.admin_list_marketplace_global_adjustments(uuid) from public,anon;
grant execute on function public.admin_preview_marketplace_global_adjustment(uuid,text,integer) to authenticated;
grant execute on function public.admin_apply_marketplace_global_adjustment(uuid,text,integer,text) to authenticated;
grant execute on function public.admin_revert_marketplace_global_adjustment(uuid,uuid) to authenticated;
grant execute on function public.admin_list_marketplace_global_adjustments(uuid) to authenticated;
