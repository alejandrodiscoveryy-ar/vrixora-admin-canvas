begin;
create table if not exists app_private.system_health_provider_v3(
  requested_at timestamptz primary key,
  token_hash bytea not null unique,
  claimed_at timestamptz,
  completed_at timestamptz,
  http_status integer,
  metrics jsonb,
  raw jsonb
);
alter table app_private.system_health_provider_v3 enable row level security;
revoke all on app_private.system_health_provider_v3 from public,anon,authenticated;
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
    where i.resolved_at is null and i.code not like 'provider_%' and i.last_seen_at<=t-interval '9 minutes'
      and not exists(select 1 from jsonb_array_elements(alerts) a where a->>'code'=i.code)
      and not (i.code='growth' and not (d ? 'growth_24h_bytes'))
      and not (i.code='cron_failed' and (d->>'cron_completed_sample')::int=0);
  insert into app_private.system_health_samples_v2 values(bucket,d);
  delete from app_private.system_health_samples_v2 where sampled_at<bucket-interval '7 days';
  delete from app_private.system_health_incidents_v2 where resolved_at<t-interval '30 days';
end $$;
revoke all on function app_private.collect_system_health_v2() from public,anon,authenticated;


-- Compare identical sets of counter series, never interpret missing/reset data as zero.
create or replace function app_private.health_counter_delta_v3(a jsonb,b jsonb,use_max boolean default false)
returns numeric language sql immutable set search_path='' as $$
select case when jsonb_typeof(a)='object' and jsonb_typeof(b)='object'
  and exists(select 1 from jsonb_each(a))
  and not exists(select 1 from jsonb_each(a) x where not (b ? x.key) or jsonb_typeof(x.value)<>'number' or jsonb_typeof(b->x.key)<>'number' or (x.value#>>'{}')::numeric<(b->>x.key)::numeric)
  and not exists(select 1 from jsonb_each(b) y where not (a ? y.key))
then (select case when use_max then max((x.value#>>'{}')::numeric-(b->>x.key)::numeric) else sum((x.value#>>'{}')::numeric-(b->>x.key)::numeric) end from jsonb_each(a)x) end
$$;
revoke all on function app_private.health_counter_delta_v3(jsonb,jsonb,boolean) from public,anon,authenticated;

create or replace function app_private.health_provider_alert_v3(p_code text,p_value numeric,p_warning numeric,p_critical numeric,p_detail text,p_at timestamptz,p_previous numeric)
returns void language plpgsql security definer set search_path='' as $$
declare sev text;
begin
 if p_value is null then return; end if;
 if p_value>=p_warning then
  sev:=case when p_value>=p_critical then 'critical' else 'warning' end;
  insert into app_private.system_health_incidents_v2 as i(code,severity,opened_at,last_seen_at,detail)
   values(p_code,sev,p_at,p_at,p_detail)
   on conflict(code) where resolved_at is null do update set severity=excluded.severity,last_seen_at=excluded.last_seen_at,detail=excluded.detail,
   acknowledged_at=case when i.severity='warning' and excluded.severity='critical' then null else i.acknowledged_at end,
   acknowledged_by=case when i.severity='warning' and excluded.severity='critical' then null else i.acknowledged_by end;
 elsif p_previous is not null and p_previous<p_warning then
  update app_private.system_health_incidents_v2 set resolved_at=p_at where code=p_code and resolved_at is null;
 end if;
end $$;
revoke all on function app_private.health_provider_alert_v3(text,numeric,numeric,numeric,text,timestamptz,numeric) from public,anon,authenticated;

create or replace function app_private.enqueue_system_health_provider_v3()
returns void language plpgsql security definer set search_path='' as $$
declare t timestamptz:=clock_timestamp(); nonce text; previous_status int; expired_count int;
begin
 if not pg_try_advisory_xact_lock(764193203) then return; end if;
 select http_status into previous_status from app_private.system_health_provider_v3 where completed_at is not null order by requested_at desc limit 1;
 update app_private.system_health_provider_v3 set completed_at=t,http_status=504,metrics=jsonb_build_object('http_status',504)
 where completed_at is null and requested_at<t-interval '2 minutes';
 get diagnostics expired_count=row_count;
 if expired_count>0 then
  perform app_private.health_provider_alert_v3('provider_api',case when previous_status is not null and previous_status<>200 then 2 else 1 end,1,2,'El recolector de métricas no respondió. Revisar disponibilidad de Supabase.',t,null);
 end if;
 if exists(select 1 from app_private.system_health_provider_v3 where requested_at>t-interval '4 minutes') then return; end if;
 nonce:=encode(extensions.gen_random_bytes(32),'hex');
 insert into app_private.system_health_provider_v3(requested_at,token_hash) values(t,extensions.digest(nonce,'sha256'));
 perform net.http_post(url:='https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/system-health-provider-v3',
  headers:=jsonb_build_object('content-type','application/json','x-health-challenge',nonce),body:='{}'::jsonb,timeout_milliseconds:=30000);
 delete from app_private.system_health_provider_v3 where requested_at<t-interval '7 days';
end $$;
revoke all on function app_private.enqueue_system_health_provider_v3() from public,anon,authenticated;

create or replace function public.system_health_claim_provider_v3(challenge text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if challenge is null or challenge !~ '^[a-f0-9]{64}$' then return false; end if;
 update app_private.system_health_provider_v3 set claimed_at=clock_timestamp()
 where token_hash=extensions.digest(challenge,'sha256') and claimed_at is null and completed_at is null and requested_at>clock_timestamp()-interval '2 minutes';
 return found;
end $$;
revoke all on function public.system_health_claim_provider_v3(text) from public,anon,authenticated;
grant execute on function public.system_health_claim_provider_v3(text) to service_role;

create or replace function public.system_health_finish_provider_v3(challenge text,provider_status integer,elapsed_ms integer,raw_sample jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare t timestamptz:=clock_timestamp(); rid timestamptz; prev app_private.system_health_provider_v3%rowtype; p jsonb; d jsonb; secs numeric; total numeric; idle numeric; wait_io numeric; disk numeric; ram numeric; swap numeric; cpu numeric; io_pct numeric; swap_total numeric; bad numeric; prev_bad numeric; cpu_count numeric;
begin
 if challenge is null or challenge !~ '^[a-f0-9]{64}$' or provider_status is null or provider_status not between 100 and 599 or elapsed_ms is null or elapsed_ms not between 0 and 60000 or coalesce(octet_length(raw_sample::text),0)>48000 then raise exception 'INVALID_SAMPLE'; end if;
 select requested_at into rid from app_private.system_health_provider_v3 where token_hash=extensions.digest(challenge,'sha256') and claimed_at is not null and completed_at is null and requested_at>t-interval '2 minutes' for update;
 if rid is null then raise exception 'EXPIRED_CHALLENGE' using errcode='42501'; end if;
 select * into prev from app_private.system_health_provider_v3 where completed_at is not null and requested_at<rid order by requested_at desc limit 1;
 p:=prev.raw;
 d:=jsonb_build_object('http_status',provider_status,'duration_ms',elapsed_ms);
 if provider_status=200 and jsonb_typeof(raw_sample)='object' then
  if (raw_sample->>'ram_total')::numeric>0 and (raw_sample->>'ram_available')::numeric between 0 and (raw_sample->>'ram_total')::numeric then
   ram:=round(100*(1-(raw_sample->>'ram_available')::numeric/(raw_sample->>'ram_total')::numeric),1);
  end if;
  swap_total:=(raw_sample->>'swap_total')::numeric;
  if swap_total>0 and (raw_sample->>'swap_free')::numeric between 0 and swap_total then
   swap:=round(100*(1-(raw_sample->>'swap_free')::numeric/swap_total),1);
  end if;
  cpu_count:=(raw_sample->>'cpu_count')::numeric;
  secs:=extract(epoch from t-prev.completed_at);
  if prev.http_status=200 and secs between 30 and 900 and raw_sample->>'boot' is not null and raw_sample->>'boot'=p->>'boot' then
   total:=app_private.health_counter_delta_v3(raw_sample->'cpu_total',p->'cpu_total');
   idle:=app_private.health_counter_delta_v3(raw_sample->'cpu_idle',p->'cpu_idle');
   wait_io:=app_private.health_counter_delta_v3(raw_sample->'cpu_iowait',p->'cpu_iowait');
   if total>0 and idle between 0 and total and wait_io between 0 and total then
    cpu:=round(100*(1-idle/total),1); io_pct:=round(100*wait_io/total,1);
   end if;
   disk:=100*app_private.health_counter_delta_v3(raw_sample->'disk_io',p->'disk_io',true)/secs;
   if disk between 0 and 105 then disk:=least(100,round(disk,1)); else disk:=null; end if;
   d:=d||jsonb_build_object('read_mbps',round(app_private.health_counter_delta_v3(raw_sample->'disk_read',p->'disk_read',true)/secs/1000000,3),
     'write_mbps',round(app_private.health_counter_delta_v3(raw_sample->'disk_write',p->'disk_write',true)/secs/1000000,3),
     'network_rx_mbps',round(app_private.health_counter_delta_v3(raw_sample->'net_rx',p->'net_rx',true)/secs/1000000,3),
     'network_tx_mbps',round(app_private.health_counter_delta_v3(raw_sample->'net_tx',p->'net_tx',true)/secs/1000000,3));
  end if;
  d:=d||jsonb_build_object('metric_families',(raw_sample->>'metric_families')::int,'ram_pct',ram,'ram_total_mb',round((raw_sample->>'ram_total')::numeric/1000000,1),
    'swap_pct',swap,'swap_total_mb',round(swap_total/1000000,1),'cpu_pct',cpu,'cpu_iowait_pct',io_pct,'disk_busy_pct',disk,'load1',(raw_sample->>'load1')::numeric,'cpu_count',cpu_count);
 else raw_sample:=null;
 end if;
 update app_private.system_health_provider_v3 set completed_at=t,http_status=provider_status,metrics=d,raw=raw_sample where requested_at=rid;
 bad:=case when provider_status=200 then 0 when prev.http_status is not null and prev.http_status<>200 then 2 else 1 end;
 prev_bad:=case when prev.http_status=200 then 0 when prev.http_status is not null then 1 end;
 perform app_private.health_provider_alert_v3('provider_api',bad,1,2,'La API oficial de métricas no está respondiendo correctamente (HTTP '||provider_status||').',t,prev_bad);
 perform app_private.health_provider_alert_v3('provider_cpu',cpu,70,90,'CPU elevada. Revisar carga y consultas; no reiniciar servicios automáticamente.',t,(prev.metrics->>'cpu_pct')::numeric);
 perform app_private.health_provider_alert_v3('provider_ram',ram,80,90,'Memoria RAM elevada. Revisar conexiones y consumo.',t,(prev.metrics->>'ram_pct')::numeric);
 perform app_private.health_provider_alert_v3('provider_swap',swap,50,85,'Uso elevado de Swap. Revisar presión de memoria.',t,(prev.metrics->>'swap_pct')::numeric);
 perform app_private.health_provider_alert_v3('provider_disk',disk,70,90,'Actividad elevada del dispositivo de disco más ocupado. Verificar Disk IO Balance en Supabase.',t,(prev.metrics->>'disk_busy_pct')::numeric);
 perform app_private.health_provider_alert_v3('provider_iowait',io_pct,15,30,'CPU esperando operaciones de E/S. Revisar carga de disco.',t,(prev.metrics->>'cpu_iowait_pct')::numeric);
end $$;
revoke all on function public.system_health_finish_provider_v3(text,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.system_health_finish_provider_v3(text,integer,integer,jsonb) to service_role;

create or replace function public.admin_get_system_health_v3(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; provider jsonb;
begin
 base:=public.admin_get_system_health_v2(target_project_id);
 select metrics||jsonb_build_object('sampled_at',completed_at) into provider from app_private.system_health_provider_v3 where completed_at is not null order by requested_at desc limit 1;
 return base||jsonb_build_object('provider',provider,'provider_history',(select coalesce(jsonb_agg(h.metrics||jsonb_build_object('sampled_at',h.completed_at) order by h.requested_at),'[]'::jsonb) from (
   select requested_at,completed_at,metrics from app_private.system_health_provider_v3 where completed_at is not null and requested_at>=now()-interval '24 hours' and extract(minute from requested_at)::int%15=0 order by requested_at desc limit 100)h));
end $$;
revoke all on function public.admin_get_system_health_v3(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_system_health_v3(uuid) to authenticated;
select cron.schedule('tuktuk-system-health-provider-v3','*/5 * * * *','select app_private.enqueue_system_health_provider_v3();');
commit;
