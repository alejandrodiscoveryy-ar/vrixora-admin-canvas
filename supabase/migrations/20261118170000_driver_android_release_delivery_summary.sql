-- Read-only summary for the current Android release only.
-- Distinguishes push dispatch from installed-version telemetry.
create or replace function public.admin_get_driver_android_release_delivery(target_project_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  v_build integer;
  v_version text;
  v_eligible integer := 0;
  v_sent integer := 0;
  v_pending integer := 0;
  v_failed integer := 0;
  v_last_sent_at timestamptz;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.view');

  select r.latest_build, r.latest_version
    into v_build, v_version
  from public.project_app_releases r
  where r.project_id=target_project_id and r.platform='android';

  select count(distinct d.user_id)::integer
    into v_eligible
  from public.driver_profiles d
  where d.project_id=target_project_id and d.status='active'
    and exists (
      select 1 from public.push_device_tokens t
      where t.project_id=d.project_id and t.user_id=d.user_id
        and t.enabled=true and t.platform='android'
    );

  if v_build is not null and v_build > 0 then
    select
      count(distinct n.user_id) filter (where n.delivery_status='sent')::integer,
      count(distinct n.user_id) filter (where n.delivery_status in ('pending','processing'))::integer,
      count(distinct n.user_id) filter (where n.delivery_status not in ('sent','pending','processing'))::integer,
      max(n.sent_at)
    into v_sent, v_pending, v_failed, v_last_sent_at
    from public.notification_outbox n
    join public.driver_profiles d on d.project_id=n.project_id and d.user_id=n.user_id
    where n.project_id=target_project_id and d.status='active'
      and n.kind='app_update'
      and n.dedupe_key='driver_android_release:' || v_build::text;
  end if;

  return jsonb_build_object(
    'release_version', coalesce(v_version,''),
    'release_build', coalesce(v_build,0),
    'eligible_drivers', v_eligible,
    'sent_drivers', v_sent,
    'pending_drivers', v_pending,
    'failed_drivers', v_failed,
    'last_sent_at', v_last_sent_at
  );
end;
$function$;

revoke all on function public.admin_get_driver_android_release_delivery(uuid) from public;
grant execute on function public.admin_get_driver_android_release_delivery(uuid) to authenticated;
