SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.project_marketplace_financial_settings f JOIN public.projects p ON p.id=f.project_id WHERE p.slug='tuktuk-control' AND f.commission_enabled) THEN RAISE EXCEPTION 'COLLECTION_MUST_BE_DISABLED'; END IF; END $$;
-- Stage 1: audited draft only. No new charges, debts, withdrawals or credits.
CREATE TABLE app_private.marketplace_wallet_transition_policy (
 project_id uuid PRIMARY KEY REFERENCES public.projects(id),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 credit_enabled boolean NOT NULL DEFAULT true,
 credit_limit_cup numeric(14,2) NOT NULL DEFAULT 500 CHECK(credit_limit_cup BETWEEN .01 AND 1000000),
 withdrawals_enabled boolean NOT NULL DEFAULT true,
 withdrawal_minimum_cup numeric(14,2) NOT NULL DEFAULT 5000 CHECK(withdrawal_minimum_cup BETWEEN .01 AND 100000000),
 remove_free_days boolean NOT NULL DEFAULT true,
 engine_ready boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
CREATE TABLE app_private.marketplace_wallet_transition_history (
 project_id uuid NOT NULL REFERENCES public.projects(id),
 version bigint NOT NULL,
 actor uuid NOT NULL,
 old_policy jsonb NOT NULL,
 new_policy jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,version)
);
ALTER TABLE app_private.marketplace_wallet_transition_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.marketplace_wallet_transition_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.marketplace_wallet_transition_policy,app_private.marketplace_wallet_transition_history FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO app_private.marketplace_wallet_transition_policy(project_id)
 SELECT id FROM public.projects WHERE slug='tuktuk-control';

CREATE OR REPLACE FUNCTION public.admin_get_marketplace_wallet_transition_v1(target_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM app_private.require_project_permission(target_project_id,'settings.view');
 PERFORM app_private.require_project_permission(target_project_id,'commercial.view');
 SELECT to_jsonb(t)-'updated_by' INTO result FROM app_private.marketplace_wallet_transition_policy t WHERE project_id=target_project_id;
 IF result IS NULL THEN RAISE EXCEPTION 'WALLET_TRANSITION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_marketplace_wallet_transition_v1(
 target_project_id uuid,target_expected_version bigint,target_credit_enabled boolean,target_credit_limit_cup numeric,
 target_withdrawals_enabled boolean,target_withdrawal_minimum_cup numeric,target_remove_free_days boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; previous app_private.marketplace_wallet_transition_policy%ROWTYPE; updated app_private.marketplace_wallet_transition_policy%ROWTYPE;
BEGIN
 actor:=app_private.require_project_permission(target_project_id,'settings.manage');
 PERFORM app_private.require_project_permission(target_project_id,'commercial.manage');
 PERFORM app_private.require_project_permission(target_project_id,'payments.manage');
 IF target_expected_version IS NULL OR target_credit_enabled IS NULL OR target_withdrawals_enabled IS NULL OR target_remove_free_days IS NULL
 OR target_credit_limit_cup IS NULL OR target_credit_limit_cup NOT BETWEEN .01 AND 1000000 OR target_credit_limit_cup<>round(target_credit_limit_cup,2)
 OR target_withdrawal_minimum_cup IS NULL OR target_withdrawal_minimum_cup NOT BETWEEN .01 AND 100000000 OR target_withdrawal_minimum_cup<>round(target_withdrawal_minimum_cup,2)
 THEN RAISE EXCEPTION 'INVALID_WALLET_TRANSITION_POLICY' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM app_private.marketplace_wallet_transition_policy WHERE project_id=target_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_TRANSITION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF previous.version<>target_expected_version THEN RAISE EXCEPTION 'WALLET_TRANSITION_CHANGED' USING ERRCODE='40001'; END IF;
 IF previous.engine_ready THEN RAISE EXCEPTION 'WALLET_TRANSITION_V1_DRAFT_ONLY' USING ERRCODE='22023'; END IF;
 UPDATE app_private.marketplace_wallet_transition_policy SET
 credit_enabled=target_credit_enabled,credit_limit_cup=target_credit_limit_cup,
 withdrawals_enabled=target_withdrawals_enabled,withdrawal_minimum_cup=target_withdrawal_minimum_cup,
 remove_free_days=target_remove_free_days,version=version+1,updated_at=now(),updated_by=actor
 WHERE project_id=target_project_id RETURNING * INTO updated;
 INSERT INTO app_private.marketplace_wallet_transition_history(project_id,version,actor,old_policy,new_policy)
 VALUES(target_project_id,updated.version,actor,to_jsonb(previous),to_jsonb(updated));
 RETURN to_jsonb(updated)-'updated_by';
END $$;
REVOKE ALL ON FUNCTION public.admin_get_marketplace_wallet_transition_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_save_marketplace_wallet_transition_v1(uuid,bigint,boolean,numeric,boolean,numeric,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_marketplace_wallet_transition_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_marketplace_wallet_transition_v1(uuid,bigint,boolean,numeric,boolean,numeric,boolean) TO authenticated;

-- Fail closed: the original switch cannot turn on collection while the credit and withdrawal
-- adapters are incomplete. Turning collection off always remains possible.
CREATE OR REPLACE FUNCTION app_private.marketplace_wallet_transition_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.commission_enabled AND NOT OLD.commission_enabled
 AND EXISTS(SELECT 1 FROM app_private.marketplace_wallet_transition_policy p WHERE p.project_id=NEW.project_id AND NOT p.engine_ready)
 THEN RAISE EXCEPTION 'WALLET_TRANSITION_ENGINE_NOT_READY' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.marketplace_wallet_transition_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER marketplace_wallet_transition_guard BEFORE UPDATE OF commission_enabled ON public.project_marketplace_financial_settings
 FOR EACH ROW EXECUTE FUNCTION app_private.marketplace_wallet_transition_guard();

-- Exclude test/deleted rides before selecting the first qualifying event. Preserve historical
-- rewards and existing relationship/version guards; do not award or backfill in this migration.
CREATE OR REPLACE FUNCTION app_private.marketplace_referral_first_qualification(target_project_id uuid,target_user_id uuid)
RETURNS TABLE(job_id uuid,qualified_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT q.job_id,q.qualified_at FROM (
  SELECT j.id AS job_id,e.created_at AS qualified_at FROM public.jobs j
  JOIN public.job_events e ON e.project_id=j.project_id AND e.job_id=j.id AND e.to_status='settled' AND e.action='settle'
  WHERE j.project_id=target_project_id AND j.assigned_driver_user_id=target_user_id AND NOT j.is_test AND j.test_deleted_at IS NULL
  UNION ALL
  SELECT j.id,r.resolved_at FROM public.jobs j JOIN public.marketplace_incident_resolutions r ON r.project_id=j.project_id AND r.job_id=j.id
  WHERE j.project_id=target_project_id AND j.assigned_driver_user_id=target_user_id AND r.resolution='completed' AND NOT j.is_test AND j.test_deleted_at IS NULL
 ) q ORDER BY q.qualified_at,q.job_id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION app_private.marketplace_referral_first_qualification(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
