-- TukTuk Marketplace / unified job finish.
-- DRAFT: do not apply to the production database until reviewed and tested.
-- Does not change existing acceptance, cancellation or incident-resolution rules.
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
  to service_role;

revoke all on function public.admin_finish_marketplace_job(uuid,text,uuid)
  from public,anon;
grant execute on function public.admin_finish_marketplace_job(uuid,text,uuid)
  to authenticated;

-- Read-only, bounded recovery feed. Creation-date history cannot recover an
-- old booking that settles later without repeatedly scanning every page.
create index if not exists jobs_driver_income_changes_idx
  on public.jobs(project_id,assigned_driver_user_id,updated_at,id)
  where status='settled';

create or replace function public.list_my_marketplace_income_changes(
  target_limit integer default 50,
  target_after_updated_at timestamptz default null,
  target_after_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  pid uuid;
  result jsonb;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if (target_after_updated_at is null) <> (target_after_job_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023';
  end if;
  select id into pid from public.projects where slug='tuktuk-control';
  select coalesce(jsonb_agg(page.payload order by page.updated_at,page.id),'[]'::jsonb)
    into result
    from (
      select j.id,j.updated_at,jsonb_build_object(
        'job_id',j.id,'status',j.status,'is_test',j.is_test,
        'final_price',j.final_price,'currency',j.currency,
        'vehicle_id',a.vehicle_id,'vehicle_name',v.name,
        'vehicle_registration',v.registration,'billing_mode',a.billing_mode,
        'completed_at',a.completed_at,'created_at',j.created_at,
        'updated_at',j.updated_at,
        'distance_km',case
          when (j.pricing_breakdown->>'distance_km') ~ '^[0-9]+([.][0-9]+)?$'
          then (j.pricing_breakdown->>'distance_km')::numeric end
      ) as payload
      from public.jobs j
      join public.job_assignments a on a.project_id=j.project_id
        and a.job_id=j.id and a.driver_user_id=actor
      join public.vehicles v on v.project_id=j.project_id and v.id=a.vehicle_id
      where j.project_id=pid and j.assigned_driver_user_id=actor
        and j.status='settled'
        and (target_after_updated_at is null or (j.updated_at,j.id) >
             (target_after_updated_at,target_after_job_id))
      order by j.updated_at,j.id
      limit least(greatest(coalesce(target_limit,50),1),50)
    ) page;
  return result;
end;
$function$;

revoke all on function public.list_my_marketplace_income_changes(integer,timestamptz,uuid)
  from public,anon;
grant execute on function public.list_my_marketplace_income_changes(integer,timestamptz,uuid)
  to authenticated;

-- Keep the published APK RPC signature, but remove the old unrated settlement.
create or replace function public.advance_my_marketplace_job(
  target_job_id uuid,target_action text,target_idempotency_key uuid
) returns public.jobs language plpgsql security definer set search_path='' as $function$
declare
  actor uuid:=auth.uid(); pid uuid; j public.jobs%rowtype;
  e public.job_events%rowtype; expected text; next_status text;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  if target_action is null or target_action not in ('start_en_route','mark_pickup','start_service','complete_service') then
    raise exception 'INVALID_JOB_ACTION' using errcode='22023';
  end if;
  select id into pid from public.projects where slug='tuktuk-control';
  select * into j from public.jobs where project_id=pid and id=target_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if;
  if j.assigned_driver_user_id is distinct from actor then
    raise exception 'JOB_NOT_ASSIGNED_TO_ACTOR' using errcode='42501';
  end if;
  if j.test_deleted_at is not null then raise exception 'JOB_NOT_AVAILABLE' using errcode='22023'; end if;
  -- This path now requires the actor's rating; old APKs cannot bypass it.
  if target_action='complete_service' then
    -- APK legacy: asks for service completion before displaying its rating sheet.
    -- This is a non-mutating preflight, not a financial or status completion.
    -- Only the subsequent saved rating can settle and charge the job.
    if j.status='in_progress' then
      if exists (
        select 1 from public.job_events as preflight_event
        where preflight_event.project_id=pid and preflight_event.operation_idempotency_key=target_idempotency_key
      ) then
        raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'
          using errcode='22023';
      end if;
      return j;
    end if;
    return app_private.finish_marketplace_job_core(
      target_job_id,'driver',actor,null,null,target_idempotency_key
    );
  end if;
  select * into e from public.job_events where project_id=pid and operation_idempotency_key=target_idempotency_key;
  if found then
    if e.job_id=j.id and e.actor_user_id=actor and e.action=target_action then return j; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION' using errcode='22023';
  end if;
  if target_action='start_en_route' then expected:='accepted'; next_status:='en_route';
  elsif target_action='mark_pickup' then expected:='en_route'; next_status:='pickup';
  else expected:='pickup'; next_status:='in_progress'; end if;
  if j.status<>expected or not app_private.marketplace_job_transition_allowed(expected,next_status,'driver') then
    raise exception 'INVALID_JOB_TRANSITION' using errcode='22023';
  end if;
  update public.jobs set status=next_status,state_version=state_version+1
    where project_id=pid and id=j.id returning * into j;
  insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key)
    values(pid,j.id,expected,next_status,target_action,'driver',actor,target_idempotency_key);
  return j;
end;
$function$;

create or replace function public.get_my_marketplace_customer_rating(target_job_id uuid)
returns table(job_id uuid,stars smallint,created_at timestamptz)
language plpgsql security definer set search_path='' as $function$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.jobs j join public.projects p on p.id=j.project_id
    where p.slug='tuktuk-control' and j.id=target_job_id and j.assigned_driver_user_id=auth.uid()
      and j.test_deleted_at is null) then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  return query select r.job_id,r.stars,r.created_at
    from public.marketplace_driver_customer_ratings r
    join public.projects p on p.id=r.project_id
    where p.slug='tuktuk-control' and r.job_id=target_job_id and r.driver_user_id=auth.uid();
end;
$function$;
revoke all on function public.get_my_marketplace_customer_rating(uuid) from public,anon;
grant execute on function public.get_my_marketplace_customer_rating(uuid) to authenticated;

-- First rating and settlement commit together; second rating is read-only financially.
create or replace function public.create_my_marketplace_customer_rating(
  target_job_id uuid,
  target_stars smallint,
  target_internal_note text,
  target_idempotency_key uuid
)
returns table(
  job_id uuid,
  stars smallint,
  created_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  pid uuid;
  job_status text;
  customer_uuid uuid;
  existing public.marketplace_driver_customer_ratings%rowtype;
  clean_note text := nullif(btrim(target_internal_note), '');
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  if target_job_id is null then
    raise exception 'JOB_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED'
      using errcode = '22023';
  end if;

  if target_stars is null or target_stars not between 1 and 5 then
    raise exception 'RATING_STARS_INVALID'
      using errcode = '22023';
  end if;

  if clean_note is not null and char_length(clean_note) > 1000 then
    raise exception 'RATING_INTERNAL_NOTE_TOO_LONG'
      using errcode = '22023';
  end if;

  select p.id
    into pid
  from public.projects p
  where p.slug = 'tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select j.status, sr.customer_id
    into job_status, customer_uuid
  from public.jobs j
  join public.service_requests sr
    on sr.project_id = j.project_id
   and sr.id = j.service_request_id
  where j.project_id = pid
    and j.id = target_job_id
    and j.assigned_driver_user_id = actor
    and j.test_deleted_at is null
  for update of j;

  if not found then
    raise exception 'ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if job_status not in ('en_route','pickup','in_progress','settled') then
    raise exception 'RATING_NOT_AVAILABLE'
      using errcode = '22023';
  end if;

  select r.*
    into existing
  from public.marketplace_driver_customer_ratings r
  where r.project_id = pid
    and r.driver_user_id = actor
    and r.idempotency_key = target_idempotency_key;

  if found then
    if existing.job_id = target_job_id
       and existing.stars = target_stars
       and existing.internal_note is not distinct from clean_note then

      return query
      select
        existing.job_id,
        existing.stars,
        existing.created_at,
        now();

      return;
    end if;

    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'
      using errcode = '22023';
  end if;

  select r.* into existing from public.marketplace_driver_customer_ratings r
    where r.project_id=pid and r.job_id=target_job_id;
  if found then
    if existing.driver_user_id=actor and existing.stars=target_stars
      and existing.internal_note is not distinct from clean_note then
      return query select existing.job_id,existing.stars,existing.created_at,now();
      return;
    end if;
    raise exception 'RATING_ALREADY_EXISTS'
      using errcode = '23505';
  end if;

  insert into public.marketplace_driver_customer_ratings(
    project_id,
    job_id,
    customer_id,
    driver_user_id,
    stars,
    internal_note,
    idempotency_key
  )
  values(
    pid,
    target_job_id,
    customer_uuid,
    actor,
    target_stars,
    clean_note,
    target_idempotency_key
  )
  returning *
    into existing;

  perform app_private.finish_marketplace_job_core(
    target_job_id,'driver',actor,null,null,target_idempotency_key
  );

  return query
  select
    existing.job_id,
    existing.stars,
    existing.created_at,
    now();
end;
$$;
create or replace function public.create_marketplace_customer_rating(
  target_session_id uuid,target_session_token text,target_job_id uuid,target_stars smallint,
  target_comment text,target_idempotency_key uuid
) returns table(job_id uuid,stars smallint,comment text,created_at timestamptz,server_time timestamptz)
language plpgsql security definer set search_path='' as $$
declare pid uuid; cid uuid; job_row public.jobs%rowtype; existing public.marketplace_customer_ratings%rowtype;
  clean_comment text:=nullif(btrim(target_comment),'');
begin
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  if target_stars is null or target_stars not between 1 and 5 then raise exception 'RATING_STARS_INVALID' using errcode='22023'; end if;
  if clean_comment is not null and char_length(clean_comment)>1000 then raise exception 'RATING_COMMENT_TOO_LONG' using errcode='22023'; end if;
  perform app_private.marketplace_customer_abuse_check('rating',target_session_id::text,8,interval '1 hour');
  cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token); pid:=app_private.marketplace_customer_project_id();
  select j.* into job_row from public.jobs j join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id
    where j.project_id=pid and j.id=target_job_id and r.customer_id=cid for update of j;
  if not found then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if job_row.test_deleted_at is not null then raise exception 'JOB_NOT_AVAILABLE' using errcode='22023'; end if;
  if job_row.status not in ('en_route','pickup','in_progress','settled') or job_row.assigned_driver_user_id is null then raise exception 'RATING_NOT_AVAILABLE' using errcode='22023'; end if;
  select * into existing from public.marketplace_customer_ratings where project_id=pid and customer_id=cid and idempotency_key=target_idempotency_key;
  if found then
    if existing.job_id=target_job_id and existing.stars=target_stars and existing.comment is not distinct from clean_comment then
      return query select existing.job_id,existing.stars,existing.comment,existing.created_at,now(); return;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION' using errcode='22023';
  end if;
  select r.* into existing from public.marketplace_customer_ratings r where r.project_id=pid and r.job_id=target_job_id;
  if found then
    if existing.customer_id=cid and existing.driver_user_id=job_row.assigned_driver_user_id
      and existing.stars=target_stars and existing.comment is not distinct from clean_comment then
      return query select existing.job_id,existing.stars,existing.comment,existing.created_at,now(); return;
    end if;
    raise exception 'RATING_ALREADY_EXISTS' using errcode='23505';
  end if;
  insert into public.marketplace_customer_ratings(project_id,job_id,customer_id,driver_user_id,stars,comment,idempotency_key)
  values(pid,target_job_id,cid,job_row.assigned_driver_user_id,target_stars,clean_comment,target_idempotency_key)
  returning * into existing;
  perform app_private.finish_marketplace_job_core(target_job_id,'customer',null,cid,null,target_idempotency_key);
  return query select existing.job_id,existing.stars,existing.comment,existing.created_at,now();
end; $$;

-- Customer history uses the existing session boundary and bounded keyset pages.
create index if not exists service_requests_customer_history_idx
  on public.service_requests(project_id,customer_id,id);
create or replace function public.list_marketplace_customer_history(
  target_session_id uuid,target_session_token text,target_limit integer default 50,
  target_before_created_at timestamptz default null,target_before_job_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare pid uuid; cid uuid; result jsonb;
begin
  cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token);
  pid:=app_private.marketplace_customer_project_id();
  if (target_before_created_at is null)<>(target_before_job_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(page.item order by page.created_at desc,page.id desc),'[]'::jsonb)
    into result from (
      select j.id,j.created_at,jsonb_build_object(
        'job_id',j.id,'status',j.status,'service_code',j.service_code,
        'origin_text',r.origin_text,'destination_text',r.destination_text,
        'final_price',j.final_price,'currency',j.currency,'created_at',j.created_at
      ) item
      from public.jobs j join public.service_requests r
        on r.project_id=j.project_id and r.id=j.service_request_id
      where j.project_id=pid and r.customer_id=cid and j.test_deleted_at is null
        and j.status='settled'
        and (target_before_created_at is null or (j.created_at,j.id)<(target_before_created_at,target_before_job_id))
      order by j.created_at desc,j.id desc limit least(greatest(coalesce(target_limit,50),1),50)
    ) page;
  return result;
end;
$function$;
revoke all on function public.list_marketplace_customer_history(uuid,text,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.list_marketplace_customer_history(uuid,text,integer,timestamptz,uuid) to service_role;

-- Solo lectura, lotes limitados, exclusivamente carreras propias del conductor.
-- Los registros locales heredados nunca se modifican desde esta funcion.
create or replace function public.list_my_marketplace_income_verification(target_job_ids uuid[])
returns table(job_id uuid,status text,is_test boolean,is_deleted boolean)
language plpgsql stable security definer set search_path='' as $function$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if target_job_ids is null or cardinality(target_job_ids) not between 1 and 50 then
    raise exception 'INVALID_INCOME_VERIFICATION_BATCH' using errcode='22023';
  end if;
  return query
    select j.id,j.status,j.is_test,(j.test_deleted_at is not null)
    from public.jobs j
    join public.projects p on p.id=j.project_id
    where p.slug='tuktuk-control'
      and j.assigned_driver_user_id=auth.uid()
      and j.id=any(target_job_ids);
end;
$function$;
revoke all on function public.list_my_marketplace_income_verification(uuid[]) from public,anon,authenticated;
grant execute on function public.list_my_marketplace_income_verification(uuid[]) to authenticated;