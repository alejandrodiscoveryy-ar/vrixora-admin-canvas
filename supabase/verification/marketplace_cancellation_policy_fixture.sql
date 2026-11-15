-- Isolated, synthetic fixture only. Never run against a production database.
create schema app_private;
create schema auth;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.fixture_actor',true),'')::uuid $$;
create table public.projects(id uuid primary key,slug text);
create function app_private.require_project_permission(pid uuid,permission text) returns uuid language plpgsql as $$
begin if auth.uid() is distinct from '00000000-0000-0000-0000-000000000010'::uuid or pid is distinct from '00000000-0000-0000-0000-000000000001'::uuid then raise exception 'ACCESS_DENIED' using errcode='42501'; end if; return auth.uid(); end $$;
create function app_private.resolve_marketplace_customer_session(sid uuid,token text) returns uuid language plpgsql as $$ begin if token<>'fixture-token' then raise exception 'ACCESS_DENIED' using errcode='42501'; end if; return sid; end $$;
create table public.service_requests(
 id uuid primary key default gen_random_uuid(),project_id uuid,customer_id uuid,service_code text,origin_text text,destination_text text,
 scheduled_for timestamptz,passenger_count integer,cargo_weight_kg numeric,cargo_volume_m3 numeric,cargo_length_cm numeric,cargo_width_cm numeric,cargo_height_cm numeric,required_body_type text,notes text,details jsonb,vehicle_category_code text
);
create table public.jobs(
 id uuid primary key default gen_random_uuid(),project_id uuid,service_request_id uuid,service_code text,status text,
 recommended_price numeric,final_price numeric,currency text,price_warning_acknowledged boolean,pricing_version text,pricing_breakdown jsonb,commission_rate_snapshot numeric,
 pricing_engine_version text,pricing_tariff_id uuid,pricing_vehicle_category_code text,pricing_total_usd numeric,exchange_rate_snapshot numeric,exchange_rate_source_snapshot text,exchange_rate_updated_at_snapshot timestamptz,exchange_rate_fallback_used boolean,cup_before_rounding numeric,rounding_mode_snapshot text,rounding_increment_snapshot numeric,
 published_at timestamptz,expires_at timestamptz,state_version bigint not null default 0,is_test boolean default false,test_deleted_at timestamptz,
 assigned_driver_user_id uuid,assigned_vehicle_id text,unique(project_id,id),unique(project_id,service_request_id)
);
create table public.job_assignments(project_id uuid,job_id uuid,driver_user_id uuid,cancelled_at timestamptz);
create table public.commission_reservations(project_id uuid,job_id uuid,status text);
create table public.project_marketplace_financial_settings(project_id uuid,commission_rate numeric);
create table public.marketplace_admin_care_jobs(project_id uuid,customer_id uuid,job_id uuid,actor_user_id uuid,idempotency_key uuid,payload_hash text,unique(project_id,job_id));
create table public.job_events(
 project_id uuid,job_id uuid,from_status text,to_status text,action text,actor_kind text,actor_user_id uuid,
 customer_id uuid,operation_idempotency_key uuid,reason text,metadata jsonb default '{}'::jsonb,created_at timestamptz default now()
);
create table public.notification_outbox(project_id uuid,user_id uuid,kind text,notification_date date,dedupe_key text,title text,body text,data jsonb,unique(project_id,user_id,kind,dedupe_key));
create function app_private.kick_admin_operational_push() returns void language plpgsql as $$ begin return; end $$;
create table app_private.marketplace_driver_promo_attribution(project_id uuid,job_id uuid primary key,service_request_id uuid unique,driver_user_id uuid,source_code text,phase text,released_at timestamptz,release_reason text);
create function app_private.marketplace_dispatch_candidate_state(target_project_id uuid,target_driver_user_id uuid,target_vehicle_id text,target_job_id uuid)
returns table(allowed boolean) language sql stable as $$
 select CASE WHEN EXISTS (select 1 where false) THEN false ELSE true END
$$;

\ir ../proposals/marketplace_cancellation_policy.sql

create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
insert into public.projects values('00000000-0000-0000-0000-000000000001','tuktuk-control');
insert into public.project_marketplace_financial_settings values('00000000-0000-0000-0000-000000000001',.15);
insert into public.service_requests values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','cargo','Vedado','Playa',null,null,150,1.5,120,80,90,'closed','Muebles delicados','{"ride_payment_method":"transfer","load_help":true}','tricycle');
insert into public.jobs(id,project_id,service_request_id,service_code,status,recommended_price,final_price,currency,price_warning_acknowledged,pricing_version,pricing_breakdown,commission_rate_snapshot,published_at,expires_at,assigned_driver_user_id,assigned_vehicle_id)
values('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','cargo','en_route',5000,5000,'CUP',false,'fixture','{}',.10,now()-interval '2 minutes',now()+interval '8 minutes','00000000-0000-0000-0000-000000000005','v1');
insert into public.job_assignments values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005',null);
-- Direct legacy cancellation is rolled back when arrival is absent.
do $$ begin
 update public.jobs set status='cancelled_by_driver' where id='00000000-0000-0000-0000-000000000004';
 insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,reason) values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','en_route','cancelled_by_driver','cancel_by_driver','driver','00000000-0000-0000-0000-000000000005','Cliente no se presentó');
 raise exception 'unexpected success';
exception when sqlstate '22023' then if sqlerrm<>'NO_SHOW_REQUIRES_ARRIVAL' then raise; end if; raise notice 'PASS: no show requires arrival'; end $$;
select pg_temp.assert_true((select status from public.jobs where id='00000000-0000-0000-0000-000000000004')='en_route','rejected cancellation rolls back job status');
update public.jobs set status='pickup' where id='00000000-0000-0000-0000-000000000004';
insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,created_at)
values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','en_route','pickup','mark_pickup','driver',now()-interval '2 minutes');
select set_config('app.fixture_actor','00000000-0000-0000-0000-000000000005',false);
select pg_temp.assert_true(public.get_my_marketplace_job_cancellation_options('00000000-0000-0000-0000-000000000004')->>'can_report_no_show'='false','wait still required');
do $$ begin
 insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,reason) values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','pickup','cancelled_by_driver','cancel_by_driver','driver','Cliente no se presentó');
 raise exception 'unexpected success';
exception when sqlstate '22023' then if sqlerrm<>'NO_SHOW_WAIT_REQUIRED' then raise; end if; raise notice 'PASS: no show requires waiting'; end $$;
update public.job_events set created_at=now()-interval '6 minutes' where action='mark_pickup';
select pg_temp.assert_true(public.get_my_marketplace_job_cancellation_options('00000000-0000-0000-0000-000000000004')->>'can_report_no_show'='true','eligible after five minutes');
update public.jobs set status='cancelled_by_driver' where id='00000000-0000-0000-0000-000000000004';
update public.job_assignments set cancelled_at=now();
insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,reason)
values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','pickup','cancelled_by_driver','cancel_by_driver','driver','00000000-0000-0000-0000-000000000005','Cliente no se presentó');
select pg_temp.assert_true((select metadata->>'no_show_wait_minutes' from public.job_events where action='cancel_by_driver')='5','no-show audit evidence');
insert into public.commission_reservations values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','released');
insert into app_private.marketplace_driver_promo_attribution values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','fixture','preferred',null,null);
insert into public.marketplace_admin_care_jobs values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000010',gen_random_uuid(),'fixture');
do $$ begin
 perform public.replace_marketplace_customer_job('00000000-0000-0000-0000-000000000099','fixture-token','00000000-0000-0000-0000-000000000004');
 raise exception 'unexpected success';
exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise; end if; raise notice 'PASS: other customer denied'; end $$;
do $$ declare x jsonb; y jsonb; new_id uuid;
begin
 x:=public.replace_marketplace_customer_job('00000000-0000-0000-0000-000000000003','fixture-token','00000000-0000-0000-0000-000000000004');
 new_id:=(x->>'job_id')::uuid;
 y:=public.replace_marketplace_customer_job('00000000-0000-0000-0000-000000000003','fixture-token','00000000-0000-0000-0000-000000000004');
 perform pg_temp.assert_true(x->>'repeated'='false' and y->>'repeated'='true' and x->>'job_id'=y->>'job_id','idempotent replacement');
 perform pg_temp.assert_true((select status='published' and final_price=5000 and assigned_driver_user_id is null and commission_rate_snapshot=.15 from public.jobs where id=new_id),'new job preserves fare and uses current commission rules');
 perform pg_temp.assert_true((select status from public.jobs where id='00000000-0000-0000-0000-000000000004')='cancelled_by_driver','old job remains cancelled');
 perform pg_temp.assert_true((select r.notes='Muebles delicados' and r.details->>'ride_payment_method'='transfer' and r.cargo_weight_kg=150 from public.jobs j join public.service_requests r on r.id=j.service_request_id where j.id=new_id),'notes, payment and cargo preserved');
 perform pg_temp.assert_true(not (select allowed from app_private.marketplace_dispatch_candidate_state('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','v1',new_id)),'cancelled driver excluded');
 perform pg_temp.assert_true((select allowed from app_private.marketplace_dispatch_candidate_state('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','v2',new_id)),'other driver remains eligible');
 perform pg_temp.assert_true((select phase='fleet' and source_code='fixture' from app_private.marketplace_driver_promo_attribution where job_id=new_id),'referral origin retained without exclusive priority');
 perform pg_temp.assert_true(exists(select 1 from public.marketplace_admin_care_jobs where job_id=new_id),'assisted booking ownership retained');
 perform pg_temp.assert_true((select count(*) from public.job_assignments)=1 and (select status from public.commission_reservations)='released','no new reservation or assignment');
end $$;
select set_config('app.fixture_actor','00000000-0000-0000-0000-000000000010',false);
select pg_temp.assert_true(public.admin_get_marketplace_driver_cancellation_reviews('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005')->>'pending'='1','new review pending');
select public.admin_review_marketplace_cancellation('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','justified','Evidencia revisada por la operadora');
select pg_temp.assert_true(public.admin_get_marketplace_driver_cancellation_reviews('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005')->>'justified'='1','review classified without money mutation');
select pg_temp.assert_true(public.admin_set_marketplace_cancellation_settings('00000000-0000-0000-0000-000000000001',10,false)->>'no_show_wait_minutes'='10','configurable wait');
select pg_temp.assert_true(public.admin_get_marketplace_cancellation_settings('00000000-0000-0000-0000-000000000001')->>'replacement_enabled'='false','configurable replacement');
-- Notice for a real cancelled assigned service, not an unassigned request.
update public.jobs set status='cancelled_by_customer' where id='00000000-0000-0000-0000-000000000004';
insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,reason)
values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','pickup','cancelled_by_customer','cancel_by_customer','customer','Ya no necesito el transporte');
select pg_temp.assert_true((select count(*) from public.notification_outbox where kind='marketplace_job_cancelled' and user_id='00000000-0000-0000-0000-000000000005')=1,'cancellation queued to assigned driver only');
select pg_temp.assert_true(not has_function_privilege('anon','public.replace_marketplace_customer_job(uuid,text,uuid)','execute'),'replacement requires gateway');
select pg_temp.assert_true(not has_function_privilege('anon','public.get_my_marketplace_job_cancellation_options(uuid)','execute'),'driver options require login');
