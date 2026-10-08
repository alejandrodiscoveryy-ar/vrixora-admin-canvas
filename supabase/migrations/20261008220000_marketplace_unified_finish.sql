-- TukTuk Marketplace / unified job finish.
-- DRAFT: do not apply to the production database until reviewed and tested.
-- Does not change existing acceptance, cancellation or incident-resolution RPCs.
-- A single, locked transaction settles the job at most once.

create or replace function app_private.finish_marketplace_job_core(
  target_job_id uuid,
  target_actor_kind text,
  target_actor_user_id uuid,
  target_customer_id uuid,
  target_reason text,
  target_idempotency_key uuid
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  pid uuid;
  j public.jobs%rowtype;
  a public.job_assignments%rowtype;
  w public.wallets%rowtype;
  r public.commission_reservations%rowtype;
  prior_event public.job_events%rowtype;
  original_status text;
  scheduled_at timestamptz;
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
  if target_actor_kind not in ('driver','customer','admin') then
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
  -- Minimal server-side guard against accidental/immediate finishing.
  -- It is not proof of actual arrival; GPS/route evidence remains separate.
  if target_actor_kind<>'admin' then
    select sr.scheduled_for into scheduled_at
      from public.service_requests sr
     where sr.project_id=j.project_id and sr.id=j.service_request_id;
    if not found then
      raise exception 'SERVICE_REQUEST_NOT_FOUND' using errcode='P0002';
    end if;
    if now() < greatest(a.accepted_at,coalesce(scheduled_at,a.accepted_at))
               + interval '60 seconds' then
      raise exception 'FINISH_TOO_EARLY' using errcode='22023';
    end if;
  end if;

  if a.driver_user_id is distinct from j.assigned_driver_user_id
    or a.vehicle_id is distinct from j.assigned_vehicle_id
    or a.completed_at is not null
    or a.cancelled_at is not null
  then
    raise exception 'FINISH_ASSIGNMENT_PRECONDITION_FAILED' using errcode='22023';
  end if;

  if a.billing_mode='trial_free' then
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
      or r.commission_rate_snapshot<>j.commission_rate_snapshot
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

revoke all on function app_private.finish_marketplace_job_core(
  uuid,text,uuid,uuid,text,uuid
) from public,anon,authenticated;

create or replace function public.finish_my_marketplace_job(
  target_job_id uuid,
  target_idempotency_key uuid
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  return app_private.finish_marketplace_job_core(
    target_job_id,'driver',auth.uid(),null,null,target_idempotency_key
  );
end;
$function$;

create or replace function public.finish_marketplace_customer_job(
  target_session_id uuid,
  target_session_token text,
  target_job_id uuid,
  target_idempotency_key uuid
)
returns table(job_id uuid,status text,server_time timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cid uuid;
  j public.jobs%rowtype;
begin
  cid:=app_private.resolve_marketplace_customer_session(
    target_session_id,target_session_token
  );
  j:=app_private.finish_marketplace_job_core(
    target_job_id,'customer',null,cid,null,target_idempotency_key
  );
  return query select j.id,j.status,now();
end;
$function$;

create or replace function public.admin_finish_marketplace_job(
  target_job_id uuid,
  target_reason text,
  target_idempotency_key uuid
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  pid uuid;
  actor uuid;
begin
  select id into pid from public.projects where slug='tuktuk-control';
  if pid is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  actor:=app_private.require_project_permission(pid,'marketplace.manage');
  perform app_private.require_project_permission(pid,'payments.manage');
  return app_private.finish_marketplace_job_core(
    target_job_id,'admin',actor,null,target_reason,target_idempotency_key
  );
end;
$function$;

revoke all on function public.finish_my_marketplace_job(uuid,uuid)
  from public,anon;
grant execute on function public.finish_my_marketplace_job(uuid,uuid)
  to authenticated;

revoke all on function public.finish_marketplace_customer_job(uuid,text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.finish_marketplace_customer_job(uuid,text,uuid,uuid)
  to anon,authenticated;

revoke all on function public.admin_finish_marketplace_job(uuid,text,uuid)
  from public,anon;
grant execute on function public.admin_finish_marketplace_job(uuid,text,uuid)
  to authenticated;
