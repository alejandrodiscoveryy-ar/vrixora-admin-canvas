\set ON_ERROR_STOP on
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA app_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION app_private.require_project_permission(uuid,text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN IF auth.uid() IS DISTINCT FROM '90000000-0000-0000-0000-000000000001'::uuid OR $1 IS DISTINCT FROM '10000000-0000-0000-0000-000000000001'::uuid THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF; RETURN auth.uid(); END $$;
CREATE TABLE public.projects(id uuid PRIMARY KEY,slug text UNIQUE);
CREATE TABLE public.project_marketplace_financial_settings(project_id uuid PRIMARY KEY,commission_enabled boolean NOT NULL,commission_rate numeric NOT NULL);
CREATE TABLE public.jobs(id uuid PRIMARY KEY,project_id uuid,assigned_driver_user_id uuid,is_test boolean NOT NULL DEFAULT false,test_deleted_at timestamptz);
CREATE TABLE public.job_events(project_id uuid,job_id uuid,to_status text,action text,created_at timestamptz);
CREATE TABLE public.marketplace_incident_resolutions(project_id uuid,job_id uuid,resolution text,resolved_at timestamptz);
INSERT INTO public.projects VALUES('10000000-0000-0000-0000-000000000001','tuktuk-control'),('10000000-0000-0000-0000-000000000002','other');
INSERT INTO public.project_marketplace_financial_settings VALUES('10000000-0000-0000-0000-000000000001',false,.10),('10000000-0000-0000-0000-000000000002',false,.10);
\i docs/security/tuktuk-wallet-transition-policy-candidate.sql
DO $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001'; driver uuid:='20000000-0000-0000-0000-000000000001'; jtest uuid:=gen_random_uuid(); jdeleted uuid:=gen_random_uuid(); jreal uuid:=gen_random_uuid(); jincident uuid:=gen_random_uuid(); p jsonb;
BEGIN
 IF has_table_privilege('authenticated','app_private.marketplace_wallet_transition_policy','UPDATE') OR has_function_privilege('anon','public.admin_save_marketplace_wallet_transition_v1(uuid,bigint,boolean,numeric,boolean,numeric,boolean)','EXECUTE') THEN RAISE EXCEPTION 'permissions'; END IF;
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 BEGIN PERFORM public.admin_get_marketplace_wallet_transition_v1(pid); RAISE EXCEPTION 'unexpected access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
 p:=public.admin_get_marketplace_wallet_transition_v1(pid);
 IF (p->>'withdrawal_minimum_cup')::numeric<>5000 OR (p->>'credit_limit_cup')::numeric<>500 OR (p->>'engine_ready')::boolean THEN RAISE EXCEPTION 'defaults'; END IF;
 p:=public.admin_save_marketplace_wallet_transition_v1(pid,1,true,600,true,5500,true);
 IF (p->>'version')::int<>2 OR (p->>'withdrawal_minimum_cup')::numeric<>5500 OR (p->>'credit_limit_cup')::numeric<>600 THEN RAISE EXCEPTION 'save'; END IF;
 IF (SELECT count(*) FROM app_private.marketplace_wallet_transition_history WHERE project_id=pid)<>1 THEN RAISE EXCEPTION 'audit'; END IF;
 BEGIN PERFORM public.admin_save_marketplace_wallet_transition_v1(pid,1,true,500,true,5000,true); RAISE EXCEPTION 'stale accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM public.admin_save_marketplace_wallet_transition_v1(pid,2,true,0,true,5000,true); RAISE EXCEPTION 'invalid accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN UPDATE public.project_marketplace_financial_settings SET commission_enabled=true WHERE project_id=pid; RAISE EXCEPTION 'unsafe activation'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.project_marketplace_financial_settings WHERE project_id=pid AND (commission_enabled OR commission_rate<>.10)) THEN RAISE EXCEPTION 'live policy changed'; END IF;
 UPDATE public.project_marketplace_financial_settings SET commission_enabled=true WHERE project_id<>pid;
 INSERT INTO public.jobs VALUES(jtest,pid,driver,true,NULL),(jdeleted,pid,driver,false,now()),(jreal,pid,driver,false,NULL),(jincident,pid,driver,false,NULL);
 INSERT INTO public.job_events VALUES(pid,jtest,'settled','settle',now()-interval '4 days'),(pid,jdeleted,'settled','settle',now()-interval '3 days'),(pid,jreal,'settled','settle',now()-interval '1 day');
 INSERT INTO public.marketplace_incident_resolutions VALUES(pid,jincident,'completed',now());
 IF (SELECT job_id FROM app_private.marketplace_referral_first_qualification(pid,driver)) IS DISTINCT FROM jreal THEN RAISE EXCEPTION 'test ride qualified'; END IF;
 RAISE NOTICE 'Wallet policy, permissions, audit, activation lock and first real referral qualification passed';
END $$;
