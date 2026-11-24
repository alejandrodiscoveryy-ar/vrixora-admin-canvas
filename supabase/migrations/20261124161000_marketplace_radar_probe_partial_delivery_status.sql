-- Mostrar entregas push parciales sin cambiar elegibilidad, avisos ni carreras.
-- "sent" significa al menos un token aceptado por FCM, no apertura.
create or replace function public.admin_get_marketplace_radar_point_probe_status_v1(
  target_project_id uuid,
  target_run_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path to ''
as $function$
declare
  v_run app_private.marketplace_radar_point_probe_runs_v1%rowtype;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  perform app_private.require_project_permission(target_project_id,'settings.manage');
  select * into v_run from app_private.marketplace_radar_point_probe_runs_v1
  where project_id=target_project_id and run_id=target_run_id;
  if not found then raise exception 'RADAR_PROBE_RUN_NOT_FOUND' using errcode='22023'; end if;
  return (
    select jsonb_build_object(
      'runId',target_run_id,'count',v_run.recipient_count,
      'sent',count(*) filter(where delivery_status='sent'),
      'partial',count(*) filter(where delivery_status='sent' and last_error like 'Partial delivery:%'),
      'failed',count(*) filter(where delivery_status='failed'),
      'skipped',count(*) filter(where delivery_status='skipped'),
      'pending',count(*) filter(where delivery_status in ('pending','processing')),
      'recipients',coalesce(jsonb_agg(jsonb_build_object(
        'driverUserId',user_id,
        'status',delivery_status,
        'partial',delivery_status='sent' and last_error like 'Partial delivery:%',
        'sentAt',sent_at,
        'openedAt',read_at
      ) order by user_id),'[]'::jsonb)
    )
    from public.notification_outbox
    where project_id=target_project_id and kind='app_announcement'
      and dedupe_key='radar-point-test:'||target_run_id::text
  );
end;
$function$;
revoke all on function public.admin_get_marketplace_radar_point_probe_status_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.admin_get_marketplace_radar_point_probe_status_v1(uuid,uuid)
  to authenticated;
