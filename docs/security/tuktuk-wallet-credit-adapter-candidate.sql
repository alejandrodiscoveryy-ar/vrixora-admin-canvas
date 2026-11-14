-- Freeze whether a newly published ride is subject to collection. Old published
-- rides are not charged retroactively when the new policy is first activated.
ALTER TABLE public.jobs ADD COLUMN wallet_transition_charge_snapshot boolean;
CREATE OR REPLACE FUNCTION app_private.wallet_transition_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE enabled boolean; rate numeric;
BEGIN
 IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status='requested') THEN
  SELECT f.commission_enabled,f.commission_rate INTO enabled,rate FROM public.project_marketplace_financial_settings f WHERE f.project_id=NEW.project_id FOR SHARE;
  IF app_private.wallet_transition_active(NEW.project_id) AND NOT NEW.is_test THEN
   NEW.wallet_transition_charge_snapshot:=enabled;
   IF enabled AND NEW.commission_rate_snapshot IS DISTINCT FROM rate THEN RAISE EXCEPTION 'WALLET_TRANSITION_RATE_CHANGED' USING ERRCODE='40001'; END IF;
  ELSE NEW.wallet_transition_charge_snapshot:=NULL; END IF;
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.wallet_transition_charge_snapshot IS DISTINCT FROM OLD.wallet_transition_charge_snapshot THEN RAISE EXCEPTION 'WALLET_TRANSITION_SNAPSHOT_IMMUTABLE'; END IF;
 ELSE NEW.wallet_transition_charge_snapshot:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a0_wallet_transition_snapshot BEFORE INSERT OR UPDATE OF status,wallet_transition_charge_snapshot ON public.jobs FOR EACH ROW EXECUTE FUNCTION app_private.wallet_transition_snapshot();
CREATE OR REPLACE FUNCTION app_private.wallet_job_charge_enabled(pid uuid,jid uuid,global_enabled boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(global_enabled,false) AND (NOT app_private.wallet_transition_active(pid) OR EXISTS(SELECT 1 FROM public.jobs j WHERE j.project_id=pid AND j.id=jid AND (j.is_test OR j.wallet_transition_charge_snapshot IS TRUE)))
$$;
REVOKE ALL ON FUNCTION app_private.wallet_transition_snapshot(),app_private.wallet_job_charge_enabled(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
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

  IF NOT j.is_test AND app_private.wallet_debt(pid,actor)>0 THEN RAISE EXCEPTION 'MARKETPLACE_DEBT_PENDING' USING ERRCODE='22023'; END IF;
  commission_charge_enabled:=app_private.wallet_job_charge_enabled(pid,j.id,commission_charge_enabled);
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

    if not app_private.wallet_can_finance(pid,actor,j.id,amount) then
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
$function$;

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
    if prior_balance<r.amount-r.credit_reserved_amount then
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_marketplace_incident(target_project_id uuid, target_job_id uuid, target_resolution text, target_resolution_note text, target_idempotency_key uuid)
 RETURNS marketplace_incident_resolutions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid; j public.jobs%rowtype; a public.job_assignments%rowtype; w public.wallets%rowtype; r public.commission_reservations%rowtype; prior numeric; ledger uuid; result public.marketplace_incident_resolutions%rowtype; note text:=nullif(btrim(target_resolution_note),'');
begin
 actor:=app_private.require_project_permission(target_project_id,'marketplace.manage'); perform app_private.require_project_permission(target_project_id,'payments.manage'); if target_resolution not in ('completed','cancelled') then raise exception 'INVALID_INCIDENT_RESOLUTION' using errcode='22023'; end if; if note is null then raise exception 'RESOLUTION_NOTE_REQUIRED' using errcode='22023'; end if; if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tuktuk:incident-resolution:' || target_project_id::text || ':' || target_idempotency_key::text, 0));
 select * into result from public.marketplace_incident_resolutions where project_id=target_project_id and resolution_idempotency_key=target_idempotency_key; if found then if result.job_id=target_job_id and result.resolution=target_resolution and result.resolution_note=note then return result; end if; raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' using errcode='22023'; end if;
 select * into j from public.jobs where project_id=target_project_id and id=target_job_id for update; if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if; if j.status<>'incident' then raise exception 'JOB_NOT_IN_INCIDENT' using errcode='22023'; end if;
 select * into result from public.marketplace_incident_resolutions where project_id=target_project_id and job_id=target_job_id; if found then if result.resolution=target_resolution and result.resolution_note=note then return result; end if; raise exception 'INCIDENT_ALREADY_RESOLVED' using errcode='22023'; end if;
 select * into a from public.job_assignments where project_id=target_project_id and job_id=j.id for update; if not found then raise exception 'JOB_ASSIGNMENT_NOT_FOUND' using errcode='P0002'; end if;
 if a.billing_mode in ('trial_free','platform_free') then if a.commission_amount_snapshot<>0 or exists(select 1 from public.commission_reservations where project_id=target_project_id and job_id=j.id) then raise exception 'TRIAL_INCIDENT_PRECONDITION_FAILED' using errcode='22023'; end if;
 elsif a.billing_mode='wallet_commission' then
   select * into w from public.wallets where project_id=target_project_id and user_id=a.driver_user_id for update; if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND' using errcode='P0002'; end if;
   select * into r from public.commission_reservations where project_id=target_project_id and job_id=j.id for update; if not found then raise exception 'COMMISSION_RESERVATION_NOT_FOUND' using errcode='P0002'; end if;
   if r.user_id<>a.driver_user_id or r.amount<>a.commission_amount_snapshot then raise exception 'INCIDENT_RESERVATION_MISMATCH' using errcode='22023'; end if;
   if target_resolution='completed' then if r.status='released' then raise exception 'INCIDENT_RESERVATION_ALREADY_RELEASED' using errcode='22023'; elsif r.status='open' then prior:=app_private.marketplace_wallet_total_balance(target_project_id,a.driver_user_id); if prior<r.amount-r.credit_reserved_amount then raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE' using errcode='22023'; end if; insert into public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,actor_id,metadata) values(target_project_id,a.driver_user_id,w.currency,'commission',-r.amount,prior-r.amount,'job_commission',j.id::text,target_idempotency_key,actor,jsonb_build_object('incident_resolution',true)) returning id into ledger; update public.commission_reservations set status='consumed',ledger_transaction_id=ledger,consumed_at=now() where project_id=target_project_id and id=r.id; else ledger:=r.ledger_transaction_id; end if;
   else if r.status='open' then update public.commission_reservations set status='released',released_at=now(),release_reason=note where project_id=target_project_id and id=r.id; elsif r.status='consumed' then prior:=app_private.marketplace_wallet_total_balance(target_project_id,a.driver_user_id); insert into public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,actor_id,metadata) values(target_project_id,a.driver_user_id,w.currency,'reversal',r.amount,prior+r.amount,'job_commission_reversal',j.id::text,target_idempotency_key,actor,jsonb_build_object('incident_resolution',true,'original_ledger_transaction_id',r.ledger_transaction_id)) returning id into ledger; end if; end if;
 else raise exception 'INVALID_BILLING_MODE' using errcode='22023'; end if;
 if target_resolution='completed' then
   if a.cancelled_at is not null then raise exception 'ASSIGNMENT_ALREADY_CANCELLED' using errcode='22023'; end if;
   update public.job_assignments set completed_at=coalesce(completed_at,now()) where project_id=target_project_id and job_id=j.id;
 elsif a.completed_at is null then
   update public.job_assignments set cancelled_at=coalesce(cancelled_at,now()) where project_id=target_project_id and job_id=j.id;
 end if;
 insert into public.marketplace_incident_resolutions(project_id,job_id,driver_user_id,billing_mode,resolution,resolution_note,commission_amount_snapshot,resolution_idempotency_key,ledger_transaction_id,resolved_by) values(target_project_id,j.id,a.driver_user_id,a.billing_mode,target_resolution,note,a.commission_amount_snapshot,target_idempotency_key,ledger,actor) returning * into result;
 insert into public.job_events(project_id,job_id,actor_user_id,actor_kind,action,from_status,to_status,operation_idempotency_key,metadata) values(target_project_id,j.id,actor,'admin','incident_resolved','incident','incident',target_idempotency_key,jsonb_build_object('resolution',target_resolution,'resolution_id',result.id));
 update public.driver_vehicle_assignments dva set is_available=true where dva.project_id=target_project_id and dva.driver_user_id=a.driver_user_id and dva.vehicle_id=a.vehicle_id and dva.is_active and exists(select 1 from public.driver_profiles dp where dp.project_id=dva.project_id and dp.user_id=dva.driver_user_id and dp.status='active' and dp.activated_at is not null and dp.suspended_at is null) and not exists(select 1 from public.vehicles v where v.project_id=dva.project_id and v.id=dva.vehicle_id and (v.marketplace_status='suspended' or v.deleted_at is not null)) and not exists(select 1 from public.jobs x left join public.marketplace_incident_resolutions ir on ir.project_id=x.project_id and ir.job_id=x.id where x.project_id=dva.project_id and x.assigned_driver_user_id=dva.driver_user_id and x.assigned_vehicle_id=dva.vehicle_id and (x.status in ('accepted','en_route','pickup','in_progress','completed') or (x.status='incident' and ir.id is null)));
 return result;
end;
$function$;

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
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled)
       and not (j.is_test and j.test_force_wallet_commission)
       and app_private.has_active_marketplace_work_trial(actor) then 'trial_free'
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then 'platform_free'
      when j.is_test and j.test_force_wallet_commission then 'wallet_commission'
      when app_private.has_active_marketplace_work_trial(actor) then 'trial_free'
      when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor) then 'wallet_commission'
      else null
    end,
    case
      when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then 0::numeric
      when j.is_test and j.test_force_wallet_commission then app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot)
      when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
      when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor) then app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot)
      else app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot)
    end,
    case
      when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then 0::numeric
      when j.is_test and j.test_force_wallet_commission then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
      when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor) then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      else round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
    end,
    balance,
    greatest(
      0::numeric,
      (case
        when j.is_test and not j.test_force_wallet_commission then 0::numeric
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then 0::numeric
        when j.is_test and j.test_force_wallet_commission then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
        when app_private.has_active_marketplace_work_trial(actor) then 0::numeric
        when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor) then round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
        else round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      end)-balance
    ),
    case
      when j.is_test and not j.test_force_wallet_commission then true
      when app_private.wallet_debt(pid,actor)>0 then false
      when not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled) then true
      when j.is_test and j.test_force_wallet_commission
        then balance>=round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2)
      when app_private.has_active_marketplace_work_trial(actor) then true
      when app_private.wallet_transition_active(pid) or app_private.has_confirmed_marketplace_initial_deposit(actor)
        then app_private.wallet_can_finance(pid,actor,j.id,round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,actor,j.commission_rate_snapshot),2))
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
      not app_private.wallet_job_charge_enabled(j.project_id,j.id,commission_charge_enabled)
      or (j.is_test and not j.test_force_wallet_commission)
      or app_private.has_active_marketplace_work_trial(actor)
      or app_private.wallet_transition_active(pid)
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
$function$;

CREATE OR REPLACE FUNCTION app_private.marketplace_driver_can_receive_job(target_project_id uuid, target_driver_user_id uuid, target_vehicle_id text, target_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select target_project_id is not null
    and target_driver_user_id is not null
    and target_vehicle_id is not null
    and target_job_id is not null
    and exists(
      select 1
      from public.jobs j
      join public.service_requests r
        on r.project_id=j.project_id and r.id=j.service_request_id
      join public.driver_profiles d
        on d.project_id=j.project_id and d.user_id=target_driver_user_id
      join public.driver_vehicle_assignments a
        on a.project_id=j.project_id and a.driver_user_id=d.user_id
       and a.vehicle_id=target_vehicle_id
      join public.vehicles v
        on v.project_id=a.project_id and v.id=a.vehicle_id
      where j.project_id=target_project_id
        and j.id=target_job_id
        and j.status='published'
        and j.test_deleted_at is null
        and (not j.is_test or app_private.marketplace_test_job_targets_driver(j.project_id,j.id,target_driver_user_id))
        and (j.expires_at is null or j.expires_at>now())
        and d.status='active' and d.activated_at is not null and d.suspended_at is null
        and a.is_active and a.accepting_jobs and a.is_available
        and v.marketplace_status='active' and v.deleted_at is null
        and app_private.marketplace_onboarding_requirements_complete(d.user_id,v.id)
        and (j.is_test or app_private.wallet_debt(j.project_id,d.user_id)=0)
        and (
          exists (
            select 1 from public.project_marketplace_financial_settings financial
            where financial.project_id = j.project_id
              and financial.commission_enabled is false
          )
          or app_private.has_active_marketplace_work_trial(d.user_id)
          or app_private.has_confirmed_marketplace_initial_deposit(d.user_id)
          or app_private.wallet_transition_active(j.project_id)
          or (j.is_test and not j.test_force_wallet_commission)
          or (j.is_test and app_private.marketplace_test_job_targets_driver(j.project_id,j.id,d.user_id) and j.test_force_wallet_commission)
        )
        and (not app_private.wallet_transition_active(j.project_id) OR j.is_test OR NOT app_private.wallet_job_charge_enabled(j.project_id,j.id,(SELECT f.commission_enabled FROM public.project_marketplace_financial_settings f WHERE f.project_id=j.project_id)) OR app_private.wallet_can_finance(j.project_id,d.user_id,j.id,round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,d.user_id,j.commission_rate_snapshot),2)))
        and exists(
          select 1 from public.vehicle_services vs
          where vs.project_id=j.project_id
            and vs.vehicle_id=v.id
            and vs.service_code=j.service_code
            and vs.enabled
        )
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
        and (
          r.required_body_type is null
          or lower(btrim(v.body_type))=lower(btrim(r.required_body_type))
        )
    );
$function$;

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
      AND (NOT app_private.wallet_job_charge_enabled(j.project_id,j.id,fin.commission_enabled) OR app_private.has_active_marketplace_work_trial(p.driver_user_id)
        OR app_private.wallet_can_finance(j.project_id,p.driver_user_id,j.id,round(j.final_price*app_private.impulsa_effective_rate(j.project_id,j.id,p.driver_user_id,j.commission_rate_snapshot),2)))
      AND EXISTS(SELECT 1 FROM app_private.marketplace_promo_base_candidate_state(j.project_id,p.driver_user_id,p.vehicle_id,j.id) b WHERE b.allowed)
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_my_marketplace_wallet()
 RETURNS TABLE(currency text, total_balance numeric, reserved_balance numeric, available_balance numeric, initial_deposit_confirmed boolean, initial_deposit_confirmed_at timestamp with time zone, initial_deposit_amount numeric, initial_minimum_snapshot numeric, current_initial_minimum_deposit numeric, commission_rate numeric, real_balance numeric, promotional_balance numeric, real_reserved_balance numeric, promotional_reserved_balance numeric, real_available_balance numeric, promotional_available_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); pid uuid; minimum_amount numeric; rate numeric;
  total numeric; reserved numeric;
  r numeric; p numeric; rr numeric; pr numeric; ra numeric; pa numeric;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select project.id,setting.initial_minimum_deposit,case when setting.commission_enabled then setting.commission_rate else 0::numeric end
   into pid,minimum_amount,rate from public.projects project
   join public.project_marketplace_financial_settings setting on setting.project_id=project.id
   where project.slug='tuktuk-control';
 if pid is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode='P0002'; end if;
 total:=app_private.marketplace_wallet_total_balance(pid,actor);
 reserved:=app_private.marketplace_wallet_reserved_balance(pid,actor);
 select b.real_balance,b.promotional_balance,b.real_reserved_balance,b.promotional_reserved_balance,
   b.real_available_balance,b.promotional_available_balance into r,p,rr,pr,ra,pa
   from app_private.marketplace_wallet_source_balances(pid,actor) b;
 if r+p-app_private.wallet_debt(pid,actor)<>total
   or rr+pr+coalesce((select sum(cr.credit_reserved_amount) from public.commission_reservations cr where cr.project_id=pid and cr.user_id=actor and cr.status='open'),0)<>reserved then
   raise exception 'WALLET_SOURCE_PROJECTION_MISMATCH' using errcode='22023';
 end if;
 return query select coalesce(w.currency,'CUP'),total,reserved,total-reserved,
   w.initial_deposit_confirmed_at is not null,w.initial_deposit_confirmed_at,
   w.initial_deposit_amount,w.initial_minimum_snapshot,minimum_amount,rate,
   r,p,rr,pr,ra,pa
 from (select 1) singleton left join public.wallets w on w.project_id=pid and w.user_id=actor;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_marketplace_work_access(target_vehicle_id text)
 RETURNS TABLE(server_time timestamp with time zone, vehicle_id text, onboarding_complete boolean, driver_active boolean, vehicle_available boolean, trial_started boolean, trial_active boolean, trial_started_at timestamp with time zone, trial_ends_at timestamp with time zone, initial_deposit_confirmed boolean, suite_active boolean, can_start_trial boolean, can_accept_new_job boolean, next_billing_mode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid:=auth.uid();
  pid uuid;
  dp public.driver_profiles%rowtype;
  dva public.driver_vehicle_assignments%rowtype;
  v public.vehicles%rowtype;
  promo public.marketplace_work_trials%rowtype;
  complete boolean;
  active boolean;
  available boolean;
  legacy_deposit boolean;
  commission_charge_enabled boolean;
  test_mode boolean;
  test_force boolean;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  select p.id into pid
  from public.projects p
  where p.slug='tuktuk-control';

  select s.commission_enabled into commission_charge_enabled
  from public.project_marketplace_financial_settings s where s.project_id=pid;

  select d.* into dp
  from public.driver_profiles d
  where d.project_id=pid and d.user_id=actor;

  select a.* into dva
  from public.driver_vehicle_assignments a
  where a.project_id=pid
    and a.driver_user_id=actor
    and a.vehicle_id=target_vehicle_id;

  select veh.* into v
  from public.vehicles veh
  where veh.project_id=pid and veh.id=target_vehicle_id;

  select t.* into promo
  from public.marketplace_work_trials t
  where t.project_id=pid and t.user_id=actor;

  complete:=coalesce(
    app_private.marketplace_onboarding_requirements_complete(actor,target_vehicle_id),
    false
  );

  active:=dp.user_id is not null
    and dp.status='active'
    and dp.activated_at is not null
    and dp.suspended_at is null;

  available:=coalesce(
    dva.is_active
    and dva.is_available
    and v.marketplace_status='active'
    and v.deleted_at is null,
    false
  );

  legacy_deposit:=coalesce(
    app_private.has_confirmed_marketplace_initial_deposit(actor),
    false
  );

  select
    coalesce(m.enabled,false),
    coalesce(m.enabled and m.force_wallet_commission,false)
  into test_mode,test_force
  from (select 1) seed
  left join public.marketplace_test_mode m
    on m.project_id=pid
   and m.target_driver_user_id=actor;

  return query
  select
    now(),
    target_vehicle_id,
    complete,
    active,
    available,
    promo.user_id is not null,
    coalesce(
      app_private.has_active_marketplace_work_trial(actor)
      and active
      and not test_force,
      false
    ),
    promo.started_at,
    promo.ends_at,
    legacy_deposit,
    coalesce(active and complete,false),
    false,
    coalesce(complete and active and available AND app_private.wallet_debt(pid,actor)=0,false),
    case
      when not commission_charge_enabled and not test_force
         and app_private.has_active_marketplace_work_trial(actor)
         and active then 'trial_free'
      when not commission_charge_enabled then 'platform_free'
      when test_force then 'wallet_commission'
      when app_private.has_active_marketplace_work_trial(actor)
       and active
        then 'trial_free'
      when active and complete then 'wallet_commission'
      else null
    end;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.has_active_marketplace_work_trial(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select target_user_id is not null and exists(select 1 from public.marketplace_work_trials t join public.driver_profiles d on d.project_id=t.project_id and d.user_id=t.user_id join public.projects p on p.id=t.project_id where p.slug='tuktuk-control' and t.user_id=target_user_id and not (app_private.wallet_transition_active(t.project_id) and exists(select 1 from app_private.marketplace_wallet_transition_policy q where q.project_id=t.project_id and q.remove_free_days)) and t.started_at<=now() and now()<t.ends_at and d.status='active' and d.activated_at is not null and d.suspended_at is null); $function$;

CREATE OR REPLACE FUNCTION app_private.protect_commission_reservation_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.id is distinct from old.id or new.project_id is distinct from old.project_id
    or new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id
    or new.currency is distinct from old.currency or new.final_price_snapshot is distinct from old.final_price_snapshot
    or new.commission_rate_snapshot is distinct from old.commission_rate_snapshot or new.amount is distinct from old.amount
    or new.real_reserved_amount is distinct from old.real_reserved_amount
    or new.promotional_reserved_amount is distinct from old.promotional_reserved_amount
    or new.credit_reserved_amount is distinct from old.credit_reserved_amount
    or new.impulsa_reserved_amount is distinct from old.impulsa_reserved_amount
    or new.opened_at is distinct from old.opened_at or new.created_at is distinct from old.created_at then
    raise exception 'COMMISSION_RESERVATION_PROVENANCE_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.impulsa_enqueue_reward()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT (NEW.action='settle' AND NEW.to_status='settled' OR
   NEW.action='incident_resolved' AND NEW.metadata->>'resolution'='completed') THEN RETURN NEW; END IF;
 INSERT INTO app_private.marketplace_impulsa_rewards(job_id,project_id,promoter_user_id,transport_driver_user_id,commission_ledger_id,amount,funded_real_amount,state)
 SELECT s.job_id,s.project_id,s.promoter_user_id,j.assigned_driver_user_id,t.id,
 round(s.fare*s.commercial_rate,2),app_private.wallet_cash_collected(t.project_id,t.id),
 CASE WHEN app_private.wallet_cash_collected(t.project_id,t.id)>=round(s.fare*s.commercial_rate,2) THEN 'pending' ELSE 'funding_required' END
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
END $function$;

CREATE OR REPLACE FUNCTION app_private.impulsa_validate_wallet_entry(t wallet_transactions, available_real numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE q app_private.marketplace_impulsa_rewards%ROWTYPE; original public.wallet_transactions%ROWTYPE;
BEGIN
 SELECT * INTO q FROM app_private.marketplace_impulsa_rewards WHERE job_id::text=t.source_id AND project_id=t.project_id;
 IF NOT FOUND OR t.user_id<>q.promoter_user_id OR t.currency<>'CUP' THEN RAISE EXCEPTION 'IMPULSA_REWARD_INVALID' USING ERRCODE='22023'; END IF;
 IF t.transaction_type='impulsa_credit' THEN
   IF q.state<>'pending' OR q.credit_ledger_id IS NOT NULL OR t.source_type<>'impulsa_reward' OR t.amount_delta<>q.amount
   OR q.funded_real_amount<q.amount OR t.metadata->>'commission_ledger_id' IS DISTINCT FROM q.commission_ledger_id::text
   OR NOT EXISTS(SELECT 1 FROM public.wallet_transactions d WHERE d.id=q.commission_ledger_id AND d.project_id=q.project_id AND d.user_id=q.transport_driver_user_id
     AND d.transaction_type='commission' AND d.source_type='job_commission' AND d.source_id=q.job_id::text AND app_private.wallet_cash_collected(d.project_id,d.id)>=q.amount)
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
END $function$;

CREATE OR REPLACE FUNCTION app_private.impulsa_process_one() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job uuid; q app_private.marketplace_impulsa_rewards%ROWTYPE; prior numeric; free_real numeric; funded numeric; tx uuid;
BEGIN
 SELECT j.id INTO job FROM app_private.marketplace_impulsa_rewards r JOIN public.jobs j ON j.id=r.job_id AND j.project_id=r.project_id
 WHERE (r.state IN ('pending','reversal_pending') OR (r.state='funding_required' AND app_private.wallet_cash_collected(r.project_id,r.commission_ledger_id)>=r.amount))
 AND r.next_attempt_at<=now() ORDER BY r.next_attempt_at,r.created_at,r.job_id LIMIT 1 FOR UPDATE OF j SKIP LOCKED;
 IF job IS NULL THEN RETURN 'empty'; END IF;
 SELECT * INTO q FROM app_private.marketplace_impulsa_rewards WHERE job_id=job FOR UPDATE;
 IF q.state NOT IN ('pending','funding_required','reversal_pending') THEN RETURN 'skipped'; END IF;
 IF q.state IN ('pending','funding_required') AND EXISTS(SELECT 1 FROM public.wallet_transactions t WHERE t.project_id=q.project_id AND t.reversed_ledger_id=q.commission_ledger_id) THEN UPDATE app_private.marketplace_impulsa_rewards SET state='cancelled',updated_at=now() WHERE job_id=job; RETURN 'cancelled'; END IF;
 INSERT INTO public.wallets(project_id,user_id,currency) VALUES(q.project_id,q.promoter_user_id,'CUP') ON CONFLICT(project_id,user_id) DO NOTHING;
 -- Lock both wallets in deterministic order. Topup corrections and payout
 -- requests use these same wallet locks. No cross-wallet updates while closing.
 PERFORM 1 FROM public.wallets WHERE project_id=q.project_id AND user_id IN (q.promoter_user_id,q.transport_driver_user_id) ORDER BY user_id FOR UPDATE;
 prior:=app_private.marketplace_wallet_total_balance(q.project_id,q.promoter_user_id);
 IF q.state IN ('pending','funding_required') THEN
  funded:=app_private.wallet_cash_collected(q.project_id,q.commission_ledger_id);
  IF funded<q.amount THEN UPDATE app_private.marketplace_impulsa_rewards SET state='funding_required',funded_real_amount=funded,updated_at=now() WHERE job_id=job; RETURN 'funding_required'; END IF;
  UPDATE app_private.marketplace_impulsa_rewards SET state='pending',funded_real_amount=funded,updated_at=now() WHERE job_id=job;
  INSERT INTO public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,metadata)
  VALUES(q.project_id,q.promoter_user_id,'CUP','impulsa_credit',q.amount,prior+q.amount,'impulsa_reward',q.job_id::text,gen_random_uuid(),jsonb_build_object('commission_ledger_id',q.commission_ledger_id,'program','impulsa')) RETURNING id INTO tx;
  UPDATE app_private.marketplace_impulsa_rewards SET state='credited',credit_ledger_id=tx,updated_at=now() WHERE job_id=job; RETURN 'credited';
 END IF;
 free_real:=app_private.wallet_impulsa_available(q.project_id,q.promoter_user_id);
 IF free_real<q.amount THEN UPDATE app_private.marketplace_impulsa_rewards SET next_attempt_at=now()+interval '5 minutes',updated_at=now() WHERE job_id=job; RETURN 'reversal_waiting_balance'; END IF;
 INSERT INTO public.wallet_transactions(project_id,user_id,currency,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,metadata)
 VALUES(q.project_id,q.promoter_user_id,'CUP','impulsa_reversal',-q.amount,prior-q.amount,'impulsa_reward_reversal',q.job_id::text,gen_random_uuid(),jsonb_build_object('original_ledger_transaction_id',q.credit_ledger_id,'program','impulsa')) RETURNING id INTO tx;
 UPDATE app_private.marketplace_impulsa_rewards SET state='reversed',reversal_ledger_id=tx,updated_at=now() WHERE job_id=job; RETURN 'reversed';
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_marketplace_wallet_transition_v1(target_project_id uuid, target_expected_version bigint, target_credit_enabled boolean, target_credit_limit_cup numeric, target_withdrawals_enabled boolean, target_withdrawal_minimum_cup numeric, target_remove_free_days boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 IF previous.activated_at IS NOT NULL AND target_remove_free_days IS DISTINCT FROM previous.remove_free_days THEN RAISE EXCEPTION 'WALLET_TRANSITION_FREE_DAYS_CUTOFF_IMMUTABLE' USING ERRCODE='22023'; END IF;
 UPDATE app_private.marketplace_wallet_transition_policy SET
 credit_enabled=target_credit_enabled,credit_limit_cup=target_credit_limit_cup,
 withdrawals_enabled=target_withdrawals_enabled,withdrawal_minimum_cup=target_withdrawal_minimum_cup,
 remove_free_days=target_remove_free_days,version=version+1,updated_at=now(),updated_by=actor
 WHERE project_id=target_project_id RETURNING * INTO updated;
 INSERT INTO app_private.marketplace_wallet_transition_history(project_id,version,actor,old_policy,new_policy)
 VALUES(target_project_id,updated.version,actor,to_jsonb(previous),to_jsonb(updated));
 RETURN to_jsonb(updated)-'updated_by';
END $function$;

CREATE OR REPLACE FUNCTION app_private.marketplace_wallet_transition_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.commission_enabled AND NOT OLD.commission_enabled
 AND EXISTS(SELECT 1 FROM app_private.marketplace_wallet_transition_policy p WHERE p.project_id=NEW.project_id AND (NOT p.engine_ready OR p.activated_at IS NULL))
 THEN RAISE EXCEPTION 'WALLET_TRANSITION_ENGINE_NOT_READY' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_get_marketplace_overview(target_project_id uuid)
 RETURNS TABLE(server_time timestamp with time zone, drivers_total bigint, drivers_active bigint, drivers_suspended bigint, drivers_trial_active bigint, drivers_post_trial_active bigint, jobs_published bigint, jobs_active bigint, jobs_incident_open bigint, jobs_incident_resolved bigint, pending_topups bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare can_pay boolean;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.view');
  can_pay:=app_private.has_project_permission(target_project_id,'payments.view');

  return query select
    now(),
    count(*)::bigint,
    count(*) filter(where d.status='active' and d.suspended_at is null)::bigint,
    count(*) filter(where d.status='suspended')::bigint,
    count(*) filter(
      where d.status='active' and d.suspended_at is null
        and app_private.has_active_marketplace_work_trial(d.user_id)
    )::bigint,
    count(*) filter(
      where d.status='active' and d.suspended_at is null
        and not app_private.has_active_marketplace_work_trial(d.user_id)
        and (app_private.has_confirmed_marketplace_initial_deposit(d.user_id) OR app_private.wallet_transition_active(d.project_id))
        and app_private.wallet_debt(d.project_id,d.user_id)=0
    )::bigint,
    (select count(*) from public.jobs j
      where j.project_id=target_project_id and not j.is_test
        and j.test_deleted_at is null and j.status='published' and (j.expires_at is null or j.expires_at>now()))::bigint,
    (select count(*) from public.jobs j
      where j.project_id=target_project_id and not j.is_test
        and j.test_deleted_at is null
        and j.status in ('accepted','en_route','pickup','in_progress','completed'))::bigint,
    (select count(*)
      from public.jobs j
      left join public.marketplace_incident_resolutions r
        on r.project_id=j.project_id and r.job_id=j.id
      where j.project_id=target_project_id and not j.is_test
        and j.test_deleted_at is null and j.status='incident' and r.id is null)::bigint,
    (select count(*)
      from public.marketplace_incident_resolutions r
      join public.jobs j on j.project_id=r.project_id and j.id=r.job_id
      where r.project_id=target_project_id and not j.is_test and j.test_deleted_at is null)::bigint,
    case when can_pay then
      (select count(*) from public.topups t
       where t.project_id=target_project_id and t.status='requested')::bigint
    else null end
  from public.driver_profiles d
  where d.project_id=target_project_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_marketplace_drivers(target_project_id uuid, target_limit integer DEFAULT 100, target_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, display_name text, phone text, status text, activated_at timestamp with time zone, suspended_at timestamp with time zone, suspension_reason text, created_at timestamp with time zone, trial_started_at timestamp with time zone, trial_ends_at timestamp with time zone, trial_active boolean, initial_deposit_confirmed boolean, vehicle_id text, vehicle_name text, vehicle_status text, vehicle_category_code text, vehicle_propulsion_code text, vehicle_brand text, vehicle_model text, is_active_assignment boolean, is_available boolean, services jsonb, wallet_total_balance numeric, wallet_reserved_balance numeric, wallet_available_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare can_pay boolean;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  if (target_before_created_at is null) <> (target_before_user_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if;
  can_pay := app_private.has_project_permission(target_project_id, 'payments.view');
  return query select d.user_id, p.display_name, p.phone, d.status, d.activated_at, d.suspended_at, d.suspension_reason, d.created_at,
    t.started_at, t.ends_at, app_private.has_active_marketplace_work_trial(d.user_id), w.initial_deposit_confirmed_at is not null,
    a.vehicle_id, v.name, v.marketplace_status, v.category_code, v.propulsion_code, v.brand, v.model, a.is_active, a.is_available,
    coalesce((select jsonb_agg(s.service_code order by s.service_code) from public.vehicle_services s where s.project_id=d.project_id and s.vehicle_id=a.vehicle_id and s.enabled), '[]'::jsonb),
    case when can_pay then app_private.marketplace_wallet_total_balance(d.project_id,d.user_id) end,
    case when can_pay then app_private.marketplace_wallet_reserved_balance(d.project_id,d.user_id) end,
    case when can_pay then app_private.marketplace_wallet_available_balance(d.project_id,d.user_id) end
  from public.driver_profiles d join public.profiles p on p.id=d.user_id
  left join public.marketplace_work_trials t on t.project_id=d.project_id and t.user_id=d.user_id
  left join public.wallets w on w.project_id=d.project_id and w.user_id=d.user_id
  left join lateral (
    select a0.project_id, a0.driver_user_id, a0.vehicle_id, a0.is_active, a0.is_available
    from public.driver_vehicle_assignments a0
    join public.vehicles v0 on v0.project_id=a0.project_id and v0.id=a0.vehicle_id
    where a0.project_id=d.project_id and a0.driver_user_id=d.user_id and v0.deleted_at is null
    order by (a0.is_active and v0.marketplace_status='active') desc,
             a0.is_active desc,
             a0.updated_at desc nulls last,
             a0.vehicle_id
    limit 1
  ) a on true
  left join public.vehicles v on v.project_id=a.project_id and v.id=a.vehicle_id
  where d.project_id=target_project_id and (target_before_created_at is null or (d.created_at,d.user_id)<(target_before_created_at,target_before_user_id))
  order by d.created_at desc,d.user_id desc limit least(greatest(coalesce(target_limit,100),1),200);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_marketplace_radar_readiness(target_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.view');
  if not exists(select 1 from public.projects p where p.id=target_project_id and p.slug='tuktuk-control') then
    raise exception 'RADAR_PROJECT_INVALID' using errcode='42501';
  end if;
  with work as materialized (
    select a.project_id,a.driver_user_id,a.vehicle_id,
      exists (
        select 1 from public.driver_profiles d
          join public.vehicles v on v.project_id=d.project_id and v.id=a.vehicle_id
        where d.project_id=a.project_id and d.user_id=a.driver_user_id
          and d.status='active' and d.activated_at is not null and d.suspended_at is null
          and v.marketplace_status='active' and v.deleted_at is null
      ) as profile_active,
      app_private.marketplace_onboarding_requirements_complete(a.driver_user_id,a.vehicle_id)
        as onboarding_complete,
      ((app_private.has_active_marketplace_work_trial(a.driver_user_id)
        or app_private.has_confirmed_marketplace_initial_deposit(a.driver_user_id) OR app_private.wallet_transition_active(a.project_id)) AND app_private.wallet_debt(a.project_id,a.driver_user_id)=0)
        as legacy_commercial_access,
      exists (
        select 1 from public.marketplace_driver_locations l
        where l.project_id=a.project_id and l.driver_user_id=a.driver_user_id
          and l.vehicle_id=a.vehicle_id
          and l.captured_at between now()-interval '5 minutes' and now()+interval '30 seconds'
          and l.received_at>=now()-interval '5 minutes'
      ) as gps_recent,
      exists (
        select 1 from public.push_device_tokens t
        where t.project_id=a.project_id and t.user_id=a.driver_user_id
          and t.app_scope='client' and t.enabled and t.platform='android'
      ) as android_push,
      exists (
        select 1 from public.push_device_tokens t
        where t.project_id=a.project_id and t.user_id=a.driver_user_id
          and t.app_scope='client' and t.enabled and t.platform='android'
          and t.job_alert_channel_version=2
      ) as channel_v2
    from public.driver_vehicle_assignments a
    where a.project_id=target_project_id
      and a.is_active and a.accepting_jobs and a.is_available
  )
  select jsonb_build_object(
      'checked_at',now(),
      'gps_ttl_seconds',300,
      'working',count(distinct driver_user_id),
      'gps_recent',count(distinct driver_user_id) filter(where gps_recent),
      'gps_missing',count(distinct driver_user_id) filter(where not gps_recent),
      'profile_ready',count(distinct driver_user_id) filter(where onboarding_complete and profile_active),
      'profile_blocked',count(distinct driver_user_id) filter(where not onboarding_complete or not profile_active),
      'commercially_ready',count(distinct driver_user_id) filter(where onboarding_complete and legacy_commercial_access and profile_active),
      'commercially_blocked',count(distinct driver_user_id) filter(where not onboarding_complete or not legacy_commercial_access or not profile_active),
      'radar_reachable',count(distinct driver_user_id) filter(where onboarding_complete and profile_active and gps_recent),
      'android_push_enabled',count(distinct driver_user_id) filter(where android_push),
      'android_channel_v2',count(distinct driver_user_id) filter(where channel_v2)
  ) into v_result from work;

  return coalesce(v_result,'{}'::jsonb);
end;
$function$;
-- One audited, atomic activation. No automatic activation in this migration.
CREATE OR REPLACE FUNCTION public.admin_activate_marketplace_wallet_transition_v1(target_project_id uuid,target_expected_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; p app_private.marketplace_wallet_transition_policy%ROWTYPE; i app_private.marketplace_impulsa_policy%ROWTYPE; f public.project_marketplace_financial_settings%ROWTYPE; updated app_private.marketplace_wallet_transition_policy%ROWTYPE;
BEGIN
 actor:=app_private.require_project_permission(target_project_id,'settings.manage');
 PERFORM app_private.require_project_permission(target_project_id,'commercial.manage');
 PERFORM app_private.require_project_permission(target_project_id,'payments.manage');
 SELECT * INTO f FROM public.project_marketplace_financial_settings WHERE project_id=target_project_id FOR UPDATE;
 SELECT * INTO p FROM app_private.marketplace_wallet_transition_policy WHERE project_id=target_project_id FOR UPDATE;
 IF NOT FOUND OR NOT p.engine_ready OR NOT p.credit_enabled OR NOT p.remove_free_days OR p.version IS DISTINCT FROM target_expected_version THEN RAISE EXCEPTION 'WALLET_TRANSITION_NOT_READY' USING ERRCODE='22023'; END IF;
 IF p.activated_at IS NOT NULL THEN RETURN to_jsonb(p)-'updated_by'; END IF;
 IF f.commission_enabled THEN RAISE EXCEPTION 'WALLET_TRANSITION_COLLECTION_ALREADY_ACTIVE' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM app_private.marketplace_impulsa_policy WHERE project_id=target_project_id FOR UPDATE;
 IF NOT FOUND OR i.enabled THEN RAISE EXCEPTION 'IMPULSA_POLICY_NOT_READY' USING ERRCODE='22023'; END IF;
 UPDATE app_private.marketplace_wallet_transition_policy SET activated_at=now(),version=version+1,updated_at=now(),updated_by=actor WHERE project_id=target_project_id RETURNING * INTO updated;
 PERFORM public.admin_set_marketplace_commission_only(target_project_id,i.general_rate);
 PERFORM public.admin_set_marketplace_welcome_policy(target_project_id,false,f.promotion_duration_days);
 PERFORM public.admin_set_marketplace_commission_enabled(target_project_id,true);
 PERFORM public.admin_save_marketplace_impulsa_policy_v1(target_project_id,i.version,i.general_rate,i.own_rate,i.commercial_rate,true);
 INSERT INTO app_private.marketplace_wallet_transition_history(project_id,version,actor,old_policy,new_policy) VALUES(target_project_id,updated.version,actor,to_jsonb(p),to_jsonb(updated));
 RETURN to_jsonb(updated)-'updated_by';
END $$;
REVOKE ALL ON FUNCTION public.admin_activate_marketplace_wallet_transition_v1(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_activate_marketplace_wallet_transition_v1(uuid,bigint) TO authenticated;
