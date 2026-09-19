-- TukTuk Marketplace V1: one immutable, explicit 30-day Work trial.

create table public.marketplace_work_trials (
  project_id uuid not null,
  user_id uuid not null,
  started_vehicle_id text not null,
  start_idempotency_key uuid not null,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  unique (project_id, start_idempotency_key),
  foreign key (project_id, user_id) references public.driver_profiles(project_id, user_id) on delete restrict,
  foreign key (project_id, started_vehicle_id) references public.vehicles(project_id, id) on delete restrict,
  check (ends_at = started_at + interval '30 days')
);

create or replace function app_private.protect_marketplace_work_trial()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'MARKETPLACE_WORK_TRIAL_IMMUTABLE' using errcode='42501'; end; $$;
create trigger marketplace_work_trials_immutable before update or delete on public.marketplace_work_trials
for each row execute function app_private.protect_marketplace_work_trial();
create trigger audit_marketplace_work_trials after insert on public.marketplace_work_trials
for each row execute function app_private.capture_audit_event();
alter table public.marketplace_work_trials enable row level security;
revoke all on public.marketplace_work_trials from public, anon, authenticated;

create or replace function app_private.marketplace_onboarding_requirements_complete(target_user_id uuid,target_vehicle_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select target_user_id is not null and target_vehicle_id is not null and exists (
   select 1 from public.profiles p
   join public.driver_profiles d on d.user_id=p.id
   join public.projects project on project.id=d.project_id and project.slug='tuktuk-control'
   join public.media_assets dp on dp.project_id=d.project_id and dp.id=d.photo_asset_id and dp.owner_user_id=d.user_id and dp.status='available'
   join public.driver_vehicle_assignments a on a.project_id=d.project_id and a.driver_user_id=d.user_id and a.vehicle_id=target_vehicle_id and a.is_active
   join public.vehicles v on v.project_id=d.project_id and v.id=a.vehicle_id and v.deleted_at is null and v.marketplace_status <> 'suspended'
   join public.media_assets vp on vp.project_id=v.project_id and vp.id=v.main_photo_asset_id and vp.owner_user_id=v.owner_user_id and vp.status='available'
   where d.user_id=target_user_id and d.status <> 'suspended' and d.suspended_at is null
     and nullif(btrim(p.display_name),'') is not null and p.phone ~ '^\+[1-9][0-9]{7,14}$'
     and nullif(btrim(v.category_code),'') is not null and nullif(btrim(v.propulsion_code),'') is not null
     and nullif(btrim(v.brand),'') is not null and nullif(btrim(v.model),'') is not null
     and exists (select 1 from public.vehicle_services vs join public.service_types st on st.project_id=vs.project_id and st.code=vs.service_code and st.active where vs.project_id=v.project_id and vs.vehicle_id=v.id and vs.enabled)
     and (not exists (select 1 from public.vehicle_services vs where vs.project_id=v.project_id and vs.vehicle_id=v.id and vs.enabled and vs.service_code in ('passenger','tourism')) or coalesce(v.passenger_capacity,0)>0)
     and (not exists (select 1 from public.vehicle_services vs where vs.project_id=v.project_id and vs.vehicle_id=v.id and vs.enabled and vs.service_code='cargo') or greatest(coalesce(v.cargo_capacity_kg,0),coalesce(v.cargo_volume_m3,0),coalesce(v.cargo_length_cm,0),coalesce(v.cargo_width_cm,0),coalesce(v.cargo_height_cm,0))>0)
 );
$$;

create or replace function public.start_my_marketplace_work_trial(target_vehicle_id text,target_idempotency_key uuid)
returns public.marketplace_work_trials language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; trial public.marketplace_work_trials%rowtype; started timestamptz;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
 select id into pid from public.projects where slug='tuktuk-control'; if pid is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND'; end if;
 perform 1 from public.driver_profiles where project_id=pid and user_id=actor for update;
 if not found then raise exception 'DRIVER_PROFILE_NOT_FOUND' using errcode='P0002'; end if;
 if exists(select 1 from public.driver_profiles where project_id=pid and user_id=actor and (status='suspended' or suspended_at is not null)) then raise exception 'DRIVER_SUSPENDED' using errcode='42501'; end if;
 select * into trial from public.marketplace_work_trials where project_id=pid and user_id=actor for update;
 if found then if trial.start_idempotency_key=target_idempotency_key and trial.started_vehicle_id=target_vehicle_id then return trial; end if; raise exception 'WORK_TRIAL_ALREADY_STARTED' using errcode='22023'; end if;
 perform 1 from public.driver_vehicle_assignments where project_id=pid and driver_user_id=actor and vehicle_id=target_vehicle_id for update;
 if not found then raise exception 'VEHICLE_ASSIGNMENT_NOT_FOUND' using errcode='P0002'; end if;
 perform 1 from public.vehicles where project_id=pid and id=target_vehicle_id for update;
 if not found then raise exception 'VEHICLE_NOT_FOUND' using errcode='P0002'; end if;
 if not app_private.marketplace_onboarding_requirements_complete(actor,target_vehicle_id) then raise exception 'MARKETPLACE_ONBOARDING_INCOMPLETE' using errcode='22023'; end if;
 started:=now(); insert into public.marketplace_work_trials(project_id,user_id,started_vehicle_id,start_idempotency_key,started_at,ends_at) values(pid,actor,target_vehicle_id,target_idempotency_key,started,started+interval '30 days') returning * into trial;
 update public.driver_profiles set status='active',activated_at=coalesce(activated_at,started) where project_id=pid and user_id=actor;
 update public.vehicles set marketplace_status='active' where project_id=pid and id=target_vehicle_id;
 return trial;
end; $$;

create or replace function app_private.has_active_marketplace_work_trial(target_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select target_user_id is not null and exists(select 1 from public.marketplace_work_trials t join public.driver_profiles d on d.project_id=t.project_id and d.user_id=t.user_id join public.projects p on p.id=t.project_id where p.slug='tuktuk-control' and t.user_id=target_user_id and t.started_at<=now() and now()<t.ends_at and d.status='active' and d.activated_at is not null and d.suspended_at is null);
$$;
create or replace function app_private.has_active_marketplace_suite(target_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select target_user_id is not null and exists(select 1 from public.driver_profiles d join public.projects p on p.id=d.project_id where p.slug='tuktuk-control' and d.user_id=target_user_id and d.status='active' and d.activated_at is not null and d.suspended_at is null) and (app_private.has_active_marketplace_work_trial(target_user_id) or app_private.has_confirmed_marketplace_initial_deposit(target_user_id));
$$;

alter table public.job_assignments add column billing_mode text, add column commission_amount_snapshot numeric(14,2), add column trial_started_at_snapshot timestamptz, add column trial_ends_at_snapshot timestamptz;
update public.job_assignments a set billing_mode='wallet_commission',commission_amount_snapshot=r.amount from public.commission_reservations r where r.project_id=a.project_id and r.job_id=a.job_id;
do $$ begin if exists(select 1 from public.job_assignments where billing_mode is null or commission_amount_snapshot is null) then raise exception 'LEGACY_JOB_ASSIGNMENT_WITHOUT_RESERVATION'; end if; end $$;
alter table public.job_assignments alter column billing_mode set not null, alter column commission_amount_snapshot set not null,
 add constraint job_assignments_billing_mode_check check ((billing_mode='wallet_commission' and commission_amount_snapshot>0 and trial_started_at_snapshot is null and trial_ends_at_snapshot is null) or (billing_mode='trial_free' and commission_amount_snapshot=0 and trial_started_at_snapshot is not null and trial_ends_at_snapshot=trial_started_at_snapshot+interval '30 days' and accepted_at>=trial_started_at_snapshot and accepted_at<trial_ends_at_snapshot));
create or replace function app_private.protect_job_assignment_provenance() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.id is distinct from old.id or new.project_id is distinct from old.project_id or new.job_id is distinct from old.job_id or new.driver_user_id is distinct from old.driver_user_id or new.vehicle_id is distinct from old.vehicle_id or new.acceptance_idempotency_key is distinct from old.acceptance_idempotency_key or new.accepted_at is distinct from old.accepted_at or new.created_at is distinct from old.created_at or new.billing_mode is distinct from old.billing_mode or new.commission_amount_snapshot is distinct from old.commission_amount_snapshot or new.trial_started_at_snapshot is distinct from old.trial_started_at_snapshot or new.trial_ends_at_snapshot is distinct from old.trial_ends_at_snapshot then raise exception 'JOB_ASSIGNMENT_PROVENANCE_IMMUTABLE' using errcode='42501'; end if; return new; end; $$;

create or replace function public.accept_job(target_job_id uuid,target_vehicle_id text,target_idempotency_key uuid)
returns public.jobs language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; j public.jobs%rowtype; e public.job_events%rowtype; a public.driver_vehicle_assignments%rowtype; t public.marketplace_work_trials%rowtype; trial_active boolean; paid_access boolean; amount numeric(14,2); reservation_id uuid; total numeric; reserved numeric;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if; if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
 select id into pid from public.projects where slug='tuktuk-control'; select * into j from public.jobs where project_id=pid and id=target_job_id for update; if not found then raise exception 'JOB_NOT_FOUND'; end if;
 select * into e from public.job_events where project_id=pid and operation_idempotency_key=target_idempotency_key; if found then if e.job_id=j.id and e.actor_user_id=actor and e.action='accept' and ((e.metadata->>'billing_mode'='trial_free' and exists(select 1 from public.job_assignments x where x.project_id=pid and x.job_id=j.id and x.driver_user_id=actor and x.vehicle_id=target_vehicle_id and x.acceptance_idempotency_key=target_idempotency_key and x.billing_mode='trial_free' and x.commission_amount_snapshot=0) and not exists(select 1 from public.commission_reservations r where r.project_id=pid and r.job_id=j.id)) or (e.metadata->>'billing_mode'='wallet_commission' and exists(select 1 from public.job_assignments x join public.commission_reservations r on r.project_id=x.project_id and r.job_id=x.job_id and r.user_id=actor and r.amount=x.commission_amount_snapshot where x.project_id=pid and x.job_id=j.id and x.driver_user_id=actor and x.vehicle_id=target_vehicle_id and x.acceptance_idempotency_key=target_idempotency_key and x.billing_mode='wallet_commission'))) then return j; end if; raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'; end if;
 if j.status<>'published' or not app_private.marketplace_job_transition_allowed('published','accepted','driver') or (j.expires_at is not null and j.expires_at<=now()) or j.assigned_driver_user_id is not null or j.assigned_vehicle_id is not null then raise exception 'JOB_NOT_AVAILABLE'; end if;
 trial_active:=app_private.has_active_marketplace_work_trial(actor); paid_access:=app_private.has_confirmed_marketplace_initial_deposit(actor); if not trial_active and not paid_access then raise exception 'MARKETPLACE_INITIAL_DEPOSIT_REQUIRED_AFTER_TRIAL' using errcode='42501'; end if;
 if not exists(select 1 from public.driver_profiles d where d.project_id=pid and d.user_id=actor and d.status='active' and d.activated_at is not null and d.suspended_at is null) then raise exception 'DRIVER_NOT_ACTIVE'; end if;
 if not app_private.marketplace_onboarding_requirements_complete(actor,target_vehicle_id) then raise exception 'MARKETPLACE_ONBOARDING_INCOMPLETE' using errcode='22023'; end if;
 select * into a from public.driver_vehicle_assignments where project_id=pid and driver_user_id=actor and vehicle_id=target_vehicle_id for update; if not found or not a.is_active or not a.is_available then raise exception 'VEHICLE_ASSIGNMENT_NOT_AVAILABLE'; end if;
 if not exists(select 1 from public.vehicles v join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id where v.project_id=pid and v.id=target_vehicle_id and v.deleted_at is null and v.marketplace_status='active' and (r.passenger_count is null or v.passenger_capacity>=r.passenger_count) and (r.cargo_weight_kg is null or v.cargo_capacity_kg>=r.cargo_weight_kg) and (r.cargo_volume_m3 is null or v.cargo_volume_m3>=r.cargo_volume_m3) and (r.cargo_length_cm is null or v.cargo_length_cm>=r.cargo_length_cm) and (r.cargo_width_cm is null or v.cargo_width_cm>=r.cargo_width_cm) and (r.cargo_height_cm is null or v.cargo_height_cm>=r.cargo_height_cm) and (r.required_body_type is null or lower(btrim(v.body_type))=lower(btrim(r.required_body_type)))) then raise exception 'VEHICLE_INCOMPATIBLE_WITH_SERVICE_REQUEST'; end if;
 if not exists(select 1 from public.vehicle_services s where s.project_id=pid and s.vehicle_id=target_vehicle_id and s.service_code=j.service_code and s.enabled) then raise exception 'VEHICLE_SERVICE_NOT_ENABLED'; end if;
 if trial_active then select * into t from public.marketplace_work_trials where project_id=pid and user_id=actor; insert into public.job_assignments(project_id,job_id,driver_user_id,vehicle_id,acceptance_idempotency_key,billing_mode,commission_amount_snapshot,trial_started_at_snapshot,trial_ends_at_snapshot) values(pid,j.id,actor,target_vehicle_id,target_idempotency_key,'trial_free',0,t.started_at,t.ends_at); else perform 1 from public.wallets where project_id=pid and user_id=actor for update; if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND'; end if; amount:=round(j.final_price*j.commission_rate_snapshot,2); if amount<=0 then raise exception 'INVALID_COMMISSION_AMOUNT'; end if; total:=app_private.marketplace_wallet_total_balance(pid,actor); reserved:=app_private.marketplace_wallet_reserved_balance(pid,actor); if total-reserved<amount then raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE'; end if; insert into public.job_assignments(project_id,job_id,driver_user_id,vehicle_id,acceptance_idempotency_key,billing_mode,commission_amount_snapshot) values(pid,j.id,actor,target_vehicle_id,target_idempotency_key,'wallet_commission',amount); insert into public.commission_reservations(project_id,job_id,user_id,final_price_snapshot,commission_rate_snapshot,amount) values(pid,j.id,actor,j.final_price,j.commission_rate_snapshot,amount) returning id into reservation_id; end if;
 update public.jobs set status='accepted',assigned_driver_user_id=actor,assigned_vehicle_id=target_vehicle_id,state_version=state_version+1 where project_id=pid and id=j.id returning * into j; update public.driver_vehicle_assignments set is_available=false where project_id=pid and driver_user_id=actor and vehicle_id=target_vehicle_id; insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key,metadata) values(pid,j.id,'published','accepted','accept','driver',actor,target_idempotency_key,jsonb_build_object('vehicle_id',target_vehicle_id,'billing_mode',case when trial_active then 'trial_free' else 'wallet_commission' end,'commission_amount',coalesce(amount,0),'trial_ends_at',case when trial_active then t.ends_at else null end,'reservation_id',reservation_id)); return j;
end; $$;

create or replace function public.advance_my_marketplace_job(target_job_id uuid,target_action text,target_idempotency_key uuid) returns public.jobs language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; j public.jobs%rowtype; e public.job_events%rowtype; x public.job_assignments%rowtype; w public.wallets%rowtype; r public.commission_reservations%rowtype; expected text; next_status text; balance numeric; ledger uuid;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if; if target_action is null or target_action not in ('start_en_route','mark_pickup','start_service','complete_service') then raise exception 'INVALID_JOB_ACTION'; end if; select id into pid from public.projects where slug='tuktuk-control'; select * into j from public.jobs where project_id=pid and id=target_job_id for update; if not found then raise exception 'JOB_NOT_FOUND'; end if; select * into e from public.job_events where project_id=pid and operation_idempotency_key=target_idempotency_key; if found then if e.job_id=j.id and e.actor_user_id=actor and e.action=target_action then return j; end if; raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'; end if; if j.assigned_driver_user_id is distinct from actor then raise exception 'JOB_NOT_ASSIGNED_TO_ACTOR'; end if;
 if target_action='start_en_route' then expected:='accepted';next_status:='en_route'; elsif target_action='mark_pickup' then expected:='en_route';next_status:='pickup'; elsif target_action='start_service' then expected:='pickup';next_status:='in_progress'; else expected:='in_progress';next_status:='completed'; end if; if target_action<>'complete_service' then if j.status<>expected or not app_private.marketplace_job_transition_allowed(expected,next_status,'driver') then raise exception 'INVALID_JOB_TRANSITION'; end if; update public.jobs set status=next_status,state_version=state_version+1 where project_id=pid and id=j.id returning * into j; insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key) values(pid,j.id,expected,next_status,target_action,'driver',actor,target_idempotency_key); return j; end if;
 select * into x from public.job_assignments where project_id=pid and job_id=j.id for update; if not found then raise exception 'JOB_ASSIGNMENT_NOT_FOUND'; end if; if j.status<>'in_progress' or not app_private.marketplace_job_transition_allowed('in_progress','completed','driver') or x.driver_user_id<>actor or x.vehicle_id<>j.assigned_vehicle_id then raise exception 'SETTLEMENT_PRECONDITION_FAILED'; end if;
 if x.billing_mode='trial_free' then if x.commission_amount_snapshot<>0 or exists(select 1 from public.commission_reservations where project_id=pid and job_id=j.id) then raise exception 'TRIAL_SETTLEMENT_PRECONDITION_FAILED'; end if; else select * into w from public.wallets where project_id=pid and user_id=actor for update; if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND'; end if; select * into r from public.commission_reservations where project_id=pid and job_id=j.id for update; if not found then raise exception 'COMMISSION_RESERVATION_NOT_FOUND'; end if; if r.status<>'open' or r.user_id<>actor or r.amount<>x.commission_amount_snapshot or r.currency<>j.currency or r.final_price_snapshot<>j.final_price or r.commission_rate_snapshot<>j.commission_rate_snapshot then raise exception 'SETTLEMENT_PRECONDITION_FAILED'; end if; balance:=app_private.marketplace_wallet_total_balance(pid,actor); if balance-r.amount<0 then raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE'; end if; insert into public.wallet_transactions(project_id,user_id,transaction_type,amount_delta,balance_after,source_type,source_id,idempotency_key,actor_id,metadata) values(pid,actor,'commission',-r.amount,balance-r.amount,'job_commission',j.id::text,gen_random_uuid(),actor,jsonb_build_object('operation_idempotency_key',target_idempotency_key)) returning id into ledger; update public.commission_reservations set status='consumed',ledger_transaction_id=ledger,consumed_at=now() where project_id=pid and id=r.id; end if;
 update public.jobs set status='completed',state_version=state_version+1 where project_id=pid and id=j.id; insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key) values(pid,j.id,'in_progress','completed','complete_service','driver',actor,target_idempotency_key); update public.job_assignments set completed_at=now() where project_id=pid and id=x.id; if not app_private.marketplace_job_transition_allowed('completed','settled','system') then raise exception 'INVALID_JOB_TRANSITION'; end if; update public.jobs set status='settled',state_version=state_version+1 where project_id=pid and id=j.id returning * into j; insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,operation_idempotency_key) values(pid,j.id,'completed','settled','settle','system',gen_random_uuid()); update public.driver_vehicle_assignments set is_available=is_active where project_id=pid and driver_user_id=actor and vehicle_id=x.vehicle_id; return j;
end; $$;

create or replace function public.cancel_my_marketplace_job(target_job_id uuid,target_reason text,target_idempotency_key uuid) returns public.jobs language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; j public.jobs%rowtype; e public.job_events%rowtype; x public.job_assignments%rowtype; w public.wallets%rowtype; r public.commission_reservations%rowtype; reason text; previous text;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
 reason:=nullif(btrim(target_reason),''); if reason is null then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
 select id into pid from public.projects where slug='tuktuk-control';
 select * into j from public.jobs where project_id=pid and id=target_job_id for update; if not found then raise exception 'JOB_NOT_FOUND'; end if;
 select * into e from public.job_events where project_id=pid and operation_idempotency_key=target_idempotency_key;
 if found then if e.job_id=j.id and e.actor_user_id=actor and e.action in ('cancel_by_driver','open_incident') and e.reason is not distinct from reason then return j; end if; raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'; end if;
 if j.assigned_driver_user_id is distinct from actor then raise exception 'JOB_NOT_ASSIGNED_TO_ACTOR'; end if;
 previous:=j.status; select * into x from public.job_assignments where project_id=pid and job_id=j.id for update; if not found then raise exception 'JOB_ASSIGNMENT_NOT_FOUND'; end if;
 if x.driver_user_id<>actor then raise exception 'CANCELLATION_PRECONDITION_FAILED'; end if;
 if x.billing_mode='wallet_commission' then
   select * into w from public.wallets where project_id=pid and user_id=actor for update; if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND'; end if;
   select * into r from public.commission_reservations where project_id=pid and job_id=j.id for update; if not found then raise exception 'COMMISSION_RESERVATION_NOT_FOUND'; end if;
   if r.user_id<>actor or r.status<>'open' then raise exception 'CANCELLATION_PRECONDITION_FAILED'; end if;
 elsif x.commission_amount_snapshot<>0 or exists(select 1 from public.commission_reservations where project_id=pid and job_id=j.id) then raise exception 'CANCELLATION_PRECONDITION_FAILED'; end if;
 if j.status in ('accepted','en_route','pickup') then
   if not app_private.marketplace_job_transition_allowed(j.status,'cancelled_by_driver','driver') then raise exception 'INVALID_JOB_TRANSITION'; end if;
   if x.billing_mode='wallet_commission' then update public.commission_reservations set status='released',released_at=now(),release_reason=reason where project_id=pid and id=r.id; end if;
   update public.job_assignments set cancelled_at=now() where project_id=pid and id=x.id;
   update public.jobs set status='cancelled_by_driver',state_version=state_version+1 where project_id=pid and id=j.id returning * into j;
   update public.driver_vehicle_assignments set is_available=is_active where project_id=pid and driver_user_id=actor and vehicle_id=x.vehicle_id;
   insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key,reason) values(pid,j.id,previous,'cancelled_by_driver','cancel_by_driver','driver',actor,target_idempotency_key,reason); return j;
 elsif j.status='in_progress' then
   if not app_private.marketplace_job_transition_allowed('in_progress','incident','driver') then raise exception 'INVALID_JOB_TRANSITION'; end if;
   update public.jobs set status='incident',incident_from_status='in_progress',incident_opened_at=now(),incident_reason=reason,state_version=state_version+1 where project_id=pid and id=j.id returning * into j;
   insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,actor_user_id,operation_idempotency_key,reason) values(pid,j.id,'in_progress','incident','open_incident','driver',actor,target_idempotency_key,reason); return j;
 end if; raise exception 'INVALID_JOB_TRANSITION';
end; $$;

revoke all on function app_private.protect_marketplace_work_trial(),app_private.marketplace_onboarding_requirements_complete(uuid,text),app_private.has_active_marketplace_work_trial(uuid) from public,anon,authenticated;
revoke all on function public.start_my_marketplace_work_trial(text,uuid) from public,anon;
grant execute on function public.start_my_marketplace_work_trial(text,uuid) to authenticated;
