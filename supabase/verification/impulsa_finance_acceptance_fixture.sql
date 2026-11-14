\set ON_ERROR_STOP on
-- Extends the isolated finance fixture with production-shaped acceptance,
-- available offers, wallet reservation and service settlement dependencies.
-- Same production functions, real Postgres, no real accounts or network.
ALTER TABLE public.project_marketplace_financial_settings ADD COLUMN wallet_currency text NOT NULL DEFAULT 'CUP';
ALTER TABLE public.jobs ADD COLUMN service_code text DEFAULT 'passenger', ADD COLUMN pricing_vehicle_category_code text DEFAULT 'tricycle',
 ADD COLUMN recommended_price numeric DEFAULT 1000, ADD COLUMN expires_at timestamptz, ADD COLUMN created_at timestamptz DEFAULT now(),
 ADD COLUMN assigned_vehicle_id text, ADD COLUMN state_version bigint NOT NULL DEFAULT 1, ADD COLUMN test_force_wallet_commission boolean NOT NULL DEFAULT false;
ALTER TABLE public.job_events ADD COLUMN from_status text, ADD COLUMN actor_kind text, ADD COLUMN actor_user_id uuid,
 ADD COLUMN customer_id uuid, ADD COLUMN operation_idempotency_key uuid, ADD COLUMN reason text;
CREATE UNIQUE INDEX fixture_job_event_idempotency ON public.job_events(project_id,operation_idempotency_key);
CREATE TABLE public.driver_profiles(project_id uuid,user_id uuid,status text,activated_at timestamptz,suspended_at timestamptz);
CREATE TABLE public.driver_vehicle_assignments(project_id uuid,driver_user_id uuid,vehicle_id text,is_active boolean,is_available boolean);
CREATE TABLE public.vehicles(project_id uuid,id text,deleted_at timestamptz,marketplace_status text,category_code text,
 passenger_capacity integer,cargo_capacity_kg numeric,cargo_volume_m3 numeric,cargo_length_cm numeric,cargo_width_cm numeric,cargo_height_cm numeric,body_type text);
CREATE TABLE public.service_requests(project_id uuid,id uuid,customer_id uuid,origin_text text,destination_text text,scheduled_for timestamptz,
 passenger_count integer,cargo_weight_kg numeric,cargo_volume_m3 numeric,cargo_length_cm numeric,cargo_width_cm numeric,cargo_height_cm numeric,required_body_type text,vehicle_category_code text);
CREATE TABLE public.vehicle_services(project_id uuid,vehicle_id text,service_code text,enabled boolean);
CREATE TABLE public.marketplace_work_trials(project_id uuid,user_id uuid,started_at timestamptz,ends_at timestamptz);
CREATE TABLE public.job_assignments(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,project_id uuid,job_id uuid,driver_user_id uuid,vehicle_id text,
 acceptance_idempotency_key uuid,billing_mode text,commission_amount_snapshot numeric,trial_started_at_snapshot timestamptz,trial_ends_at_snapshot timestamptz,completed_at timestamptz,cancelled_at timestamptz,UNIQUE(project_id,job_id));
CREATE TABLE public.marketplace_driver_customer_ratings(project_id uuid,job_id uuid,driver_user_id uuid);
CREATE TABLE public.marketplace_customer_ratings(project_id uuid,job_id uuid,customer_id uuid,driver_user_id uuid);
ALTER TABLE public.marketplace_incident_resolutions ADD COLUMN id uuid DEFAULT gen_random_uuid();
CREATE FUNCTION app_private.marketplace_test_job_targets_driver(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION app_private.marketplace_job_transition_allowed(text,text,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1='published' AND $2='accepted' AND $3='driver' $$;
CREATE FUNCTION app_private.has_active_marketplace_work_trial(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.marketplace_work_trials WHERE user_id=$1 AND started_at<=now() AND ends_at>now()) $$;
CREATE FUNCTION app_private.marketplace_onboarding_requirements_complete(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION app_private.has_confirmed_marketplace_initial_deposit(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION app_private.marketplace_wallet_reserved_balance(uuid,uuid) RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT coalesce(sum(amount),0) FROM public.commission_reservations WHERE project_id=$1 AND user_id=$2 AND status='open' $$;
CREATE FUNCTION app_private.marketplace_wallet_available_balance(uuid,uuid) RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT app_private.marketplace_wallet_total_balance($1,$2)-app_private.marketplace_wallet_reserved_balance($1,$2) $$;
CREATE FUNCTION app_private.marketplace_dispatch_policy_allows(uuid,uuid,text,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
-- Production reservation source attribution, plus actual three adapted RPCs.
\i /tmp/impulsa-acceptance-adapter.sql
CREATE TRIGGER commission_reservations_attribute_sources BEFORE INSERT ON public.commission_reservations FOR EACH ROW EXECUTE FUNCTION app_private.marketplace_attribute_commission_reservation();

CREATE FUNCTION pg_temp.publish_real(fare numeric, attributed boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE j uuid:=gen_random_uuid(); sr uuid:=gen_random_uuid(); pid uuid:='10000000-0000-0000-0000-000000000001';
BEGIN
 INSERT INTO public.service_requests(project_id,id,customer_id,origin_text,destination_text,passenger_count,vehicle_category_code)
 VALUES(pid,sr,gen_random_uuid(),'Origen de prueba','Destino de prueba',1,'tricycle');
 INSERT INTO public.jobs(id,project_id,service_request_id,status,final_price,recommended_price,commission_rate_snapshot,expires_at)
 VALUES(j,pid,sr,'requested',fare,fare,(SELECT commission_rate FROM public.project_marketplace_financial_settings WHERE project_id=pid),now()+interval '24 hours');
 IF attributed THEN INSERT INTO app_private.marketplace_driver_promo_attribution VALUES(j,pid,'20000000-0000-0000-0000-000000000001',sr,'code'); END IF;
 UPDATE public.jobs SET status='published' WHERE id=j;
 RETURN j;
END $$;

DO $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001'; promoter uuid:='20000000-0000-0000-0000-000000000001'; driver uuid:='20000000-0000-0000-0000-000000000002';
 own_job uuid; fleet_job uuid; free_job uuid; normal_job uuid; akey uuid:=gen_random_uuid(); close_key uuid:=gen_random_uuid(); v public.jobs%ROWTYPE; b numeric; d numeric;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
 PERFORM public.admin_save_marketplace_impulsa_policy_v1(pid,5,.15,.10,.05,true);
 INSERT INTO public.driver_profiles VALUES(pid,promoter,'active',now(),NULL),(pid,driver,'active',now(),NULL);
 INSERT INTO public.driver_vehicle_assignments VALUES(pid,promoter,'v1',true,true),(pid,driver,'v2',true,true);
 INSERT INTO public.vehicles(project_id,id,marketplace_status,category_code,passenger_capacity) VALUES(pid,'v1','active','tricycle',4),(pid,'v2','active','tricycle',4);
 INSERT INTO public.vehicle_services VALUES(pid,'v1','passenger',true),(pid,'v2','passenger',true);
 -- Promoter has 900 CUP after earlier tests. A fare of 8000 needs 800
 -- at 10%, not the 1200 general charge. The UI and acceptance agree.
 own_job:=pg_temp.publish_real(8000);
 PERFORM set_config('request.jwt.claim.sub',promoter::text,true);
 PERFORM pg_temp.check_true((SELECT commission_rate=.10 AND commission_amount=800 AND can_accept FROM public.list_my_marketplace_available_jobs('v1') WHERE job_id=own_job),'offer preview own rate and affordability');
 v:=public.accept_job(own_job,'v1',akey);
 PERFORM pg_temp.check_true(v.status='accepted' AND v.assigned_driver_user_id=promoter,'own acceptance succeeds at 10%');
 PERFORM pg_temp.check_true((SELECT amount=800 AND commission_rate_snapshot=.10 AND real_reserved_amount=800 AND status='open' FROM public.commission_reservations WHERE job_id=own_job),'actual reservation at 10%');
 v:=public.accept_job(own_job,'v1',akey);
 PERFORM pg_temp.check_true((SELECT count(*)=1 FROM public.commission_reservations WHERE job_id=own_job),'replayed accept one reservation');
 -- Pricing snapshot remains immutable general rate; actual settlement uses
 -- actor-specific frozen rate and matches actual reservation.
 UPDATE public.jobs SET status='in_progress' WHERE id=own_job;
 INSERT INTO public.marketplace_driver_customer_ratings VALUES(pid,own_job,promoter);
 b:=app_private.marketplace_wallet_total_balance(pid,promoter);
 v:=app_private.finish_marketplace_job_core(own_job,'driver',promoter,NULL,NULL,close_key);
 PERFORM pg_temp.check_true(v.status='settled' AND v.commission_rate_snapshot=.15,'general historical snapshot unchanged');
 PERFORM pg_temp.check_true(app_private.marketplace_wallet_total_balance(pid,promoter)=b-800,'real own debit');
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_rewards WHERE job_id=own_job),'own job no credit');
 v:=app_private.finish_marketplace_job_core(own_job,'driver',promoter,NULL,NULL,close_key);
 PERFORM pg_temp.check_true(app_private.marketplace_wallet_total_balance(pid,promoter)=b-800,'replay close no duplicate debit');

 fleet_job:=pg_temp.publish_real(1000);
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 PERFORM pg_temp.check_true((SELECT commission_rate=.15 AND commission_amount=150 AND can_accept FROM public.list_my_marketplace_available_jobs('v2') WHERE job_id=fleet_job),'fleet offer 15%');
 v:=public.accept_job(fleet_job,'v2',gen_random_uuid());
 PERFORM pg_temp.check_true((SELECT amount=150 AND commission_rate_snapshot=.15 FROM public.commission_reservations WHERE job_id=fleet_job),'fleet reservation 15%');
 UPDATE public.jobs SET status='in_progress' WHERE id=fleet_job;
 INSERT INTO public.marketplace_driver_customer_ratings VALUES(pid,fleet_job,driver);
 d:=app_private.marketplace_wallet_total_balance(pid,driver);
 b:=app_private.marketplace_wallet_total_balance(pid,promoter);
 v:=app_private.finish_marketplace_job_core(fleet_job,'driver',driver,NULL,NULL,gen_random_uuid());
 PERFORM pg_temp.check_true(v.status='settled' AND app_private.marketplace_wallet_total_balance(pid,driver)=d-150,'fleet settlement 150 CUP');
 PERFORM pg_temp.check_true((SELECT amount=50 AND state='pending' FROM app_private.marketplace_impulsa_rewards WHERE job_id=fleet_job),'5% automatically queued from actual close');
 PERFORM pg_temp.check_true(app_private.impulsa_process_one()='credited','worker credits actual settlement');
 PERFORM pg_temp.check_true(app_private.marketplace_wallet_total_balance(pid,promoter)=b+50,'commercial wallet +50');
 -- Existing free trials remain free and do not generate revenue.
 INSERT INTO public.marketplace_work_trials VALUES(pid,driver,now()-interval '1 day',now()+interval '5 days');
 free_job:=pg_temp.publish_real(1000);
 PERFORM pg_temp.check_true((SELECT commission_amount=0 AND billing_mode='trial_free' FROM public.list_my_marketplace_available_jobs('v2') WHERE job_id=free_job),'welcome trial still free');
 v:=public.accept_job(free_job,'v2',gen_random_uuid());
 UPDATE public.jobs SET status='in_progress' WHERE id=free_job;
 INSERT INTO public.marketplace_driver_customer_ratings VALUES(pid,free_job,driver);
 v:=app_private.finish_marketplace_job_core(free_job,'driver',driver,NULL,NULL,gen_random_uuid());
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.commission_reservations WHERE job_id=free_job) AND NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_rewards WHERE job_id=free_job),'trial no debit or reward');
 DELETE FROM public.marketplace_work_trials WHERE user_id=driver;
 -- Global switch off overrides future acceptance; no hidden new charge.
 UPDATE public.project_marketplace_financial_settings SET commission_enabled=false WHERE project_id=pid;
 normal_job:=pg_temp.publish_real(1000,false);
 PERFORM pg_temp.check_true((SELECT commission_amount=0 AND billing_mode='platform_free' FROM public.list_my_marketplace_available_jobs('v2') WHERE job_id=normal_job),'global switch still authoritative');
 v:=public.accept_job(normal_job,'v2',gen_random_uuid());
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.commission_reservations WHERE job_id=normal_job),'disabled no reservation');
 RAISE NOTICE 'Actual accept_job, list_my_marketplace_available_jobs, finish_marketplace_job_core, reservation classifier, and worker: passed';
END $$;
