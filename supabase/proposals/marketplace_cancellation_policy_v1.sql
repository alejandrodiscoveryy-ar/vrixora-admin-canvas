-- Cancellation policy v1. No monetary penalties or changes to settlement.
create table if not exists app_private.marketplace_cancellation_settings(
 project_id uuid primary key references public.projects(id),
 no_show_wait_minutes integer not null default 5 check(no_show_wait_minutes between 1 and 30),
 recovery_enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table app_private.marketplace_cancellation_settings enable row level security;
revoke all on app_private.marketplace_cancellation_settings from public,anon,authenticated;
create table if not exists app_private.marketplace_cancellation_retries(
 project_id uuid not null,
 previous_job_id uuid not null,
 replacement_job_id uuid not null,
 excluded_driver_user_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(project_id,previous_job_id),
 unique(project_id,replacement_job_id),
 foreign key(project_id,previous_job_id) references public.jobs(project_id,id),
 foreign key(project_id,replacement_job_id) references public.jobs(project_id,id)
);
alter table app_private.marketplace_cancellation_retries enable row level security;
revoke all on app_private.marketplace_cancellation_retries from public,anon,authenticated;

create or replace function app_private.marketplace_no_show_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare minutes integer; arrived timestamptz;
begin
 if new.action<>'cancel_by_driver' or new.actor_kind<>'driver'
    or lower(btrim(coalesce(new.reason,''))) not in ('cliente no se presentó','cliente no se presento') then return new; end if;
 select coalesce((select s.no_show_wait_minutes from app_private.marketplace_cancellation_settings s where s.project_id=new.project_id),5) into minutes;
 select max(e.created_at) into arrived from public.job_events e where e.project_id=new.project_id
 and e.job_id=new.job_id and e.action='mark_pickup' and e.to_status='pickup'
 and e.actor_user_id=new.actor_user_id;
 if new.from_status<>'pickup' or arrived is null or now()<arrived+make_interval(mins=>minutes) then
   raise exception 'MARKETPLACE_NO_SHOW_WAIT_REQUIRED' using errcode='22023';
 end if;
 new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('no_show_wait_verified',true,'wait_minutes',minutes,'arrival_at',arrived);
 return new;
end $;
revoke all on function app_private.marketplace_no_show_guard() from public,anon,authenticated;
drop trigger if exists marketplace_no_show_guard on public.job_events;
create trigger marketplace_no_show_guard before insert on public.job_events for each row execute function app_private.marketplace_no_show_guard();

create or replace function public.get_my_marketplace_cancellation_policy(target_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j public.jobs%rowtype; arrived timestamptz; minutes integer;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select * into j from public.jobs where id=target_job_id and assigned_driver_user_id=auth.uid();
 if not found then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 select coalesce((select s.no_show_wait_minutes from app_private.marketplace_cancellation_settings s where s.project_id=j.project_id),5) into minutes;
 select max(e.created_at) into arrived from public.job_events e where e.project_id=j.project_id and e.job_id=j.id
 and e.action='mark_pickup' and e.to_status='pickup' and e.actor_user_id=auth.uid();
 return jsonb_build_object('no_show_wait_minutes',minutes,'no_show_allowed',j.status='pickup' and arrived is not null and now()>=arrived+make_interval(mins=>minutes),
 'no_show_available_at',case when arrived is not null then arrived+make_interval(mins=>minutes) end,'server_time',now());
end $$;
revoke all on function public.get_my_marketplace_cancellation_policy(uuid) from public,anon,authenticated;
grant execute on function public.get_my_marketplace_cancellation_policy(uuid) to authenticated;

create or replace function public.admin_get_marketplace_cancellation_settings(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_project_permission(target_project_id,'marketplace.manage');
 return jsonb_build_object('no_show_wait_minutes',coalesce((select no_show_wait_minutes from app_private.marketplace_cancellation_settings where project_id=target_project_id),5),
 'recovery_enabled',coalesce((select recovery_enabled from app_private.marketplace_cancellation_settings where project_id=target_project_id),true),
 'automatic_penalties_enabled',false);
end $$;
create or replace function public.admin_set_marketplace_cancellation_settings(target_project_id uuid,target_no_show_wait_minutes integer,target_recovery_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform app_private.require_project_permission(target_project_id,'marketplace.manage');
 if target_no_show_wait_minutes is null or target_no_show_wait_minutes not between 1 and 30 or target_recovery_enabled is null then raise exception 'INVALID_CANCELLATION_SETTINGS' using errcode='22023'; end if;
 insert into app_private.marketplace_cancellation_settings(project_id,no_show_wait_minutes,recovery_enabled)
 values(target_project_id,target_no_show_wait_minutes,target_recovery_enabled)
 on conflict(project_id) do update set no_show_wait_minutes=excluded.no_show_wait_minutes,recovery_enabled=excluded.recovery_enabled,updated_at=now();
 return public.admin_get_marketplace_cancellation_settings(target_project_id);
end $$;
revoke all on function public.admin_get_marketplace_cancellation_settings(uuid),public.admin_set_marketplace_cancellation_settings(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.admin_get_marketplace_cancellation_settings(uuid),public.admin_set_marketplace_cancellation_settings(uuid,integer,boolean) to authenticated;

-- A replacement is a new request/job, never a reset of an accepted job.
create or replace function app_private.marketplace_recover_cancelled_job(target_project_id uuid,target_customer_id uuid,target_job_id uuid,target_actor_kind text,target_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; r public.service_requests%rowtype; c public.marketplace_admin_care_jobs%rowtype;
 rid uuid; jid uuid; ttl integer; rate numeric; existing uuid; v_now timestamptz:=now();
begin
 select * into j from public.jobs where project_id=target_project_id and id=target_job_id for update;
 if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if;
 select * into r from public.service_requests where project_id=j.project_id and id=j.service_request_id and customer_id=target_customer_id;
 if not found then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 select replacement_job_id into existing from app_private.marketplace_cancellation_retries where project_id=j.project_id and previous_job_id=j.id;
 if found then return jsonb_build_object('job_id',existing,'repeated',true); end if;
 if not coalesce((select recovery_enabled from app_private.marketplace_cancellation_settings where project_id=j.project_id),true)
 or j.status<>'cancelled_by_driver' or j.is_test or j.test_deleted_at is not null or j.assigned_driver_user_id is null
 or not exists(select 1 from public.job_assignments a where a.project_id=j.project_id and a.job_id=j.id and a.cancelled_at is not null and a.completed_at is null)
 or exists(select 1 from public.commission_reservations x where x.project_id=j.project_id and x.job_id=j.id and x.status<>'released')
 or (r.scheduled_for is not null and r.scheduled_for<now()-interval '5 minutes')
 or not exists(select 1 from public.job_events e where e.project_id=j.project_id and e.job_id=j.id and e.action='cancel_by_driver' and e.created_at>=now()-interval '30 minutes')
 then raise exception 'MARKETPLACE_RECOVERY_NOT_AVAILABLE' using errcode='22023'; end if;
 -- Do not retry a no-show without a new explicit booking, or a mutual cancellation.
 if exists(select 1 from public.job_events e where e.project_id=j.project_id and e.job_id=j.id and e.action='cancel_by_driver'
 and lower(btrim(coalesce(e.reason,''))) in ('cliente no se presentó','cliente no se presento','acuerdo con el cliente')) then
 raise exception 'MARKETPLACE_RECOVERY_NOT_AVAILABLE' using errcode='22023'; end if;
 select commission_rate into rate from public.project_marketplace_financial_settings where project_id=j.project_id for share;
 if rate is null then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'; end if;
 ttl:=least(60,greatest(5,coalesce(ceil(extract(epoch from (j.expires_at-j.published_at))/60)::integer,15)));
 insert into public.service_requests(project_id,customer_id,service_code,origin_text,destination_text,scheduled_for,passenger_count,cargo_weight_kg,cargo_volume_m3,cargo_length_cm,cargo_width_cm,cargo_height_cm,required_body_type,notes,details,vehicle_category_code)
 values(j.project_id,r.customer_id,r.service_code,r.origin_text,r.destination_text,r.scheduled_for,r.passenger_count,r.cargo_weight_kg,r.cargo_volume_m3,r.cargo_length_cm,r.cargo_width_cm,r.cargo_height_cm,r.required_body_type,r.notes,r.details,r.vehicle_category_code) returning id into rid;
 insert into public.jobs(project_id,service_request_id,service_code,status,recommended_price,final_price,currency,price_warning_acknowledged,pricing_version,pricing_breakdown,commission_rate_snapshot,pricing_engine_version,pricing_tariff_id,pricing_vehicle_category_code,pricing_total_usd,exchange_rate_snapshot,exchange_rate_source_snapshot,exchange_rate_updated_at_snapshot,exchange_rate_fallback_used,cup_before_rounding,rounding_mode_snapshot,rounding_increment_snapshot)
 values(j.project_id,rid,j.service_code,'requested',j.recommended_price,j.final_price,j.currency,j.price_warning_acknowledged,j.pricing_version,j.pricing_breakdown,rate,j.pricing_engine_version,j.pricing_tariff_id,j.pricing_vehicle_category_code,j.pricing_total_usd,j.exchange_rate_snapshot,j.exchange_rate_source_snapshot,j.exchange_rate_updated_at_snapshot,j.exchange_rate_fallback_used,j.cup_before_rounding,j.rounding_mode_snapshot,j.rounding_increment_snapshot) returning id into jid;
 insert into app_private.marketplace_cancellation_retries(project_id,previous_job_id,replacement_job_id,excluded_driver_user_id) values(j.project_id,j.id,jid,j.assigned_driver_user_id);
 -- Preserve legitimate Impulsa attribution, but do not re-prioritize the cancelled driver.
 insert into app_private.marketplace_driver_promo_attribution(project_id,job_id,service_request_id,driver_user_id,source_code,phase,released_at,release_reason)
 select project_id,jid,rid,driver_user_id,source_code,'fleet',v_now,'driver_cancelled_recovery'
 from app_private.marketplace_driver_promo_attribution where project_id=j.project_id and job_id=j.id;
 select * into c from public.marketplace_admin_care_jobs where project_id=j.project_id and job_id=j.id;
 if found then
 insert into public.marketplace_admin_care_jobs(project_id,customer_id,job_id,actor_user_id,idempotency_key,payload_hash)
 values(j.project_id,r.customer_id,jid,coalesce(target_actor_id,c.actor_user_id),gen_random_uuid(),c.payload_hash);
 end if;
 update public.jobs set status='published',published_at=v_now,expires_at=v_now+make_interval(mins=>ttl),state_version=state_version+1 where id=jid and project_id=j.project_id;
 insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,customer_id,operation_idempotency_key,metadata)
 values(j.project_id,jid,'requested','published','publish_replacement',target_actor_kind,target_actor_id,r.customer_id,gen_random_uuid(),jsonb_build_object('previous_job_id',j.id,'same_customer_price',true));
 return jsonb_build_object('job_id',jid,'repeated',false);
end $$;
revoke all on function app_private.marketplace_recover_cancelled_job(uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.recover_marketplace_customer_job(target_session_id uuid,target_session_token text,target_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid; pid uuid;
begin
 cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token);
 select id into pid from public.projects where slug='tuktuk-control';
 return app_private.marketplace_recover_cancelled_job(pid,cid,target_job_id,'customer',null);
end $$;
revoke all on function public.recover_marketplace_customer_job(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.recover_marketplace_customer_job(uuid,text,uuid) to service_role;

create or replace function public.admin_recover_marketplace_customer_job(target_project_id uuid,target_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; cid uuid;
begin
 actor:=app_private.require_project_permission(target_project_id,'marketplace.manage');
 perform app_private.require_project_permission(target_project_id,'customers.view');
 select r.customer_id into cid from public.jobs j join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id where j.project_id=target_project_id and j.id=target_job_id;
 if cid is null then raise exception 'JOB_NOT_FOUND'; end if;
 return app_private.marketplace_recover_cancelled_job(target_project_id,cid,target_job_id,'admin',actor);
end $$;
revoke all on function public.admin_recover_marketplace_customer_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_recover_marketplace_customer_job(uuid,uuid) to authenticated;

-- Deny the cancelling driver for every replacement in the chain, both in radar and acceptance.
create or replace function app_private.marketplace_retry_excludes_driver(pid uuid,jid uuid,uid uuid)
returns boolean language sql stable security definer set search_path='' as $$
 with recursive chain as (
 select r.previous_job_id,r.excluded_driver_user_id from app_private.marketplace_cancellation_retries r where r.project_id=pid and r.replacement_job_id=jid
 union all
 select r.previous_job_id,r.excluded_driver_user_id from app_private.marketplace_cancellation_retries r join chain c on r.replacement_job_id=c.previous_job_id where r.project_id=pid
 ) select exists(select 1 from chain where excluded_driver_user_id=uid);
$$;
revoke all on function app_private.marketplace_retry_excludes_driver(uuid,uuid,uuid) from public,anon,authenticated;
do $patch$
declare d text; old text:='CASE WHEN EXISTS ('; newtext text:='CASE WHEN app_private.marketplace_retry_excludes_driver(target_project_id,target_job_id,target_driver_user_id) THEN false WHEN EXISTS (';
begin
 select pg_get_functiondef('app_private.marketplace_dispatch_candidate_state(uuid,uuid,text,uuid)'::regprocedure) into d;
 if position(newtext in d)>0 then return; end if;
 if length(d)-length(replace(d,old,''))<>length(old) then raise exception 'CANCELLATION_DISPATCH_CONTRACT_CHANGED'; end if;
 execute replace(d,old,newtext);
end $patch$;

-- Operational audit and in-app driver notification; existing queue handles transport.
create or replace function app_private.marketplace_cancellation_notice()
returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;
begin
 if new.action not in ('cancel_by_customer','cancel_by_driver') then return new; end if;
 select * into j from public.jobs where project_id=new.project_id and id=new.job_id;
 if not found or j.is_test or j.test_deleted_at is not null then return new; end if;
 if new.action='cancel_by_customer' and j.assigned_driver_user_id is not null then
 insert into public.notification_outbox(project_id,user_id,kind,notification_date,dedupe_key,title,body,data)
 values(j.project_id,j.assigned_driver_user_id,'marketplace_job_cancelled',current_date,'cancel:'||j.id::text,'Servicio cancelado','El cliente canceló el servicio. Consulta Trabajos.',jsonb_build_object('event_type','marketplace_job_cancelled','job_id',j.id))
 on conflict(project_id,user_id,kind,dedupe_key) do nothing;
 end if;
 insert into public.notification_outbox(project_id,user_id,kind,notification_date,dedupe_key,title,body,data)
 select j.project_id,recipient.user_id,'admin_marketplace_cancellation',current_date,'admin-op:cancel:'||j.id::text,
 'Servicio cancelado','Consulta el motivo en la ficha de la carrera.',
 jsonb_build_object('kind','admin_marketplace_cancellation','event_type','admin_marketplace_cancellation','target_audience','admin','project_id',j.project_id,'job_id',j.id,'url','/admin/proyectos/'||j.project_id::text||'/trabajos')
 from (select p.owner_id as user_id from public.projects p where p.id=j.project_id
 union select m.user_id from public.project_members m join public.project_role_permissions rp on rp.role_code=m.role
 where m.project_id=j.project_id and rp.permission_code='marketplace.view') recipient
 where exists(select 1 from public.push_device_tokens t where t.project_id=j.project_id and t.user_id=recipient.user_id and t.app_scope='admin' and t.platform='web' and t.enabled)
 on conflict(project_id,user_id,kind,dedupe_key) do nothing;
 -- A cancellation must not fail because the push dispatcher is unavailable.
 begin perform app_private.kick_admin_operational_push(); exception when others then null; end;
 return new;
end $$;
revoke all on function app_private.marketplace_cancellation_notice() from public,anon,authenticated;
drop trigger if exists marketplace_cancellation_notice on public.job_events;
create trigger marketplace_cancellation_notice after insert on public.job_events for each row execute function app_private.marketplace_cancellation_notice();

-- Indicators are descriptive, never an automatic financial penalty or an adjudication.
create or replace function public.admin_get_marketplace_driver_cancellation_summary(target_project_id uuid,target_driver_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform app_private.require_project_permission(target_project_id,'marketplace.view');
 return (select jsonb_build_object(
  'driver_cancelled',count(*) filter(where e.action='cancel_by_driver'),
  'customer_cancelled',count(*) filter(where e.action='cancel_by_customer'),
  'verified_wait',count(*) filter(where e.action='cancel_by_driver' and lower(btrim(e.reason)) in ('cliente no se presentó','cliente no se presento') and e.metadata->>'no_show_wait_verified'='true'),
  'reported_justified',count(*) filter(where e.action='cancel_by_driver' and lower(btrim(e.reason)) in ('problema con el vehículo','emergencia','acuerdo con el cliente')),
  'review_required',count(*) filter(where e.action='cancel_by_driver' and not (lower(btrim(coalesce(e.reason,''))) in ('problema con el vehículo','emergencia','acuerdo con el cliente') or (lower(btrim(coalesce(e.reason,''))) in ('cliente no se presentó','cliente no se presento') and coalesce(e.metadata->>'no_show_wait_verified','false')='true'))),
  'customer_reported_driver_request',count(*) filter(where e.action='cancel_by_customer' and lower(btrim(e.reason))='el conductor me pidió cancelar')
 )
 from public.job_events e join public.jobs j on j.project_id=e.project_id and j.id=e.job_id
 where e.project_id=target_project_id and j.assigned_driver_user_id=target_driver_user_id and not j.is_test and j.test_deleted_at is null
 and e.action in ('cancel_by_driver','cancel_by_customer'));
end $$;
revoke all on function public.admin_get_marketplace_driver_cancellation_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_get_marketplace_driver_cancellation_summary(uuid,uuid) to authenticated;
