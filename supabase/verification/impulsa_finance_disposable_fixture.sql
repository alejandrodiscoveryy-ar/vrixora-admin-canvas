\set ON_ERROR_STOP on
-- Disposable DB: no connection to hosted Supabase. Core + actual patched wallet classifier.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA app_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION app_private.require_project_permission(uuid,text) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN IF auth.uid() IS DISTINCT FROM '90000000-0000-0000-0000-000000000001'::uuid OR $1 IS DISTINCT FROM '10000000-0000-0000-0000-000000000001'::uuid THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF; RETURN auth.uid(); END $$;
CREATE TABLE public.projects(id uuid PRIMARY KEY,slug text UNIQUE);
CREATE TABLE public.project_marketplace_financial_settings(project_id uuid PRIMARY KEY REFERENCES public.projects(id),commission_enabled boolean NOT NULL,commission_rate numeric NOT NULL,updated_at timestamptz DEFAULT now(),updated_by uuid);
CREATE TABLE public.jobs(id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES public.projects(id),service_request_id uuid NOT NULL,status text NOT NULL,is_test boolean NOT NULL DEFAULT false,test_deleted_at timestamptz,currency text NOT NULL DEFAULT 'CUP',final_price numeric NOT NULL DEFAULT 1000,commission_rate_snapshot numeric NOT NULL DEFAULT .15,assigned_driver_user_id uuid);
CREATE TABLE app_private.marketplace_driver_promo_profiles(project_id uuid,driver_user_id uuid,code text,consented_at timestamptz,revoked_at timestamptz,PRIMARY KEY(project_id,driver_user_id));
CREATE TABLE app_private.marketplace_driver_promo_attribution(job_id uuid PRIMARY KEY,project_id uuid,driver_user_id uuid,service_request_id uuid,source_code text);
CREATE TABLE app_private.marketplace_driver_identity_reviews(project_id uuid,driver_user_id uuid,verified_at timestamptz,revoked_at timestamptz,PRIMARY KEY(project_id,driver_user_id));
CREATE TABLE app_private.marketplace_driver_promo_settings(project_id uuid PRIMARY KEY,profiles_enabled boolean);
CREATE TABLE public.wallets(project_id uuid,user_id uuid,currency text NOT NULL DEFAULT 'CUP',PRIMARY KEY(project_id,user_id));
CREATE TABLE public.wallet_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,user_id uuid,currency text NOT NULL,transaction_type text NOT NULL,amount_delta numeric NOT NULL,balance_after numeric NOT NULL,source_type text NOT NULL,source_id text NOT NULL,idempotency_key uuid NOT NULL,actor_id uuid,metadata jsonb NOT NULL DEFAULT '{}',real_delta numeric NOT NULL DEFAULT 0,promotional_delta numeric NOT NULL DEFAULT 0,reversed_ledger_id uuid,created_at timestamptz DEFAULT now(),UNIQUE(project_id,source_type,source_id,transaction_type),UNIQUE(project_id,idempotency_key),CHECK(real_delta+promotional_delta=amount_delta),CHECK(balance_after>=0));
CREATE TABLE public.topups(id uuid PRIMARY KEY,project_id uuid,user_id uuid,status text,amount numeric,currency text);
CREATE TABLE public.commission_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,job_id uuid,user_id uuid,status text,amount numeric,currency text DEFAULT 'CUP',final_price_snapshot numeric,commission_rate_snapshot numeric,real_reserved_amount numeric DEFAULT 0,promotional_reserved_amount numeric DEFAULT 0,ledger_transaction_id uuid,UNIQUE(project_id,job_id));
CREATE TABLE public.marketplace_incident_resolutions(project_id uuid,job_id uuid,resolution text);
CREATE TABLE public.job_events(project_id uuid,job_id uuid,action text,to_status text,metadata jsonb DEFAULT '{}');
CREATE FUNCTION app_private.marketplace_wallet_total_balance(uuid,uuid) RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT coalesce(sum(amount_delta),0) FROM public.wallet_transactions WHERE project_id=$1 AND user_id=$2 $$;
CREATE FUNCTION app_private.marketplace_wallet_source_balances(uuid,uuid) RETURNS TABLE(real_available_balance numeric,promotional_available_balance numeric) LANGUAGE sql STABLE AS $$
 SELECT coalesce(sum(real_delta),0)-(SELECT coalesce(sum(real_reserved_amount),0) FROM public.commission_reservations WHERE project_id=$1 AND user_id=$2 AND status='open'),
 coalesce(sum(promotional_delta),0)-(SELECT coalesce(sum(promotional_reserved_amount),0) FROM public.commission_reservations WHERE project_id=$1 AND user_id=$2 AND status='open') FROM public.wallet_transactions WHERE project_id=$1 AND user_id=$2
$$;
INSERT INTO public.projects VALUES('10000000-0000-0000-0000-000000000001','tuktuk-control'),('10000000-0000-0000-0000-000000000002','other');
INSERT INTO public.project_marketplace_financial_settings(project_id,commission_enabled,commission_rate) VALUES('10000000-0000-0000-0000-000000000001',false,.10);
INSERT INTO app_private.marketplace_driver_promo_profiles VALUES('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','code',now(),NULL);
INSERT INTO app_private.marketplace_driver_identity_reviews VALUES('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',now(),NULL);
INSERT INTO app_private.marketplace_driver_promo_settings VALUES('10000000-0000-0000-0000-000000000001',true);
\i docs/security/mi-tuktuk-impulsa-finance-core-candidate.sql
-- The workflow extracts the exact production-shaped classifier and check
-- constraints from the adapter. This tests real ledger provenance, not a stub.
\i /tmp/impulsa-wallet-adapter.sql
CREATE TRIGGER wallet_transactions_classify_sources BEFORE INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION app_private.marketplace_classify_wallet_transaction();

CREATE FUNCTION pg_temp.check_true(b boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.make_job(driver uuid, test boolean DEFAULT false, attributed boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE j uuid:=gen_random_uuid(); sr uuid:=gen_random_uuid(); pid uuid:='10000000-0000-0000-0000-000000000001';
BEGIN
 INSERT INTO public.jobs(id,project_id,service_request_id,status,is_test,commission_rate_snapshot,assigned_driver_user_id) VALUES(j,pid,sr,'requested',test,(SELECT commission_rate FROM public.project_marketplace_financial_settings WHERE project_id=pid),driver);
 IF attributed THEN INSERT INTO app_private.marketplace_driver_promo_attribution VALUES(j,pid,'20000000-0000-0000-0000-000000000001',sr,'code'); END IF;
 UPDATE public.jobs SET status='published' WHERE id=j;
 RETURN j;
END $$;
CREATE FUNCTION pg_temp.credit_wallet(driver uuid, amount numeric, promo boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001'; id uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.wallets VALUES(pid,driver,'CUP') ON CONFLICT DO NOTHING;
 IF NOT promo THEN INSERT INTO public.topups VALUES(id,pid,driver,'requested',amount,'CUP'); END IF;
 INSERT INTO public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key)
 VALUES(pid,driver,'CUP',CASE WHEN promo THEN 'referral_credit' ELSE 'topup' END,amount,app_private.marketplace_wallet_total_balance(pid,driver)+amount,CASE WHEN promo THEN 'referral_reward' ELSE 'topup' END,id::text,gen_random_uuid());
END $$;
CREATE FUNCTION pg_temp.settle(jid uuid, real_part numeric, promo_part numeric, incident boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE j public.jobs%ROWTYPE; charge numeric:=real_part+promo_part; rate numeric; tx uuid;
BEGIN
 SELECT * INTO j FROM public.jobs WHERE id=jid;
 rate:=app_private.impulsa_effective_rate(j.project_id,j.id,j.assigned_driver_user_id,j.commission_rate_snapshot);
 PERFORM pg_temp.check_true(charge=round(j.final_price*rate,2),'reservation amount matches actor-specific rate');
 INSERT INTO public.commission_reservations(project_id,job_id,user_id,status,amount,final_price_snapshot,commission_rate_snapshot,real_reserved_amount,promotional_reserved_amount)
 VALUES(j.project_id,j.id,j.assigned_driver_user_id,'open',charge,j.final_price,rate,real_part,promo_part);
 INSERT INTO public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key)
 VALUES(j.project_id,j.assigned_driver_user_id,'CUP','commission',-charge,app_private.marketplace_wallet_total_balance(j.project_id,j.assigned_driver_user_id)-charge,'job_commission',j.id::text,gen_random_uuid()) RETURNING id INTO tx;
 UPDATE public.commission_reservations SET status='consumed',ledger_transaction_id=tx WHERE job_id=j.id;
 UPDATE public.jobs SET status=CASE WHEN incident THEN 'incident' ELSE 'settled' END WHERE id=j.id;
 IF incident THEN INSERT INTO public.marketplace_incident_resolutions VALUES(j.project_id,j.id,'completed'); END IF;
 INSERT INTO public.job_events VALUES(j.project_id,j.id,CASE WHEN incident THEN 'incident_resolved' ELSE 'settle' END,CASE WHEN incident THEN 'incident' ELSE 'settled' END,CASE WHEN incident THEN '{"resolution":"completed"}'::jsonb ELSE '{}'::jsonb END);
 RETURN tx;
END $$;
CREATE FUNCTION pg_temp.reverse_commission(original uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t public.wallet_transactions%ROWTYPE;
BEGIN
 SELECT * INTO t FROM public.wallet_transactions WHERE id=original;
 INSERT INTO public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,metadata)
 VALUES(t.project_id,t.user_id,'CUP','reversal',-t.amount_delta,app_private.marketplace_wallet_total_balance(t.project_id,t.user_id)-t.amount_delta,'job_commission_reversal',t.source_id,gen_random_uuid(),jsonb_build_object('original_ledger_transaction_id',t.id));
END $$;
DO $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001'; promoter uuid:='20000000-0000-0000-0000-000000000001'; driver uuid:='20000000-0000-0000-0000-000000000002'; old_job uuid; own_job uuid; fleet_job uuid; t uuid; j uuid; result jsonb; tx uuid; pending_job uuid; blocked uuid; s jsonb;
BEGIN
 PERFORM pg_temp.check_true(NOT has_table_privilege('authenticated','app_private.marketplace_impulsa_rewards','SELECT'),'no direct reward read');
 PERFORM pg_temp.check_true(NOT has_function_privilege('anon','public.admin_save_marketplace_impulsa_policy_v1(uuid,bigint,numeric,numeric,numeric,boolean)','EXECUTE'),'no anonymous writes');
 PERFORM pg_temp.check_true(NOT has_function_privilege('authenticated','app_private.impulsa_process_one()','EXECUTE'),'no driver worker access');
 PERFORM pg_temp.check_true((SELECT NOT enabled AND general_rate=.15 AND own_rate=.10 AND commercial_rate=.05 FROM app_private.marketplace_impulsa_policy WHERE project_id=pid),'15/10/5 draft default');
 old_job:=pg_temp.make_job(promoter);
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_job_policy WHERE job_id=old_job),'disabled creates no snapshot');
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 BEGIN PERFORM public.admin_get_marketplace_impulsa_policy_v1(pid); RAISE EXCEPTION 'unexpected access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
 result:=public.admin_save_marketplace_impulsa_policy_v1(pid,1,.15,.10,.05,false);
 PERFORM pg_temp.check_true((result->>'version')::int=2 AND (result->>'live_general_rate')::numeric=.10 AND NOT (result->>'billing_enabled')::boolean,'draft save preserves real rate and global switch');
 BEGIN PERFORM public.admin_save_marketplace_impulsa_policy_v1(pid,2,.15,.10,.05,true); RAISE EXCEPTION 'unexpected activation'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN PERFORM public.admin_save_marketplace_impulsa_policy_v1(pid,2,.15,.16,.05,false); RAISE EXCEPTION 'unexpected invalid rates'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN PERFORM public.admin_save_marketplace_impulsa_policy_v1(pid,1,.15,.10,.05,false); RAISE EXCEPTION 'unexpected stale write'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 UPDATE public.project_marketplace_financial_settings SET commission_enabled=true WHERE project_id=pid;
 result:=public.admin_save_marketplace_impulsa_policy_v1(pid,2,.15,.10,.05,true);
 PERFORM pg_temp.check_true((result->>'enabled')::boolean AND (result->>'live_general_rate')::numeric=.15,'explicit activation changes new general rate');
 BEGIN UPDATE public.project_marketplace_financial_settings SET commission_rate=.20 WHERE project_id=pid; RAISE EXCEPTION 'unexpected drift'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 own_job:=pg_temp.make_job(promoter); fleet_job:=pg_temp.make_job(driver);
 PERFORM pg_temp.check_true(app_private.impulsa_effective_rate(pid,own_job,promoter,.15)=.10,'own rate 10');
 PERFORM pg_temp.check_true(app_private.impulsa_effective_rate(pid,fleet_job,driver,.15)=.15,'other driver 15');
 PERFORM pg_temp.check_true(app_private.impulsa_effective_rate(pid,old_job,promoter,.10)=.10,'old job unchanged');
 j:=pg_temp.make_job(driver,true); PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_job_policy WHERE job_id=j),'no tests');
 j:=pg_temp.make_job(driver,false,false); PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_job_policy WHERE job_id=j),'no attribution no benefit');
 UPDATE app_private.marketplace_driver_identity_reviews SET revoked_at=now() WHERE project_id=pid AND driver_user_id=promoter;
 j:=pg_temp.make_job(driver); PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_job_policy WHERE job_id=j),'revoked no snapshot');
 UPDATE app_private.marketplace_driver_identity_reviews SET revoked_at=NULL WHERE project_id=pid AND driver_user_id=promoter;
 PERFORM pg_temp.credit_wallet(promoter,1000); PERFORM pg_temp.credit_wallet(driver,2000);
 PERFORM pg_temp.settle(own_job,100,0);
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_rewards WHERE job_id=own_job),'own no double credit');
 tx:=pg_temp.settle(fleet_job,150,0);
 INSERT INTO public.job_events VALUES(pid,fleet_job,'settle','settled','{}');
 PERFORM pg_temp.check_true((SELECT count(*)=1 AND min(amount)=50 FROM app_private.marketplace_impulsa_rewards WHERE job_id=fleet_job),'5% exactly once');
 PERFORM pg_temp.check_true(app_private.impulsa_process_one()='credited','worker credits');
 PERFORM pg_temp.check_true((SELECT real_delta=50 AND promotional_delta=0 FROM public.wallet_transactions WHERE source_type='impulsa_reward' AND source_id=fleet_job::text),'50 real CUP, not promo');
 PERFORM pg_temp.check_true(app_private.marketplace_wallet_total_balance(pid,promoter)=950,'900 after own charge plus 50');
 PERFORM pg_temp.check_true(app_private.impulsa_process_one()='empty','replay no extra credit');
 s:=public.admin_get_marketplace_impulsa_summary_v1(pid,promoter);
 PERFORM pg_temp.check_true((s->>'credited_cup')::numeric=50 AND (s->>'own_savings_cup')::numeric=50,'summary real earnings separate from savings');
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 s:=public.get_my_marketplace_impulsa_summary_v1();
 PERFORM pg_temp.check_true((s->>'credited_cup')::numeric=0,'other driver sees own only');
 PERFORM set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
 -- Insufficient real funding: full 5% recorded, no conversion of promo funds to real.
 blocked:=pg_temp.make_job(driver); PERFORM pg_temp.credit_wallet(driver,150,true); PERFORM pg_temp.settle(blocked,0,150);
 PERFORM pg_temp.check_true((SELECT state='funding_required' AND amount=50 FROM app_private.marketplace_impulsa_rewards WHERE job_id=blocked),'funding hold');
 -- A free or cancelled trip never produces a claim.
 j:=pg_temp.make_job(driver); UPDATE public.jobs SET status='settled' WHERE id=j; INSERT INTO public.job_events VALUES(pid,j,'settle','settled','{}');
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_rewards WHERE job_id=j),'no consumed commission no claim');
 j:=pg_temp.make_job(driver); UPDATE public.jobs SET status='cancelled' WHERE id=j; INSERT INTO public.job_events VALUES(pid,j,'cancel','cancelled','{}');
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_rewards WHERE job_id=j),'cancel no claim');
 -- Before credit, reverse original -> cancellation.
 pending_job:=pg_temp.make_job(driver); t:=pg_temp.settle(pending_job,150,0,true);
 PERFORM pg_temp.reverse_commission(t);
 PERFORM pg_temp.check_true((SELECT state='cancelled' FROM app_private.marketplace_impulsa_rewards WHERE job_id=pending_job),'incident reversal before posting');
 -- After credit, reverse original -> one compensating real ledger debit.
 PERFORM pg_temp.reverse_commission(tx);
 PERFORM pg_temp.check_true((SELECT state='reversal_pending' FROM app_private.marketplace_impulsa_rewards WHERE job_id=fleet_job),'reversal queued');
 PERFORM pg_temp.check_true(app_private.impulsa_process_one()='reversed','worker reverses');
 PERFORM pg_temp.check_true(app_private.marketplace_wallet_total_balance(pid,promoter)=900,'original credit fully reversed');
 PERFORM pg_temp.check_true((SELECT real_delta=-50 AND reversed_ledger_id IS NOT NULL FROM public.wallet_transactions WHERE source_type='impulsa_reward_reversal' AND source_id=fleet_job::text),'reversal provenance');
 -- Policy change must not alter the immutable prior job.
 result:=public.admin_save_marketplace_impulsa_policy_v1(pid,3,.20,.12,.06,true);
 PERFORM pg_temp.check_true((SELECT own_rate=.10 AND commercial_rate=.05 FROM app_private.marketplace_impulsa_job_policy WHERE job_id=own_job),'old snapshots immutable');
 j:=pg_temp.make_job(promoter); PERFORM pg_temp.check_true(app_private.impulsa_effective_rate(pid,j,promoter,.20)=.12,'new percentage only future job');
 result:=public.admin_save_marketplace_impulsa_policy_v1(pid,4,.20,.12,.06,false);
 j:=pg_temp.make_job(driver); PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_job_policy WHERE job_id=j),'disable new snapshots only');
 PERFORM pg_temp.check_true((SELECT count(*)=4 FROM app_private.marketplace_impulsa_policy_history WHERE project_id=pid),'audit history');
 RAISE NOTICE 'Impulsa 15/10/5, authorization, funded real credits, idempotency, reversals and versioning passed';
END $$;
