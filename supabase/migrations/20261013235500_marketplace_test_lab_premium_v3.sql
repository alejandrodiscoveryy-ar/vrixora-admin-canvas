-- TUKTUK Marketplace Test Lab V3: georreferenciación, precio del motor real y paginación.
-- Preparada en rama, NO aplicada a producción.
-- Mantiene intactas las funciones V2 y no altera el flujo de aceptación/cierre/push.

create or replace function public.admin_create_marketplace_test_job_v3(
  target_project_id uuid,
  target_idempotency_key uuid,
  target_driver_user_ids uuid[],
  target_service_code text,
  target_vehicle_category_code text,
  target_origin_text text,
  target_destination_text text,
  target_origin_point jsonb,
  target_destination_point jsonb,
  target_distance_km numeric,
  target_route_duration_seconds integer,
  target_price_mode text,
  target_expected_price numeric,
  target_notes text default null,
  target_force_wallet_commission boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_origin_lat numeric;
  v_origin_lon numeric;
  v_destination_lat numeric;
  v_destination_lon numeric;
  v_quote jsonb;
  v_recommended_price numeric;
  v_final_price numeric;
  v_created jsonb;
  v_job_id uuid;
  v_request_id uuid;
  v_existing jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'settings.manage');
  if target_force_wallet_commission then
    perform app_private.require_project_permission(target_project_id,'payments.manage');
  end if;

  if target_price_mode not in ('auto','manual')
     or target_origin_point is null or jsonb_typeof(target_origin_point)<>'object'
     or target_destination_point is null or jsonb_typeof(target_destination_point)<>'object'
     or target_distance_km is null or target_distance_km<=0 or target_distance_km>5000
     or target_route_duration_seconds is null or target_route_duration_seconds<=0 or target_route_duration_seconds>259200
     or target_expected_price is null or target_expected_price<=0 or target_expected_price>100000
  then
    raise exception 'TEST_LAB_V3_INVALID_ROUTE_OR_PRICE' using errcode='22023';
  end if;
  if nullif(target_origin_point->>'lat','') is null
     or nullif(target_origin_point->>'lon','') is null
     or nullif(target_destination_point->>'lat','') is null
     or nullif(target_destination_point->>'lon','') is null
     or (target_origin_point->>'lat') !~ '^-?[0-9]+([.][0-9]+)?$'
     or (target_origin_point->>'lon') !~ '^-?[0-9]+([.][0-9]+)?$'
     or (target_destination_point->>'lat') !~ '^-?[0-9]+([.][0-9]+)?$'
     or (target_destination_point->>'lon') !~ '^-?[0-9]+([.][0-9]+)?$'
  then raise exception 'TEST_LAB_V3_COORDINATES_INVALID' using errcode='22023'; end if;

  v_origin_lat := (target_origin_point->>'lat')::numeric;
  v_origin_lon := (target_origin_point->>'lon')::numeric;
  v_destination_lat := (target_destination_point->>'lat')::numeric;
  v_destination_lon := (target_destination_point->>'lon')::numeric;
  if v_origin_lat not between 18 and 24.5
     or v_destination_lat not between 18 and 24.5
     or v_origin_lon not between -85.5 and -73
     or v_destination_lon not between -85.5 and -73
     or (v_origin_lat=v_destination_lat and v_origin_lon=v_destination_lon)
  then raise exception 'TEST_LAB_V3_COORDINATES_OUTSIDE_CUBA' using errcode='22023'; end if;

  -- MISMO motor vigente que Cliente; no se calcula una tarifa en frontend ni se confía en su precio.
  if target_price_mode='auto' then
    if target_service_code='passenger' then
      if target_vehicle_category_code not in ('motorcycle','tricycle','bicitaxi','light_car') then
        raise exception 'TEST_LAB_V3_CATEGORY_REQUIRED' using errcode='22023';
      end if;
      v_quote:=public.preview_marketplace_customer_quote_v3(
        'passenger',target_vehicle_category_code,1,target_distance_km,0,
        v_destination_lat,v_destination_lon,null);
    elsif target_service_code in ('cargo','courier') then
      v_quote:=public.preview_marketplace_customer_quote(
        target_service_code,null,null,null,target_distance_km,0,false,false,false);
    else
      raise exception 'TEST_LAB_V3_AUTO_PRICING_UNSUPPORTED' using errcode='22023';
    end if;
    if jsonb_typeof(v_quote)<>'object' or nullif(v_quote->>'recommended_price','') is null then
      raise exception 'TEST_LAB_V3_QUOTE_MISSING' using errcode='22023';
    end if;
    v_recommended_price := (v_quote->>'recommended_price')::numeric;
    if v_recommended_price is null or v_recommended_price<=0 or v_recommended_price>100000 then
      raise exception 'TEST_LAB_V3_QUOTE_INVALID' using errcode='22023';
    end if;
    -- Ante cambios de cotización (distancia/ruta/tasa), pedir nueva confirmación sin crear servicio.
    if v_recommended_price <> target_expected_price then
      raise exception 'TEST_LAB_V3_PRICE_CHANGED' using errcode='22023';
    end if;
    v_final_price:=v_recommended_price;
  else
    v_final_price:=target_expected_price;
  end if;

  -- Crear mediante V2 preserva cliente sintético, destinatarios congelados,
  -- idempotencia, outbox marketplace_job_available y comisiones gratis por defecto.
  v_created:=public.admin_create_marketplace_test_job(
    target_project_id,target_idempotency_key,target_driver_user_ids,
    target_service_code,target_vehicle_category_code,
    target_origin_text,target_destination_text,v_final_price,
    target_notes,target_force_wallet_commission);
  v_job_id:=(v_created->>'job_id')::uuid;
  if v_created->>'replayed'='true' then
    select sr.details into v_existing from public.jobs j
    join public.service_requests sr on sr.project_id=j.project_id and sr.id=j.service_request_id
    where j.project_id=target_project_id and j.id=v_job_id;
    if v_existing #>> '{route_origin,lat}' is distinct from v_origin_lat::text
       or v_existing #>> '{route_origin,lon}' is distinct from v_origin_lon::text
       or v_existing #>> '{route_destination,lat}' is distinct from v_destination_lat::text
       or v_existing #>> '{route_destination,lon}' is distinct from v_destination_lon::text then
      raise exception 'TEST_LAB_V3_IDEMPOTENCY_ROUTE_MISMATCH' using errcode='22023';
    end if;
    return v_created;
  end if;

  select j.service_request_id into v_request_id from public.jobs j
  where j.project_id=target_project_id and j.id=v_job_id and j.is_test=true;
  if v_request_id is null then raise exception 'TEST_LAB_V3_CREATED_JOB_NOT_FOUND'; end if;
  update public.service_requests sr set details=coalesce(sr.details,'{}'::jsonb)||jsonb_build_object(
    'admin_simulated',true,'test_lab',true,'test_lab_v3',true,
    'route_origin',jsonb_build_object('lat',v_origin_lat,'lon',v_origin_lon),
    'route_destination',jsonb_build_object('lat',v_destination_lat,'lon',v_destination_lon),
    'estimated_distance_km',target_distance_km,'distance_source','provider',
    'route_provider','mapbox','route_mode','driving',
    'route_duration_seconds',target_route_duration_seconds,
    'route_verified_at',now()
  ) where sr.project_id=target_project_id and sr.id=v_request_id;
  update public.jobs j set pricing_breakdown=coalesce(j.pricing_breakdown,'{}'::jsonb)||jsonb_build_object(
    'test_lab',true,'test_lab_v3',true,'manual_price',target_price_mode='manual',
    'route_provider','mapbox','distance_km',target_distance_km,
    'route_duration_seconds',target_route_duration_seconds,
    'pricing_quote',coalesce(v_quote,'{}'::jsonb)
  ) where j.project_id=target_project_id and j.id=v_job_id and j.is_test=true;
  return v_created || jsonb_build_object('distance_km',target_distance_km,
     'duration_seconds',target_route_duration_seconds,'final_price',v_final_price);
end;
$function$;
revoke all on function public.admin_create_marketplace_test_job_v3(uuid,uuid,uuid[],text,text,text,text,jsonb,jsonb,numeric,integer,text,numeric,text,boolean)
from public,anon;
grant execute on function public.admin_create_marketplace_test_job_v3(uuid,uuid,uuid[],text,text,text,text,jsonb,jsonb,numeric,integer,text,numeric,text,boolean)
to authenticated;

-- Historial V3 paginado por cursor, orden estable (created_at,id).
create or replace function public.admin_list_marketplace_test_jobs_v3(
  target_project_id uuid,
  target_limit integer default 10,
  target_cursor_created_at timestamptz default null,
  target_cursor_job_id uuid default null,
  target_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  max_rows integer := least(greatest(coalesce(target_limit,10),1),25);
  v_rows jsonb;
  v_last_created_at timestamptz;
  v_last_job_id uuid;
  v_more boolean;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.view');
  perform app_private.require_project_permission(target_project_id,'settings.view');
  if (target_cursor_created_at is null) <> (target_cursor_job_id is null) then
    raise exception 'TEST_LAB_V3_BAD_CURSOR' using errcode='22023';
  end if;
  if target_status is not null and target_status not in (
    'published','accepted','en_route','pickup','in_progress','completed','settled','expired','incident'
  ) then raise exception 'TEST_LAB_V3_BAD_STATUS' using errcode='22023'; end if;
  with page_rows as (
    select t.job_id,j.created_at,j.status,j.service_code,j.final_price,
      j.assigned_driver_user_id,j.test_deleted_at,
      sr.origin_text,sr.destination_text,sr.details,
      t.recipient_count,t.destination_mode
    from public.marketplace_admin_test_jobs t
    join public.jobs j on j.project_id=t.project_id and j.id=t.job_id
    join public.service_requests sr on sr.project_id=j.project_id and sr.id=j.service_request_id
    where t.project_id=target_project_id and j.is_test
      and (target_status is null or j.status=target_status)
      and (target_cursor_created_at is null
           or (j.created_at,j.id) < (target_cursor_created_at,target_cursor_job_id))
    order by j.created_at desc,j.id desc
    limit max_rows+1
  ), visible_rows as (
    select * from page_rows order by created_at desc,job_id desc limit max_rows
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'job_id',v.job_id,'created_at',v.created_at,'status',v.status,
      'service_code',v.service_code,'final_price',v.final_price,
      'origin_text',v.origin_text,'destination_text',v.destination_text,
      'recipient_count',v.recipient_count,'destination_mode',v.destination_mode,
      'accepted_driver_user_id',v.assigned_driver_user_id,
      'deleted',v.test_deleted_at is not null,
      'distance_km',v.details->>'estimated_distance_km',
      'duration_seconds',v.details->>'route_duration_seconds',
      'recipients',(select coalesce(jsonb_agg(jsonb_build_object(
         'driver_user_id',r.driver_user_id,'display_name',coalesce(p.display_name,'Conductor'))),'[]'::jsonb)
         from public.marketplace_test_job_recipients r
         left join public.profiles p on p.id=r.driver_user_id
         where r.project_id=target_project_id and r.job_id=v.job_id),
      'notification_status',(select coalesce(jsonb_agg(jsonb_build_object(
         'driver_user_id',o.user_id,'delivery_status',o.delivery_status,'attempt_count',o.attempt_count)),'[]'::jsonb)
         from public.notification_outbox o where o.project_id=target_project_id
          and o.dedupe_key='marketplace-job:'||v.job_id::text)
    ) order by v.created_at desc,v.job_id desc),'[]'::jsonb),
    (select count(*) from page_rows)>max_rows,
    (select x.created_at from visible_rows x order by x.created_at,x.job_id limit 1),
    (select x.job_id from visible_rows x order by x.created_at,x.job_id limit 1)
  into v_rows,v_more,v_last_created_at,v_last_job_id
  from visible_rows v;
  return jsonb_build_object('items',v_rows,'has_more',v_more,
    'next_created_at',v_last_created_at,'next_job_id',v_last_job_id);
end;
$function$;
revoke all on function public.admin_list_marketplace_test_jobs_v3(uuid,integer,timestamptz,uuid,text)
from public,anon;
grant execute on function public.admin_list_marketplace_test_jobs_v3(uuid,integer,timestamptz,uuid,text)
to authenticated;
