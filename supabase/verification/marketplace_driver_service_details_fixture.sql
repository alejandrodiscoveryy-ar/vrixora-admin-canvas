-- Disposable PostgreSQL fixture: existing list contracts are mocked with driver ownership.
create schema auth;
create role anon;
create role authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_actor',true),'')::uuid $$;
create table public.jobs(id uuid primary key,project_id uuid not null,service_request_id uuid not null);
create table public.service_requests(id uuid primary key,project_id uuid not null,notes text,details jsonb);
create table public.job_assignments(project_id uuid,job_id uuid,driver_user_id uuid);
create table public.fixture_offer(job_id uuid,driver_id uuid,created_at timestamptz,ride_payment_method text,cargo_weight_kg numeric);
create function public.list_my_marketplace_available_jobs_with_payment(text,integer,timestamptz,uuid)
 returns table(job_id uuid,created_at timestamptz,ride_payment_method text,cargo_weight_kg numeric)
 language sql as $$ select f.job_id,f.created_at,f.ride_payment_method,f.cargo_weight_kg from public.fixture_offer f where f.driver_id=auth.uid() and $1='v1' $$;
create function public.list_my_marketplace_jobs_with_payment(text,integer,timestamptz,uuid)
 returns table(job_id uuid,created_at timestamptz,ride_payment_method text,cargo_weight_kg numeric)
 language sql as $$ select f.job_id,f.created_at,f.ride_payment_method,f.cargo_weight_kg from public.fixture_offer f join public.job_assignments a on a.job_id=f.job_id and a.driver_user_id=auth.uid() where $1='active' $$;
\ir ../proposals/marketplace_driver_service_details.sql
insert into public.service_requests values
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Muebles delicados; llamar +53 5555 5555; persona@example.com','{"load_help":true,"unload_help":true,"urgent":true,"stop_count":2}'),
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Documentos en recepción','{"load_help":false,"stop_count":"unknown"}');
insert into public.jobs values
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
insert into public.fixture_offer values
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006',now(),'transfer',150.5),
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000007',now(),'cash',2);
insert into public.job_assignments values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000006');
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
do $$ begin
 perform public.list_my_marketplace_available_jobs_with_details('v1');
 raise exception 'unexpected success';
exception when insufficient_privilege then
 if sqlerrm <> 'AUTHENTICATION_REQUIRED' then raise; end if;
 raise notice 'PASS: rejects unauthenticated';
end $$;
select set_config('app.test_actor','00000000-0000-0000-0000-000000000006',false);
do $$ declare x jsonb; begin
 select t into strict x from public.list_my_marketplace_available_jobs_with_details('v1') t;
 perform pg_temp.assert_true(x->>'ride_payment_method'='transfer' and x->>'cargo_weight_kg'='150.5','payment and existing specifications preserved');
 perform pg_temp.assert_true(x->>'customer_notes' like 'Muebles delicados%' and x->>'customer_notes' not like '%5555%' and x->>'customer_notes' not like '%example.com%','offer notes without common contact strings');
 perform pg_temp.assert_true(x->>'load_help'='true' and x->>'unload_help'='true' and x->>'urgent'='true' and x->>'stop_count'='2','additional requirements');
 select t into strict x from public.list_my_marketplace_jobs_with_details('active') t;
 perform pg_temp.assert_true(x->>'customer_notes' like '%5555%' and x->>'customer_notes' like '%persona@example.com%','assigned driver receives full note');
end $$;
select pg_temp.assert_true((select count(*) from public.list_my_marketplace_available_jobs_with_details('other-vehicle'))=0,'no ineligible offer');
select set_config('app.test_actor','00000000-0000-0000-0000-000000000007',false);
select pg_temp.assert_true((select count(*) from public.list_my_marketplace_jobs_with_details('active'))=0,'no other driver assigned rows');
select pg_temp.assert_true((select t->>'customer_notes' from public.list_my_marketplace_available_jobs_with_details('v1') t)='Documentos en recepción','second request notes');
select pg_temp.assert_true((select t->>'stop_count' from public.list_my_marketplace_available_jobs_with_details('v1') t) is null,'malformed optional details ignored');
select pg_temp.assert_true(not has_function_privilege('anon','public.list_my_marketplace_available_jobs_with_details(text,integer,timestamptz,uuid)','execute'),'no anonymous execute');
select pg_temp.assert_true(not has_function_privilege('anon','public.list_my_marketplace_jobs_with_details(text,integer,timestamptz,uuid)','execute'),'no anonymous assigned execute');
