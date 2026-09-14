-- TukTuk Marketplace V1, Block 6: atomic acceptance, reservation and settlement.

alter table public.vehicles
  add column cargo_length_cm numeric check (cargo_length_cm is null or cargo_length_cm >= 0),
  add column cargo_width_cm numeric check (cargo_width_cm is null or cargo_width_cm >= 0),
  add column cargo_height_cm numeric check (cargo_height_cm is null or cargo_height_cm >= 0);

create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid not null,
  driver_user_id uuid not null,
  vehicle_id text not null,
  acceptance_idempotency_key uuid not null,
  accepted_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, job_id),
  unique (project_id, driver_user_id, acceptance_idempotency_key),
  foreign key (project_id, job_id) references public.jobs(project_id, id) on delete restrict,
  foreign key (project_id, driver_user_id, vehicle_id)
    references public.driver_vehicle_assignments(project_id, driver_user_id, vehicle_id) on delete restrict,
  check (not (completed_at is not null and cancelled_at is not null))
);

create table public.commission_reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid not null,
  user_id uuid not null,
  currency text not null default 'CUP' check (currency = 'CUP'),
  final_price_snapshot numeric(14,2) not null check (final_price_snapshot > 0),
  commission_rate_snapshot numeric(8,6) not null check (commission_rate_snapshot > 0 and commission_rate_snapshot <= 1),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'open' check (status in ('open', 'consumed', 'released')),
  ledger_transaction_id uuid,
  opened_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, job_id),
  foreign key (project_id, job_id) references public.jobs(project_id, id) on delete restrict,
  foreign key (project_id, user_id) references public.wallets(project_id, user_id) on delete restrict,
  foreign key (project_id, user_id, ledger_transaction_id)
    references public.wallet_transactions(project_id, user_id, id) on delete restrict,
  check (amount = round(final_price_snapshot * commission_rate_snapshot, 2)),
  check ((status = 'open' and ledger_transaction_id is null and consumed_at is null and released_at is null and release_reason is null)
    or (status = 'consumed' and ledger_transaction_id is not null and consumed_at is not null and released_at is null and release_reason is null)
    or (status = 'released' and ledger_transaction_id is null and consumed_at is null and released_at is not null and nullif(btrim(release_reason), '') is not null))
);

create trigger job_assignments_set_updated_at before update on public.job_assignments
for each row execute function app_private.set_updated_at();
create trigger commission_reservations_set_updated_at before update on public.commission_reservations
for each row execute function app_private.set_updated_at();

create or replace function app_private.protect_job_assignment_provenance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.project_id is distinct from old.project_id
    or new.job_id is distinct from old.job_id or new.driver_user_id is distinct from old.driver_user_id
    or new.vehicle_id is distinct from old.vehicle_id or new.acceptance_idempotency_key is distinct from old.acceptance_idempotency_key
    or new.accepted_at is distinct from old.accepted_at or new.created_at is distinct from old.created_at then
    raise exception 'JOB_ASSIGNMENT_PROVENANCE_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function app_private.protect_commission_reservation_provenance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.project_id is distinct from old.project_id
    or new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id
    or new.currency is distinct from old.currency or new.final_price_snapshot is distinct from old.final_price_snapshot
    or new.commission_rate_snapshot is distinct from old.commission_rate_snapshot or new.amount is distinct from old.amount
    or new.opened_at is distinct from old.opened_at or new.created_at is distinct from old.created_at then
    raise exception 'COMMISSION_RESERVATION_PROVENANCE_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger job_assignments_protect_provenance before update on public.job_assignments
for each row execute function app_private.protect_job_assignment_provenance();
create trigger commission_reservations_protect_provenance before update on public.commission_reservations
for each row execute function app_private.protect_commission_reservation_provenance();

create or replace function app_private.marketplace_wallet_reserved_balance(target_project_id uuid, target_user_id uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(reservation.amount), 0)::numeric
  from public.commission_reservations reservation
  where reservation.project_id = target_project_id and reservation.user_id = target_user_id and reservation.status = 'open';
$$;

create or replace function app_private.marketplace_wallet_available_balance(target_project_id uuid, target_user_id uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select app_private.marketplace_wallet_total_balance(target_project_id, target_user_id)
    - app_private.marketplace_wallet_reserved_balance(target_project_id, target_user_id);
$$;

create or replace function public.accept_job(target_job_id uuid, target_vehicle_id text, target_idempotency_key uuid)
returns public.jobs language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); tuktuk_project_id uuid; job_record public.jobs%rowtype;
  assignment_record public.driver_vehicle_assignments%rowtype; wallet_record public.wallets%rowtype;
  event_record public.job_events%rowtype; reservation_id uuid; commission_amount numeric(14,2);
  total_balance numeric; reserved_balance numeric; available_balance numeric;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  select id into tuktuk_project_id from public.projects where slug = 'tuktuk-control';
  if tuktuk_project_id is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  select * into job_record from public.jobs where project_id=tuktuk_project_id and id=target_job_id for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if;
  select * into event_record from public.job_events where project_id=tuktuk_project_id and operation_idempotency_key=target_idempotency_key;
  if found then
    if event_record.job_id=job_record.id and event_record.actor_user_id=actor and event_record.action='accept'
      and exists (select 1 from public.job_assignments a where a.project_id=tuktuk_project_id and a.job_id=job_record.id and a.driver_user_id=actor and a.vehicle_id=target_vehicle_id and a.acceptance_idempotency_key=target_idempotency_key)
      and exists (select 1 from public.commission_reservations r where r.project_id=tuktuk_project_id and r.job_id=job_record.id and r.user_id=actor) then return job_record; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION' using errcode='22023';
  end if;
  if job_record.status <> 'published' or not app_private.marketplace_job_transition_allowed('published','accepted','driver') or (job_record.expires_at is not null and job_record.expires_at <= now())
    or job_record.assigned_driver_user_id is not null or job_record.assigned_vehicle_id is not null then raise exception 'JOB_NOT_AVAILABLE' using errcode='22023'; end if;
  if not app_private.has_active_marketplace_suite(actor) then raise exception 'MARKETPLACE_SUITE_NOT_ACTIVE' using errcode='42501'; end if;
  if not app_private.has_confirmed_marketplace_initial_deposit(actor) then raise exception 'MARKETPLACE_INITIAL_DEPOSIT_NOT_CONFIRMED' using errcode='42501'; end if;
  if not exists (select 1 from public.driver_profiles d where d.project_id=tuktuk_project_id and d.user_id=actor and d.status='active' and d.activated_at is not null and d.suspended_at is null) then raise exception 'DRIVER_NOT_ACTIVE' using errcode='42501'; end if;
  select * into assignment_record from public.driver_vehicle_assignments d where d.project_id=tuktuk_project_id and d.driver_user_id=actor and d.vehicle_id=target_vehicle_id for update;
  if not found or not assignment_record.is_active or not assignment_record.is_available then raise exception 'VEHICLE_ASSIGNMENT_NOT_AVAILABLE' using errcode='22023'; end if;
  if not exists (select 1 from public.vehicles v join public.service_requests r on r.project_id=job_record.project_id and r.id=job_record.service_request_id where v.project_id=tuktuk_project_id and v.id=target_vehicle_id and v.deleted_at is null and v.marketplace_status='active' and (r.passenger_count is null or v.passenger_capacity >= r.passenger_count) and (r.cargo_weight_kg is null or v.cargo_capacity_kg >= r.cargo_weight_kg) and (r.cargo_volume_m3 is null or v.cargo_volume_m3 >= r.cargo_volume_m3) and (r.cargo_length_cm is null or v.cargo_length_cm >= r.cargo_length_cm) and (r.cargo_width_cm is null or v.cargo_width_cm >= r.cargo_width_cm) and (r.cargo_height_cm is null or v.cargo_height_cm >= r.cargo_height_cm) and (r.required_body_type is null or (v.body_type is not null and lower(btrim(v.body_type))=lower(btrim(r.required_body_type))))) then raise exception 'VEHICLE_INCOMPATIBLE_WITH_SERVICE_REQUEST' using errcode='22023'; end if;
  if not exists (select 1 from public.vehicle_services s where s.project_id=tuktuk_project_id and s.vehicle_id=target_vehicle_id and s.service_code=job_record.service_code and s.enabled) then raise exception 'VEHICLE_SERVICE_NOT_ENABLED' using errcode='22023'; end if;
  select * into wallet_record from public.wallets w where w.project_id=tuktuk_project_id and w.user_id=actor for update;
  if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND' using errcode='P0002'; end if;
  commission_amount := round(job_record.final_price * job_record.commission_rate_snapshot, 2);
  if commission_amount <= 0 then raise exception 'INVALID_COMMISSION_AMOUNT' using errcode='22023'; end if;
  total_balance := app_private.marketplace_wallet_total_balance(tuktuk_project_id,actor); reserved_balance := app_private.marketplace_wallet_reserved_balance(tuktuk_project_id,actor); available_balance := total_balance-reserved_balance;
  if available_balance < commission_amount then raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE' using errcode='22023'; end if;
  insert into public.job_assignments(project_id,job_id,driver_user_id,vehicle_id,acceptance_idempotency_key) values(tuktuk_project_id,job_record.id,actor,target_vehicle_id,target_idempotency_key);
  insert into public.commission_reservations(project_id,job_id,user_id,final_price_snapshot,commission_rate_snapshot,amount) values(tuktuk_project_id,job_record.id,actor,job_record.final_price,job_record.commission_rate_snapshot,commission_amount) returning id into reservation_id;
  update public.jobs set status='accepted',assigned_driver_user_id=actor,assigned_vehicle_id=target_vehicle_id,state_version=state_version+1 where project_id=tuktuk_project_id and id=job_record.id returning * into job_record;
  update public.driver_vehicle_assignments set is_available=false where project_id=tuktuk_project_id and driver_user_id=actor and vehicle_id=target_vehicle_id;
  insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key,metadata) values(tuktuk_project_id,job_record.id,'published','accepted','accept','driver',actor,target_idempotency_key,jsonb_build_object('vehicle_id',target_vehicle_id,'reservation_id',reservation_id));
  return job_record;
end;
$$;

create or replace function public.advance_my_marketplace_job(target_job_id uuid, target_action text, target_idempotency_key uuid)
returns public.jobs language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); tuktuk_project_id uuid; job_record public.jobs%rowtype; event_record public.job_events%rowtype; expected_from text; next_status text; assignment_record public.job_assignments%rowtype; wallet_record public.wallets%rowtype; reservation_record public.commission_reservations%rowtype; prior_total numeric; ledger_id uuid;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  if target_action is null or target_action not in ('start_en_route','mark_pickup','start_service','complete_service') then raise exception 'INVALID_JOB_ACTION' using errcode='22023'; end if;
  select id into tuktuk_project_id from public.projects where slug='tuktuk-control'; if tuktuk_project_id is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  select * into job_record from public.jobs where project_id=tuktuk_project_id and id=target_job_id for update; if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if;
  select * into event_record from public.job_events where project_id=tuktuk_project_id and operation_idempotency_key=target_idempotency_key;
  if found then if event_record.job_id=job_record.id and event_record.actor_user_id=actor and event_record.action=target_action then return job_record; else raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION' using errcode='22023'; end if; end if;
  if job_record.assigned_driver_user_id is distinct from actor then raise exception 'JOB_NOT_ASSIGNED_TO_ACTOR' using errcode='42501'; end if;
  if target_action='start_en_route' then expected_from:='accepted'; next_status:='en_route';
  elsif target_action='mark_pickup' then expected_from:='en_route'; next_status:='pickup';
  elsif target_action='start_service' then expected_from:='pickup'; next_status:='in_progress';
  else expected_from:='in_progress'; next_status:='completed'; end if;
  if target_action <> 'complete_service' then
    if job_record.status<>expected_from or not app_private.marketplace_job_transition_allowed(expected_from,next_status,'driver') then raise exception 'INVALID_JOB_TRANSITION' using errcode='22023'; end if;
    update public.jobs set status=next_status,state_version=state_version+1 where project_id=tuktuk_project_id and id=job_record.id returning * into job_record;
    insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key) values(tuktuk_project_id,job_record.id,expected_from,next_status,target_action,'driver',actor,target_idempotency_key);
    return job_record;
  end if;
  select * into assignment_record from public.job_assignments where project_id=tuktuk_project_id and job_id=job_record.id for update;
  if not found then raise exception 'JOB_ASSIGNMENT_NOT_FOUND' using errcode='P0002'; end if;
  select * into wallet_record from public.wallets where project_id=tuktuk_project_id and user_id=actor for update;
  if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND' using errcode='P0002'; end if;
  select * into reservation_record from public.commission_reservations where project_id=tuktuk_project_id and job_id=job_record.id for update;
  if not found then raise exception 'COMMISSION_RESERVATION_NOT_FOUND' using errcode='P0002'; end if;
  if job_record.status<>'in_progress' or not app_private.marketplace_job_transition_allowed('in_progress','completed','driver') then raise exception 'INVALID_JOB_TRANSITION' using errcode='22023'; end if;
  if assignment_record.driver_user_id<>actor or assignment_record.vehicle_id<>job_record.assigned_vehicle_id or reservation_record.status<>'open' or reservation_record.user_id<>actor or reservation_record.currency<>job_record.currency or reservation_record.amount<=0 or reservation_record.final_price_snapshot<>job_record.final_price or reservation_record.commission_rate_snapshot<>job_record.commission_rate_snapshot then raise exception 'SETTLEMENT_PRECONDITION_FAILED' using errcode='22023'; end if;
  prior_total:=app_private.marketplace_wallet_total_balance(tuktuk_project_id,actor); if prior_total-reservation_record.amount<0 then raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE' using errcode='22023'; end if;
  update public.jobs set status='completed',state_version=state_version+1 where project_id=tuktuk_project_id and id=job_record.id;
  insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key) values(tuktuk_project_id,job_record.id,'in_progress','completed','complete_service','driver',actor,target_idempotency_key);
  insert into public.wallet_transactions(project_id,user_id,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,actor_id,metadata) values(tuktuk_project_id,actor,'commission',-reservation_record.amount,prior_total-reservation_record.amount,'job_commission',job_record.id::text,gen_random_uuid(),actor,jsonb_build_object('operation_idempotency_key',target_idempotency_key)) returning id into ledger_id;
  update public.commission_reservations set status='consumed',ledger_transaction_id=ledger_id,consumed_at=now() where project_id=tuktuk_project_id and id=reservation_record.id;
  update public.job_assignments set completed_at=now() where project_id=tuktuk_project_id and id=assignment_record.id;
  if not app_private.marketplace_job_transition_allowed('completed','settled','system') then raise exception 'INVALID_JOB_TRANSITION' using errcode='22023'; end if;
  update public.jobs set status='settled',state_version=state_version+1 where project_id=tuktuk_project_id and id=job_record.id returning * into job_record;
  insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,operation_idempotency_key) values(tuktuk_project_id,job_record.id,'completed','settled','settle','system',gen_random_uuid());
  update public.driver_vehicle_assignments set is_available=is_active where project_id=tuktuk_project_id and driver_user_id=actor and vehicle_id=assignment_record.vehicle_id;
  return job_record;
end;
$$;

create or replace function public.cancel_my_marketplace_job(target_job_id uuid, target_reason text, target_idempotency_key uuid)
returns public.jobs language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); tuktuk_project_id uuid; job_record public.jobs%rowtype; event_record public.job_events%rowtype; assignment_record public.job_assignments%rowtype; wallet_record public.wallets%rowtype; reservation_record public.commission_reservations%rowtype; reason text; previous_status text;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  reason:=nullif(btrim(target_reason),''); if reason is null then raise exception 'CANCELLATION_REASON_REQUIRED' using errcode='22023'; end if;
  select id into tuktuk_project_id from public.projects where slug='tuktuk-control'; if tuktuk_project_id is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  select * into job_record from public.jobs where project_id=tuktuk_project_id and id=target_job_id for update; if not found then raise exception 'JOB_NOT_FOUND' using errcode='P0002'; end if;
  select * into event_record from public.job_events where project_id=tuktuk_project_id and operation_idempotency_key=target_idempotency_key;
  if found then if event_record.job_id=job_record.id and event_record.actor_user_id=actor and event_record.action in ('cancel_by_driver','open_incident') and event_record.reason is not distinct from reason then return job_record; else raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION' using errcode='22023'; end if; end if;
  if job_record.assigned_driver_user_id is distinct from actor then raise exception 'JOB_NOT_ASSIGNED_TO_ACTOR' using errcode='42501'; end if;
  previous_status:=job_record.status;
  select * into assignment_record from public.job_assignments where project_id=tuktuk_project_id and job_id=job_record.id for update;
  if not found then raise exception 'JOB_ASSIGNMENT_NOT_FOUND' using errcode='P0002'; end if;
  select * into wallet_record from public.wallets where project_id=tuktuk_project_id and user_id=actor for update;
  if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND' using errcode='P0002'; end if;
  select * into reservation_record from public.commission_reservations where project_id=tuktuk_project_id and job_id=job_record.id for update;
  if not found then raise exception 'COMMISSION_RESERVATION_NOT_FOUND' using errcode='P0002'; end if;
  if assignment_record.driver_user_id<>actor or reservation_record.user_id<>actor or reservation_record.status<>'open' then raise exception 'CANCELLATION_PRECONDITION_FAILED' using errcode='22023'; end if;
  if job_record.status in ('accepted','en_route','pickup') then
    if reservation_record.status<>'open' or not app_private.marketplace_job_transition_allowed(job_record.status,'cancelled_by_driver','driver') then raise exception 'INVALID_JOB_TRANSITION' using errcode='22023'; end if;
    update public.commission_reservations set status='released',released_at=now(),release_reason=reason where project_id=tuktuk_project_id and id=reservation_record.id;
    update public.job_assignments set cancelled_at=now() where project_id=tuktuk_project_id and id=assignment_record.id;
    update public.jobs set status='cancelled_by_driver',state_version=state_version+1 where project_id=tuktuk_project_id and id=job_record.id returning * into job_record;
    update public.driver_vehicle_assignments set is_available=is_active where project_id=tuktuk_project_id and driver_user_id=actor and vehicle_id=assignment_record.vehicle_id;
    insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key,reason) values(tuktuk_project_id,job_record.id,previous_status,'cancelled_by_driver','cancel_by_driver','driver',actor,target_idempotency_key,reason);
    return job_record;
  elsif job_record.status='in_progress' then
    if not app_private.marketplace_job_transition_allowed('in_progress','incident','driver') then raise exception 'INVALID_JOB_TRANSITION' using errcode='22023'; end if;
    update public.jobs set status='incident',incident_from_status='in_progress',incident_opened_at=now(),incident_reason=reason,state_version=state_version+1 where project_id=tuktuk_project_id and id=job_record.id returning * into job_record;
    insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key,reason) values(tuktuk_project_id,job_record.id,'in_progress','incident','open_incident','driver',actor,target_idempotency_key,reason);
    return job_record;
  end if;
  raise exception 'INVALID_JOB_TRANSITION' using errcode='22023';
end;
$$;

create trigger audit_marketplace_job_assignments after insert or update on public.job_assignments for each row execute function app_private.capture_audit_event();
create trigger audit_marketplace_commission_reservations after insert or update on public.commission_reservations for each row execute function app_private.capture_audit_event();
create index job_assignments_driver_accepted_idx on public.job_assignments(project_id,driver_user_id,accepted_at desc);
create index commission_reservations_user_status_created_idx on public.commission_reservations(project_id,user_id,status,created_at desc);
create index commission_reservations_open_lookup_idx on public.commission_reservations(project_id,user_id,job_id) where status='open';
alter table public.job_assignments enable row level security;
alter table public.commission_reservations enable row level security;
revoke all on public.job_assignments, public.commission_reservations from public, anon, authenticated;
revoke all on function app_private.protect_job_assignment_provenance(), app_private.protect_commission_reservation_provenance(), app_private.marketplace_wallet_reserved_balance(uuid,uuid), app_private.marketplace_wallet_available_balance(uuid,uuid) from public, anon, authenticated;
revoke all on function public.accept_job(uuid,text,uuid), public.advance_my_marketplace_job(uuid,text,uuid), public.cancel_my_marketplace_job(uuid,text,uuid) from public, anon;
grant execute on function public.accept_job(uuid,text,uuid), public.advance_my_marketplace_job(uuid,text,uuid), public.cancel_my_marketplace_job(uuid,text,uuid) to authenticated;
