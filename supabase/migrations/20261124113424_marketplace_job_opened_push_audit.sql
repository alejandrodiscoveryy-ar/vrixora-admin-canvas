-- Extiende únicamente la respuesta de auditoría al administrador autorizado.
-- first_opened_at representa una apertura explícita, no recepción garantizada.
CREATE OR REPLACE FUNCTION public.admin_get_marketplace_job_notification_recipients(target_project_id uuid, target_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      min(n.read_at) as first_opened_at,
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
      n.first_notification_at, n.first_opened_at, false as is_test_recipient
    from notices n
    union all
    select t.driver_user_id, 'simulated'::text, 0::integer,
      t.selected_at, null::timestamptz, true
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
    'first_opened_at', a.first_opened_at,
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
$function$
;
