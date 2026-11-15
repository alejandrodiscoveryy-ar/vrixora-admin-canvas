-- Disposable database only. No production data, credentials or mutations.
create schema auth;
create schema app_private;
create role anon;
create role authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_actor',true),'')::uuid $$;
create function app_private.require_project_permission(uuid,text) returns uuid language plpgsql stable as $$
begin if $1 <> '00000000-0000-0000-0000-000000000001' or auth.uid() is null
  or current_setting('app.test_manage',true) is distinct from 'yes' then
  raise exception 'FORBIDDEN' using errcode='42501'; end if; return auth.uid(); end $$;
create function app_private.has_project_permission(uuid,text) returns boolean language sql stable as $$
 select current_setting('app.test_customer',true)='yes' $$;
create table public.jobs(id uuid primary key,project_id uuid,service_request_id uuid,service_code text,status text,
  expires_at timestamptz,is_test boolean default false,test_deleted_at timestamptz,assigned_driver_user_id uuid,
  assigned_vehicle_id text,pricing_vehicle_category_code text,final_price numeric,currency text);
create table public.service_requests(id uuid primary key,project_id uuid,origin_text text,destination_text text,
 vehicle_category_code text,scheduled_for timestamptz,details jsonb,passenger_count integer,cargo_weight_kg numeric,
 cargo_volume_m3 numeric,cargo_length_cm numeric,cargo_width_cm numeric,cargo_height_cm numeric,
 required_body_type text,notes text);
create table public.job_assignments(project_id uuid,job_id uuid);
create table app_private.marketplace_driver_promo_attribution(project_id uuid,job_id uuid,phase text,priority_until timestamptz);
create table app_private.marketplace_driver_promo_settings(project_id uuid,profiles_enabled boolean,priority_enabled boolean);
\ir ../proposals/marketplace_admin_whatsapp_payload.sql
insert into public.service_requests values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
 'Vedado','Playa','tricycle',null,'{"ride_payment_method":"transfer","estimated_distance_km":4.2,"load_help":true}',null,150,1.5,120,80,90,null,'Muebles');
insert into public.jobs values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','cargo','published',now()+interval '1 hour',false,null,null,null,'tricycle',1200,'CUP');
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.expect_reject(expected text) returns void language plpgsql as $$
begin
 perform public.admin_get_marketplace_job_whatsapp_payload('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
 raise exception 'unexpected success';
exception when others then
 if sqlerrm <> expected then raise exception 'expected %, got %',expected,sqlerrm; end if;
 raise notice 'PASS: %',expected;
end $$;
select pg_temp.expect_reject('AUTHENTICATION_REQUIRED');
select set_config('app.test_actor','00000000-0000-0000-0000-000000000004',false);
select set_config('app.test_manage','no',false);
select pg_temp.expect_reject('FORBIDDEN');
select set_config('app.test_manage','yes',false);
select set_config('app.test_customer','yes',false);
do $$ declare payload jsonb;
begin
 payload:=public.admin_get_marketplace_job_whatsapp_payload('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
 perform pg_temp.check_true(payload->>'paymentMethod'='transfer' and payload->>'comment'='Muebles' and payload->>'price'='1200' and payload->>'weightKg'='150','real freight payload');
 perform pg_temp.check_true(not(payload ? 'customerId') and not(payload ? 'phone'),'no customer identifiers');
end $$;
select set_config('app.test_customer','no',false);
select pg_temp.check_true(public.admin_get_marketplace_job_whatsapp_payload('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003')->>'comment' is null,'restricted comments');
update public.jobs set is_test=true;
select pg_temp.expect_reject('JOB_NOT_SHAREABLE');
update public.jobs set is_test=false,expires_at=now()-interval '1 minute';
select pg_temp.expect_reject('JOB_NOT_SHAREABLE');
update public.jobs set expires_at=now()+interval '1 hour',assigned_driver_user_id='00000000-0000-0000-0000-000000000004';
select pg_temp.expect_reject('JOB_NOT_SHAREABLE');
update public.jobs set assigned_driver_user_id=null,status='cancelled_by_customer';
select pg_temp.expect_reject('JOB_NOT_SHAREABLE');
update public.jobs set status='published';
insert into app_private.marketplace_driver_promo_settings values ('00000000-0000-0000-0000-000000000001',true,true);
insert into app_private.marketplace_driver_promo_attribution values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','preferred',now()+interval '30 seconds');
select pg_temp.expect_reject('JOB_NOT_SHAREABLE');
update app_private.marketplace_driver_promo_attribution set priority_until=now()-interval '1 second';
select pg_temp.check_true(public.admin_get_marketplace_job_whatsapp_payload('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003')->>'serviceCode'='cargo','available after priority');
select pg_temp.check_true(not has_function_privilege('anon','public.admin_get_marketplace_job_whatsapp_payload(uuid,uuid)','execute'),'no anonymous execute');
