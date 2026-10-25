-- Lista real de destinatarios de carreras; sin cambios al motor de despacho.
create index if not exists notification_outbox_marketplace_job_lookup_idx
  on public.notification_outbox (project_id, dedupe_key)
  where kind = 'marketplace_job_available';

create or replace function public.admin_get_marketplace_job_notification_recipients(
  target_project_id uuid, target_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  if not exists (
    select 1 from public.jobs j
    where j.project_id = target_project_id
      and j.id = target_job_id
      and j.test_deleted_at is null
  ) then
    return '[]'::jsonb;
  end if;
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'driver_user_id', n.user_id,
      'driver_display_name', coalesce(nullif(trim(p.display_name), ''), 'Conductor sin nombre'),
      'delivery_status', n.delivery_status
    ) order by n.created_at, n.user_id),
    '[]'::jsonb
  ) into v_result
  from public.notification_outbox n
  left join public.profiles p on p.id = n.user_id
  where n.project_id = target_project_id
    and n.kind = 'marketplace_job_available'
    and n.dedupe_key = 'marketplace-job:' || target_job_id::text;
  return v_result;
end;
$function$;

revoke all on function public.admin_get_marketplace_job_notification_recipients(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_get_marketplace_job_notification_recipients(uuid, uuid)
  to authenticated;
