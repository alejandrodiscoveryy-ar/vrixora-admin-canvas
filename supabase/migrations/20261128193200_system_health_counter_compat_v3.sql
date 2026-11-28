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
  if prev.http_status=200 and secs between 30 and 900 and ((raw_sample->>'boot' is null and p->>'boot' is null) or raw_sample->>'boot'=p->>'boot') then
   total:=app_private.health_counter_delta_v3(raw_sample->'cpu_total',p->'cpu_total');
   idle:=app_private.health_counter_delta_v3(raw_sample->'cpu_idle',p->'cpu_idle');
   wait_io:=app_private.health_counter_delta_v3(raw_sample->'cpu_iowait',p->'cpu_iowait');
   if total>0 and cpu_count>0 and total between secs*cpu_count*0.65 and secs*cpu_count*1.35 and idle between 0 and total and wait_io between 0 and total then
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

