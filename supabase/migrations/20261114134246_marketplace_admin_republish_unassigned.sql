-- Same job, new dispatch generation; keep price, customer and event history.
create or replace function app_private.marketplace_job_offer_key(target_project_id uuid,target_job_id uuid)
returns text language sql stable set search_path='' as $$
  select 'marketplace-job:'||target_job_id::text||coalesce((
    select ':republish:'||e.operation_idempotency_key::text
    from public.job_events e where e.project_id=target_project_id
      and e.job_id=target_job_id and e.action='admin_republish'
    order by e.created_at desc,e.id desc limit 1
  ),'')
$$;
revoke all on function app_private.marketplace_job_offer_key(uuid,uuid) from public,anon,authenticated;

do $patch$
declare fn text; needle text;
begin
  select pg_get_functiondef('app_private.enqueue_marketplace_job_offer_wave(uuid)'::regprocedure) into fn;
  needle := '''marketplace-job:'' || target_job_id::text';
  if (length(fn)-length(replace(fn,needle,'')))/length(needle)<>1 then raise exception 'OFFER_KEY_CHANGED'; end if;
  execute replace(fn,needle,'app_private.marketplace_job_offer_key(v_project_id,target_job_id)');
  select pg_get_functiondef('app_private.enqueue_marketplace_job_reminders()'::regprocedure) into fn;
  needle := '''marketplace-job:'' || j.id::text';
  if (length(fn)-length(replace(fn,needle,'')))/length(needle)<>3 then raise exception 'REMINDER_KEY_CHANGED'; end if;
  execute replace(fn,needle,'app_private.marketplace_job_offer_key(j.project_id,j.id)');
end
$patch$;

create or replace function public.admin_republish_marketplace_job(target_project_id uuid,target_job_id uuid,target_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid;
  j public.jobs%rowtype;
  previous_event public.job_events%rowtype;
  ttl integer;
  new_expiry timestamptz;
  start_time timestamptz;
  dispatched integer;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  actor:=app_private.require_project_permission(target_project_id,'marketplace.manage');
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_REQUIRED' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_project_id::text||':'||target_idempotency_key::text,0));
  select * into j from public.jobs where project_id=target_project_id and id=target_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if;
  select * into previous_event from public.job_events where project_id=target_project_id and operation_idempotency_key=target_idempotency_key;
  if found then
    if previous_event.job_id<>target_job_id or previous_event.action<>'admin_republish' then raise exception 'IDEMPOTENCY_MISMATCH' using errcode='22023'; end if;
    return jsonb_build_object('job_id',j.id,'expires_at',previous_event.metadata->'new_expires_at','replayed',true);
  end if;
  if j.is_test or j.test_deleted_at is not null or j.status not in ('published','expired')
     or j.assigned_driver_user_id is not null or j.assigned_vehicle_id is not null
     or exists(select 1 from public.job_assignments a where a.project_id=j.project_id and a.job_id=j.id)
  then raise exception 'JOB_NOT_REPUBLISHABLE' using errcode='22023'; end if;
  if exists(select 1 from public.service_requests r where r.project_id=j.project_id and r.id=j.service_request_id and r.scheduled_for < now()-interval '5 minutes')
  then raise exception 'JOB_SCHEDULE_PAST' using errcode='22023'; end if;
  if j.published_at > now()-interval '60 seconds' then raise exception 'JOB_REPUBLISH_COOLDOWN' using errcode='22023'; end if;
  select publication_ttl_minutes into ttl from public.marketplace_pricing_rules where project_id=j.project_id and service_code=j.service_code and active;
  if ttl is null then raise exception 'JOB_TTL_NOT_CONFIGURED' using errcode='22023'; end if;
  start_time:=clock_timestamp();
  new_expiry:=start_time+make_interval(mins=>ttl);
  insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key,reason,metadata)
  values(j.project_id,j.id,j.status,'published','admin_republish','admin',actor,target_idempotency_key,'Republicación administrativa con confirmación del cliente',
    jsonb_build_object('previous_published_at',j.published_at,'previous_expires_at',j.expires_at,'new_expires_at',new_expiry));
  update public.notification_outbox set delivery_status='skipped'
    where project_id=j.project_id and kind='marketplace_job_available' and data->>'job_id'=j.id::text and delivery_status='pending';
  update public.jobs set status='published',published_at=start_time,expires_at=new_expiry,state_version=state_version+1
    where project_id=j.project_id and id=j.id;
  dispatched:=app_private.enqueue_marketplace_job_offer_wave(j.id);
  return jsonb_build_object('job_id',j.id,'expires_at',new_expiry,'enqueued',dispatched,'replayed',false);
end
$$;
revoke all on function public.admin_republish_marketplace_job(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_republish_marketplace_job(uuid,uuid,uuid) to authenticated;

-- Preserve expired unassigned services in the map for recovery, but mark them honestly.
do $map$
declare fn text; needle text;
begin
 select pg_get_functiondef('public.admin_get_marketplace_operational_map(uuid)'::regprocedure) into fn;
 needle := 'j.id as job_id,'||chr(10)||'      j.status,'||chr(10)||'      j.service_code,';
 if (length(fn)-length(replace(fn,needle,'')))/length(needle)<>1 then raise exception 'MAP_JOB_STATUS_CHANGED'; end if;
 fn:=replace(fn,needle,'j.id as job_id,'||chr(10)||'      case when j.status=''published'' and j.assigned_driver_user_id is null and j.expires_at<=now() then ''expired'' else j.status end as status,'||chr(10)||'      j.service_code,');
 needle:='v.category_code as vehicle_category_code,'||chr(10)||'      j.created_at,';
 if (length(fn)-length(replace(fn,needle,'')))/length(needle)<>1 then raise exception 'MAP_JOB_CATEGORY_CHANGED'; end if;
 fn:=replace(fn,needle,'coalesce(v.category_code,sr.vehicle_category_code,j.pricing_vehicle_category_code) as vehicle_category_code,'||chr(10)||'      j.created_at,');
 needle:='(select count(*) from active_jobs)';
 if (length(fn)-length(replace(fn,needle,'')))/length(needle)<>1 then raise exception 'MAP_ACTIVE_COUNT_CHANGED'; end if;
 execute replace(fn,needle,'(select count(*) from active_jobs where status<>''expired'')');
end
$map$;