-- Wallet transition v2 core. Candidate: activation remains guarded by engine_ready.
-- Debt is a liability, not a deposit or a promotional credit. Commercial earnings
-- are a subset of the real wallet, with their own provenance and reservations.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.wallet_transactions WHERE transaction_type IN ('impulsa_credit','impulsa_reversal')) THEN
  RAISE EXCEPTION 'EXISTING_IMPULSA_REQUIRES_PROVENANCE_MIGRATION';
 END IF;
END $$;
ALTER TABLE app_private.marketplace_wallet_transition_policy ADD COLUMN activated_at timestamptz;
ALTER TABLE public.wallet_transactions
 ADD COLUMN debt_delta numeric(14,2) NOT NULL DEFAULT 0,
 ADD COLUMN debt_job_id uuid,
 ADD COLUMN impulsa_delta numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.wallet_transactions DROP CONSTRAINT wallet_transactions_source_sum_check,
 DROP CONSTRAINT wallet_transactions_balance_after_check,
 DROP CONSTRAINT wallet_transactions_source_sign_check,
 DROP CONSTRAINT wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions
 ADD CONSTRAINT wallet_transactions_source_sum_check CHECK(real_delta+promotional_delta-debt_delta=amount_delta),
 ADD CONSTRAINT wallet_transactions_debt_provenance_check CHECK((debt_delta<>0)=(debt_job_id IS NOT NULL)),
 ADD CONSTRAINT wallet_transactions_commercial_subset_check CHECK((real_delta>=0 AND impulsa_delta BETWEEN 0 AND real_delta) OR (real_delta<=0 AND impulsa_delta BETWEEN real_delta AND 0)),
 ADD CONSTRAINT wallet_transactions_transaction_type_check CHECK(transaction_type IN ('topup','commission','adjustment','reversal','referral_credit','topup_reversal','impulsa_credit','impulsa_reversal','impulsa_withdrawal')),
 ADD CONSTRAINT wallet_transactions_source_sign_check CHECK(
 (transaction_type='topup' AND amount_delta>0 AND real_delta>=0 AND promotional_delta=0 AND debt_delta<=0 AND impulsa_delta=0 AND reversed_ledger_id IS NULL)
 OR (transaction_type='referral_credit' AND promotional_delta>0 AND real_delta=0 AND debt_delta=0 AND reversed_ledger_id IS NULL)
 OR (transaction_type='commission' AND amount_delta<0 AND real_delta<=0 AND promotional_delta<=0 AND debt_delta>=0 AND reversed_ledger_id IS NULL)
 OR (transaction_type='reversal' AND amount_delta>0 AND real_delta>=0 AND promotional_delta>=0 AND debt_delta<=0 AND reversed_ledger_id IS NOT NULL)
 OR (transaction_type='topup_reversal' AND amount_delta<0 AND real_delta<=0 AND promotional_delta=0 AND debt_delta>=0 AND impulsa_delta=0 AND reversed_ledger_id IS NOT NULL)
 OR (transaction_type='impulsa_credit' AND amount_delta>0 AND real_delta>=0 AND promotional_delta=0 AND debt_delta<=0 AND impulsa_delta=real_delta AND reversed_ledger_id IS NULL)
 OR (transaction_type='impulsa_reversal' AND amount_delta<0 AND real_delta<0 AND promotional_delta=0 AND debt_delta=0 AND impulsa_delta=real_delta AND reversed_ledger_id IS NOT NULL)
 OR (transaction_type='impulsa_withdrawal' AND amount_delta<0 AND real_delta<0 AND promotional_delta=0 AND debt_delta=0 AND impulsa_delta=real_delta AND reversed_ledger_id IS NULL));
CREATE INDEX wallet_transactions_debt_job_idx ON public.wallet_transactions(project_id,user_id,debt_job_id) WHERE debt_job_id IS NOT NULL;
ALTER TABLE public.commission_reservations ADD COLUMN credit_reserved_amount numeric(14,2) NOT NULL DEFAULT 0,
 ADD COLUMN impulsa_reserved_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.commission_reservations DROP CONSTRAINT commission_reservations_source_sum_check;
ALTER TABLE public.commission_reservations ADD CONSTRAINT commission_reservations_source_sum_check CHECK(
 real_reserved_amount>=0 AND promotional_reserved_amount>=0 AND credit_reserved_amount>=0 AND impulsa_reserved_amount BETWEEN 0 AND real_reserved_amount
 AND real_reserved_amount+promotional_reserved_amount+credit_reserved_amount=amount);
CREATE UNIQUE INDEX commission_one_initial_credit ON public.commission_reservations(project_id,user_id) WHERE credit_reserved_amount>0 AND status IN ('open','consumed');
ALTER TABLE public.marketplace_incident_resolutions DROP CONSTRAINT marketplace_incident_resolutions_billing_mode_check;
ALTER TABLE public.marketplace_incident_resolutions ADD CONSTRAINT marketplace_incident_resolutions_billing_mode_check CHECK(billing_mode IN ('trial_free','platform_free','wallet_commission'));

CREATE TABLE app_private.marketplace_impulsa_withdrawals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL,user_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0),minimum_snapshot numeric(14,2) NOT NULL CHECK(minimum_snapshot>0 AND amount>=minimum_snapshot),
 request_key uuid NOT NULL,status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','paid','rejected','cancelled')),
 requested_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,resolved_by uuid,resolution_key uuid,payment_reference text,ledger_transaction_id uuid,
 FOREIGN KEY(project_id,user_id) REFERENCES public.wallets(project_id,user_id),
 UNIQUE(project_id,user_id,request_key),UNIQUE(project_id,resolution_key),
 CHECK((status='requested' AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_key IS NULL AND payment_reference IS NULL AND ledger_transaction_id IS NULL)
 OR (status<>'requested' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution_key IS NOT NULL AND nullif(btrim(payment_reference),'') IS NOT NULL AND ((status='paid')=(ledger_transaction_id IS NOT NULL))))
);
CREATE INDEX marketplace_impulsa_withdrawals_open_idx ON app_private.marketplace_impulsa_withdrawals(project_id,user_id) WHERE status='requested';
ALTER TABLE app_private.marketplace_impulsa_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.marketplace_impulsa_withdrawals FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.wallet_transition_active(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM app_private.marketplace_wallet_transition_policy p WHERE p.project_id=pid AND p.engine_ready AND p.activated_at IS NOT NULL)
$$;
CREATE OR REPLACE FUNCTION app_private.wallet_debt(pid uuid,uid uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(t.debt_delta),0) FROM public.wallet_transactions t WHERE t.project_id=pid AND t.user_id=uid
$$;
CREATE OR REPLACE FUNCTION app_private.wallet_debt_for_job(pid uuid,uid uuid,jid uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(t.debt_delta),0) FROM public.wallet_transactions t WHERE t.project_id=pid AND t.user_id=uid AND t.debt_job_id=jid
$$;
CREATE OR REPLACE FUNCTION app_private.wallet_open_debt_job(pid uuid,uid uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT t.debt_job_id FROM public.wallet_transactions t WHERE t.project_id=pid AND t.user_id=uid AND t.debt_job_id IS NOT NULL
 GROUP BY t.debt_job_id HAVING sum(t.debt_delta)>0 ORDER BY t.debt_job_id LIMIT 1
$$;
CREATE OR REPLACE FUNCTION app_private.wallet_impulsa_balance(pid uuid,uid uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(t.impulsa_delta),0) FROM public.wallet_transactions t WHERE t.project_id=pid AND t.user_id=uid
$$;
CREATE OR REPLACE FUNCTION app_private.wallet_withdrawal_hold(pid uuid,uid uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(w.amount),0) FROM app_private.marketplace_impulsa_withdrawals w WHERE w.project_id=pid AND w.user_id=uid AND w.status='requested'
$$;
CREATE OR REPLACE FUNCTION app_private.wallet_impulsa_available(pid uuid,uid uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT app_private.wallet_impulsa_balance(pid,uid)
 - coalesce((SELECT sum(r.impulsa_reserved_amount) FROM public.commission_reservations r WHERE r.project_id=pid AND r.user_id=uid AND r.status='open'),0)
 - app_private.wallet_withdrawal_hold(pid,uid)
$$;
CREATE OR REPLACE FUNCTION app_private.wallet_credit_unused(pid uuid,uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.commission_reservations r WHERE r.project_id=pid AND r.user_id=uid AND r.credit_reserved_amount>0 AND r.status IN ('open','consumed'))
$$;
CREATE OR REPLACE FUNCTION app_private.wallet_can_finance(pid uuid,uid uuid,jid uuid,charge numeric) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT charge>0 AND app_private.wallet_debt(pid,uid)=0 AND (
 app_private.marketplace_wallet_available_balance(pid,uid)>=charge
 OR EXISTS(SELECT 1 FROM app_private.marketplace_wallet_transition_policy p
 JOIN public.project_marketplace_financial_settings f ON f.project_id=p.project_id AND f.commission_enabled
 JOIN public.jobs j ON j.project_id=p.project_id AND j.id=jid AND NOT j.is_test AND j.test_deleted_at IS NULL
 WHERE p.project_id=pid AND p.engine_ready AND p.activated_at IS NOT NULL AND p.credit_enabled
 AND app_private.wallet_credit_unused(pid,uid)
 AND NOT EXISTS(SELECT 1 FROM public.commission_reservations r WHERE r.project_id=pid AND r.user_id=uid AND r.status='open')
 AND charge-app_private.marketplace_wallet_available_balance(pid,uid) BETWEEN .01 AND p.credit_limit_cup))
$$;
CREATE OR REPLACE FUNCTION app_private.marketplace_wallet_reserved_balance(target_project_id uuid,target_user_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(r.amount),0)+app_private.wallet_withdrawal_hold(target_project_id,target_user_id)
 FROM public.commission_reservations r WHERE r.project_id=target_project_id AND r.user_id=target_user_id AND r.status='open'
$$;
CREATE OR REPLACE FUNCTION app_private.marketplace_wallet_source_balances(target_project_id uuid,target_user_id uuid)
RETURNS TABLE(real_balance numeric,promotional_balance numeric,real_reserved_balance numeric,promotional_reserved_balance numeric,real_available_balance numeric,promotional_available_balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rt numeric; pt numeric; rh numeric; ph numeric; dh numeric; ih numeric; it numeric;
BEGIN
 SELECT coalesce(sum(t.real_delta),0),coalesce(sum(t.promotional_delta),0),coalesce(sum(t.impulsa_delta),0) INTO rt,pt,it FROM public.wallet_transactions t WHERE t.project_id=target_project_id AND t.user_id=target_user_id;
 SELECT coalesce(sum(r.real_reserved_amount),0),coalesce(sum(r.promotional_reserved_amount),0),coalesce(sum(r.credit_reserved_amount),0),coalesce(sum(r.impulsa_reserved_amount),0)
 INTO rh,ph,dh,ih FROM public.commission_reservations r WHERE r.project_id=target_project_id AND r.user_id=target_user_id AND r.status='open';
 rh:=rh+app_private.wallet_withdrawal_hold(target_project_id,target_user_id);
 ih:=ih+app_private.wallet_withdrawal_hold(target_project_id,target_user_id);
 IF rt<0 OR pt<0 OR it<0 OR it>rt OR rh<0 OR ph<0 OR dh<0 OR ih<0 OR rh>rt OR ph>pt OR ih>it OR rh-ih>rt-it
 OR rh+ph+dh<>app_private.marketplace_wallet_reserved_balance(target_project_id,target_user_id) THEN RAISE EXCEPTION 'WALLET_SOURCE_RESERVATION_INTEGRITY_FAILURE' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT rt,pt,rh,ph,rt-rh,pt-ph;
END $$;
CREATE OR REPLACE FUNCTION app_private.marketplace_attribute_commission_reservation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE wallet_currency text; ar numeric; ap numeric; ai numeric; cash_available numeric; rem numeric;
BEGIN
 IF NEW.status<>'open' OR NEW.real_reserved_amount<>0 OR NEW.promotional_reserved_amount<>0 OR NEW.credit_reserved_amount<>0 OR NEW.impulsa_reserved_amount<>0 THEN RAISE EXCEPTION 'COMMISSION_RESERVATION_SOURCE_SERVER_ONLY' USING ERRCODE='42501'; END IF;
 SELECT w.currency INTO wallet_currency FROM public.wallets w WHERE w.project_id=NEW.project_id AND w.user_id=NEW.user_id FOR UPDATE;
 IF NOT FOUND OR NEW.currency IS DISTINCT FROM wallet_currency OR wallet_currency<>'CUP' THEN RAISE EXCEPTION 'COMMISSION_RESERVATION_WALLET_INVALID' USING ERRCODE='22023'; END IF;
 IF NOT app_private.wallet_can_finance(NEW.project_id,NEW.user_id,NEW.job_id,NEW.amount) THEN RAISE EXCEPTION 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE' USING ERRCODE='22023'; END IF;
 SELECT b.real_available_balance,b.promotional_available_balance INTO ar,ap FROM app_private.marketplace_wallet_source_balances(NEW.project_id,NEW.user_id) b;
 ai:=app_private.wallet_impulsa_available(NEW.project_id,NEW.user_id);
 cash_available:=ar-ai;
 NEW.promotional_reserved_amount:=least(ap,NEW.amount);
 rem:=NEW.amount-NEW.promotional_reserved_amount;
 NEW.real_reserved_amount:=least(rem,ar);
 NEW.impulsa_reserved_amount:=greatest(0,NEW.real_reserved_amount-cash_available);
 NEW.credit_reserved_amount:=rem-NEW.real_reserved_amount;
 RETURN NEW;
END $$;

-- A settled credit ride has one debt origin. Payments are attributed to that origin.
-- No reward is funded until the entire debt is discharged, and recycled earnings
-- or referral credits are not counted as newly collected cash.
CREATE OR REPLACE FUNCTION app_private.wallet_cash_collected(pid uuid,ledger uuid) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.wallet_transactions%ROWTYPE; paid numeric;
BEGIN
 SELECT * INTO t FROM public.wallet_transactions WHERE id=ledger AND project_id=pid AND transaction_type='commission';
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.wallet_transactions r WHERE r.project_id=pid AND r.reversed_ledger_id=ledger) THEN RETURN 0; END IF;
 IF t.debt_delta>0 THEN
  IF app_private.wallet_debt_for_job(pid,t.user_id,t.debt_job_id)>0 THEN RETURN 0; END IF;
  SELECT -coalesce(sum(x.debt_delta),0) INTO paid FROM public.wallet_transactions x WHERE x.project_id=pid AND x.user_id=t.user_id AND x.debt_job_id=t.debt_job_id AND x.transaction_type IN ('topup','topup_reversal');
 ELSE paid:=0; END IF;
 RETURN greatest(0,-t.real_delta+t.impulsa_delta+paid);
END $$;

CREATE OR REPLACE FUNCTION app_private.marketplace_classify_wallet_transaction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE wc text; rb numeric; pb numeric; ib numeric; db numeric; tb numeric; debit numeric; orig public.wallet_transactions%ROWTYPE; cr public.commission_reservations%ROWTYPE; tp public.topups%ROWTYPE; wd app_private.marketplace_impulsa_withdrawals%ROWTYPE;
 rh numeric; ph numeric; ih numeric; repay numeric; outstanding numeric; paid_cash numeric; paid_impulsa numeric;
BEGIN
 SELECT currency INTO wc FROM public.wallets WHERE project_id=NEW.project_id AND user_id=NEW.user_id FOR UPDATE;
 IF NOT FOUND OR NEW.currency<>wc OR wc<>'CUP' THEN RAISE EXCEPTION 'WALLET_SOURCE_WALLET_INVALID' USING ERRCODE='22023'; END IF;
 IF NEW.real_delta<>0 OR NEW.promotional_delta<>0 OR NEW.impulsa_delta<>0 OR NEW.debt_delta<>0 OR NEW.debt_job_id IS NOT NULL OR NEW.reversed_ledger_id IS NOT NULL THEN RAISE EXCEPTION 'WALLET_SOURCE_FIELDS_SERVER_ONLY' USING ERRCODE='42501'; END IF;
 SELECT coalesce(sum(t.real_delta),0),coalesce(sum(t.promotional_delta),0),coalesce(sum(t.impulsa_delta),0),coalesce(sum(t.debt_delta),0),coalesce(sum(t.amount_delta),0)
 INTO rb,pb,ib,db,tb FROM public.wallet_transactions t WHERE t.project_id=NEW.project_id AND t.user_id=NEW.user_id;
 IF rb<0 OR pb<0 OR ib<0 OR ib>rb OR db<0 OR rb+pb-db<>tb OR NEW.balance_after<>tb+NEW.amount_delta THEN RAISE EXCEPTION 'WALLET_SOURCE_LEDGER_BALANCE_MISMATCH' USING ERRCODE='22023'; END IF;
 SELECT coalesce(sum(r.real_reserved_amount),0),coalesce(sum(r.promotional_reserved_amount),0),coalesce(sum(r.impulsa_reserved_amount),0)
 INTO rh,ph,ih FROM public.commission_reservations r WHERE r.project_id=NEW.project_id AND r.user_id=NEW.user_id AND r.status='open';
 rh:=rh+app_private.wallet_withdrawal_hold(NEW.project_id,NEW.user_id); ih:=ih+app_private.wallet_withdrawal_hold(NEW.project_id,NEW.user_id);
 IF NEW.transaction_type='topup' THEN
  IF NEW.amount_delta<=0 OR NEW.source_type<>'topup' THEN RAISE EXCEPTION 'WALLET_SOURCE_INVALID_TOPUP'; END IF;
  SELECT * INTO tp FROM public.topups t WHERE t.project_id=NEW.project_id AND t.user_id=NEW.user_id AND t.id::text=NEW.source_id AND t.status='requested' AND t.amount=NEW.amount_delta AND t.currency=NEW.currency;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_SOURCE_TOPUP_NOT_VERIFIED'; END IF;
  repay:=least(db,NEW.amount_delta); NEW.debt_delta:=-repay; NEW.real_delta:=NEW.amount_delta-repay;
 ELSIF NEW.transaction_type='referral_credit' THEN
  IF NEW.amount_delta<=0 OR NEW.source_type NOT IN ('referral_reward','legacy_referral_transition') THEN RAISE EXCEPTION 'WALLET_SOURCE_INVALID_PROMOTIONAL_CREDIT'; END IF;
  NEW.promotional_delta:=NEW.amount_delta;
 ELSIF NEW.transaction_type='impulsa_credit' THEN
  PERFORM app_private.impulsa_validate_wallet_entry(NEW,rb);
  repay:=least(db,NEW.amount_delta); NEW.debt_delta:=-repay; NEW.real_delta:=NEW.amount_delta-repay; NEW.impulsa_delta:=NEW.real_delta;
 ELSIF NEW.transaction_type='commission' THEN
  debit:=-NEW.amount_delta;
  IF debit<=0 OR NEW.source_type<>'job_commission' THEN RAISE EXCEPTION 'WALLET_SOURCE_INVALID_COMMISSION'; END IF;
  SELECT * INTO cr FROM public.commission_reservations r WHERE r.project_id=NEW.project_id AND r.user_id=NEW.user_id AND r.job_id::text=NEW.source_id AND r.status='open' AND r.amount=debit;
  IF NOT FOUND OR db>0 THEN RAISE EXCEPTION 'WALLET_SOURCE_RESERVATION_NOT_FOUND_OR_DEBT'; END IF;
  NEW.real_delta:=-cr.real_reserved_amount; NEW.promotional_delta:=-cr.promotional_reserved_amount; NEW.impulsa_delta:=-cr.impulsa_reserved_amount;
  NEW.debt_delta:=cr.credit_reserved_amount;
  -- A confirmed topup/referral/earning received during the trip can cover
  -- more of the originally unfunded amount. Never take someone else's hold.
  rh:=rh-cr.real_reserved_amount; ph:=ph-cr.promotional_reserved_amount; ih:=ih-cr.impulsa_reserved_amount;
  repay:=least(NEW.debt_delta,pb-cr.promotional_reserved_amount-ph);
  NEW.promotional_delta:=NEW.promotional_delta-repay; NEW.debt_delta:=NEW.debt_delta-repay;
  repay:=least(NEW.debt_delta,rb-ib-(cr.real_reserved_amount-cr.impulsa_reserved_amount)-(rh-ih));
  NEW.real_delta:=NEW.real_delta-repay; NEW.debt_delta:=NEW.debt_delta-repay;
  repay:=least(NEW.debt_delta,ib-cr.impulsa_reserved_amount-ih);
  NEW.real_delta:=NEW.real_delta-repay; NEW.impulsa_delta:=NEW.impulsa_delta-repay; NEW.debt_delta:=NEW.debt_delta-repay;
  IF NEW.debt_delta>0 THEN NEW.debt_job_id:=cr.job_id; END IF;
 ELSIF NEW.transaction_type='reversal' THEN
  IF NEW.amount_delta<=0 OR NEW.source_type<>'job_commission_reversal' THEN RAISE EXCEPTION 'WALLET_SOURCE_INVALID_REVERSAL'; END IF;
  SELECT * INTO orig FROM public.wallet_transactions t WHERE t.id=(NEW.metadata->>'original_ledger_transaction_id')::uuid AND t.project_id=NEW.project_id AND t.user_id=NEW.user_id AND t.transaction_type='commission' AND t.source_id=NEW.source_id AND t.source_type='job_commission';
  IF NOT FOUND OR NEW.amount_delta<>-orig.amount_delta THEN RAISE EXCEPTION 'WALLET_SOURCE_REVERSAL_MISMATCH'; END IF;
  NEW.reversed_ledger_id:=orig.id; NEW.real_delta:=-orig.real_delta; NEW.promotional_delta:=-orig.promotional_delta; NEW.impulsa_delta:=-orig.impulsa_delta;
  IF orig.debt_delta>0 THEN
   outstanding:=app_private.wallet_debt_for_job(NEW.project_id,NEW.user_id,orig.debt_job_id);
   SELECT -coalesce(sum(x.debt_delta) FILTER(WHERE x.transaction_type IN ('topup','topup_reversal')),0),-coalesce(sum(x.debt_delta) FILTER(WHERE x.transaction_type='impulsa_credit'),0)
   INTO paid_cash,paid_impulsa FROM public.wallet_transactions x WHERE x.project_id=NEW.project_id AND x.user_id=NEW.user_id AND x.debt_job_id=orig.debt_job_id;
   IF outstanding<0 OR paid_cash<0 OR paid_impulsa<0 OR outstanding+paid_cash+paid_impulsa<>orig.debt_delta THEN RAISE EXCEPTION 'DEBT_REVERSAL_PROVENANCE_MISMATCH'; END IF;
   NEW.real_delta:=NEW.real_delta+paid_cash+paid_impulsa; NEW.impulsa_delta:=NEW.impulsa_delta+paid_impulsa; NEW.debt_delta:=-outstanding;
   IF outstanding>0 THEN NEW.debt_job_id:=orig.debt_job_id; END IF;
  END IF;
 ELSIF NEW.transaction_type='topup_reversal' THEN
  IF NEW.amount_delta>=0 OR NEW.source_type<>'topup_reversal' THEN RAISE EXCEPTION 'WALLET_SOURCE_INVALID_TOPUP_REVERSAL'; END IF;
  SELECT * INTO orig FROM public.wallet_transactions t WHERE t.id=(NEW.metadata->>'original_ledger_transaction_id')::uuid AND t.project_id=NEW.project_id AND t.user_id=NEW.user_id AND t.transaction_type='topup' AND t.source_type='topup' AND t.source_id=NEW.source_id;
  IF NOT FOUND OR NEW.amount_delta<>-orig.amount_delta THEN RAISE EXCEPTION 'WALLET_SOURCE_TOPUP_REVERSAL_MISMATCH'; END IF;
  NEW.reversed_ledger_id:=orig.id; NEW.real_delta:=NEW.amount_delta;
  IF orig.debt_delta<0 AND EXISTS(SELECT 1 FROM public.wallet_transactions c WHERE c.project_id=NEW.project_id AND c.user_id=NEW.user_id AND c.transaction_type='commission' AND c.debt_job_id=orig.debt_job_id AND NOT EXISTS(SELECT 1 FROM public.wallet_transactions rev WHERE rev.project_id=c.project_id AND rev.reversed_ledger_id=c.id)) THEN
   -- Never undo cash backing an already paid commercial reward or reopen a
   -- debt while a different ride/withdrawal is reserved. Explicit correction first.
   IF EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_rewards q WHERE q.project_id=NEW.project_id AND q.job_id=orig.debt_job_id AND q.state IN ('credited','reversal_pending'))
   OR EXISTS(SELECT 1 FROM public.commission_reservations r WHERE r.project_id=NEW.project_id AND r.user_id=NEW.user_id AND r.status='open')
   OR app_private.wallet_withdrawal_hold(NEW.project_id,NEW.user_id)>0 THEN RAISE EXCEPTION 'DEBT_PAYMENT_CORRECTION_REQUIRES_RECONCILIATION' USING ERRCODE='22023'; END IF;
   NEW.debt_delta:=-orig.debt_delta; NEW.debt_job_id:=orig.debt_job_id; NEW.real_delta:=-orig.real_delta;
  END IF;
 ELSIF NEW.transaction_type='impulsa_reversal' THEN
  PERFORM app_private.impulsa_validate_wallet_entry(NEW,ib-ih);
  NEW.real_delta:=NEW.amount_delta; NEW.impulsa_delta:=NEW.amount_delta; NEW.reversed_ledger_id:=(NEW.metadata->>'original_ledger_transaction_id')::uuid;
 ELSIF NEW.transaction_type='impulsa_withdrawal' THEN
  SELECT * INTO wd FROM app_private.marketplace_impulsa_withdrawals w WHERE w.id::text=NEW.source_id AND w.project_id=NEW.project_id AND w.user_id=NEW.user_id AND w.status='requested';
  IF NOT FOUND OR NEW.source_type<>'impulsa_withdrawal' OR NEW.amount_delta<>-wd.amount OR db<>0 OR NEW.actor_id IS NULL OR EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_rewards q WHERE q.project_id=NEW.project_id AND q.promoter_user_id=NEW.user_id AND q.state='reversal_pending') THEN RAISE EXCEPTION 'IMPULSA_WITHDRAWAL_INVALID' USING ERRCODE='22023'; END IF;
  NEW.real_delta:=NEW.amount_delta; NEW.impulsa_delta:=NEW.amount_delta; rh:=rh-wd.amount; ih:=ih-wd.amount;
 ELSE RAISE EXCEPTION 'WALLET_SOURCE_UNCLASSIFIED_TRANSACTION' USING ERRCODE='22023'; END IF;
 IF NEW.debt_delta<0 AND NEW.debt_job_id IS NULL THEN NEW.debt_job_id:=app_private.wallet_open_debt_job(NEW.project_id,NEW.user_id); END IF;
 IF NEW.debt_delta<>0 AND NEW.debt_job_id IS NULL THEN RAISE EXCEPTION 'DEBT_ORIGIN_REQUIRED'; END IF;
 IF NEW.real_delta+NEW.promotional_delta-NEW.debt_delta<>NEW.amount_delta OR db+NEW.debt_delta<0 OR rb+NEW.real_delta<rh OR pb+NEW.promotional_delta<ph OR ib+NEW.impulsa_delta<ih OR rb+NEW.real_delta-ib-NEW.impulsa_delta<rh-ih THEN RAISE EXCEPTION 'WALLET_SOURCE_NEGATIVE_OR_RESERVED' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;

-- New public functions use authenticated identity and project permissions only.
CREATE OR REPLACE FUNCTION app_private.wallet_transition_summary(pid uuid,uid uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p app_private.marketplace_wallet_transition_policy%ROWTYPE; b record; debt numeric; ia numeric; ih numeric; pending boolean;
BEGIN
 SELECT * INTO p FROM app_private.marketplace_wallet_transition_policy WHERE project_id=pid;
 SELECT * INTO b FROM app_private.marketplace_wallet_source_balances(pid,uid);
 debt:=app_private.wallet_debt(pid,uid); ia:=app_private.wallet_impulsa_available(pid,uid); ih:=app_private.wallet_withdrawal_hold(pid,uid);
 pending:=EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_rewards r WHERE r.project_id=pid AND r.promoter_user_id=uid AND r.state='reversal_pending');
 RETURN jsonb_build_object('ready',coalesce(p.engine_ready,false),'active',app_private.wallet_transition_active(pid),'net_balance',app_private.marketplace_wallet_total_balance(pid,uid),
 'available_balance',app_private.marketplace_wallet_available_balance(pid,uid),'debt_cup',debt,'cash_balance',b.real_balance-app_private.wallet_impulsa_balance(pid,uid),
 'promotional_balance',b.promotional_balance,'impulsa_balance',app_private.wallet_impulsa_balance(pid,uid),'impulsa_available',ia,'withdrawal_reserved',ih,
 'withdrawal_minimum_cup',coalesce(p.withdrawal_minimum_cup,5000),'withdrawals_enabled',coalesce(p.withdrawals_enabled AND p.engine_ready AND p.activated_at IS NOT NULL,false),
 'can_withdraw',coalesce(p.engine_ready AND p.activated_at IS NOT NULL AND p.withdrawals_enabled AND debt=0 AND ia>=p.withdrawal_minimum_cup AND NOT pending,false),
 'credit_available',coalesce(p.engine_ready AND p.activated_at IS NOT NULL AND p.credit_enabled AND debt=0 AND app_private.wallet_credit_unused(pid,uid),false),
 'credit_limit_cup',coalesce(p.credit_limit_cup,500),'reversal_pending',pending,
 'withdrawals',coalesce((SELECT jsonb_agg(to_jsonb(w) - 'request_key' - 'resolution_key' - 'resolved_by' ORDER BY w.requested_at DESC) FROM (SELECT * FROM app_private.marketplace_impulsa_withdrawals x WHERE x.project_id=pid AND x.user_id=uid ORDER BY requested_at DESC LIMIT 20) w),'[]'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION public.get_my_marketplace_wallet_transition_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); pid uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT id INTO pid FROM public.projects WHERE slug='tuktuk-control';
 IF NOT EXISTS(SELECT 1 FROM public.driver_profiles d WHERE d.project_id=pid AND d.user_id=actor) THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND' USING ERRCODE='42501'; END IF;
 RETURN app_private.wallet_transition_summary(pid,actor);
END $$;
CREATE OR REPLACE FUNCTION public.request_my_marketplace_impulsa_withdrawal_v1(target_amount numeric,target_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); pid uuid; p app_private.marketplace_wallet_transition_policy%ROWTYPE; w app_private.marketplace_impulsa_withdrawals%ROWTYPE;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF target_key IS NULL OR target_amount IS NULL OR target_amount<=0 OR target_amount>100000000 OR target_amount<>round(target_amount,2) THEN RAISE EXCEPTION 'INVALID_WITHDRAWAL_AMOUNT' USING ERRCODE='22023'; END IF;
 SELECT id INTO pid FROM public.projects WHERE slug='tuktuk-control';
 PERFORM 1 FROM public.wallets WHERE project_id=pid AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
 SELECT * INTO w FROM app_private.marketplace_impulsa_withdrawals WHERE project_id=pid AND user_id=actor AND request_key=target_key;
 IF FOUND THEN IF w.amount<>target_amount THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'; END IF; RETURN to_jsonb(w); END IF;
 SELECT * INTO p FROM app_private.marketplace_wallet_transition_policy WHERE project_id=pid;
 IF NOT FOUND OR NOT p.engine_ready OR p.activated_at IS NULL OR NOT p.withdrawals_enabled OR target_amount<p.withdrawal_minimum_cup
 OR app_private.wallet_debt(pid,actor)>0 OR app_private.wallet_impulsa_available(pid,actor)<target_amount
 OR EXISTS(SELECT 1 FROM app_private.marketplace_impulsa_rewards q WHERE q.project_id=pid AND q.promoter_user_id=actor AND q.state='reversal_pending') THEN RAISE EXCEPTION 'IMPULSA_WITHDRAWAL_NOT_AVAILABLE' USING ERRCODE='22023'; END IF;
 INSERT INTO app_private.marketplace_impulsa_withdrawals(project_id,user_id,amount,minimum_snapshot,request_key) VALUES(pid,actor,target_amount,p.withdrawal_minimum_cup,target_key) RETURNING * INTO w;
 RETURN to_jsonb(w);
END $$;
CREATE OR REPLACE FUNCTION public.admin_resolve_marketplace_impulsa_withdrawal_v1(target_project_id uuid,target_id uuid,target_status text,target_reference text,target_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; uid uuid; w app_private.marketplace_impulsa_withdrawals%ROWTYPE; tx uuid; ref text:=nullif(btrim(target_reference),'');
BEGIN
 actor:=app_private.require_project_permission(target_project_id,'payments.manage');
 PERFORM app_private.require_project_permission(target_project_id,'commercial.manage');
 IF target_status NOT IN ('paid','rejected') OR target_key IS NULL OR ref IS NULL OR length(ref)>500 THEN RAISE EXCEPTION 'INVALID_WITHDRAWAL_RESOLUTION' USING ERRCODE='22023'; END IF;
 SELECT user_id INTO uid FROM app_private.marketplace_impulsa_withdrawals WHERE project_id=target_project_id AND id=target_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.wallets WHERE project_id=target_project_id AND user_id=uid FOR UPDATE;
 SELECT * INTO w FROM app_private.marketplace_impulsa_withdrawals WHERE project_id=target_project_id AND id=target_id FOR UPDATE;
 IF w.status<>'requested' THEN
  IF w.status=target_status AND w.resolution_key=target_key AND w.payment_reference=ref THEN RETURN to_jsonb(w); END IF;
  RAISE EXCEPTION 'WITHDRAWAL_ALREADY_RESOLVED';
 END IF;
 IF target_status='paid' THEN
  INSERT INTO public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,actor_id,metadata)
  VALUES(target_project_id,uid,'CUP','impulsa_withdrawal',-w.amount,app_private.marketplace_wallet_total_balance(target_project_id,uid)-w.amount,'impulsa_withdrawal',w.id::text,target_key,actor,jsonb_build_object('payment_reference',ref))
  RETURNING id INTO tx;
 END IF;
 UPDATE app_private.marketplace_impulsa_withdrawals SET status=target_status,resolved_at=now(),resolved_by=actor,resolution_key=target_key,payment_reference=ref,ledger_transaction_id=tx WHERE id=w.id RETURNING * INTO w;
 RETURN to_jsonb(w);
END $$;
CREATE OR REPLACE FUNCTION public.cancel_my_marketplace_impulsa_withdrawal_v1(target_id uuid,target_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); pid uuid; w app_private.marketplace_impulsa_withdrawals%ROWTYPE;
BEGIN
 IF actor IS NULL OR target_key IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT id INTO pid FROM public.projects WHERE slug='tuktuk-control';
 PERFORM 1 FROM public.wallets WHERE project_id=pid AND user_id=actor FOR UPDATE;
 SELECT * INTO w FROM app_private.marketplace_impulsa_withdrawals WHERE project_id=pid AND id=target_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF w.status='cancelled' AND w.resolution_key=target_key THEN RETURN to_jsonb(w); END IF;
 IF w.status<>'requested' THEN RAISE EXCEPTION 'WITHDRAWAL_ALREADY_RESOLVED'; END IF;
 UPDATE app_private.marketplace_impulsa_withdrawals SET status='cancelled',resolved_at=now(),resolved_by=actor,resolution_key=target_key,payment_reference='Cancelada por el conductor' WHERE id=w.id RETURNING * INTO w;
 RETURN to_jsonb(w);
END $$;
CREATE OR REPLACE FUNCTION public.admin_list_marketplace_impulsa_withdrawals_v1(target_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app_private.require_project_permission(target_project_id,'payments.view');
 PERFORM app_private.require_project_permission(target_project_id,'commercial.view');
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY (x.status='requested') DESC,x.requested_at DESC) FROM (
 SELECT w.*,p.display_name FROM app_private.marketplace_impulsa_withdrawals w LEFT JOIN public.profiles p ON p.id=w.user_id WHERE w.project_id=target_project_id ORDER BY (w.status='requested') DESC,w.requested_at DESC LIMIT 100
 ) x),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.admin_get_marketplace_wallet_transition_summary_v1(target_project_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app_private.require_project_permission(target_project_id,'payments.view');
 PERFORM app_private.require_project_permission(target_project_id,'commercial.view');
 RETURN jsonb_build_object('debt_cup',coalesce((SELECT sum(t.debt_delta) FROM public.wallet_transactions t WHERE t.project_id=target_project_id),0),
 'debt_drivers',(SELECT count(*) FROM public.wallets w WHERE w.project_id=target_project_id AND app_private.wallet_debt(w.project_id,w.user_id)>0),
 'pending_withdrawals',(SELECT count(*) FROM app_private.marketplace_impulsa_withdrawals w WHERE w.project_id=target_project_id AND w.status='requested'),
 'pending_withdrawal_cup',coalesce((SELECT sum(w.amount) FROM app_private.marketplace_impulsa_withdrawals w WHERE w.project_id=target_project_id AND w.status='requested'),0),
 'drivers',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.debt_cup DESC) FROM (SELECT w.user_id,p.display_name,app_private.wallet_debt(w.project_id,w.user_id) AS debt_cup,app_private.marketplace_wallet_total_balance(w.project_id,w.user_id) AS net_balance FROM public.wallets w JOIN public.profiles p ON p.id=w.user_id WHERE w.project_id=target_project_id AND app_private.wallet_debt(w.project_id,w.user_id)>0 ORDER BY debt_cup DESC LIMIT 100) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_my_marketplace_wallet_transition_v1(), public.request_my_marketplace_impulsa_withdrawal_v1(numeric,uuid),public.admin_resolve_marketplace_impulsa_withdrawal_v1(uuid,uuid,text,text,uuid),public.cancel_my_marketplace_impulsa_withdrawal_v1(uuid,uuid),public.admin_list_marketplace_impulsa_withdrawals_v1(uuid),public.admin_get_marketplace_wallet_transition_summary_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_marketplace_wallet_transition_v1(),public.request_my_marketplace_impulsa_withdrawal_v1(numeric,uuid),public.admin_resolve_marketplace_impulsa_withdrawal_v1(uuid,uuid,text,text,uuid),public.cancel_my_marketplace_impulsa_withdrawal_v1(uuid,uuid),public.admin_list_marketplace_impulsa_withdrawals_v1(uuid),public.admin_get_marketplace_wallet_transition_summary_v1(uuid) TO authenticated;
REVOKE ALL ON FUNCTION app_private.wallet_transition_active(uuid),app_private.wallet_debt(uuid,uuid),app_private.wallet_debt_for_job(uuid,uuid,uuid),app_private.wallet_open_debt_job(uuid,uuid),app_private.wallet_impulsa_balance(uuid,uuid),app_private.wallet_withdrawal_hold(uuid,uuid),app_private.wallet_impulsa_available(uuid,uuid),app_private.wallet_credit_unused(uuid,uuid),app_private.wallet_can_finance(uuid,uuid,uuid,numeric),app_private.wallet_cash_collected(uuid,uuid),app_private.wallet_transition_summary(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
