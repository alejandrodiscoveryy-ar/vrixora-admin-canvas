-- Production hotfix.
-- Enforces the customer-selected vehicle category across:
-- 1. push/job eligibility
-- 2. available-jobs listing
-- 3. atomic job acceptance
--
-- This migration corresponds to the change already applied in production
-- as Supabase migration 20261003161101.

create or replace function app_private.marketplace_driver_can_receive_job(
  target_project_id uuid,
  target_driver_user_id uuid,
  target_vehicle_id text,
  target_job_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
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
        and (not j.is_test or j.test_driver_user_id=target_driver_user_id)
        and (j.expires_at is null or j.expires_at>now())
        and d.status='active'
        and d.activated_at is not null
        and d.suspended_at is null
        and a.is_active
        and a.is_available
        and v.marketplace_status='active'
        and v.deleted_at is null
        and app_private.marketplace_onboarding_requirements_complete(d.user_id,v.id)
        and (
          app_private.has_active_marketplace_work_trial(d.user_id)
          or app_private.has_confirmed_marketplace_initial_deposit(d.user_id)
          or (
            j.is_test
            and j.test_driver_user_id=d.user_id
            and j.test_force_wallet_commission
          )
        )
        and exists(
          select 1
          from public.vehicle_services vs
          where vs.project_id=j.project_id
            and vs.vehicle_id=v.id
            and vs.service_code=j.service_code
            and vs.enabled
        )
        and (
          coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code) is null
          or v.category_code =
             coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code)
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

create or replace function public.list_my_marketplace_available_jobs(
  target_vehicle_id text,
  target_limit integer default 50,
  target_before_created_at timestamptz default null,
  target_before_job_id uuid default null
)
returns table(
  job_id uuid,
  service_code text,
  origin_text text,
  destination_text text,
  scheduled_for timestamptz,
  passenger_count integer,
  cargo_weight_kg numeric,
  cargo_volume_m3 numeric,
  cargo_length_cm numeric,
  cargo_width_cm numeric,
  cargo_height_cm numeric,
  required_body_type text,
  recommended_price numeric,
  final_price numeric,
  currency text,
  expires_at timestamptz,
  created_at timestamptz,
  billing_mode text,
  commission_rate numeric,
  commission_amount numeric,
  available_balance numeric,
  missing_balance numeric,
  can_accept boolean,
  is_test boolean
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  actor uuid:=auth.uid();
  pid uuid;
  safe_limit integer:=least(greatest(coalesce(target_limit,50),1),100);
  balance numeric;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  if (target_before_created_at is null)<>(target_before_job_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023';
  end if;

  select id into pid
  from public.projects
  where slug='tuktuk-control';

  if not exists(
    select 1
    from public.driver_profiles d
    where d.project_id=pid
      and d.user_id=actor
      and d.status='active'
      and d.activated_at is not null
      and d.suspended_at is null
  )
  or not app_private.marketplace_onboarding_requirements_complete(
    actor,target_vehicle_id
  )
  or not exists(
    select 1
    from public.driver_vehicle_assignments a
    join public.vehicles v
      on v.project_id=a.project_id
     and v.id=a.vehicle_id
    where a.project_id=pid
      and a.driver_user_id=actor
      and a.vehicle_id=target_vehicle_id
      and a.is_active
      and a.is_available
      and v.marketplace_status='active'
      and v.deleted_at is null
  )
  then
    raise exception 'MARKETPLACE_WORK_ACCESS_DENIED' using errcode='42501';
  end if;

  balance:=coalesce(
    app_private.marketplace_wallet_available_balance(pid,actor),0
  );

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
      when j.is_test and j.test_force_wallet_commission
        then 'wallet_commission'
      when app_private.has_active_marketplace_work_trial(actor)
        then 'trial_free'
      when app_private.has_confirmed_marketplace_initial_deposit(actor)
        then 'wallet_commission'
      else null
    end,
    case
      when j.is_test and j.test_force_wallet_commission
        then j.commission_rate_snapshot
      when app_private.has_active_marketplace_work_trial(actor)
        then 0::numeric
      else j.commission_rate_snapshot
    end,
    case
      when j.is_test and j.test_force_wallet_commission
        then round(j.final_price*j.commission_rate_snapshot,2)
      when app_private.has_active_marketplace_work_trial(actor)
        then 0::numeric
      else round(j.final_price*j.commission_rate_snapshot,2)
    end,
    balance,
    greatest(
      0::numeric,
      (
        case
          when j.is_test and j.test_force_wallet_commission
            then round(j.final_price*j.commission_rate_snapshot,2)
          when app_private.has_active_marketplace_work_trial(actor)
            then 0::numeric
          else round(j.final_price*j.commission_rate_snapshot,2)
        end
      )-balance
    ),
    case
      when j.is_test and j.test_force_wallet_commission
        then balance>=round(j.final_price*j.commission_rate_snapshot,2)
      when app_private.has_active_marketplace_work_trial(actor)
        then true
      when app_private.has_confirmed_marketplace_initial_deposit(actor)
        then balance>=round(j.final_price*j.commission_rate_snapshot,2)
      else false
    end,
    j.is_test
  from public.jobs j
  join public.service_requests r
    on r.project_id=j.project_id
   and r.id=j.service_request_id
  where j.project_id=pid
    and j.status='published'
    and j.test_deleted_at is null
    and (not j.is_test or j.test_driver_user_id=actor)
    and (j.expires_at is null or j.expires_at>now())
    and (
      app_private.has_active_marketplace_work_trial(actor)
      or app_private.has_confirmed_marketplace_initial_deposit(actor)
      or (
        j.is_test
        and j.test_driver_user_id=actor
        and j.test_force_wallet_commission
      )
    )
    and exists(
      select 1
      from public.vehicle_services s
      where s.project_id=pid
        and s.vehicle_id=target_vehicle_id
        and s.service_code=j.service_code
        and s.enabled
    )
    and exists(
      select 1
      from public.vehicles v
      where v.project_id=pid
        and v.id=target_vehicle_id
        and (
          coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code) is null
          or v.category_code =
             coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code)
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
    )
    and (
      target_before_created_at is null
      or (j.created_at,j.id)<(target_before_created_at,target_before_job_id)
    )
  order by j.created_at desc,j.id desc
  limit safe_limit;
end;
$function$;

create or replace function public.accept_job(
  target_job_id uuid,
  target_vehicle_id text,
  target_idempotency_key uuid
)
returns public.jobs
language plpgsql
security definer
set search_path=''
as $function$
declare
  actor uuid:=auth.uid();
  pid uuid;
  j public.jobs%rowtype;
  e public.job_events%rowtype;
  a public.driver_vehicle_assignments%rowtype;
  t public.marketplace_work_trials%rowtype;
  trial_active boolean;
  paid_access boolean;
  force_test_commission boolean;
  amount numeric(14,2);
  reservation_id uuid;
  total numeric;
  reserved numeric;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;

  select id into pid
  from public.projects
  where slug='tuktuk-control';

  select *
  into j
  from public.jobs
  where project_id=pid
    and id=target_job_id
  for update;

  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if j.test_deleted_at is not null then
    raise exception 'JOB_NOT_AVAILABLE';
  end if;

  if j.is_test and j.test_driver_user_id is distinct from actor then
    raise exception 'JOB_NOT_AVAILABLE';
  end if;

  select *
  into e
  from public.job_events
  where project_id=pid
    and operation_idempotency_key=target_idempotency_key;

  if found then
    if e.job_id=j.id
       and e.actor_user_id=actor
       and e.action='accept'
       and (
         (
           e.metadata->>'billing_mode'='trial_free'
           and exists(
             select 1
             from public.job_assignments x
             where x.project_id=pid
               and x.job_id=j.id
               and x.driver_user_id=actor
               and x.vehicle_id=target_vehicle_id
               and x.acceptance_idempotency_key=target_idempotency_key
               and x.billing_mode='trial_free'
               and x.commission_amount_snapshot=0
           )
           and not exists(
             select 1
             from public.commission_reservations r
             where r.project_id=pid
               and r.job_id=j.id
           )
         )
         or
         (
           e.metadata->>'billing_mode'='wallet_commission'
           and exists(
             select 1
             from public.job_assignments x
             join public.commission_reservations r
               on r.project_id=x.project_id
              and r.job_id=x.job_id
              and r.user_id=actor
              and r.amount=x.commission_amount_snapshot
             where x.project_id=pid
               and x.job_id=j.id
               and x.driver_user_id=actor
               and x.vehicle_id=target_vehicle_id
               and x.acceptance_idempotency_key=target_idempotency_key
               and x.billing_mode='wallet_commission'
           )
         )
       )
    then
      return j;
    end if;

    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION';
  end if;

  if j.status<>'published'
     or not app_private.marketplace_job_transition_allowed(
       'published','accepted','driver'
     )
     or (j.expires_at is not null and j.expires_at<=now())
     or j.assigned_driver_user_id is not null
     or j.assigned_vehicle_id is not null
  then
    raise exception 'JOB_NOT_AVAILABLE';
  end if;

  force_test_commission :=
    j.is_test
    and j.test_force_wallet_commission
    and j.test_driver_user_id=actor;

  trial_active :=
    app_private.has_active_marketplace_work_trial(actor)
    and not force_test_commission;

  paid_access :=
    app_private.has_confirmed_marketplace_initial_deposit(actor)
    or force_test_commission;

  if not trial_active and not paid_access then
    raise exception 'MARKETPLACE_INITIAL_DEPOSIT_REQUIRED_AFTER_TRIAL'
      using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.driver_profiles d
    where d.project_id=pid
      and d.user_id=actor
      and d.status='active'
      and d.activated_at is not null
      and d.suspended_at is null
  ) then
    raise exception 'DRIVER_NOT_ACTIVE';
  end if;

  if not app_private.marketplace_onboarding_requirements_complete(
    actor,target_vehicle_id
  ) then
    raise exception 'MARKETPLACE_ONBOARDING_INCOMPLETE'
      using errcode='22023';
  end if;

  select *
  into a
  from public.driver_vehicle_assignments
  where project_id=pid
    and driver_user_id=actor
    and vehicle_id=target_vehicle_id
  for update;

  if not found or not a.is_active or not a.is_available then
    raise exception 'VEHICLE_ASSIGNMENT_NOT_AVAILABLE';
  end if;

  if not exists(
    select 1
    from public.vehicles v
    join public.service_requests r
      on r.project_id=j.project_id
     and r.id=j.service_request_id
    where v.project_id=pid
      and v.id=target_vehicle_id
      and v.deleted_at is null
      and v.marketplace_status='active'
      and (
        coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code) is null
        or v.category_code =
           coalesce(r.vehicle_category_code,j.pricing_vehicle_category_code)
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
  ) then
    raise exception 'VEHICLE_INCOMPATIBLE_WITH_SERVICE_REQUEST';
  end if;

  if not exists(
    select 1
    from public.vehicle_services s
    where s.project_id=pid
      and s.vehicle_id=target_vehicle_id
      and s.service_code=j.service_code
      and s.enabled
  ) then
    raise exception 'VEHICLE_SERVICE_NOT_ENABLED';
  end if;

  if trial_active then
    select *
    into t
    from public.marketplace_work_trials
    where project_id=pid
      and user_id=actor;

    insert into public.job_assignments(
      project_id,
      job_id,
      driver_user_id,
      vehicle_id,
      acceptance_idempotency_key,
      billing_mode,
      commission_amount_snapshot,
      trial_started_at_snapshot,
      trial_ends_at_snapshot
    )
    values(
      pid,
      j.id,
      actor,
      target_vehicle_id,
      target_idempotency_key,
      'trial_free',
      0,
      t.started_at,
      t.ends_at
    );
  else
    perform 1
    from public.wallets
    where project_id=pid
      and user_id=actor
    for update;

    if not found then
      raise exception 'MARKETPLACE_WALLET_NOT_FOUND';
    end if;

    amount:=round(j.final_price*j.commission_rate_snapshot,2);

    if amount<=0 then
      raise exception 'INVALID_COMMISSION_AMOUNT';
    end if;

    total:=app_private.marketplace_wallet_total_balance(pid,actor);
    reserved:=app_private.marketplace_wallet_reserved_balance(pid,actor);

    if total-reserved<amount then
      raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE';
    end if;

    insert into public.job_assignments(
      project_id,
      job_id,
      driver_user_id,
      vehicle_id,
      acceptance_idempotency_key,
      billing_mode,
      commission_amount_snapshot
    )
    values(
      pid,
      j.id,
      actor,
      target_vehicle_id,
      target_idempotency_key,
      'wallet_commission',
      amount
    );

    insert into public.commission_reservations(
      project_id,
      job_id,
      user_id,
      final_price_snapshot,
      commission_rate_snapshot,
      amount
    )
    values(
      pid,
      j.id,
      actor,
      j.final_price,
      j.commission_rate_snapshot,
      amount
    )
    returning id into reservation_id;
  end if;

  update public.jobs
  set status='accepted',
      assigned_driver_user_id=actor,
      assigned_vehicle_id=target_vehicle_id,
      state_version=state_version+1
  where project_id=pid
    and id=j.id
  returning * into j;

  update public.driver_vehicle_assignments
  set is_available=false
  where project_id=pid
    and driver_user_id=actor
    and vehicle_id=target_vehicle_id;

  insert into public.job_events(
    project_id,
    job_id,
    from_status,
    to_status,
    action,
    actor_kind,
    actor_user_id,
    operation_idempotency_key,
    metadata
  )
  values(
    pid,
    j.id,
    'published',
    'accepted',
    'accept',
    'driver',
    actor,
    target_idempotency_key,
    jsonb_build_object(
      'vehicle_id',target_vehicle_id,
      'billing_mode',
        case when trial_active then 'trial_free' else 'wallet_commission' end,
      'commission_amount',coalesce(amount,0),
      'trial_ends_at',
        case when trial_active then t.ends_at else null end,
      'reservation_id',reservation_id,
      'test_mode',j.is_test
    )
  );

  return j;
end;
$function$;
