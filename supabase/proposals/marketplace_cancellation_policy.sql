-- Cancellation policy: explicit recovery with immutable history, no financial penalties.
create table app_private.marketplace_cancellation_settings(
  project_id uuid primary key references public.projects(id),
  no_show_wait_minutes integer not null default 5 check(no_show_wait_minutes between 1 and 60),
  replacement_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table app_private.marketplace_cancellation_settings enable row level security;
revoke all on app_private.marketplace_cancellation_settings from public,anon,authenticated;

create table app_private.marketplace_job_replacements(
  project_id uuid not null,
  previous_job_id uuid not null,
  replacement_job_id uuid not null,
  cancelled_driver_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(project_id,previous_job_id),
  unique(project_id,replacement_job_id),
  foreign key(project_id,previous_job_id) references public.jobs(project_id,id),
  foreign key(project_id,replacement_job_id) references public.jobs(project_id,id),
  check(previous_job_id<>replacement_job_id)
);
alter table app_private.marketplace_job_replacements enable row level security;
revoke all on app_private.marketplace_job_replacements from public,anon,authenticated;

create or replace function public.admin_get_marketplace_cancellation_settings(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_project_permission(target_project_id,'marketplace.manage');
 return jsonb_build_object('no_show_wait_minutes',coalesce((select s.no_show_wait_minutes from app_private.marketplace_cancellation_settings s where s.project_id=target_project_id),5),
 'replacement_enabled',coalesce((select s.replacement_enabled from app_private.marketplace_cancellation_settings s where s.project_id=target_project_id),true));
end $$;
create or replace function public.admin_set_marketplace_cancellation_settings(target_project_id uuid,target_no_show_wait_minutes integer,target_replacement_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_project_permission(target_project_id,'marketplace.manage');
 perform app_private.require_project_permission(target_project_id,'settings.manage');
 if target_no_show_wait_minutes is null or target_no_show_wait_minutes not between 1 and 60 or target_replacement_enabled is null then raise exception 'CANCELLATION_SETTINGS_INVALID' using errcode='22023'; end if;
 insert into app_private.marketplace_cancellation_settings(project_id,no_show_wait_minutes,replacement_enabled)
 values(target_project_id,target_no_show_wait_minutes,target_replacement_enabled)
 on conflict(project_id) do update set no_show_wait_minutes=excluded.no_show_wait_minutes,replacement_enabled=excluded.replacement_enabled,updated_at=now();
 return public.admin_get_marketplace_cancellation_settings(target_project_id);
end $$;
revoke all on function public.admin_get_marketplace_cancellation_settings(uuid),public.admin_set_marketplace_cancellation_settings(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.admin_get_marketplace_cancellation_settings(uuid),public.admin_set_marketplace_cancellation_settings(uuid,integer,boolean) to authenticated;

-- Guard the existing cancellation transaction, including older APKs. A rejection
-- rolls back the status, reservation release and vehicle availability changes.
create or replace function app_private.marketplace_guard_no_show_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare arrived timestamptz; wait_minutes integer;
begin
 if new.actor_kind<>'driver' or new.action<>'cancel_by_driver'
   or lower(btrim(coalesce(new.reason,''))) not in ('cliente no se presentó','cliente no se presento') then return new; end if;
 if new.from_status<>'pickup' then raise exception 'NO_SHOW_REQUIRES_ARRIVAL' using errcode='22023'; end if;
 select max(e.created_at) into arrived from public.job_events e
 where e.project_id=new.project_id and e.job_id=new.job_id and e.action='mark_pickup' and e.to_status='pickup';
 select coalesce((select s.no_show_wait_minutes from app_private.marketplace_cancellation_settings s where s.project_id=new.project_id),5) into wait_minutes;
 if arrived is null then raise exception 'NO_SHOW_REQUIRES_ARRIVAL' using errcode='22023'; end if;
 if now()<arrived+make_interval(mins=>wait_minutes) then raise exception 'NO_SHOW_WAIT_REQUIRED' using errcode='22023'; end if;
 new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('no_show_wait_minutes',wait_minutes,'arrival_recorded_at',arrived);
 return new;
end $$;
revoke all on function app_private.marketplace_guard_no_show_event() from public,anon,authenticated;
create trigger marketplace_guard_no_show_event before insert on public.job_events
for each row execute function app_private.marketplace_guard_no_show_event();

-- Driver-facing availability for the no-show reason. All other reasons remain available.
create or replace function public.get_my_marketplace_job_cancellation_options(target_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $
declare j public.jobs%rowtype; arrived timestamptz; wait_minutes integer; remaining integer;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select job.* into j from public.jobs job join public.projects p on p.id=job.project_id
 where p.slug='tuktuk-control' and job.id=target_job_id and job.assigned_driver_user_id=auth.uid()
 and job.test_deleted_at is null;
 if not found then raise exception 'JOB_NOT_ASSIGNED_TO_ACTOR' using errcode='42501'; end if;
 select coalesce((select s.no_show_wait_minutes from app_private.marketplace_cancellation_settings s where s.project_id=j.project_id),5) into wait_minutes;
 select max(e.created_at) into arrived from public.job_events e where e.project_id=j.project_id and e.job_id=j.id and e.action='mark_pickup' and e.to_status='pickup';
 remaining:=case when arrived is null then null else greatest(0,ceil(extract(epoch from (arrived+make_interval(mins=>wait_minutes)-now())))::integer) end;
 return jsonb_build_object('can_report_no_show',j.status='pickup' and arrived is not null and remaining=0,
 'arrival_recorded',j.status='pickup' and arrived is not null,'wait_minutes',wait_minutes,'remaining_seconds',remaining);
end $;
revoke all on function public.get_my_marketplace_job_cancellation_options(uuid) from public,anon,authenticated;
grant execute on function public.get_my_marketplace_job_cancellation_options(uuid) to authenticated;

-- No previously cancelling driver may take a replacement in this chain.
create or replace function app_private.marketplace_replacement_driver_excluded(pid uuid,jid uuid,uid uuid)
returns boolean language sql stable security definer set search_path='' as $$
 with recursive chain as (
 select r.previous_job_id,r.cancelled_driver_user_id from app_private.marketplace_job_replacements r
 where r.project_id=pid and r.replacement_job_id=jid
 union all
 select r.previous_job_id,r.cancelled_driver_user_id from app_private.marketplace_job_replacements r
 join chain c on r.replacement_job_id=c.previous_job_id where r.project_id=pid
 ) select exists(select 1 from chain where cancelled_driver_user_id=uid)
$$;
revoke all on function app_private.marketplace_replacement_driver_excluded(uuid,uuid,uuid) from public,anon,authenticated;

-- Preserve the existing dispatch and Impulsa decision; add only the replacement exclusion.
do $patch$
declare definition text; anchor text:='CASE WHEN EXISTS ('; new_anchor text:='CASE WHEN app_private.marketplace_replacement_driver_excluded(target_project_id,target_job_id,target_driver_user_id) THEN false WHEN EXISTS (';
begin
 select pg_get_functiondef('app_private.marketplace_dispatch_candidate_state(uuid,uuid,text,uuid)'::regprocedure) into definition;
 if (length(definition)-length(replace(definition,anchor,'')))<>length(anchor) then raise exception 'REPLACEMENT_DISPATCH_CONTRACT_CHANGED'; end if;
 execute replace(definition,anchor,new_anchor);
end $patch$;

-- Shared internal implementation. Original request and assignment remain untouched.
create or replace function app_private.marketplace_replace_cancelled_job(pid uuid,previous_id uuid,cid uuid,actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare oldj public.jobs%rowtype; req public.service_requests%rowtype; newj public.jobs%rowtype;
 new_request_id uuid; prior_replacement uuid; rate numeric; ttl integer; care public.marketplace_admin_care_jobs%rowtype;
begin
 select * into oldj from public.jobs j where j.project_id=pid and j.id=previous_id for update;
 if not found or oldj.is_test or oldj.test_deleted_at is not null then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if;
 select * into req from public.service_requests r where r.project_id=pid and r.id=oldj.service_request_id;
 if not found or req.customer_id is distinct from cid then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 select r.replacement_job_id into prior_replacement from app_private.marketplace_job_replacements r where r.project_id=pid and r.previous_job_id=previous_id;
 if found then return jsonb_build_object('job_id',prior_replacement,'repeated',true); end if;
 if not coalesce((select s.replacement_enabled from app_private.marketplace_cancellation_settings s where s.project_id=pid),true) then raise exception 'REPLACEMENT_DISABLED' using errcode='22023'; end if;
 if oldj.status<>'cancelled_by_driver' or oldj.assigned_driver_user_id is null
   or not exists(select 1 from public.job_assignments a where a.project_id=pid and a.job_id=oldj.id and a.driver_user_id=oldj.assigned_driver_user_id and a.cancelled_at is not null)
   or exists(select 1 from public.commission_reservations r where r.project_id=pid and r.job_id=oldj.id and r.status in ('open','consumed'))
 then raise exception 'JOB_NOT_REPLACEABLE' using errcode='22023'; end if;
 -- A replacement is a continuation, not a new quote. Keep the agreed customer fare
 -- and all pricing inputs. Commission for the new attempt follows current policy.
 select f.commission_rate into rate from public.project_marketplace_financial_settings f where f.project_id=pid for share;
 if rate is null then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'; end if;
 ttl:=greatest(1,least(120,coalesce(ceil(extract(epoch from (oldj.expires_at-oldj.published_at))/60)::integer,10)));
 insert into public.service_requests(project_id,customer_id,service_code,origin_text,destination_text,scheduled_for,passenger_count,cargo_weight_kg,cargo_volume_m3,cargo_length_cm,cargo_width_cm,cargo_height_cm,required_body_type,notes,details,vehicle_category_code)
 values(pid,cid,req.service_code,req.origin_text,req.destination_text,req.scheduled_for,req.passenger_count,req.cargo_weight_kg,req.cargo_volume_m3,req.cargo_length_cm,req.cargo_width_cm,req.cargo_height_cm,req.required_body_type,req.notes,req.details,req.vehicle_category_code)
 returning id into new_request_id;
 insert into public.jobs(project_id,service_request_id,service_code,status,recommended_price,final_price,currency,price_warning_acknowledged,pricing_version,pricing_breakdown,commission_rate_snapshot,pricing_engine_version,pricing_tariff_id,pricing_vehicle_category_code,pricing_total_usd,exchange_rate_snapshot,exchange_rate_source_snapshot,exchange_rate_updated_at_snapshot,exchange_rate_fallback_used,cup_before_rounding,rounding_mode_snapshot,rounding_increment_snapshot)
 values(pid,new_request_id,oldj.service_code,'requested',oldj.recommended_price,oldj.final_price,oldj.currency,oldj.price_warning_acknowledged,oldj.pricing_version,oldj.pricing_breakdown,rate,oldj.pricing_engine_version,oldj.pricing_tariff_id,oldj.pricing_vehicle_category_code,oldj.pricing_total_usd,oldj.exchange_rate_snapshot,oldj.exchange_rate_source_snapshot,oldj.exchange_rate_updated_at_snapshot,oldj.exchange_rate_fallback_used,oldj.cup_before_rounding,oldj.rounding_mode_snapshot,oldj.rounding_increment_snapshot)
 returning * into newj;
 insert into app_private.marketplace_job_replacements(project_id,previous_job_id,replacement_job_id,cancelled_driver_user_id) values(pid,oldj.id,newj.id,oldj.assigned_driver_user_id);
 -- Keep referral origin but do not restart exclusive priority.
 insert into app_private.marketplace_driver_promo_attribution(project_id,job_id,service_request_id,driver_user_id,source_code,phase,released_at,release_reason)
 select pid,newj.id,new_request_id,a.driver_user_id,a.source_code,'fleet',now(),'driver_cancelled_replacement'
 from app_private.marketplace_driver_promo_attribution a where a.project_id=pid and a.job_id=oldj.id;
 select * into care from public.marketplace_admin_care_jobs c where c.project_id=pid and c.job_id=oldj.id;
 if found then
   insert into public.marketplace_admin_care_jobs(project_id,customer_id,job_id,actor_user_id,idempotency_key,payload_hash)
   values(pid,cid,newj.id,coalesce(actor,care.actor_user_id),gen_random_uuid(),care.payload_hash);
 end if;
 update public.jobs set status='published',published_at=now(),expires_at=now()+make_interval(mins=>ttl),state_version=state_version+1
 where project_id=pid and id=newj.id returning * into newj;
 if newj.is_test then raise exception 'REPLACEMENT_UNEXPECTED_TEST_JOB'; end if;
 insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,customer_id,operation_idempotency_key,metadata)
 values(pid,newj.id,'requested','published','publish',case when actor is null then 'customer' else 'admin' end,actor,cid,gen_random_uuid(),jsonb_build_object('replacement_of',oldj.id,'preserved_fare',true));
 return jsonb_build_object('job_id',newj.id,'repeated',false);
end $$;
revoke all on function app_private.marketplace_replace_cancelled_job(uuid,uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.replace_marketplace_customer_job(target_session_id uuid,target_session_token text,target_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid; pid uuid;
begin
 cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token);
 select id into pid from public.projects where slug='tuktuk-control';
 return app_private.marketplace_replace_cancelled_job(pid,target_job_id,cid,null);
end $$;
revoke all on function public.replace_marketplace_customer_job(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.replace_marketplace_customer_job(uuid,text,uuid) to service_role;

create or replace function public.admin_replace_marketplace_cancelled_job(target_project_id uuid,target_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; cid uuid;
begin
 actor:=app_private.require_project_permission(target_project_id,'marketplace.manage');
 perform app_private.require_project_permission(target_project_id,'customers.view');
 select c.customer_id into cid from public.marketplace_admin_care_jobs c where c.project_id=target_project_id and c.job_id=target_job_id;
 if not found then raise exception 'CARE_ONLY_ASSISTED_JOBS' using errcode='42501'; end if;
 return app_private.marketplace_replace_cancelled_job(target_project_id,target_job_id,cid,actor);
end $$;
revoke all on function public.admin_replace_marketplace_cancelled_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_replace_marketplace_cancelled_job(uuid,uuid) to authenticated;

-- Operational cancellation alert for the assigned driver. Do not use the
-- new-offer sound or the separate Cliente exchange-rate subscriber audience.
create or replace function app_private.marketplace_queue_cancellation_notice()
returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;
begin
 if new.action<>'cancel_by_customer' or new.to_status<>'cancelled_by_customer' then return new; end if;
 select * into j from public.jobs where project_id=new.project_id and id=new.job_id;
 if not found or j.is_test or j.test_deleted_at is not null or j.assigned_driver_user_id is null then return new; end if;
 insert into public.notification_outbox(project_id,user_id,kind,notification_date,dedupe_key,title,body,data)
 values(j.project_id,j.assigned_driver_user_id,'marketplace_job_cancelled',current_date,
 'marketplace-cancelled:'||j.id::text,'Servicio cancelado','El cliente canceló tu servicio. Consulta Trabajos para ver el estado actualizado.',
 jsonb_build_object('kind','marketplace_job_cancelled','job_id',j.id::text,'target_audience','client'))
 on conflict(project_id,user_id,kind,dedupe_key) do nothing;
 perform app_private.kick_admin_operational_push();
 return new;
end $$;
revoke all on function app_private.marketplace_queue_cancellation_notice() from public,anon,authenticated;
create trigger marketplace_queue_cancellation_notice after insert on public.job_events
for each row execute function app_private.marketplace_queue_cancellation_notice();
