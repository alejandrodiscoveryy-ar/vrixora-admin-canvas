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
