-- TUKTUK / alcance real de cada solicitud. Preparacion: NO aplicada a Supabase.
-- La distancia se toma del ultimo GPS valido al ENCOLAR cada aviso, no al verlo.
-- No conserva coordenadas del conductor, solo km, momento y metodo.
-- No altera la elegibilidad, orden o frecuencia de despacho ni los pagos.

create or replace function app_private.marketplace_snapshot_notification_distance()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_job_id_text text;
  v_origin_lat_text text;
  v_origin_lon_text text;
  v_origin_lat numeric;
  v_origin_lon numeric;
  v_driver_lat numeric;
  v_driver_lon numeric;
  v_captured_at timestamptz;
  v_km numeric;
begin
  -- El WHEN del trigger evita trabajo en notificaciones no relacionadas.
  v_job_id_text := new.data->>'job_id';
  if v_job_id_text is null or
     v_job_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;

  select r.details #>> '{route_origin,lat}', r.details #>> '{route_origin,lon}'
    into v_origin_lat_text, v_origin_lon_text
  from public.jobs j
  join public.service_requests r
    on r.project_id = j.project_id and r.id = j.service_request_id
  where j.project_id = new.project_id and j.id = v_job_id_text::uuid;

  if v_origin_lat_text is null or v_origin_lon_text is null
     or v_origin_lat_text !~ '^-?[0-9]+(\.[0-9]+)?$'
     or v_origin_lon_text !~ '^-?[0-9]+(\.[0-9]+)?$' then
    return new;
  end if;

  v_origin_lat := v_origin_lat_text::numeric;
  v_origin_lon := v_origin_lon_text::numeric;
  if v_origin_lat not between -90 and 90 or v_origin_lon not between -180 and 180 then
    return new;
  end if;

  select l.latitude, l.longitude, l.captured_at
    into v_driver_lat, v_driver_lon, v_captured_at
  from public.marketplace_driver_locations l
  where l.project_id = new.project_id
    and l.driver_user_id = new.user_id
    and l.captured_at <= clock_timestamp()
    and l.captured_at >= clock_timestamp() - interval '300 seconds'
    and l.latitude between -90 and 90
    and l.longitude between -180 and 180
  order by l.captured_at desc
  limit 1;

  if not found then return new; end if;
  v_km := app_private.marketplace_haversine_km(
    v_origin_lat, v_origin_lon, v_driver_lat, v_driver_lon
  );
  if v_km is not null and v_km between 0 and 20050 then
    new.data := coalesce(new.data, '{}'::jsonb) || jsonb_build_object(
      'distance_km', round(v_km, 2),
      'distance_gps_at', v_captured_at,
      'distance_method', 'straight_line'
    );
  end if;
  return new;
exception when others then
  -- Una incidencia en telemetria nunca debe impedir que se encole el aviso.
  raise warning 'TUKTUK_NOTIFICATION_DISTANCE_SNAPSHOT_SKIPPED: %', sqlstate;
  return new;
end;
$function$;

revoke all on function app_private.marketplace_snapshot_notification_distance()
  from public, anon, authenticated;

create trigger marketplace_notification_distance_before_insert
before insert on public.notification_outbox
for each row
when (new.kind = 'marketplace_job_available'
      and new.dedupe_key like 'marketplace-job:%')
execute function app_private.marketplace_snapshot_notification_distance();

-- Consulta administrativa. Consolida envios iniciales y recordatorios por conductor.
-- Los destinatarios de pruebas son SOLO simulados si no hay envio real.
create or replace function public.admin_get_marketplace_job_notification_recipients(
  target_project_id uuid, target_job_id uuid
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_result jsonb;
  v_is_test boolean;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  select j.is_test into v_is_test
  from public.jobs j
  where j.project_id = target_project_id
    and j.id = target_job_id
    and j.test_deleted_at is null;
  if not found then return '[]'::jsonb; end if;

  with notices as (
    select n.user_id,
      count(*)::integer as notification_count,
      min(coalesce(n.sent_at, n.created_at)) as first_notification_at,
      case
        when bool_or(n.delivery_status = 'sent') then 'sent'
        when bool_or(n.delivery_status in ('pending','processing')) then 'pending'
        else coalesce(max(n.delivery_status), 'unknown')
      end as delivery_status
    from public.notification_outbox n
    where n.project_id = target_project_id
      and n.kind = 'marketplace_job_available'
      and (n.dedupe_key = 'marketplace-job:' || target_job_id::text
        or n.dedupe_key like 'marketplace-job:' || target_job_id::text || ':reminder:%')
    group by n.user_id
  ),
  gps as (
    select distinct on (n.user_id)
      n.user_id,
      (n.data->>'distance_km')::numeric as distance_km,
      n.data->>'distance_gps_at' as distance_gps_at
    from public.notification_outbox n
    where n.project_id = target_project_id
      and n.kind = 'marketplace_job_available'
      and (n.dedupe_key = 'marketplace-job:' || target_job_id::text
        or n.dedupe_key like 'marketplace-job:' || target_job_id::text || ':reminder:%')
      and (n.data->>'distance_km') ~ '^[0-9]+(\.[0-9]+)?$'
    order by n.user_id, n.created_at, n.id
  ),
  audience as (
    select n.user_id, n.delivery_status, n.notification_count,
      n.first_notification_at, false as is_test_recipient
    from notices n
    union all
    select t.driver_user_id, 'simulated'::text, 0::integer,
      t.selected_at, true
    from public.marketplace_test_job_recipients t
    where coalesce(v_is_test,false)
      and t.project_id = target_project_id and t.job_id = target_job_id
      and not exists (select 1 from notices n where n.user_id = t.driver_user_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'driver_user_id', a.user_id,
    'driver_display_name', coalesce(nullif(trim(p.display_name),''), 'Conductor sin nombre'),
    'delivery_status', a.delivery_status,
    'notification_count', a.notification_count,
    'first_notification_at', a.first_notification_at,
    'distance_km', g.distance_km,
    'distance_gps_at', g.distance_gps_at,
    'is_test_recipient', a.is_test_recipient
  ) order by g.distance_km asc nulls last, a.first_notification_at, a.user_id), '[]'::jsonb)
    into v_result
  from audience a
  left join public.profiles p on p.id = a.user_id
  left join gps g on g.user_id = a.user_id;

  return v_result;
end;
$function$;

revoke all on function public.admin_get_marketplace_job_notification_recipients(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_get_marketplace_job_notification_recipients(uuid, uuid)
  to authenticated;
