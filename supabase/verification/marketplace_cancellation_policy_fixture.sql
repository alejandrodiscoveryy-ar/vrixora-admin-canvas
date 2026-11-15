-- Isolated PostgreSQL contract fixture; no production data.
create schema app_private; create schema auth;
create role anon; create role authenticated; create role service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_actor',true),'')::uuid $$;
create table public.projects(id uuid primary key,slug text,owner_id uuid);
create table public.service_requests(id uuid primary key default gen_random_uuid(),project_id uuid,customer_id uuid,service_code text,origin_text text,destination_text text,scheduled_for timestamptz,passenger_count integer,cargo_weight_kg numeric,cargo_volume_m3 numeric,cargo_length_cm numeric,cargo_width_cm numeric,cargo_height_cm numeric,required_body_type text,notes text,details jsonb,vehicle_category_code text);
create table public.jobs(id uuid primary key default gen_random_uuid(),project_id uuid,service_request_id uuid,service_code text,status text,recommended_price numeric,final_price numeric,currency text,price_warning_acknowledged boolean,pricing_version text,pricing_breakdown jsonb,commission_rate_snapshot numeric,pricing_engine_version text,pricing_tariff_id uuid,pricing_vehicle_category_code text,pricing_total_usd numeric,exchange_rate_snapshot numeric,exchange_rate_source_snapshot text,exchange_rate_updated_at_snapshot timestamptz,exchange_rate_fallback_used boolean,cup_before_rounding numeric,rounding_mode_snapshot text,rounding_increment_snapshot numeric,published_at timestamptz,expires_at timestamptz,assigned_driver_user_id uuid,assigned_vehicle_id text,is_test boolean default false,test_deleted_at timestamptz,state_version bigint default 0,unique(project_id,id),unique(project_id,service_request_id));
create table public.job_assignments(project_id uuid,job_id uuid,driver_user_id uuid,cancelled_at timestamptz,completed_at timestamptz,unique(project_id,job_id));
create table public.commission_reservations(project_id uuid,job_id uuid,status text);
create table public.job_events(project_id uuid,job_id uuid,from_status text,to_status text,action text,actor_kind text,actor_user_id uuid,customer_id uuid,operation_idempotency_key uuid,reason text,metadata jsonb default '{}',created_at timestamptz default now());
create table public.marketplace_admin_care_jobs(project_id uuid,customer_id uuid,job_id uuid,actor_user_id uuid,idempotency_key uuid,payload_hash text);
create table public.project_marketplace_financial_settings(project_id uuid,commission_rate numeric);
create table app_private.marketplace_driver_promo_attribution(project_id uuid,job_id uuid,service_request_id uuid,driver_user_id uuid,source_code text,phase text,released_at timestamptz,release_reason text);
create table public.notification_outbox(project_id uuid,user_id uuid,kind text,notification_date date,dedupe_key text,title text,body text,data jsonb,unique(project_id,user_id,kind,dedupe_key));
create table public.project_members(project_id uuid,user_id uuid,role text);
create table public.project_role_permissions(role_code text,permission_code text);
create table public.push_device_tokens(project_id uuid,user_id uuid,app_scope text,platform text,enabled boolean);
create function app_private.kick_admin_operational_push() returns void language plpgsql as $$ begin return; end $$;
create function app_private.require_project_permission(uuid,text) returns uuid language plpgsql as $$ begin if auth.uid() is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if; return auth.uid(); end $$;
create function app_private.resolve_marketplace_customer_session(uuid,text) returns uuid language plpgsql as $$ begin if $2<>'secret' then raise exception 'ACCESS_DENIED' using errcode='42501'; end if; return $1; end $$;
create function app_private.marketplace_dispatch_candidate_state(target_project_id uuid,target_driver_user_id uuid,target_vehicle_id text,target_job_id uuid) returns table(allowed boolean) language sql stable as $$ select CASE WHEN EXISTS (select 1 where false) THEN false ELSE true END $$;
\ir ../proposals/marketplace_cancellation_policy_v1.sql

create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
insert into public.projects values('00000000-0000-0000-0000-000000000001','tuktuk-control','00000000-0000-0000-0000-000000000008');
insert into public.project_marketplace_financial_settings values('00000000-0000-0000-0000-000000000001',.15);
insert into public.service_requests(id,project_id,customer_id,service_code,origin_text,destination_text,cargo_weight_kg,notes,details,vehicle_category_code)
values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','cargo','A','B',150,'Muebles delicados','{"ride_payment_method":"transfer","load_help":true}','truck');
insert into public.jobs(id,project_id,service_request_id,service_code,status,recommended_price,final_price,currency,commission_rate_snapshot,published_at,expires_at,assigned_driver_user_id,assigned_vehicle_id)
values('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','cargo','cancelled_by_driver',5000,5000,'CUP',.15,now()-interval '5 min',now()+interval '10 min','00000000-0000-0000-0000-000000000005','truck1');
insert into public.job_assignments values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005',now(),null);
insert into public.commission_reservations values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','released');
insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,reason)
values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','en_route','cancelled_by_driver','cancel_by_driver','driver','00000000-0000-0000-0000-000000000005','Problema con el vehículo');
do $$ declare a jsonb; b jsonb; replacement uuid; begin
 a:=public.recover_marketplace_customer_job('00000000-0000-0000-0000-000000000003','secret','00000000-0000-0000-0000-000000000004');
 b:=public.recover_marketplace_customer_job('00000000-0000-0000-0000-000000000003','secret','00000000-0000-0000-0000-000000000004');
 replacement:=(a->>'job_id')::uuid;
 perform pg_temp.assert_true(a->>'job_id'=b->>'job_id' and b->>'repeated'='true','idempotent recovery');
 perform pg_temp.assert_true((select j.status='published' and j.final_price=5000 and j.assigned_driver_user_id is null and r.notes='Muebles delicados' and r.details->>'ride_payment_method'='transfer' and r.cargo_weight_kg=150 from public.jobs j join public.service_requests r on r.id=j.service_request_id where j.id=replacement),'preserve price, payment, notes and no assignment');
 perform pg_temp.assert_true((select status='cancelled_by_driver' from public.jobs where id='00000000-0000-0000-0000-000000000004'),'old ride remains cancelled');
 perform pg_temp.assert_true(not (select allowed from app_private.marketplace_dispatch_candidate_state('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','truck1',replacement)),'exclude cancelling driver');
 perform pg_temp.assert_true((select allowed from app_private.marketplace_dispatch_candidate_state('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','truck2',replacement)),'other driver still eligible');
 perform pg_temp.assert_true((select count(*) from public.commission_reservations)=1,'no new commission reservation');
end $$;
do $$ begin
 perform public.recover_marketplace_customer_job('00000000-0000-0000-0000-000000000006','secret','00000000-0000-0000-0000-000000000004');
 raise exception 'UNEXPECTED_ACCESS';
exception when insufficient_privilege then raise notice 'PASS: rejects different customer'; end $$;
do $$ begin
 insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,reason)
 values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','en_route','cancelled_by_driver','cancel_by_driver','driver','00000000-0000-0000-0000-000000000005','Cliente no se presentó');
 raise exception 'UNEXPECTED_NO_SHOW';
exception when invalid_parameter_value then if sqlerrm<>'MARKETPLACE_NO_SHOW_WAIT_REQUIRED' then raise; end if; raise notice 'PASS: no-show before arrival blocked'; end $$;
insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,created_at)
values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','en_route','pickup','mark_pickup','driver','00000000-0000-0000-0000-000000000005',now()-interval '6 minutes');
insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,reason)
values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','pickup','cancelled_by_driver','cancel_by_driver','driver','00000000-0000-0000-0000-000000000005','Cliente no se presentó');
select pg_temp.assert_true(exists(select 1 from public.job_events where reason='Cliente no se presentó' and metadata->>'no_show_wait_verified'='true'),'record verified wait');
select pg_temp.assert_true(not has_function_privilege('anon','public.recover_marketplace_customer_job(uuid,text,uuid)','execute'),'recovery only via gateway');
select set_config('app.test_actor','00000000-0000-0000-0000-000000000008',false);
select pg_temp.assert_true(public.admin_set_marketplace_cancellation_settings('00000000-0000-0000-0000-000000000001',7,false)->>'no_show_wait_minutes'='7','admin configurable wait');
select pg_temp.assert_true(public.admin_get_marketplace_driver_cancellation_summary('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005')->>'verified_wait'='1','driver cancellation classification');
