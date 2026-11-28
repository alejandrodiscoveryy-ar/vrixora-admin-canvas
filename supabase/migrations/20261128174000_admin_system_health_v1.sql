-- Read-only, bounded infrastructure snapshot. No customer data or external credentials.
create or replace function public.admin_get_system_health_v1(target_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.manage');
  if not exists (select 1 from public.projects where id=target_project_id and slug='tuktuk-control') then
    raise exception 'PERMISSION_DENIED:system_health' using errcode='42501';
  end if;
  with connections as (
    select count(*) filter (where backend_type='client backend') as clients,
      count(*) filter (where backend_type='client backend' and state='active' and pid<>pg_backend_pid()) as active,
      count(*) filter (where backend_type='client backend' and cardinality(pg_blocking_pids(pid))>0) as blocked
    from pg_catalog.pg_stat_activity
  ), recent_cron as (
    select status, end_time from cron.job_run_details order by runid desc limit 100
  ), sample as (
    select count(*) filter (where end_time>=now()-interval '15 minutes' and status in ('succeeded','failed')) as completed,
      count(*) filter (where end_time>=now()-interval '15 minutes' and status='failed') as failed
    from recent_cron
  )
  select jsonb_build_object(
    'sampled_at', clock_timestamp(),
    'database_bytes', pg_database_size(current_database()),
    'cron_history_bytes', pg_total_relation_size('cron.job_run_details'::regclass),
    'client_connections', connections.clients,
    'max_connections', current_setting('max_connections')::int,
    'active_queries', connections.active,
    'blocked_queries', connections.blocked,
    'active_cron', (select count(*) from cron.job where active),
    'cron_completed_sample', sample.completed,
    'cron_failed_sample', sample.failed
  ) into result from connections cross join sample;
  return result;
end;
$$;
revoke all on function public.admin_get_system_health_v1(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_system_health_v1(uuid) to authenticated;
