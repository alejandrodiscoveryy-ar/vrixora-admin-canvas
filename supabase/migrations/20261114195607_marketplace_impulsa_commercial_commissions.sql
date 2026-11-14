-- Install only, never activate or backfill. Candidate tested in disposable PostgreSQL 17.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $install_guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.project_marketplace_financial_settings f JOIN public.projects p ON p.id=f.project_id WHERE p.slug='tuktuk-control' AND f.commission_enabled) THEN
 RAISE EXCEPTION 'IMPULSA_INSTALL_REQUIRES_EXISTING_BILLING_DISABLED';
 END IF;
END $install_guard$;
-- Impulsa commercial commissions, candidate. Install only after isolated and
-- production-shaped validation. No historical jobs or wallet balances are modified.
CREATE TABLE app_private.marketplace_impulsa_policy (
 project_id uuid PRIMARY KEY REFERENCES public.projects(id),
 enabled boolean NOT NULL DEFAULT false,
 general_rate numeric(8,6) NOT NULL DEFAULT .15,
 own_rate numeric(8,6) NOT NULL DEFAULT .10,
 commercial_rate numeric(8,6) NOT NULL DEFAULT .05,
 version bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid,
 CHECK (general_rate>0 AND general_rate<=1 AND own_rate>0 AND own_rate<=general_rate
   AND commercial_rate>=0 AND commercial_rate<=general_rate)
);
CREATE TABLE app_private.marketplace_impulsa_policy_history (
 project_id uuid NOT NULL REFERENCES public.projects(id),
 version bigint NOT NULL, enabled boolean NOT NULL,
 general_rate numeric NOT NULL, own_rate numeric NOT NULL, commercial_rate numeric NOT NULL,
 actor uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,version)
);
CREATE TABLE app_private.marketplace_impulsa_job_policy (
 job_id uuid PRIMARY KEY REFERENCES public.jobs(id),
 project_id uuid NOT NULL REFERENCES public.projects(id),
 promoter_user_id uuid NOT NULL,
 policy_version bigint NOT NULL,
 fare numeric(14,2) NOT NULL CHECK(fare>0),
 general_rate numeric(8,6) NOT NULL,
 own_rate numeric(8,6) NOT NULL,
 commercial_rate numeric(8,6) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (general_rate>0 AND general_rate<=1 AND own_rate>0 AND own_rate<=general_rate
   AND commercial_rate>=0 AND commercial_rate<=general_rate)
);
CREATE INDEX marketplace_impulsa_job_policy_promoter_idx ON app_private.marketplace_impulsa_job_policy(project_id,promoter_user_id,created_at DESC);
CREATE TABLE app_private.marketplace_impulsa_rewards (
 job_id uuid PRIMARY KEY REFERENCES app_private.marketplace_impulsa_job_policy(job_id),
 project_id uuid NOT NULL REFERENCES public.projects(id),
 promoter_user_id uuid NOT NULL,
 transport_driver_user_id uuid NOT NULL,
 commission_ledger_id uuid NOT NULL REFERENCES public.wallet_transactions(id),
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 funded_real_amount numeric(14,2) NOT NULL CHECK(funded_real_amount>=0),
 state text NOT NULL CHECK(state IN ('pending','funding_required','credited','cancelled','reversal_pending','reversed')),
 credit_ledger_id uuid UNIQUE REFERENCES public.wallet_transactions(id),
 reversal_ledger_id uuid UNIQUE REFERENCES public.wallet_transactions(id),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(promoter_user_id<>transport_driver_user_id),
 CHECK ((state IN ('credited','reversal_pending','reversed'))=(credit_ledger_id IS NOT NULL)),
 CHECK ((state='reversed')=(reversal_ledger_id IS NOT NULL))
);
CREATE INDEX marketplace_impulsa_rewards_queue_idx ON app_private.marketplace_impulsa_rewards(next_attempt_at,created_at) WHERE state IN ('pending','reversal_pending');
CREATE INDEX marketplace_impulsa_rewards_promoter_idx ON app_private.marketplace_impulsa_rewards(project_id,promoter_user_id,created_at DESC);
ALTER TABLE app_private.marketplace_impulsa_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.marketplace_impulsa_policy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.marketplace_impulsa_job_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.marketplace_impulsa_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.marketplace_impulsa_policy,app_private.marketplace_impulsa_policy_history,app_private.marketplace_impulsa_job_policy,app_private.marketplace_impulsa_rewards FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO app_private.marketplace_impulsa_policy(project_id)
SELECT id FROM public.projects WHERE slug='tuktuk-control';

-- Settings save is not a switch for the existing global collection policy.
-- Draft rates can be saved while billing is disabled; activating Impulsa
-- requires the global switch already on and updates the general rate atomically.
CREATE FUNCTION public.admin_get_marketplace_impulsa_policy_v1(target_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p app_private.marketplace_impulsa_policy%ROWTYPE; f public.project_marketplace_financial_settings%ROWTYPE;
BEGIN
 PERFORM app_private.require_project_permission(target_project_id,'settings.view');
 SELECT * INTO p FROM app_private.marketplace_impulsa_policy WHERE project_id=target_project_id;
 SELECT * INTO f FROM public.project_marketplace_financial_settings WHERE project_id=target_project_id;
 IF p.project_id IS NULL OR f.project_id IS NULL THEN RAISE EXCEPTION 'IMPULSA_POLICY_NOT_FOUND'; END IF;
 RETURN jsonb_build_object('enabled',p.enabled,'general_rate',p.general_rate,'own_rate',p.own_rate,
 'commercial_rate',p.commercial_rate,'version',p.version,'updated_at',p.updated_at,
 'billing_enabled',f.commission_enabled,'live_general_rate',f.commission_rate);
END $$;

CREATE FUNCTION public.admin_save_marketplace_impulsa_policy_v1(target_project_id uuid,target_expected_version bigint,
 target_general_rate numeric,target_own_rate numeric,target_commercial_rate numeric,target_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; p app_private.marketplace_impulsa_policy%ROWTYPE; f public.project_marketplace_financial_settings%ROWTYPE;
BEGIN
 actor:=app_private.require_project_permission(target_project_id,'settings.manage');
 PERFORM app_private.require_project_permission(target_project_id,'commercial.manage');
 PERFORM app_private.require_project_permission(target_project_id,'payments.manage');
 IF target_expected_version IS NULL OR target_enabled IS NULL OR target_general_rate IS NULL OR target_own_rate IS NULL OR target_commercial_rate IS NULL
 OR target_general_rate<=0 OR target_general_rate>1 OR target_own_rate<=0 OR target_own_rate>target_general_rate
 OR target_commercial_rate<0 OR target_commercial_rate>target_general_rate
 OR target_general_rate<>round(target_general_rate,6) OR target_own_rate<>round(target_own_rate,6)
 OR target_commercial_rate<>round(target_commercial_rate,6) THEN RAISE EXCEPTION 'IMPULSA_INVALID_RATES' USING ERRCODE='22023'; END IF;
 SELECT * INTO f FROM public.project_marketplace_financial_settings WHERE project_id=target_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'; END IF;
 SELECT * INTO p FROM app_private.marketplace_impulsa_policy WHERE project_id=target_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'IMPULSA_POLICY_NOT_FOUND'; END IF;
 IF p.version<>target_expected_version THEN RAISE EXCEPTION 'IMPULSA_POLICY_CHANGED' USING ERRCODE='40001'; END IF;
 IF target_enabled AND NOT f.commission_enabled THEN RAISE EXCEPTION 'IMPULSA_BILLING_DISABLED' USING ERRCODE='22023'; END IF;
 UPDATE app_private.marketplace_impulsa_policy SET general_rate=target_general_rate, own_rate=target_own_rate,
 commercial_rate=target_commercial_rate, enabled=target_enabled, version=version+1, updated_at=now(),updated_by=actor
 WHERE project_id=target_project_id RETURNING * INTO p;
 IF target_enabled AND f.commission_rate IS DISTINCT FROM p.general_rate THEN
   UPDATE public.project_marketplace_financial_settings SET commission_rate=p.general_rate,updated_at=now(),updated_by=actor WHERE project_id=target_project_id;
 END IF;
 INSERT INTO app_private.marketplace_impulsa_policy_history(project_id,version,enabled,general_rate,own_rate,commercial_rate,actor)
 VALUES(p.project_id,p.version,p.enabled,p.general_rate,p.own_rate,p.commercial_rate,actor);
 RETURN public.admin_get_marketplace_impulsa_policy_v1(target_project_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_get_marketplace_impulsa_policy_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_save_marketplace_impulsa_policy_v1(uuid,bigint,numeric,numeric,numeric,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_marketplace_impulsa_policy_v1(uuid), public.admin_save_marketplace_impulsa_policy_v1(uuid,bigint,numeric,numeric,numeric,boolean) TO authenticated;

-- Prevent a different configuration screen from silently changing the general
-- percentage while an enabled Impulsa policy requires a coherent split.
CREATE FUNCTION app_private.impulsa_guard_general_rate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate AND EXISTS(
 SELECT 1 FROM app_private.marketplace_impulsa_policy p WHERE p.project_id=NEW.project_id AND p.enabled AND p.general_rate<>NEW.commission_rate)
 THEN RAISE EXCEPTION 'IMPULSA_CHANGE_GENERAL_RATE_IN_POLICY' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.impulsa_guard_general_rate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER impulsa_guard_general_rate BEFORE UPDATE OF commission_rate ON public.project_marketplace_financial_settings
 FOR EACH ROW EXECUTE FUNCTION app_private.impulsa_guard_general_rate();

-- At publication freeze the three rates with the real attributed job. The
-- general jobs pricing snapshot stays immutable; no previous jobs are backfilled.
CREATE FUNCTION app_private.impulsa_snapshot_on_publish() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.status<>'requested' OR NEW.status<>'published' OR NEW.is_test OR NEW.test_deleted_at IS NOT NULL
 OR NEW.currency<>'CUP' OR NEW.final_price<=0 THEN RETURN NEW; END IF;
 INSERT INTO app_private.marketplace_impulsa_job_policy(job_id,project_id,promoter_user_id,policy_version,fare,general_rate,own_rate,commercial_rate)
 SELECT NEW.id,NEW.project_id,a.driver_user_id,p.version,NEW.final_price,NEW.commission_rate_snapshot,p.own_rate,p.commercial_rate
 FROM app_private.marketplace_driver_promo_attribution a
 JOIN app_private.marketplace_driver_promo_profiles pr ON pr.project_id=a.project_id AND pr.driver_user_id=a.driver_user_id AND pr.code=a.source_code
 JOIN app_private.marketplace_driver_identity_reviews iv ON iv.project_id=a.project_id AND iv.driver_user_id=a.driver_user_id AND iv.verified_at IS NOT NULL AND iv.revoked_at IS NULL
 JOIN app_private.marketplace_driver_promo_settings ps ON ps.project_id=a.project_id AND ps.profiles_enabled
 JOIN app_private.marketplace_impulsa_policy p ON p.project_id=a.project_id AND p.enabled
 JOIN public.project_marketplace_financial_settings f ON f.project_id=a.project_id AND f.commission_enabled
 WHERE a.job_id=NEW.id AND a.project_id=NEW.project_id AND a.service_request_id=NEW.service_request_id
 AND pr.consented_at IS NOT NULL AND pr.revoked_at IS NULL
 AND NEW.commission_rate_snapshot=p.general_rate
 AND p.own_rate<=NEW.commission_rate_snapshot AND p.commercial_rate<=NEW.commission_rate_snapshot
 ON CONFLICT(job_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.impulsa_snapshot_on_publish() FROM PUBLIC,anon,authenticated,service_role;
-- Sorts BEFORE aa_marketplace_promo_on_publish, which checks preferred driver's balance.
CREATE TRIGGER a0_impulsa_snapshot_on_publish AFTER UPDATE OF status ON public.jobs
 FOR EACH ROW EXECUTE FUNCTION app_private.impulsa_snapshot_on_publish();

CREATE FUNCTION app_private.impulsa_effective_rate(target_project_id uuid,target_job_id uuid,target_driver_user_id uuid,target_general_rate numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT s.own_rate FROM app_private.marketplace_impulsa_job_policy s
 WHERE s.project_id=target_project_id AND s.job_id=target_job_id AND s.promoter_user_id=target_driver_user_id
 AND s.general_rate=target_general_rate),target_general_rate)
$$;
REVOKE ALL ON FUNCTION app_private.impulsa_effective_rate(uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;

-- A settled or incident-completed job must have a consumed, genuine wallet
-- commission before the 5% commercial claim can be queued. No reward for
-- self-operated, free, test, cancelled or already-reversed services.
CREATE FUNCTION app_private.impulsa_enqueue_reward() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (NEW.action='settle' AND NEW.to_status='settled' OR
   NEW.action='incident_resolved' AND NEW.metadata->>'resolution'='completed') THEN RETURN NEW; END IF;
 INSERT INTO app_private.marketplace_impulsa_rewards(job_id,project_id,promoter_user_id,transport_driver_user_id,commission_ledger_id,amount,funded_real_amount,state)
 SELECT s.job_id,s.project_id,s.promoter_user_id,j.assigned_driver_user_id,t.id,
 round(s.fare*s.commercial_rate,2),-t.real_delta,
 CASE WHEN -t.real_delta>=round(s.fare*s.commercial_rate,2) THEN 'pending' ELSE 'funding_required' END
 FROM app_private.marketplace_impulsa_job_policy s JOIN public.jobs j ON j.project_id=s.project_id AND j.id=s.job_id
 JOIN public.commission_reservations r ON r.project_id=j.project_id AND r.job_id=j.id AND r.status='consumed' AND r.user_id=j.assigned_driver_user_id
 JOIN public.wallet_transactions t ON t.project_id=r.project_id AND t.id=r.ledger_transaction_id AND t.user_id=r.user_id
 WHERE s.job_id=NEW.job_id AND s.project_id=NEW.project_id AND NOT j.is_test AND j.test_deleted_at IS NULL
 AND j.assigned_driver_user_id<>s.promoter_user_id AND s.fare=j.final_price AND r.commission_rate_snapshot=s.general_rate
 AND r.amount=round(s.fare*s.general_rate,2) AND t.transaction_type='commission' AND t.source_type='job_commission'
 AND t.source_id=j.id::text AND t.amount_delta=-r.amount AND t.currency='CUP'
 AND round(s.fare*s.commercial_rate,2)>0
 AND (j.status='settled' OR EXISTS(SELECT 1 FROM public.marketplace_incident_resolutions ir WHERE ir.project_id=j.project_id AND ir.job_id=j.id AND ir.resolution='completed'))
 AND NOT EXISTS(SELECT 1 FROM public.wallet_transactions rev WHERE rev.project_id=t.project_id AND rev.reversed_ledger_id=t.id)
 ON CONFLICT(job_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.impulsa_enqueue_reward() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER marketplace_impulsa_enqueue_reward AFTER INSERT ON public.job_events FOR EACH ROW EXECUTE FUNCTION app_private.impulsa_enqueue_reward();

-- Separate, auditable real-money ledger classification. Called only by the
-- existing wallet classifier, after locking the wallet and checking balances.
CREATE FUNCTION app_private.impulsa_validate_wallet_entry(t public.wallet_transactions, available_real numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q app_private.marketplace_impulsa_rewards%ROWTYPE; original public.wallet_transactions%ROWTYPE;
BEGIN
 SELECT * INTO q FROM app_private.marketplace_impulsa_rewards WHERE job_id::text=t.source_id AND project_id=t.project_id;
 IF NOT FOUND OR t.user_id<>q.promoter_user_id OR t.currency<>'CUP' THEN RAISE EXCEPTION 'IMPULSA_REWARD_INVALID' USING ERRCODE='22023'; END IF;
 IF t.transaction_type='impulsa_credit' THEN
   IF q.state<>'pending' OR q.credit_ledger_id IS NOT NULL OR t.source_type<>'impulsa_reward' OR t.amount_delta<>q.amount
   OR q.funded_real_amount<q.amount OR t.metadata->>'commission_ledger_id' IS DISTINCT FROM q.commission_ledger_id::text
   OR NOT EXISTS(SELECT 1 FROM public.wallet_transactions d WHERE d.id=q.commission_ledger_id AND d.project_id=q.project_id AND d.user_id=q.transport_driver_user_id
     AND d.transaction_type='commission' AND d.source_type='job_commission' AND d.source_id=q.job_id::text AND -d.real_delta>=q.amount)
   OR EXISTS(SELECT 1 FROM public.wallet_transactions rev WHERE rev.project_id=q.project_id AND rev.reversed_ledger_id=q.commission_ledger_id)
   THEN RAISE EXCEPTION 'IMPULSA_CREDIT_NOT_FUNDED' USING ERRCODE='22023'; END IF;
 ELSIF t.transaction_type='impulsa_reversal' THEN
   SELECT * INTO original FROM public.wallet_transactions WHERE id=q.credit_ledger_id AND project_id=q.project_id AND user_id=q.promoter_user_id;
   IF NOT FOUND OR q.state<>'reversal_pending' OR q.reversal_ledger_id IS NOT NULL OR t.source_type<>'impulsa_reward_reversal'
   OR t.amount_delta<>-q.amount OR original.transaction_type<>'impulsa_credit' OR original.amount_delta<>q.amount
   OR t.metadata->>'original_ledger_transaction_id' IS DISTINCT FROM original.id::text OR available_real<q.amount
   OR NOT EXISTS(SELECT 1 FROM public.wallet_transactions rev WHERE rev.project_id=q.project_id AND rev.reversed_ledger_id=q.commission_ledger_id)
   THEN RAISE EXCEPTION 'IMPULSA_REVERSAL_INVALID' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION 'IMPULSA_ENTRY_TYPE_INVALID'; END IF;
END $$;
REVOKE ALL ON FUNCTION app_private.impulsa_validate_wallet_entry(public.wallet_transactions,numeric) FROM PUBLIC,anon,authenticated,service_role;

-- A real commission reversal invalidates an unposted reward or queues a
-- clawback. Never take reserved money or make the wallet balance negative.
CREATE FUNCTION app_private.impulsa_on_commission_reversal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.transaction_type='reversal' AND NEW.source_type='job_commission_reversal' AND NEW.reversed_ledger_id IS NOT NULL THEN
 UPDATE app_private.marketplace_impulsa_rewards SET
 state=CASE WHEN state='credited' THEN 'reversal_pending' ELSE 'cancelled' END,
 next_attempt_at=now(),updated_at=now()
 WHERE project_id=NEW.project_id AND commission_ledger_id=NEW.reversed_ledger_id AND state IN ('credited','pending','funding_required');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.impulsa_on_commission_reversal() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER marketplace_impulsa_on_commission_reversal AFTER INSERT ON public.wallet_transactions
 FOR EACH ROW EXECUTE FUNCTION app_private.impulsa_on_commission_reversal();

-- One reward per transaction. The source job lock serializes settlement and
-- reversals. No second wallet is locked by the transport driver's settlement.
-- Unique source/type and reward PK make replays safe.
CREATE FUNCTION app_private.impulsa_process_one() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job uuid; q app_private.marketplace_impulsa_rewards%ROWTYPE; prior numeric; free_real numeric; tx uuid;
BEGIN
 SELECT j.id INTO job FROM app_private.marketplace_impulsa_rewards r JOIN public.jobs j ON j.id=r.job_id AND j.project_id=r.project_id
 WHERE r.state IN ('pending','reversal_pending') AND r.next_attempt_at<=now()
 ORDER BY r.next_attempt_at,r.created_at,r.job_id LIMIT 1 FOR UPDATE OF j SKIP LOCKED;
 IF job IS NULL THEN RETURN 'empty'; END IF;
 SELECT * INTO q FROM app_private.marketplace_impulsa_rewards WHERE job_id=job FOR UPDATE;
 IF q.state NOT IN ('pending','reversal_pending') THEN RETURN 'skipped'; END IF;
 IF q.state='pending' AND EXISTS(SELECT 1 FROM public.wallet_transactions t WHERE t.project_id=q.project_id AND t.reversed_ledger_id=q.commission_ledger_id) THEN
 UPDATE app_private.marketplace_impulsa_rewards SET state='cancelled',updated_at=now() WHERE job_id=job; RETURN 'cancelled'; END IF;
 INSERT INTO public.wallets(project_id,user_id,currency) VALUES(q.project_id,q.promoter_user_id,'CUP') ON CONFLICT(project_id,user_id) DO NOTHING;
 PERFORM 1 FROM public.wallets WHERE project_id=q.project_id AND user_id=q.promoter_user_id FOR UPDATE;
 prior:=app_private.marketplace_wallet_total_balance(q.project_id,q.promoter_user_id);
 IF q.state='pending' THEN
  INSERT INTO public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,metadata)
  VALUES(q.project_id,q.promoter_user_id,'CUP','impulsa_credit',q.amount,prior+q.amount,'impulsa_reward',q.job_id::text,gen_random_uuid(),
   jsonb_build_object('commission_ledger_id',q.commission_ledger_id,'program','impulsa')) RETURNING id INTO tx;
  UPDATE app_private.marketplace_impulsa_rewards SET state='credited',credit_ledger_id=tx,updated_at=now() WHERE job_id=job;
  RETURN 'credited';
 END IF;
 SELECT b.real_available_balance INTO free_real FROM app_private.marketplace_wallet_source_balances(q.project_id,q.promoter_user_id) b;
 IF free_real IS NULL OR free_real<q.amount THEN
  UPDATE app_private.marketplace_impulsa_rewards SET next_attempt_at=now()+interval '5 minutes',updated_at=now() WHERE job_id=job; RETURN 'reversal_waiting_balance';
 END IF;
 INSERT INTO public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,metadata)
 VALUES(q.project_id,q.promoter_user_id,'CUP','impulsa_reversal',-q.amount,prior-q.amount,'impulsa_reward_reversal',q.job_id::text,gen_random_uuid(),
  jsonb_build_object('original_ledger_transaction_id',q.credit_ledger_id,'program','impulsa')) RETURNING id INTO tx;
 UPDATE app_private.marketplace_impulsa_rewards SET state='reversed',reversal_ledger_id=tx,updated_at=now() WHERE job_id=job;
 RETURN 'reversed';
END $$;
REVOKE ALL ON FUNCTION app_private.impulsa_process_one() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.impulsa_summary(target_project_id uuid,target_driver_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'generated_jobs',(SELECT count(*) FROM app_private.marketplace_driver_promo_attribution a JOIN public.jobs j ON j.id=a.job_id AND j.project_id=a.project_id WHERE a.project_id=target_project_id AND a.driver_user_id=target_driver_user_id AND NOT j.is_test AND j.test_deleted_at IS NULL),
 'own_paid_jobs',coalesce((SELECT count(*) FROM app_private.marketplace_impulsa_job_policy s JOIN public.commission_reservations r ON r.project_id=s.project_id AND r.job_id=s.job_id AND r.user_id=s.promoter_user_id AND r.status='consumed'
 JOIN public.jobs j ON j.id=s.job_id AND j.project_id=s.project_id WHERE s.project_id=target_project_id AND s.promoter_user_id=target_driver_user_id AND (j.status='settled' OR EXISTS(SELECT 1 FROM public.marketplace_incident_resolutions i WHERE i.project_id=j.project_id AND i.job_id=j.id AND i.resolution='completed'))
 AND NOT EXISTS(SELECT 1 FROM public.wallet_transactions rev WHERE rev.project_id=r.project_id AND rev.reversed_ledger_id=r.ledger_transaction_id)),0),
 'own_savings_cup',coalesce((SELECT sum(round(s.fare*s.general_rate,2)-r.amount) FROM app_private.marketplace_impulsa_job_policy s JOIN public.commission_reservations r ON r.project_id=s.project_id AND r.job_id=s.job_id AND r.user_id=s.promoter_user_id AND r.status='consumed'
 JOIN public.jobs j ON j.id=s.job_id AND j.project_id=s.project_id WHERE s.project_id=target_project_id AND s.promoter_user_id=target_driver_user_id AND (j.status='settled' OR EXISTS(SELECT 1 FROM public.marketplace_incident_resolutions i WHERE i.project_id=j.project_id AND i.job_id=j.id AND i.resolution='completed'))
 AND NOT EXISTS(SELECT 1 FROM public.wallet_transactions rev WHERE rev.project_id=r.project_id AND rev.reversed_ledger_id=r.ledger_transaction_id)),0),
 'fleet_credited_jobs',(SELECT count(*) FROM app_private.marketplace_impulsa_rewards q WHERE q.project_id=target_project_id AND q.promoter_user_id=target_driver_user_id AND q.state='credited'),
 'credited_cup',coalesce((SELECT sum(q.amount) FROM app_private.marketplace_impulsa_rewards q WHERE q.project_id=target_project_id AND q.promoter_user_id=target_driver_user_id AND q.state IN ('credited','reversal_pending')),0),
 'pending_cup',coalesce((SELECT sum(q.amount) FROM app_private.marketplace_impulsa_rewards q WHERE q.project_id=target_project_id AND q.promoter_user_id=target_driver_user_id AND q.state='pending'),0),
 'funding_required_cup',coalesce((SELECT sum(q.amount) FROM app_private.marketplace_impulsa_rewards q WHERE q.project_id=target_project_id AND q.promoter_user_id=target_driver_user_id AND q.state='funding_required'),0),
 'reversal_pending_cup',coalesce((SELECT sum(q.amount) FROM app_private.marketplace_impulsa_rewards q WHERE q.project_id=target_project_id AND q.promoter_user_id=target_driver_user_id AND q.state='reversal_pending'),0),
 'recent',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM
 (SELECT q.job_id,q.amount,q.state,q.created_at,q.updated_at,s.commercial_rate FROM app_private.marketplace_impulsa_rewards q JOIN app_private.marketplace_impulsa_job_policy s ON s.job_id=q.job_id
 WHERE q.project_id=target_project_id AND q.promoter_user_id=target_driver_user_id ORDER BY q.created_at DESC LIMIT 20) x),'[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION app_private.impulsa_summary(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.admin_get_marketplace_impulsa_summary_v1(target_project_id uuid,target_driver_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app_private.require_project_permission(target_project_id,'marketplace.view');
 PERFORM app_private.require_project_permission(target_project_id,'payments.view');
 RETURN app_private.impulsa_summary(target_project_id,target_driver_user_id);
END $$;
CREATE FUNCTION public.get_my_marketplace_impulsa_summary_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); pid uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT id INTO pid FROM public.projects WHERE slug='tuktuk-control';
 RETURN app_private.impulsa_summary(pid,actor);
END $$;
REVOKE ALL ON FUNCTION public.admin_get_marketplace_impulsa_summary_v1(uuid,uuid),public.get_my_marketplace_impulsa_summary_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_marketplace_impulsa_summary_v1(uuid,uuid),public.get_my_marketplace_impulsa_summary_v1() TO authenticated;

-- Production-shaped adapter. Drift checks are mandatory before application.
-- The original functions are preserved except for precisely scoped financial hooks.
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.accept_job(uuid,text,uuid)'::regprocedure)) <> '80e555daa0c1c30358f470b4bdf32d7d' THEN RAISE EXCEPTION 'IMPULSA_BASE_DRIFT_accept_job'; END IF;
 IF md5(pg_get_functiondef('app_private.finish_marketplace_job_core(uuid,text,uuid,uuid,text,uuid)'::regprocedure)) <> 'ccfbd9e4f0ff94fd3ff9d454be78ad1a' THEN RAISE EXCEPTION 'IMPULSA_BASE_DRIFT_finish_marketplace_job_core'; END IF;
 IF md5(pg_get_functiondef('app_private.marketplace_promo_preferred_eligible(uuid,uuid,text)'::regprocedure)) <> '0772354ccd361b67d02e6388f2d460d4' THEN RAISE EXCEPTION 'IMPULSA_BASE_DRIFT_marketplace_promo_preferred_eligible'; END IF;
 IF md5(pg_get_functiondef('app_private.marketplace_classify_wallet_transaction()'::regprocedure)) <> '9631cdabf6ae0539a7690045b3aeec61' THEN RAISE EXCEPTION 'IMPULSA_BASE_DRIFT_marketplace_classify_wallet_transaction'; END IF;
 IF md5(pg_get_functiondef('public.list_my_marketplace_available_jobs(text,integer,timestamp with time zone,uuid)'::regprocedure)) <> '1b58e5f0b40d9e527ceee58a9ee06260' THEN RAISE EXCEPTION 'IMPULSA_BASE_DRIFT_list_my_marketplace_available_jobs'; END IF;
END $guard$;

-- The source classifier remains the single writer of real/promotional deltas.
-- Replace only the two enumerated checks to support the new transaction types.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check CHECK(transaction_type IN ('topup','commission','adjustment','reversal','referral_credit','topup_reversal','impulsa_credit','impulsa_reversal'));
ALTER TABLE public.wallet_transactions DROP CONSTRAINT wallet_transactions_source_sign_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_source_sign_check CHECK(
 (transaction_type='topup' AND real_delta>0 AND promotional_delta=0 AND reversed_ledger_id IS NULL)
 OR (transaction_type='referral_credit' AND real_delta=0 AND promotional_delta>0 AND reversed_ledger_id IS NULL)
 OR (transaction_type='commission' AND real_delta<=0 AND promotional_delta<=0 AND reversed_ledger_id IS NULL)
 OR (transaction_type='reversal' AND real_delta>=0 AND promotional_delta>=0 AND reversed_ledger_id IS NOT NULL)
 OR (transaction_type='topup_reversal' AND real_delta<0 AND promotional_delta=0 AND reversed_ledger_id IS NOT NULL)
 OR (transaction_type='impulsa_credit' AND real_delta>0 AND promotional_delta=0 AND reversed_ledger_id IS NULL)
 OR (transaction_type='impulsa_reversal' AND real_delta<0 AND promotional_delta=0 AND reversed_ledger_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.accept_job(target_job_id uuid, target_vehicle_id text, target_idempotency_key uuid)
 RETURNS jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid:=auth.uid();
  pid uuid;
  j public.jobs%rowtype;
  e public.job_events%rowtype;
  a public.driver_vehicle_assignments%rowtype;
  t public.marketplace_work_trials%rowtype;
  trial_active boolean;
  force_test_commission boolean;
  commission_charge_enabled boolean;
  amount numeric(14,2);
  effective_rate numeric;
  reservation_id uuid;
  total numeric;
  reserved numeric;
  wallet_currency text;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;

  select id into pid from public.projects where slug='tuktuk-control';
  select s.commission_enabled into commission_charge_enabled
    from public.project_marketplace_financial_settings s
    where s.project_id=pid for share;
  if commission_charge_enabled is null then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'; end if;
  select * into j from public.jobs where project_id=pid and id=target_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if j.test_deleted_at is not null then raise exception 'JOB_NOT_AVAILABLE'; end if;
  if j.is_test and not app_private.marketplace_test_job_targets_driver(pid,j.id,actor) then raise exception 'JOB_NOT_AVAILABLE'; end if;

  select * into e
  from public.job_events
  where project_id=pid and operation_idempotency_key=target_idempotency_key;

  if found then
    if e.job_id=j.id and e.actor_user_id=actor and e.action='accept'
       and (
         (e.metadata->>'billing_mode'='trial_free'
          and exists(
            select 1 from public.job_assignments x
            where x.project_id=pid and x.job_id=j.id
              and x.driver_user_id=actor and x.vehicle_id=target_vehicle_id
              and x.acceptance_idempotency_key=target_idempotency_key
              and x.billing_mode='trial_free' and x.commission_amount_snapshot=0
          )
          and not exists(select 1 from public.commission_reservations r where r.project_id=pid and r.job_id=j.id))
         or
         (e.metadata->>'billing_mode'='platform_free'
          and exists(select 1 from public.job_assignments x
            where x.project_id=pid and x.job_id=j.id and x.driver_user_id=actor
              and x.vehicle_id=target_vehicle_id
              and x.acceptance_idempotency_key=target_idempotency_key
              and x.billing_mode='platform_free' and x.commission_amount_snapshot=0)
          and not exists(select 1 from public.commission_reservations r
            where r.project_id=pid and r.job_id=j.id))
         or
         (e.metadata->>'billing_mode'='wallet_commission'
          and exists(
            select 1
            from public.job_assignments x
            join public.commission_reservations r
              on r.project_id=x.project_id and r.job_id=x.job_id
             and r.user_id=actor and r.amount=x.commission_amount_snapshot
            where x.project_id=pid and x.job_id=j.id
              and x.driver_user_id=actor and x.vehicle_id=target_vehicle_id
              and x.acceptance_idempotency_key=target_idempotency_key
              and x.billing_mode='wallet_commission'
          ))
       )
    then return j; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION';
  end if;

  if j.status<>'published'
     or not app_private.marketplace_job_transition_allowed('published','accepted','driver')
     or (j.expires_at is not null and j.expires_at<=now())
     or j.assigned_driver_user_id is not null
     or j.assigned_vehicle_id is not null
  then
    raise exception 'JOB_NOT_AVAILABLE';
  end if;

  force_test_commission:=j.is_test and j.test_force_wallet_commission and app_private.marketplace_test_job_targets_driver(pid,j.id,actor);
  trial_active:=app_private.has_active_marketplace_work_trial(actor) and not force_test_commission and not (j.is_test and not j.test_force_wallet_commission);

  if not exists(
    select 1 from public.driver_profiles d
    where d.project_id=pid and d.user_id=actor
      and d.status='active' and d.activated_at is not null and d.suspended_at is null
  ) then raise exception 'DRIVER_NOT_ACTIVE'; end if;

  if not app_private.marketplace_onboarding_requirements_complete(actor,target_vehicle_id) then
    raise exception 'MARKETPLACE_ONBOARDING_INCOMPLETE' using errcode='22023';
  end if;

  select * into a
  from public.driver_vehicle_assignments
  where project_id=pid and driver_user_id=actor and vehicle_id=target_vehicle_id
  for update;

  if not found or not a.is_active or not a.is_available then
    raise exception 'VEHICLE_ASSIGNMENT_NOT_AVAILABLE';
  end if;

  if not exists(
    select 1
    from public.vehicles v
    join public.service_requests r
      on r.project_id=j.project_id and r.id=j.service_request_id
    where v.project_id=pid and v.id=target_vehicle_id
      and v.deleted_at is null and v.marketplace_status='active'
      and (
        coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code) is null
        or v.category_code=coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code)
      )
      and (r.passenger_count is null or v.passenger_capacity>=r.passenger_count)
      and (r.cargo_weight_kg is null or v.cargo_capacity_kg>=r.cargo_weight_kg)
      and (r.cargo_volume_m3 is null or v.cargo_volume_m3>=r.cargo_volume_m3)
      and (r.cargo_length_cm is null or v.cargo_length_cm>=r.cargo_length_cm)
      and (r.cargo_width_cm is null or v.cargo_width_cm>=r.cargo_width_cm)
      and (r.cargo_height_cm is null or v.cargo_height_cm>=r.cargo_height_cm)
      and (r.required_body_type is null or lower(btrim(v.body_type))=lower(btrim(r.required_body_type)))
  ) then raise exception 'VEHICLE_INCOMPATIBLE_WITH_SERVICE_REQUEST'; end if;

  if not exists(
    select 1 from public.vehicle_services s
    where s.project_id=pid and s.vehicle_id=target_vehicle_id
      and s.service_code=j.service_code and s.enabled
  ) then raise exception 'VEHICLE_SERVICE_NOT_ENABLED'; end if;

  if j.is_test and not j.test_force_wallet_commission then
    insert into public.job_assignments(
      project_id,job_id,driver_user_id,vehicle_id,acceptance_idempotency_key,
      billing_mode,commission_amount_snapshot
    ) values(pid,j.id,actor,target_vehicle_id,target_idempotency_key,'platform_free',0);
  elsif trial_active then
    select * into t from public.marketplace_work_trials where project_id=pid and user_id=actor;
    insert into public.job_assignments(
      project_id,job_id,driver_user_id,vehicle_id,acceptance_idempotency_key,
      billing_mode,commission_amount_snapshot,trial_started_at_snapshot,trial_ends_at_snapshot
    )
    values(
      pid,j.id,actor,target_vehicle_id,target_idempotency_key,
      'trial_free',0,t.started_at,t.ends_at
    );
  elsif commission_charge_enabled is false then
    insert into public.job_assignments(
      project_id,job_id,driver_user_id,vehicle_id,acceptance_idempotency_key,
      billing_mode,commission_amount_snapshot
    ) values(pid,j.id,actor,target_vehicle_id,target_idempotency_key,'platform_free',0);
  else
    select f.wallet_currency into wallet_currency
    from public.project_marketplace_financial_settings f
    where f.project_id=pid;

    insert into public.wallets(project_id,user_id,currency)
    values(pid,actor,wallet_currency)
    on conflict (project_id,user_id) do nothing;

    perform 1 from public.wallets where project_id=pid and user_id=actor for update;

    effective_rate:=app_private.impulsa_effective_rate(pid,j.id,actor,j.commission_rate_snapshot);
    amount:=round(j.final_price*effective_rate,2);
    if amount<=0 then raise exception 'INVALID_COMMISSION_AMOUNT'; end if;

    total:=app_private.marketplace_wallet_total_balance(pid,actor);
    reserved:=app_private.marketplace_wallet_reserved_balance(pid,actor);

    if total-reserved<amount then
      raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE' using errcode='22023';
    end if;

    insert into public.job_assignments(
      project_id,job_id,driver_user_id,vehicle_id,acceptance_idempotency_key,
      billing_mode,commission_amount_snapshot
    )
    values(
      pid,j.id,actor,target_vehicle_id,target_idempotency_key,
      'wallet_commission',amount
    );

    insert into public.commission_reservations(
      project_id,job_id,user_id,final_price_snapshot,commission_rate_snapshot,amount
    )
    values(pid,j.id,actor,j.final_price,effective_rate,amount)
    returning id into reservation_id;
  end if;

  update public.jobs
  set status='accepted',
      assigned_driver_user_id=actor,
      assigned_vehicle_id=target_vehicle_id,
      state_version=state_version+1
  where project_id=pid and id=j.id
  returning * into j;

  update public.driver_vehicle_assignments
  set is_available=false
  where project_id=pid and driver_user_id=actor and vehicle_id=target_vehicle_id;

  insert into public.job_events(
    project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,
    operation_idempotency_key,metadata
  )
  values(
    pid,j.id,'published','accepted','accept','driver',actor,target_idempotency_key,
    jsonb_build_object(
      'vehicle_id',target_vehicle_id,
      'billing_mode',case when trial_active then 'trial_free'
                          when j.is_test and not j.test_force_wallet_commission then 'platform_free'
                          when not commission_charge_enabled then 'platform_free'
                          else 'wallet_commission' end,
      'commission_amount',coalesce(amount,0),
      'trial_ends_at',case when trial_active then t.ends_at else null end,
      'reservation_id',reservation_id,
      'test_mode',j.is_test
    )
  );

  return j;
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.finish_marketplace_job_core(target_job_id uuid, target_actor_kind text, target_actor_user_id uuid, target_customer_id uuid, target_reason text, target_idempotency_key uuid)
 RETURNS jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pid uuid;
  j public.jobs%rowtype;
  a public.job_assignments%rowtype;
  w public.wallets%rowtype;
  r public.commission_reservations%rowtype;
  prior_event public.job_events%rowtype;
  original_status text;
  prior_balance numeric;
  ledger_id uuid;
  clean_reason text := nullif(btrim(target_reason), '');
begin
  if target_job_id is null then
    raise exception 'JOB_ID_REQUIRED' using errcode='22023';
  end if;
  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;
  if target_actor_kind is null or target_actor_kind not in ('driver','customer','admin') then
    raise exception 'INVALID_FINISH_ACTOR' using errcode='42501';
  end if;
  if target_actor_kind='admin' and clean_reason is null then
    raise exception 'ADMIN_FINISH_REASON_REQUIRED' using errcode='22023';
  end if;
  if clean_reason is not null and char_length(clean_reason)>1000 then
    raise exception 'FINISH_REASON_TOO_LONG' using errcode='22023';
  end if;
  if (target_actor_kind='customer') <> (target_customer_id is not null) then
    raise exception 'INVALID_CUSTOMER_FINISH_IDENTITY' using errcode='42501';
  end if;
  if (target_actor_kind='customer') = (target_actor_user_id is not null) then
    raise exception 'INVALID_FINISH_IDENTITY' using errcode='42501';
  end if;

  select id into pid from public.projects where slug='tuktuk-control';
  if pid is null then
    raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode='P0002';
  end if;

  -- Lock the job first: driver/customer/admin attempts serialize here.
  select * into j from public.jobs
   where project_id=pid and id=target_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if;
  if j.test_deleted_at is not null then
    raise exception 'JOB_NOT_AVAILABLE' using errcode='22023';
  end if;

  if target_actor_kind='driver' then
    if j.assigned_driver_user_id is distinct from target_actor_user_id then
      raise exception 'JOB_NOT_ASSIGNED_TO_ACTOR' using errcode='42501';
    end if;
  elsif target_actor_kind='customer' then
    if not exists (
      select 1 from public.service_requests sr
       where sr.project_id=j.project_id
         and sr.id=j.service_request_id
         and sr.customer_id=target_customer_id
    ) then
      raise exception 'ACCESS_DENIED' using errcode='42501';
    end if;
  end if;

  -- Same key and same request is a safe replay. A different request is not.
  select * into prior_event from public.job_events
   where project_id=pid and operation_idempotency_key=target_idempotency_key;
  if found then
    if prior_event.job_id=j.id
      and prior_event.action='finish_service'
      and prior_event.actor_kind=target_actor_kind
      and prior_event.actor_user_id is not distinct from target_actor_user_id
      and prior_event.customer_id is not distinct from target_customer_id
      and prior_event.reason is not distinct from clean_reason
    then
      return j;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'
      using errcode='22023';
  end if;

  -- A second authorized party can observe a completed job without recharging.
  if j.status='settled' then return j; end if;

  -- Only a persisted, validated rating can authorize a participant close.
  -- The rating RPC inserts it under this same job lock and transaction.
  if target_actor_kind='driver' and not exists (
    select 1 from public.marketplace_driver_customer_ratings rating
    where rating.project_id=pid and rating.job_id=j.id
      and rating.driver_user_id=target_actor_user_id
  ) then raise exception 'RATING_REQUIRED' using errcode='22023'; end if;
  if target_actor_kind='customer' and not exists (
    select 1 from public.marketplace_customer_ratings rating
    where rating.project_id=pid and rating.job_id=j.id
      and rating.customer_id=target_customer_id
      and rating.driver_user_id=j.assigned_driver_user_id
  ) then raise exception 'RATING_REQUIRED' using errcode='22023'; end if;
  if target_actor_kind='admin' then
    if j.status not in ('accepted','en_route','pickup','in_progress') then
      raise exception 'INVALID_JOB_TRANSITION' using errcode='22023';
    end if;
  elsif j.status not in ('en_route','pickup','in_progress') then
    -- A customer or driver cannot finish an accepted-but-not-started booking.
    raise exception 'INVALID_JOB_TRANSITION' using errcode='22023';
  end if;

  select * into a from public.job_assignments
   where project_id=pid and job_id=j.id for update;
  if not found then raise exception 'JOB_ASSIGNMENT_NOT_FOUND' using errcode='P0002'; end if;
  if a.driver_user_id is distinct from j.assigned_driver_user_id
    or a.vehicle_id is distinct from j.assigned_vehicle_id
    or a.completed_at is not null
    or a.cancelled_at is not null
  then
    raise exception 'FINISH_ASSIGNMENT_PRECONDITION_FAILED' using errcode='22023';
  end if;

  if a.billing_mode in ('trial_free','platform_free') then
    if a.commission_amount_snapshot<>0
      or exists(select 1 from public.commission_reservations cr
        where cr.project_id=pid and cr.job_id=j.id)
    then
      raise exception 'TRIAL_SETTLEMENT_PRECONDITION_FAILED' using errcode='22023';
    end if;
  elsif a.billing_mode='wallet_commission' then
    select * into w from public.wallets
      where project_id=pid and user_id=a.driver_user_id for update;
    if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND' using errcode='P0002'; end if;

    select * into r from public.commission_reservations
      where project_id=pid and job_id=j.id for update;
    if not found then raise exception 'COMMISSION_RESERVATION_NOT_FOUND' using errcode='P0002'; end if;
    if r.status<>'open'
      or r.user_id is distinct from a.driver_user_id
      or r.amount<>a.commission_amount_snapshot
      or r.final_price_snapshot<>j.final_price
      or r.commission_rate_snapshot<>app_private.impulsa_effective_rate(j.project_id,j.id,a.driver_user_id,j.commission_rate_snapshot)
      or r.currency<>j.currency
      or r.currency<>w.currency
    then
      raise exception 'SETTLEMENT_PRECONDITION_FAILED' using errcode='22023';
    end if;

    prior_balance:=app_private.marketplace_wallet_total_balance(pid,a.driver_user_id);
    if prior_balance<r.amount then
      raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE' using errcode='22023';
    end if;
    -- The existing wallet trigger allocates the debit across real/promotional
    -- sources and validates the previously reserved split.
    insert into public.wallet_transactions(
      project_id,user_id,currency,transaction_type,amount_delta,
      balance_after,source_type,source_id,idempotency_key,actor_id,metadata
    ) values (
      pid,a.driver_user_id,w.currency,'commission',-r.amount,
      prior_balance-r.amount,'job_commission',j.id::text,
      gen_random_uuid(),target_actor_user_id,
      jsonb_build_object('close_idempotency_key',target_idempotency_key,
                         'closed_by',target_actor_kind)
    ) returning id into ledger_id;

    update public.commission_reservations
       set status='consumed',ledger_transaction_id=ledger_id,consumed_at=now()
     where project_id=pid and id=r.id;
  else
    raise exception 'INVALID_BILLING_MODE' using errcode='22023';
  end if;

  original_status:=j.status;
  update public.jobs set status='completed',state_version=state_version+1
   where project_id=pid and id=j.id;
  insert into public.job_events(
    project_id,job_id,from_status,to_status,action,actor_kind,
    actor_user_id,customer_id,operation_idempotency_key,reason,metadata
  ) values (
    pid,j.id,original_status,'completed','finish_service',target_actor_kind,
    target_actor_user_id,target_customer_id,target_idempotency_key,clean_reason,
    jsonb_build_object('billing_mode',a.billing_mode,'ledger_transaction_id',ledger_id)
  );
  update public.job_assignments set completed_at=now()
   where project_id=pid and id=a.id;
  update public.jobs set status='settled',state_version=state_version+1
   where project_id=pid and id=j.id returning * into j;
  insert into public.job_events(
    project_id,job_id,from_status,to_status,action,actor_kind,
    operation_idempotency_key,metadata
  ) values (
    pid,j.id,'completed','settled','settle','system',gen_random_uuid(),
    jsonb_build_object('finish_idempotency_key',target_idempotency_key)
  );
  -- Restore availability only for eligible drivers and vehicles.
  -- Other unresolved jobs must continue blocking availability.
  update public.driver_vehicle_assignments dva
     set is_available=true
   where dva.project_id=pid
     and dva.driver_user_id=a.driver_user_id
     and dva.vehicle_id=a.vehicle_id
     and dva.is_active
     and exists (
       select 1 from public.driver_profiles dp
        where dp.project_id=dva.project_id
          and dp.user_id=dva.driver_user_id
          and dp.status='active'
          and dp.activated_at is not null
          and dp.suspended_at is null
     )
     and exists (
       select 1 from public.vehicles v
        where v.project_id=dva.project_id
          and v.id=dva.vehicle_id
          and v.marketplace_status='active'
          and v.deleted_at is null
     )
     and not exists (
       select 1
         from public.jobs other
         left join public.marketplace_incident_resolutions ir
           on ir.project_id=other.project_id
          and ir.job_id=other.id
        where other.project_id=pid
          and other.id<>j.id
          and other.test_deleted_at is null
          and other.assigned_driver_user_id=a.driver_user_id
          and other.assigned_vehicle_id=a.vehicle_id
          and (
            other.status in (
              'accepted','en_route','pickup',
              'in_progress','completed'
            )
            or (other.status='incident' and ir.id is null)
          )
     );
  return j;
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.marketplace_promo_preferred_eligible(target_job_id uuid, target_driver_user_id uuid, target_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.jobs j
    JOIN public.service_requests req ON req.project_id=j.project_id AND req.id=j.service_request_id
    JOIN app_private.marketplace_driver_promo_settings cfg ON cfg.project_id=j.project_id AND cfg.profiles_enabled AND cfg.priority_enabled AND cfg.priority_seconds>0
    JOIN public.project_marketplace_dispatch_settings radar ON radar.project_id=j.project_id AND radar.enabled
    JOIN app_private.resolve_marketplace_promo_profile(target_code) p ON p.project_id=j.project_id AND p.driver_user_id=target_driver_user_id
    JOIN public.project_marketplace_financial_settings fin ON fin.project_id=j.project_id
    WHERE j.id=target_job_id AND j.status='published' AND NOT j.is_test AND j.test_deleted_at IS NULL
      AND req.scheduled_for IS NULL
      AND p.category_code=coalesce(req.vehicle_category_code,j.pricing_vehicle_category_code)
      AND j.service_code=ANY(p.service_codes)
      AND app_private.marketplace_driver_can_receive_job(j.project_id,p.driver_user_id,p.vehicle_id,j.id)
      AND EXISTS(SELECT 1 FROM public.marketplace_driver_locations l WHERE l.project_id=j.project_id
        AND l.driver_user_id=p.driver_user_id AND l.vehicle_id=p.vehicle_id
        AND l.captured_at >= now()-interval '300 seconds' AND l.captured_at <= now()+interval '30 seconds')
      AND NOT EXISTS(SELECT 1 FROM public.jobs busy WHERE busy.project_id=j.project_id AND busy.assigned_driver_user_id=p.driver_user_id
        AND busy.status IN ('accepted','en_route','pickup','in_progress','incident'))
      AND (fin.commission_enabled IS FALSE OR app_private.has_active_marketplace_work_trial(p.driver_user_id)
        OR coalesce(app_private.marketplace_wallet_available_balance(j.project_id,p.driver_user_id),0)>=round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,p.driver_user_id,j.commission_rate_snapshot),2))
      AND EXISTS(SELECT 1 FROM app_private.marketplace_promo_base_candidate_state(j.project_id,p.driver_user_id,p.vehicle_id,j.id) b WHERE b.allowed)
  )
$function$
;

CREATE OR REPLACE FUNCTION app_private.marketplace_classify_wallet_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  wallet_currency text;
  real_before numeric;
  promo_before numeric;
  total_before numeric;
  debit numeric;
  original_tx public.wallet_transactions%rowtype;
  active_reservation public.commission_reservations%rowtype;
  other_real_reserved numeric;
  other_promo_reserved numeric;
  topup_record public.topups%rowtype;
begin
  select w.currency into wallet_currency
  from public.wallets w
  where w.project_id=new.project_id
    and w.user_id=new.user_id
  for update;

  if not found then
    raise exception 'WALLET_SOURCE_WALLET_NOT_FOUND' using errcode='22023';
  end if;

  if new.currency<>wallet_currency or new.currency<>'CUP' then
    raise exception 'WALLET_SOURCE_CURRENCY_MISMATCH' using errcode='22023';
  end if;

  if new.real_delta<>0
     or new.promotional_delta<>0
     or new.reversed_ledger_id is not null then
    raise exception 'WALLET_SOURCE_FIELDS_SERVER_ONLY' using errcode='42501';
  end if;

  select
    coalesce(sum(t.real_delta),0),
    coalesce(sum(t.promotional_delta),0),
    coalesce(sum(t.amount_delta),0)
  into real_before,promo_before,total_before
  from public.wallet_transactions t
  where t.project_id=new.project_id
    and t.user_id=new.user_id;

  if real_before<0
     or promo_before<0
     or real_before+promo_before<>total_before then
    raise exception 'WALLET_SOURCE_PREVIOUS_BALANCE_CORRUPT'
      using errcode='22023';
  end if;

  if new.balance_after<>total_before+new.amount_delta then
    raise exception 'WALLET_SOURCE_LEDGER_BALANCE_MISMATCH'
      using errcode='22023';
  end if;

  if new.transaction_type='topup' then
    if new.amount_delta<=0 or new.source_type<>'topup' then
      raise exception 'WALLET_SOURCE_INVALID_TOPUP' using errcode='22023';
    end if;

    select * into topup_record
    from public.topups t
    where t.project_id=new.project_id
      and t.user_id=new.user_id
      and t.id::text=new.source_id
      and t.status='requested'
      and t.amount=new.amount_delta
      and t.currency=new.currency;

    if not found then
      raise exception 'WALLET_SOURCE_TOPUP_NOT_VERIFIED'
        using errcode='22023';
    end if;

    new.real_delta:=new.amount_delta;

  elsif new.transaction_type='referral_credit' then
    if new.amount_delta<=0
       or new.source_type not in ('referral_reward','legacy_referral_transition') then
      raise exception 'WALLET_SOURCE_INVALID_PROMOTIONAL_CREDIT'
        using errcode='22023';
    end if;

    new.promotional_delta:=new.amount_delta;

  elsif new.transaction_type='impulsa_credit' then
    perform app_private.impulsa_validate_wallet_entry(new,real_before);
    new.real_delta:=new.amount_delta;
  elsif new.transaction_type='impulsa_reversal' then
    select coalesce(sum(r.real_reserved_amount),0) into other_real_reserved
    from public.commission_reservations r where r.project_id=new.project_id and r.user_id=new.user_id and r.status='open';
    perform app_private.impulsa_validate_wallet_entry(new,real_before-other_real_reserved);
    new.real_delta:=new.amount_delta;
    new.reversed_ledger_id:=(new.metadata->>'original_ledger_transaction_id')::uuid;

  elsif new.transaction_type='commission' then
    if new.amount_delta>=0 or new.source_type<>'job_commission' then
      raise exception 'WALLET_SOURCE_INVALID_COMMISSION'
        using errcode='22023';
    end if;

    debit:=-new.amount_delta;

    select * into active_reservation
    from public.commission_reservations r
    where r.project_id=new.project_id
      and r.user_id=new.user_id
      and r.job_id::text=new.source_id
      and r.status='open'
      and r.amount=debit;

    if not found then
      raise exception 'WALLET_SOURCE_RESERVATION_NOT_FOUND'
        using errcode='22023';
    end if;

    if active_reservation.real_reserved_amount<0
       or active_reservation.promotional_reserved_amount<0
       or active_reservation.real_reserved_amount
          +active_reservation.promotional_reserved_amount<>debit then
      raise exception 'WALLET_SOURCE_RESERVATION_SPLIT_INVALID'
        using errcode='22023';
    end if;

    select
      coalesce(sum(r.real_reserved_amount),0),
      coalesce(sum(r.promotional_reserved_amount),0)
    into other_real_reserved,other_promo_reserved
    from public.commission_reservations r
    where r.project_id=new.project_id
      and r.user_id=new.user_id
      and r.status='open'
      and r.id<>active_reservation.id;

    if real_before-active_reservation.real_reserved_amount<other_real_reserved
       or promo_before-active_reservation.promotional_reserved_amount<other_promo_reserved then
      raise exception 'WALLET_SOURCE_OTHER_RESERVATIONS_UNFUNDED'
        using errcode='22023';
    end if;

    new.real_delta:=-active_reservation.real_reserved_amount;
    new.promotional_delta:=-active_reservation.promotional_reserved_amount;

  elsif new.transaction_type='reversal' then
    if new.amount_delta<=0
       or new.source_type<>'job_commission_reversal'
       or nullif(new.metadata->>'original_ledger_transaction_id','') is null then
      raise exception 'WALLET_SOURCE_REVERSAL_REFERENCE_REQUIRED'
        using errcode='22023';
    end if;

    select * into original_tx
    from public.wallet_transactions t
    where t.id=(new.metadata->>'original_ledger_transaction_id')::uuid
      and t.project_id=new.project_id
      and t.user_id=new.user_id
      and t.transaction_type='commission'
      and t.source_type='job_commission'
      and t.source_id=new.source_id;

    if not found or new.amount_delta<>-original_tx.amount_delta then
      raise exception 'WALLET_SOURCE_REVERSAL_MISMATCH'
        using errcode='22023';
    end if;

    new.reversed_ledger_id:=original_tx.id;
    new.real_delta:=-original_tx.real_delta;
    new.promotional_delta:=-original_tx.promotional_delta;

  elsif new.transaction_type='topup_reversal' then
    if new.amount_delta>=0
       or new.source_type<>'topup_reversal'
       or nullif(new.metadata->>'original_ledger_transaction_id','') is null then
      raise exception 'WALLET_SOURCE_TOPUP_REVERSAL_REFERENCE_REQUIRED'
        using errcode='22023';
    end if;

    select * into original_tx
    from public.wallet_transactions t
    where t.id=(new.metadata->>'original_ledger_transaction_id')::uuid
      and t.project_id=new.project_id
      and t.user_id=new.user_id
      and t.transaction_type='topup'
      and t.source_type='topup'
      and t.source_id=new.source_id;

    if not found or new.amount_delta<>-original_tx.amount_delta then
      raise exception 'WALLET_SOURCE_TOPUP_REVERSAL_MISMATCH'
        using errcode='22023';
    end if;

    if real_before + new.amount_delta < 0 then
      raise exception 'INSUFFICIENT_REAL_BALANCE_FOR_TOPUP_REVERSAL'
        using errcode='22023';
    end if;

    -- The wallet row is already locked above; preserve real money allocated
    -- to open commissions before allowing a topup reversal.
    select coalesce(sum(r.real_reserved_amount),0)
    into other_real_reserved
    from public.commission_reservations r
    where r.project_id=new.project_id
      and r.user_id=new.user_id
      and r.status='open';

    if real_before + new.amount_delta < other_real_reserved then
      raise exception 'TOPUP_REVERSAL_REAL_BALANCE_RESERVED'
        using errcode='22023';
    end if;

    new.reversed_ledger_id:=original_tx.id;
    new.real_delta:=new.amount_delta;
    new.promotional_delta:=0;

  else
    raise exception 'WALLET_SOURCE_UNCLASSIFIED_TRANSACTION'
      using errcode='22023';
  end if;

  if new.real_delta+new.promotional_delta<>new.amount_delta
     or real_before+new.real_delta<0
     or promo_before+new.promotional_delta<0 then
    raise exception 'WALLET_SOURCE_NEGATIVE_OR_UNBALANCED'
      using errcode='22023';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_my_marketplace_available_jobs(target_vehicle_id text, target_limit integer DEFAULT 50, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_job_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(job_id uuid, service_code text, origin_text text, destination_text text, scheduled_for timestamp with time zone, passenger_count integer, cargo_weight_kg numeric, cargo_volume_m3 numeric, cargo_length_cm numeric, cargo_width_cm numeric, cargo_height_cm numeric, required_body_type text, recommended_price numeric, final_price numeric, currency text, expires_at timestamp with time zone, created_at timestamp with time zone, billing_mode text, commission_rate numeric, commission_amount numeric, available_balance numeric, missing_balance numeric, can_accept boolean, is_test boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid:=auth.uid();
  pid uuid;
  safe_limit integer:=least(greatest(coalesce(target_limit,50),1),100);
  balance numeric;
  commission_charge_enabled boolean;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;

  if (target_before_created_at is null)<>(target_before_job_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023';
  end if;

  select id into pid from public.projects where slug='tuktuk-control';

  if not exists(
    select 1 from public.driver_profiles d
    where d.project_id=pid and d.user_id=actor
      and d.status='active' and d.activated_at is not null and d.suspended_at is null
  )
  or not app_private.marketplace_onboarding_requirements_complete(actor,target_vehicle_id)
  or not exists(
    select 1
    from public.driver_vehicle_assignments a
    join public.vehicles v
      on v.project_id=a.project_id and v.id=a.vehicle_id
    where a.project_id=pid and a.driver_user_id=actor
      and a.vehicle_id=target_vehicle_id
      and a.is_active and a.is_available
      and v.marketplace_status='active' and v.deleted_at is null
  )
  then
    raise exception 'MARKETPLACE_WORK_ACCESS_DENIED' using errcode='42501';
  end if;

  select s.commission_enabled into commission_charge_enabled from public.project_marketplace_financial_settings s where s.project_id=pid;
  if commission_charge_enabled is null then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND'; end if;
  balance:=coalesce(app_private.marketplace_wallet_available_balance(pid,actor),0);

  return query
  select
    j.id,
    j.service_code,
    r.origin_text,
    r.destination_text,
    r.scheduled_for,
    r.passenger_count,
    r.cargo_weight_kg,
    r.cargo_volume_m3,
    r.cargo_length_cm,
    r.cargo_width_cm,
    r.cargo_height_cm,
    r.required_body_type,
    j.recommended_price,
    j.final_price,
    j.currency,
    j.expires_at,
    j.created_at,
    case
      when j.is_test and not j.test_force_wallet_commission then 'platform_free'
      when not commission_charge_enabled
       and not (j.is_test and j.test_force_wallet_commission)
       and app_private.has_active_marketplace_work_trial(actor) then 'trial_free'
      when not commission_charge_enabled then 'platform_free'
      when j.is_test and j.test_force_wallet_commission then 'wallet_commission'
      when app_private.has_active_marketplace_work_trial(actor) then 'trial_free'
      when app_private.has_confirmed_marketplace_initial_deposit(actor) then 'wallet_commission'
      else null
    end,
    case
      when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not commission_charge_enabled then 0::numeric
      when j.is_test and j.test_force_wallet_commission then app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot)
      when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
      when app_private.has_confirmed_marketplace_initial_deposit(actor) then app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot)
      else app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot)
    end,
    case
      when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not commission_charge_enabled then 0::numeric
      when j.is_test and j.test_force_wallet_commission then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
      when app_private.has_confirmed_marketplace_initial_deposit(actor) then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      else round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
    end,
    balance,
    greatest(
      0::numeric,
      (case
        when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not commission_charge_enabled then 0::numeric
        when j.is_test and j.test_force_wallet_commission then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
        when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
        when app_private.has_confirmed_marketplace_initial_deposit(actor) then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
        else round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      end)-balance
    ),
    case
      when j.is_test and not j.test_force_wallet_commission then true
      when not commission_charge_enabled then true
      when j.is_test and j.test_force_wallet_commission
        then balance>=round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      when app_private.has_active_marketplace_work_trial(actor) then true
      when app_private.has_confirmed_marketplace_initial_deposit(actor)
        then balance>=round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      else false
    end,
    j.is_test
  from public.jobs j
  join public.service_requests r
    on r.project_id=j.project_id and r.id=j.service_request_id
  where j.project_id=pid
    and j.status='published'
    and j.test_deleted_at is null
    and (not j.is_test or app_private.marketplace_test_job_targets_driver(j.project_id,j.id,actor))
    and (j.expires_at is null or j.expires_at>now())
    and app_private.marketplace_dispatch_policy_allows(
      pid,
      actor,
      target_vehicle_id,
      j.id
    )
    and (
      not commission_charge_enabled
      or (j.is_test and not j.test_force_wallet_commission)
      or app_private.has_active_marketplace_work_trial(actor)
      or app_private.has_confirmed_marketplace_initial_deposit(actor)
      or (j.is_test and app_private.marketplace_test_job_targets_driver(j.project_id,j.id,actor) and j.test_force_wallet_commission)
    )
    and exists(
      select 1 from public.vehicle_services s
      where s.project_id=pid and s.vehicle_id=target_vehicle_id
        and s.service_code=j.service_code and s.enabled
    )
    and exists(
      select 1
      from public.vehicles v
      where v.project_id=pid and v.id=target_vehicle_id
        and (
          coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code) is null
          or v.category_code=coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code)
        )
        and (r.passenger_count is null or v.passenger_capacity>=r.passenger_count)
        and (r.cargo_weight_kg is null or v.cargo_capacity_kg>=r.cargo_weight_kg)
        and (r.cargo_volume_m3 is null or v.cargo_volume_m3>=r.cargo_volume_m3)
        and (r.cargo_length_cm is null or v.cargo_length_cm>=r.cargo_length_cm)
        and (r.cargo_width_cm is null or v.cargo_width_cm>=r.cargo_width_cm)
        and (r.cargo_height_cm is null or v.cargo_height_cm>=r.cargo_height_cm)
        and (r.required_body_type is null or lower(btrim(v.body_type))=lower(btrim(r.required_body_type)))
    )
    and (target_before_created_at is null or (j.created_at,j.id)<(target_before_created_at,target_before_job_id))
  order by j.created_at desc,j.id desc
  limit safe_limit;
end;
$function$
;

-- The queue is a separate transaction from settlement. No scheduled work for
-- existing/historical jobs; the policy is initialized disabled.
SELECT cron.schedule('marketplace-impulsa-reconcile-v1','5 seconds','SELECT app_private.impulsa_process_one()');
