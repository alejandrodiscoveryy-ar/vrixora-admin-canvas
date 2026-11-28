begin;
-- One aggregate row per 5 minutes. Private tables, no device or customer data.
create table if not exists app_private.system_health_samples_v2 (
  sampled_at timestamptz primary key, snapshot jsonb not null
);
create table if not exists app_private.system_health_incidents_v2 (
  id bigint generated always as identity primary key,
  code text not null, severity text not null check (severity in ('warning','critical')),
  opened_at timestamptz not null, last_seen_at timestamptz not null,
  resolved_at timestamptz, acknowledged_at timestamptz, acknowledged_by uuid,
  detail text not null
);
create unique index if not exists system_health_open_incident_v2 on app_private.system_health_incidents_v2(code) where resolved_at is null;
alter table app_private.system_health_samples_v2 enable row level security;
alter table app_private.system_health_incidents_v2 enable row level security;
revoke all on app_private.system_health_samples_v2,app_private.system_health_incidents_v2 from public,anon,authenticated;

create or replace function app_private.collect_system_health_v2()
returns void language plpgsql security definer set search_path='' as $$
declare
  t timestamptz:=clock_timestamp();
  bucket timestamptz:=date_bin('5 minutes',t,'2000-01-01 00:00:00+00'::timestamptz);
  d jsonb; prev jsonb; prev_t timestamptz; growth numeric;
  alerts jsonb:='[]'::jsonb; item jsonb;
  missing_count integer; overdue_count integer;
begin
  if not pg_try_advisory_xact_lock(764193201) then return; end if;
  if exists(select 1 from app_private.system_health_samples_v2 where sampled_at=bucket) then return; end if;
  with connections as (
    select count(*) filter(where backend_type='client backend') clients,
      count(*) filter(where backend_type='client backend' and state='active' and pid<>pg_backend_pid()) active,
      count(*) filter(where backend_type='client backend' and cardinality(pg_blocking_pids(pid))>0) blocked
    from pg_catalog.pg_stat_activity
  ), recent as materialized (
    select jobid,status,end_time from cron.job_run_details order by runid desc limit 300
  ), sample as (
    select count(*) filter(where end_time>=t-interval '15 minutes' and status in ('succeeded','failed')) completed,
      count(*) filter(where end_time>=t-interval '15 minutes' and status='failed') failed
    from recent
  ), essential(name, allowed_minutes) as (
    values ('marketplace-dispatch-waves',3),('tuktuk-job-reminders-v1',3),
      ('marketplace-impulsa-reconcile-v1',5),('tuktuk-push-dispatch',15),
      ('tuktuk-expire-inactive-shifts-v2',40)
  ), checks as (
    select e.name, j.jobid, coalesce(j.active,false) enabled,
      (select max(r.end_time) from recent r where r.jobid=j.jobid and r.status='succeeded') last_success,
      e.allowed_minutes
    from essential e left join cron.job j on j.jobname=e.name
  )
  select jsonb_build_object('sampled_at',t,'database_bytes',pg_database_size(current_database()),
    'cron_history_bytes',pg_total_relation_size('cron.job_run_details'::regclass),
    'client_connections',connections.clients,'max_connections',current_setting('max_connections')::int,
    'active_queries',connections.active,'blocked_queries',connections.blocked,
    'active_cron',(select count(*) from cron.job where active),
    'cron_completed_sample',sample.completed,'cron_failed_sample',sample.failed,
    'essential_cron',(select jsonb_agg(to_jsonb(c) order by c.name) from checks c))
  into d from connections cross join sample;
  select count(*) filter(where not (x->>'enabled')::boolean),
    count(*) filter(where (x->>'enabled')::boolean and
      ((x->>'last_success') is null or (x->>'last_success')::timestamptz<t-make_interval(mins=>(x->>'allowed_minutes')::int)))
    into missing_count,overdue_count from jsonb_array_elements(d->'essential_cron') x;
  select snapshot,sampled_at into prev,prev_t from app_private.system_health_samples_v2
    where sampled_at<=bucket-interval '24 hours' order by sampled_at desc limit 1;
  if prev is not null and prev_t>=bucket-interval '25 hours' then
    growth:=(d->>'database_bytes')::numeric-(prev->>'database_bytes')::numeric;
    d:=d||jsonb_build_object('growth_24h_bytes',growth,
      'days_to_90_percent',case when growth>0 then greatest(0,round((450000000-(d->>'database_bytes')::numeric)/growth,1)) else null end);
  end if;
  if (d->>'database_bytes')::numeric>=375000000 then
    alerts:=alerts||jsonb_build_array(jsonb_build_object('code','database','severity',case when (d->>'database_bytes')::numeric>=450000000 then 'critical' else 'warning' end,'detail','Base de datos cerca del límite de referencia de 500 MB.'));
  end if;
  if (d->>'days_to_90_percent')::numeric<=3 and (d->>'database_bytes')::numeric<450000000 then
    alerts:=alerts||jsonb_build_array(jsonb_build_object('code','growth','severity','warning','detail','Al ritmo neto de las últimas 24 h, podría alcanzarse el 90% en tres días o menos. Estimación, no garantía.'));
  end if;
  if (d->>'client_connections')::numeric>=0.7*(d->>'max_connections')::numeric then
    alerts:=alerts||jsonb_build_array(jsonb_build_object('code','connections','severity',case when (d->>'client_connections')::numeric>=0.85*(d->>'max_connections')::numeric then 'critical' else 'warning' end,'detail','Conexiones PostgreSQL elevadas.'));
  end if;
  if (d->>'blocked_queries')::int>0 then
    alerts:=alerts||jsonb_build_array(jsonb_build_object('code','blocks','severity',case when exists(select 1 from app_private.system_health_incidents_v2 where code='blocks' and resolved_at is null and opened_at<=t-interval '5 minutes') then 'critical' else 'warning' end,'detail','Hay consultas bloqueadas. Revisar transacciones; no cancelar sesiones automáticamente.'));
  end if;
  if (d->>'cron_history_bytes')::numeric>=50000000 then
    alerts:=alerts||jsonb_build_array(jsonb_build_object('code','cron_storage','severity',case when (d->>'cron_history_bytes')::numeric>=125000000 then 'critical' else 'warning' end,'detail','El historial técnico consume espacio. Revisar política de retención.'));
  end if;
  if missing_count>0 then
    alerts:=alerts||jsonb_build_array(jsonb_build_object('code','cron_disabled','severity','critical','detail',missing_count||' procesos esenciales desactivados o ausentes.'));
  end if;
  if overdue_count>0 then
    alerts:=alerts||jsonb_build_array(jsonb_build_object('code','cron_overdue','severity','warning','detail',overdue_count||' procesos esenciales sin éxito reciente confirmado en la muestra acotada. Verificar en Cron.'));
  end if;
  if (d->>'cron_failed_sample')::int>0 then
    alerts:=alerts||jsonb_build_array(jsonb_build_object('code','cron_failed','severity',case when (d->>'cron_failed_sample')::int>=2 then 'critical' else 'warning' end,'detail','Se detectaron ejecuciones fallidas en los últimos 15 minutos (máximo 300).'));
  end if;
  for item in select value from jsonb_array_elements(alerts) loop
    insert into app_private.system_health_incidents_v2 as i(code,severity,opened_at,last_seen_at,detail)
      values(item->>'code',item->>'severity',t,t,item->>'detail')
      on conflict(code) where resolved_at is null do update set
      severity=excluded.severity,last_seen_at=excluded.last_seen_at,detail=excluded.detail,
      acknowledged_at=case when i.severity='warning' and excluded.severity='critical' then null else i.acknowledged_at end,
      acknowledged_by=case when i.severity='warning' and excluded.severity='critical' then null else i.acknowledged_by end;
  end loop;
  -- Resolve only after two consecutive healthy samples; unknown coverage is not a healthy result.
  update app_private.system_health_incidents_v2 i set resolved_at=t
    where i.resolved_at is null and i.last_seen_at<=t-interval '9 minutes'
      and not exists(select 1 from jsonb_array_elements(alerts) a where a->>'code'=i.code)
      and not (i.code='growth' and not (d ? 'growth_24h_bytes'))
      and not (i.code='cron_failed' and (d->>'cron_completed_sample')::int=0);
  insert into app_private.system_health_samples_v2 values(bucket,d);
  delete from app_private.system_health_samples_v2 where sampled_at<bucket-interval '7 days';
  delete from app_private.system_health_incidents_v2 where resolved_at<t-interval '30 days';
end $$;
revoke all on function app_private.collect_system_health_v2() from public,anon,authenticated;

create or replace function public.admin_get_system_health_v2(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'settings.manage');
  if not exists(select 1 from public.projects where id=target_project_id and slug='tuktuk-control') then
    raise exception 'PERMISSION_DENIED:system_health' using errcode='42501';
  end if;
  select snapshot into d from app_private.system_health_samples_v2 order by sampled_at desc limit 1;
  return jsonb_build_object('server_time',clock_timestamp(),'snapshot',d,
    'incidents',(select coalesce(jsonb_agg(to_jsonb(i)-'acknowledged_by' order by i.opened_at desc),'[]'::jsonb) from (
      select * from app_private.system_health_incidents_v2 order by (resolved_at is null) desc,opened_at desc limit 40) i),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('at',sampled_at,'database_bytes',snapshot->'database_bytes','client_connections',snapshot->'client_connections','blocked_queries',snapshot->'blocked_queries') order by sampled_at),'[]'::jsonb) from (
      select * from app_private.system_health_samples_v2 where sampled_at>=now()-interval '24 hours' and extract(minute from sampled_at)::int % 30=0 order by sampled_at desc limit 49) h));
end $$;
revoke all on function public.admin_get_system_health_v2(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_system_health_v2(uuid) to authenticated;

create or replace function public.admin_ack_system_health_incident_v2(target_project_id uuid,target_incident_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=app_private.require_project_permission(target_project_id,'settings.manage');
  if not exists(select 1 from public.projects where id=target_project_id and slug='tuktuk-control') then
    raise exception 'PERMISSION_DENIED:system_health' using errcode='42501';
  end if;
  update app_private.system_health_incidents_v2 set acknowledged_at=now(),acknowledged_by=actor
    where id=target_incident_id and resolved_at is null and acknowledged_at is null;
end $$;
revoke all on function public.admin_ack_system_health_incident_v2(uuid,bigint) from public,anon,authenticated;
grant execute on function public.admin_ack_system_health_incident_v2(uuid,bigint) to authenticated;

select app_private.collect_system_health_v2();
select cron.schedule('tuktuk-system-health-v2','*/5 * * * *','select app_private.collect_system_health_v2();');
commit;
