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
CREATE TABLE public.wallet_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,user_id uuid,currency text NOT NULL,transaction_type text NOT NULL,amount_delta numeric NOT NULL,balance_after numeric NOT NULL,source_type text NOT NULL,source_id text NOT NULL,idempotency_key uuid NOT NULL,actor_id uuid,metadata jsonb NOT NULL DEFAULT '{}',real_delta numeric NOT NULL DEFAULT 0,promotional_delta numeric NOT NULL DEFAULT 0,reversed_ledger_id uuid,created_at timestamptz DEFAULT now(),UNIQUE(project_id,source_type,source_id,transaction_type),UNIQUE(project_id,idempotency_key),CONSTRAINT wallet_transactions_source_sum_check CHECK(real_delta+promotional_delta=amount_delta),CONSTRAINT wallet_transactions_balance_after_check CHECK(balance_after>=0));
CREATE TABLE public.topups(id uuid PRIMARY KEY,project_id uuid,user_id uuid,status text,amount numeric,currency text);
CREATE TABLE public.commission_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,job_id uuid,user_id uuid,status text,amount numeric,currency text DEFAULT 'CUP',final_price_snapshot numeric,commission_rate_snapshot numeric,real_reserved_amount numeric DEFAULT 0,promotional_reserved_amount numeric DEFAULT 0,ledger_transaction_id uuid,UNIQUE(project_id,job_id));
CREATE TABLE public.marketplace_incident_resolutions(project_id uuid,job_id uuid,resolution text);
CREATE TABLE public.job_events(project_id uuid,job_id uuid,action text,to_status text,metadata jsonb DEFAULT '{}');
CREATE FUNCTION app_private.marketplace_wallet_total_balance(uuid,uuid) RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT coalesce(sum(amount_delta),0) FROM public.wallet_transactions WHERE project_id=$1 AND user_id=$2 $$;
CREATE OR REPLACE FUNCTION app_private.marketplace_wallet_source_balances(target_project_id uuid, target_user_id uuid)
 RETURNS TABLE(real_balance numeric, promotional_balance numeric, real_reserved_balance numeric, promotional_reserved_balance numeric, real_available_balance numeric, promotional_available_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare real_total numeric; promo_total numeric; promo_hold numeric; real_hold numeric;
begin
 select coalesce(sum(t.real_delta),0),coalesce(sum(t.promotional_delta),0)
   into real_total,promo_total from public.wallet_transactions t
   where t.project_id=target_project_id and t.user_id=target_user_id;
 select coalesce(sum(r.real_reserved_amount),0),coalesce(sum(r.promotional_reserved_amount),0)
   into real_hold,promo_hold from public.commission_reservations r
   where r.project_id=target_project_id and r.user_id=target_user_id and r.status='open';
 if real_total<0 or promo_total<0 or real_hold<0 or promo_hold<0
   or real_hold>real_total or promo_hold>promo_total
   or real_hold+promo_hold<>app_private.marketplace_wallet_reserved_balance(target_project_id,target_user_id) then
   raise exception 'WALLET_SOURCE_RESERVATION_INTEGRITY_FAILURE' using errcode='22023';
 end if;
 return query select real_total,promo_total,real_hold,promo_hold,real_total-real_hold,promo_total-promo_hold;
end;
$function$;

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
\set ON_ERROR_STOP on
-- Extends the isolated finance fixture with production-shaped acceptance,
-- available offers, wallet reservation and service settlement dependencies.
-- Same production functions, real Postgres, no real accounts or network.
ALTER TABLE public.project_marketplace_financial_settings ADD COLUMN wallet_currency text NOT NULL DEFAULT 'CUP';
ALTER TABLE public.commission_reservations ALTER COLUMN status SET DEFAULT 'open', ADD COLUMN consumed_at timestamptz;
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

-- Additional production-shaped dependencies for debt, activation and withdrawal.
ALTER TABLE public.project_marketplace_financial_settings ADD COLUMN promotion_enabled boolean NOT NULL DEFAULT true,ADD COLUMN promotion_duration_days integer NOT NULL DEFAULT 5,ADD COLUMN promotion_rule_version integer NOT NULL DEFAULT 1,ADD COLUMN promotion_effective_at timestamptz DEFAULT now(),ADD COLUMN initial_minimum_deposit numeric NOT NULL DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN initial_deposit_confirmed_at timestamptz,ADD COLUMN initial_deposit_amount numeric,ADD COLUMN initial_minimum_snapshot numeric,ADD COLUMN initial_deposit_topup_id uuid,ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE public.commission_reservations ADD COLUMN opened_at timestamptz DEFAULT now(),ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN released_at timestamptz,ADD COLUMN release_reason text;
ALTER TABLE public.commission_reservations ADD CONSTRAINT commission_reservations_source_sum_check CHECK(real_reserved_amount>=0 AND promotional_reserved_amount>=0 AND real_reserved_amount+promotional_reserved_amount=amount);
ALTER TABLE public.job_events ADD COLUMN created_at timestamptz DEFAULT now();
ALTER TABLE public.jobs ADD COLUMN published_at timestamptz;
ALTER TABLE public.marketplace_incident_resolutions ADD COLUMN resolved_at timestamptz DEFAULT now(),ADD COLUMN driver_user_id uuid,ADD COLUMN billing_mode text NOT NULL DEFAULT 'wallet_commission',ADD COLUMN resolution_note text,ADD COLUMN commission_amount_snapshot numeric,ADD COLUMN resolution_idempotency_key uuid,ADD COLUMN ledger_transaction_id uuid,ADD COLUMN resolved_by uuid;
ALTER TABLE public.marketplace_incident_resolutions ADD CONSTRAINT marketplace_incident_resolutions_billing_mode_check CHECK(billing_mode IN ('trial_free','wallet_commission'));
ALTER TABLE public.driver_vehicle_assignments ADD COLUMN accepting_jobs boolean DEFAULT true,ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE public.driver_profiles ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN suspension_reason text;
ALTER TABLE public.vehicles ADD COLUMN name text,ADD COLUMN propulsion_code text,ADD COLUMN brand text,ADD COLUMN model text;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,display_name text,phone text);
CREATE TABLE public.marketplace_test_mode(project_id uuid,target_driver_user_id uuid,enabled boolean,force_wallet_commission boolean);
CREATE TABLE public.marketplace_driver_locations(project_id uuid,driver_user_id uuid,vehicle_id text,captured_at timestamptz,received_at timestamptz);
CREATE TABLE public.project_marketplace_dispatch_settings(project_id uuid,enabled boolean);
CREATE TABLE public.push_device_tokens(project_id uuid,user_id uuid,app_scope text,enabled boolean,platform text,job_alert_channel_version integer);
ALTER TABLE app_private.marketplace_driver_promo_settings ADD COLUMN priority_enabled boolean DEFAULT false,ADD COLUMN priority_seconds integer DEFAULT 0;
CREATE FUNCTION app_private.resolve_marketplace_promo_profile(text) RETURNS TABLE(project_id uuid,driver_user_id uuid,vehicle_id text,category_code text,service_codes text[]) LANGUAGE sql STABLE AS $$ SELECT NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text[] WHERE false $$;
CREATE FUNCTION app_private.marketplace_promo_base_candidate_state(uuid,uuid,text,uuid) RETURNS TABLE(allowed boolean) LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION app_private.has_project_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION app_private.has_confirmed_marketplace_initial_deposit(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.marketplace_welcome_policy_events(project_id uuid,actor uuid,prior_enabled boolean,prior_days integer,new_enabled boolean,new_days integer);
CREATE TABLE public.marketplace_commission_policy_events(project_id uuid,actor uuid,previous_enabled boolean,new_enabled boolean,rate_snapshot numeric);
ALTER TABLE public.topups ADD COLUMN confirmation_idempotency_key uuid,ADD COLUMN ledger_transaction_id uuid,ADD COLUMN confirmed_by uuid,ADD COLUMN confirmed_at timestamptz,ADD COLUMN updated_at timestamptz DEFAULT now();
CREATE TABLE public.marketplace_financial_documents(id uuid DEFAULT gen_random_uuid());
CREATE FUNCTION app_private.issue_marketplace_topup_receipt(uuid,uuid,uuid,uuid) RETURNS public.marketplace_financial_documents LANGUAGE sql AS $$ SELECT ROW(gen_random_uuid())::public.marketplace_financial_documents $$;
CREATE OR REPLACE FUNCTION public.admin_set_marketplace_commission_only(target_project_id uuid, target_commission_rate numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
begin
  actor := app_private.require_project_permission(target_project_id,'settings.manage');
  if target_commission_rate is null or target_commission_rate<=0
     or target_commission_rate>1 then
    raise exception 'INVALID_COMMISSION_RATE' using errcode='22023';
  end if;
  update public.project_marketplace_financial_settings
     set commission_rate=target_commission_rate, updated_by=actor,updated_at=now()
   where project_id=target_project_id;
  if not found then
    raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode='P0002';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_marketplace_commission_enabled(target_project_id uuid, target_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid; s public.project_marketplace_financial_settings%rowtype;
begin
  actor:=app_private.require_project_permission(target_project_id,'settings.manage');
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  if target_enabled is null then raise exception 'COMMISSION_POLICY_REQUIRED' using errcode='22023'; end if;
  select * into s from public.project_marketplace_financial_settings
    where project_id=target_project_id for update;
  if not found then raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode='P0002'; end if;
  if s.commission_enabled is distinct from target_enabled then
    update public.project_marketplace_financial_settings
      set commission_enabled=target_enabled,updated_by=actor,updated_at=now()
    where project_id=target_project_id;
    insert into public.marketplace_commission_policy_events
     (project_id,actor,previous_enabled,new_enabled,rate_snapshot)
     values(target_project_id,actor,s.commission_enabled,target_enabled,s.commission_rate);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_marketplace_welcome_policy(target_project_id uuid, target_enabled boolean, target_duration_days integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
  old_s public.project_marketplace_financial_settings%rowtype;
begin
  actor := app_private.require_project_permission(target_project_id,'settings.manage');
  if target_enabled is null or target_duration_days is null
     or target_duration_days not between 1 and 365 then
    raise exception 'INVALID_MARKETPLACE_WELCOME_POLICY' using errcode='22023';
  end if;

  select * into old_s
  from public.project_marketplace_financial_settings
  where project_id=target_project_id
  for update;
  if not found then
    raise exception 'MARKETPLACE_FINANCIAL_SETTINGS_NOT_FOUND' using errcode='P0002';
  end if;
  if old_s.promotion_enabled is not distinct from target_enabled
     and old_s.promotion_duration_days is not distinct from target_duration_days then
    return;
  end if;

  update public.project_marketplace_financial_settings
     set promotion_enabled=target_enabled,
         promotion_duration_days=target_duration_days,
         promotion_rule_version=old_s.promotion_rule_version+1,
         promotion_effective_at=now(),
         updated_by=actor,
         updated_at=now()
   where project_id=target_project_id;

  insert into public.marketplace_welcome_policy_events
    (project_id,actor,prior_enabled,prior_days,new_enabled,new_days)
  values (target_project_id,actor,old_s.promotion_enabled,
          old_s.promotion_duration_days,target_enabled,target_duration_days);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_confirm_marketplace_topup(target_project_id uuid, target_topup_id uuid, target_confirmation_idempotency_key uuid)
 RETURNS topups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
  topup_record public.topups%rowtype;
  wallet_record public.wallets%rowtype;
  transaction_id uuid;
  prior_balance numeric;
  receipt public.marketplace_financial_documents%rowtype;
begin
  actor:=app_private.require_project_permission(
    target_project_id,
    'payments.manage'
  );

  if target_confirmation_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;

  select * into topup_record
  from public.topups
  where id=target_topup_id and project_id=target_project_id
  for update;

  if not found then
    raise exception 'TOPUP_NOT_FOUND' using errcode='P0002';
  end if;

  select * into wallet_record
  from public.wallets
  where project_id=topup_record.project_id
    and user_id=topup_record.user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode='P0002';
  end if;

  if topup_record.status in ('confirmed','reconciled') then
    if topup_record.confirmation_idempotency_key
       is distinct from target_confirmation_idempotency_key then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'
        using errcode='22023';
    end if;

    perform app_private.issue_marketplace_topup_receipt(
      target_project_id,
      topup_record.id,
      coalesce(topup_record.confirmed_by,actor),
      target_confirmation_idempotency_key
    );

    return topup_record;
  end if;

  if topup_record.status='rejected' then
    raise exception 'REJECTED_TOPUP_CANNOT_BE_CONFIRMED'
      using errcode='22023';
  end if;

  prior_balance:=app_private.marketplace_wallet_total_balance(
    target_project_id,
    topup_record.user_id
  );

  insert into public.wallet_transactions(
    project_id,user_id,currency,transaction_type,amount_delta,balance_after,
    source_type,source_id,idempotency_key,actor_id,metadata
  )
  values(
    target_project_id,
    topup_record.user_id,
    topup_record.currency,
    'topup',
    topup_record.amount,
    prior_balance+topup_record.amount,
    'topup',
    topup_record.id::text,
    target_confirmation_idempotency_key,
    actor,
    jsonb_build_object('topup_id',topup_record.id)
  )
  returning id into transaction_id;

  update public.topups
  set status='confirmed',
      confirmation_idempotency_key=target_confirmation_idempotency_key,
      ledger_transaction_id=transaction_id,
      confirmed_by=actor,
      confirmed_at=now(),
      updated_at=now()
  where id=topup_record.id and project_id=target_project_id
  returning * into topup_record;

  receipt:=app_private.issue_marketplace_topup_receipt(
    target_project_id,
    topup_record.id,
    actor,
    target_confirmation_idempotency_key
  );

  return topup_record;
end;
$function$;

\i docs/security/tuktuk-wallet-transition-policy-candidate.sql
\i docs/security/tuktuk-wallet-credit-core-candidate.sql
\i docs/security/tuktuk-wallet-credit-adapter-candidate.sql
CREATE TRIGGER commission_reservations_protect_provenance BEFORE UPDATE ON public.commission_reservations FOR EACH ROW EXECUTE FUNCTION app_private.protect_commission_reservation_provenance();

CREATE FUNCTION pg_temp.add_driver(uid uuid,vid text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001';
BEGIN
 INSERT INTO public.profiles VALUES(uid,vid,'+5355555555');
 INSERT INTO public.driver_profiles(project_id,user_id,status,activated_at) VALUES(pid,uid,'active',now());
 INSERT INTO public.driver_vehicle_assignments(project_id,driver_user_id,vehicle_id,is_active,is_available) VALUES(pid,uid,vid,true,true);
 INSERT INTO public.vehicles(project_id,id,marketplace_status,category_code,passenger_capacity) VALUES(pid,vid,'active','tricycle',4);
 INSERT INTO public.vehicle_services VALUES(pid,vid,'passenger',true);
 INSERT INTO public.wallets(project_id,user_id,currency) VALUES(pid,uid,'CUP');
END $$;
CREATE FUNCTION pg_temp.confirm_topup(uid uuid,amount numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001'; tid uuid:=gen_random_uuid(); previous text:=current_setting('request.jwt.claim.sub',true); t public.topups%ROWTYPE;
BEGIN
 INSERT INTO public.topups(id,project_id,user_id,status,amount,currency) VALUES(tid,pid,uid,'requested',amount,'CUP');
 PERFORM set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
 t:=public.admin_confirm_marketplace_topup(pid,tid,gen_random_uuid());
 PERFORM set_config('request.jwt.claim.sub',coalesce(previous,''),true);
 RETURN t.ledger_transaction_id;
END $$;
CREATE FUNCTION pg_temp.finish_driver(jid uuid,uid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001';
BEGIN
 UPDATE public.jobs SET status='in_progress' WHERE id=jid;
 INSERT INTO public.marketplace_driver_customer_ratings VALUES(pid,jid,uid);
 PERFORM app_private.finish_marketplace_job_core(jid,'driver',uid,NULL,NULL,gen_random_uuid());
END $$;

DO $$
DECLARE pid uuid:='10000000-0000-0000-0000-000000000001'; admin uuid:='90000000-0000-0000-0000-000000000001'; promoter uuid:='20000000-0000-0000-0000-000000000001'; driver uuid:='20000000-0000-0000-0000-000000000002'; driver2 uuid:='20000000-0000-0000-0000-000000000003'; driver3 uuid:='20000000-0000-0000-0000-000000000004'; driver4 uuid:='20000000-0000-0000-0000-000000000005';
 old_job uuid; j uuid; fleet uuid; nextj uuid; wd uuid; key uuid:=gen_random_uuid(); payment_key uuid:=gen_random_uuid(); s jsonb; tx uuid; c numeric; k uuid;
BEGIN
 PERFORM pg_temp.add_driver(promoter,'v1'); PERFORM pg_temp.add_driver(driver,'v2'); PERFORM pg_temp.add_driver(driver2,'v3'); PERFORM pg_temp.add_driver(driver3,'v4'); PERFORM pg_temp.add_driver(driver4,'v5');
 PERFORM set_config('request.jwt.claim.sub',admin::text,true);
 old_job:=pg_temp.publish_real(1000,false);
 INSERT INTO public.marketplace_work_trials VALUES(pid,driver,now()-interval '1 day',now()+interval '4 days');
 BEGIN PERFORM public.admin_activate_marketplace_wallet_transition_v1(pid,1); RAISE EXCEPTION 'premature activation'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 UPDATE app_private.marketplace_wallet_transition_policy SET engine_ready=true WHERE project_id=pid;
 BEGIN UPDATE public.project_marketplace_financial_settings SET commission_enabled=true WHERE project_id=pid; RAISE EXCEPTION 'bypass activation'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 s:=public.admin_activate_marketplace_wallet_transition_v1(pid,1);
 PERFORM pg_temp.check_true((SELECT commission_enabled AND commission_rate=.15 AND NOT promotion_enabled FROM public.project_marketplace_financial_settings WHERE project_id=pid),'atomic cutover general 15 no free');
 PERFORM pg_temp.check_true((SELECT enabled AND general_rate=.15 AND own_rate=.10 AND commercial_rate=.05 FROM app_private.marketplace_impulsa_policy WHERE project_id=pid),'Impulsa activated atomically');
 PERFORM pg_temp.check_true(NOT app_private.has_active_marketplace_work_trial(driver),'old free trial no longer grants free future jobs');
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 PERFORM pg_temp.check_true((SELECT billing_mode='platform_free' AND commission_amount=0 FROM public.list_my_marketplace_available_jobs('v2') WHERE job_id=old_job),'old published ride preserves free terms');
 PERFORM public.accept_job(old_job,'v2',gen_random_uuid()); PERFORM pg_temp.finish_driver(old_job,driver);
 PERFORM pg_temp.check_true(app_private.marketplace_wallet_total_balance(pid,driver)=0,'old ride no debit');
 j:=pg_temp.publish_real(4000,false);
 PERFORM pg_temp.check_true((SELECT NOT can_accept FROM public.list_my_marketplace_available_jobs('v2') WHERE job_id=j),'over 500 credit limit denied');
 BEGIN PERFORM public.accept_job(j,'v2',gen_random_uuid()); RAISE EXCEPTION 'over limit accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 fleet:=pg_temp.publish_real(1000);
 PERFORM pg_temp.check_true((SELECT can_accept AND commission_rate=.15 AND commission_amount=150 FROM public.list_my_marketplace_available_jobs('v2') WHERE job_id=fleet),'zero balance eligible for one credit');
 PERFORM pg_temp.check_true(app_private.marketplace_driver_can_receive_job(pid,driver,'v2',fleet),'radar sees eligible credit driver');
 PERFORM public.accept_job(fleet,'v2',key);
 PERFORM public.accept_job(fleet,'v2',key);
 PERFORM pg_temp.check_true((SELECT amount=150 AND credit_reserved_amount=150 AND real_reserved_amount=0 AND promotional_reserved_amount=0 FROM public.commission_reservations WHERE job_id=fleet),'unfunded credit reservation not cash');
 PERFORM pg_temp.finish_driver(fleet,driver);
 PERFORM pg_temp.check_true(app_private.wallet_debt(pid,driver)=150 AND app_private.marketplace_wallet_total_balance(pid,driver)=-150,'debt and negative net -150');
 PERFORM pg_temp.check_true((SELECT total_balance=-150 AND real_balance=0 AND promotional_balance=0 FROM public.get_my_marketplace_wallet()),'old wallet API net negative and sources zero');
 PERFORM pg_temp.check_true((SELECT state='funding_required' AND funded_real_amount=0 FROM app_private.marketplace_impulsa_rewards WHERE job_id=fleet),'commercial reward held for cash repayment');
 PERFORM pg_temp.check_true(app_private.impulsa_process_one()='empty','no premature cash payout');
 nextj:=pg_temp.publish_real(1000,false);
 PERFORM pg_temp.credit_wallet(driver,200,true);
 PERFORM pg_temp.check_true((SELECT NOT can_accept FROM public.list_my_marketplace_available_jobs('v2') WHERE job_id=nextj),'bonus does not clear debt even positive net');
 PERFORM pg_temp.check_true(NOT app_private.marketplace_driver_can_receive_job(pid,driver,'v2',nextj),'debt excluded from radar');
 BEGIN PERFORM public.accept_job(nextj,'v2',gen_random_uuid()); RAISE EXCEPTION 'debt accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 tx:=pg_temp.confirm_topup(driver,100);
 PERFORM pg_temp.check_true(app_private.wallet_debt(pid,driver)=50 AND (SELECT real_delta=0 AND debt_delta=-100 FROM public.wallet_transactions WHERE id=tx),'topup pays debt first');
 PERFORM pg_temp.check_true(app_private.impulsa_process_one()='empty','partial repayment no reward');
 PERFORM pg_temp.confirm_topup(driver,50);
 PERFORM pg_temp.check_true(app_private.wallet_debt(pid,driver)=0 AND app_private.wallet_cash_collected(pid,(SELECT ledger_transaction_id FROM public.commission_reservations WHERE job_id=fleet))=150,'full cash repayment');
 PERFORM pg_temp.check_true(app_private.impulsa_process_one()='credited' AND app_private.wallet_impulsa_balance(pid,promoter)=50,'commercial reward after actual cash');
 PERFORM pg_temp.check_true(app_private.impulsa_process_one()='empty','one commercial payment');
 PERFORM pg_temp.check_true(NOT app_private.wallet_credit_unused(pid,driver),'credit never renewed after payoff');
 PERFORM public.accept_job(nextj,'v2',gen_random_uuid()); PERFORM pg_temp.finish_driver(nextj,driver);
 PERFORM pg_temp.check_true(app_private.marketplace_wallet_total_balance(pid,driver)=50,'referidos spent first');
 j:=pg_temp.publish_real(1000,false);
 BEGIN PERFORM public.accept_job(j,'v2',gen_random_uuid()); RAISE EXCEPTION 'second credit accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 -- A canceled initial reservation releases the entitlement.
 PERFORM set_config('request.jwt.claim.sub',driver2::text,true);
 j:=pg_temp.publish_real(1000,false); PERFORM public.accept_job(j,'v3',gen_random_uuid());
 UPDATE public.jobs SET status='incident' WHERE id=j;
 PERFORM set_config('request.jwt.claim.sub',admin::text,true);
 PERFORM public.admin_resolve_marketplace_incident(pid,j,'cancelled','Prueba cancelada',gen_random_uuid());
 PERFORM pg_temp.check_true(app_private.wallet_credit_unused(pid,driver2) AND app_private.wallet_debt(pid,driver2)=0,'cancel releases initial credit without debt');
 PERFORM set_config('request.jwt.claim.sub',driver2::text,true);
 j:=pg_temp.publish_real(1000,false); PERFORM public.accept_job(j,'v3',gen_random_uuid());
 PERFORM pg_temp.confirm_topup(driver2,200);
 UPDATE public.jobs SET status='incident' WHERE id=j;
 PERFORM set_config('request.jwt.claim.sub',admin::text,true);
 PERFORM public.admin_resolve_marketplace_incident(pid,j,'completed','Prueba completada',gen_random_uuid());
 PERFORM pg_temp.check_true(app_private.wallet_debt(pid,driver2)=0 AND app_private.marketplace_wallet_total_balance(pid,driver2)=50,'topup before close covers previously reserved debt');
 -- Debt reversal refunds repaid cash and cancels unpaid portion.
 PERFORM set_config('request.jwt.claim.sub',driver3::text,true);
 j:=pg_temp.publish_real(1000,false); PERFORM public.accept_job(j,'v4',gen_random_uuid()); PERFORM pg_temp.finish_driver(j,driver3);
 PERFORM pg_temp.confirm_topup(driver3,60);
 tx:=(SELECT ledger_transaction_id FROM public.commission_reservations WHERE job_id=j);
 PERFORM pg_temp.reverse_commission(tx);
 PERFORM pg_temp.check_true(app_private.wallet_debt(pid,driver3)=0 AND app_private.marketplace_wallet_total_balance(pid,driver3)=60,'partial debt reversal restores actual cash only');
 -- Commercial earnings are a separate real-money source.
 PERFORM pg_temp.confirm_topup(driver4,15000);
 PERFORM set_config('request.jwt.claim.sub',driver4::text,true);
 j:=pg_temp.publish_real(100000); PERFORM public.accept_job(j,'v5',gen_random_uuid()); PERFORM pg_temp.finish_driver(j,driver4);
 PERFORM pg_temp.check_true(app_private.impulsa_process_one()='credited','large funded commercial reward');
 PERFORM pg_temp.check_true(app_private.wallet_impulsa_balance(pid,promoter)=5050,'real commercial 5050');
 PERFORM pg_temp.confirm_topup(promoter,100); PERFORM pg_temp.credit_wallet(promoter,100,true);
 PERFORM set_config('request.jwt.claim.sub',promoter::text,true);
 s:=public.get_my_marketplace_wallet_transition_v1();
 PERFORM pg_temp.check_true((s->>'impulsa_available')::numeric=5050 AND (s->>'cash_balance')::numeric=100 AND (s->>'promotional_balance')::numeric=100 AND (s->>'can_withdraw')::boolean,'separate commercial cash promo');
 BEGIN PERFORM public.request_my_marketplace_impulsa_withdrawal_v1(4999,gen_random_uuid()); RAISE EXCEPTION 'below minimum'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 s:=public.request_my_marketplace_impulsa_withdrawal_v1(5000,key); wd:=(s->>'id')::uuid;
 s:=public.request_my_marketplace_impulsa_withdrawal_v1(5000,key);
 PERFORM pg_temp.check_true((s->>'id')::uuid=wd AND app_private.wallet_withdrawal_hold(pid,promoter)=5000 AND app_private.wallet_impulsa_available(pid,promoter)=50,'reserved and idempotent withdrawal');
 BEGIN PERFORM public.request_my_marketplace_impulsa_withdrawal_v1(5000,gen_random_uuid()); RAISE EXCEPTION 'double withdrawal'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',driver::text,true);
 BEGIN PERFORM public.cancel_my_marketplace_impulsa_withdrawal_v1(wd,gen_random_uuid()); RAISE EXCEPTION 'other driver cancelled'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',admin::text,true);
 PERFORM public.admin_resolve_marketplace_impulsa_withdrawal_v1(pid,wd,'paid','Referencia manual de prueba',payment_key);
 PERFORM public.admin_resolve_marketplace_impulsa_withdrawal_v1(pid,wd,'paid','Referencia manual de prueba',payment_key);
 PERFORM pg_temp.check_true(app_private.wallet_impulsa_balance(pid,promoter)=50 AND app_private.wallet_withdrawal_hold(pid,promoter)=0,'manual payout debits only commercial and once');
 PERFORM set_config('request.jwt.claim.sub',promoter::text,true);
 j:=pg_temp.publish_real(2200); PERFORM public.accept_job(j,'v1',gen_random_uuid()); PERFORM pg_temp.finish_driver(j,promoter);
 PERFORM pg_temp.check_true(app_private.wallet_impulsa_balance(pid,promoter)=30 AND app_private.marketplace_wallet_total_balance(pid,promoter)=30,'promo then personal deposit then commercial spend');
 PERFORM pg_temp.check_true(NOT has_function_privilege('anon','public.request_my_marketplace_impulsa_withdrawal_v1(numeric,uuid)','EXECUTE'),'no anonymous withdrawal');
 RAISE NOTICE 'Credit, cash collection, reward funding, incident reversal, withdrawals, promo separation and activation passed';
END $$;
