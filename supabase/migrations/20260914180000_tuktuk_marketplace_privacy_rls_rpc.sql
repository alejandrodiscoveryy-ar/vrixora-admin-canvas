-- TukTuk Marketplace V1, Block 7: private data boundary and narrow RPCs.
-- PWA IP rate limiting, CAPTCHA, anti-bot, reputation and global throttling belong
-- to the Block 10 endpoint/Edge layer. No IP, device, browser fingerprint or raw token
-- is persisted here.

create table public.marketplace_customer_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  customer_id uuid not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  start_idempotency_key uuid not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, token_hash),
  unique (project_id, start_idempotency_key),
  foreign key (project_id, customer_id)
    references public.customers(project_id, id) on delete restrict
);

create index marketplace_customer_sessions_customer_idx
  on public.marketplace_customer_sessions(project_id, customer_id, expires_at);

alter table public.marketplace_customer_sessions enable row level security;
revoke all on public.marketplace_customer_sessions from public, anon, authenticated;

create trigger audit_marketplace_customer_sessions after insert or update
on public.marketplace_customer_sessions
for each row execute function app_private.capture_audit_event();

create or replace function app_private.resolve_marketplace_customer_session(
  target_session_id uuid,
  target_session_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  session_row public.marketplace_customer_sessions%rowtype;
  supplied_hash text;
begin
  if target_session_token is null or char_length(target_session_token) < 32 or char_length(target_session_token) > 512 then
    raise exception 'CUSTOMER_SESSION_INVALID' using errcode = '22023';
  end if;
  select project.id into target_project_id from public.projects project where project.slug = 'tuktuk-control';
  if target_project_id is null then raise exception 'CUSTOMER_SESSION_NOT_FOUND'; end if;
  select * into session_row from public.marketplace_customer_sessions session
  where session.project_id = target_project_id and session.id = target_session_id;
  if not found then raise exception 'CUSTOMER_SESSION_NOT_FOUND'; end if;
  if session_row.status <> 'active' or now() >= session_row.expires_at then
    raise exception 'CUSTOMER_SESSION_EXPIRED' using errcode = '42501';
  end if;
  supplied_hash := encode(extensions.digest(convert_to(target_session_token, 'UTF8'), 'sha256'), 'hex');
  if supplied_hash <> session_row.token_hash then raise exception 'CUSTOMER_SESSION_INVALID' using errcode = '42501'; end if;
  return session_row.customer_id;
end;
$$;

create or replace function public.start_marketplace_customer_session(
  target_display_name text,
  target_whatsapp_phone text,
  target_session_token text,
  target_idempotency_key uuid
)
returns table(session_id uuid, customer_id uuid, expires_at timestamptz, server_time timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_project_id uuid;
  normalized_name text := nullif(btrim(target_display_name), '');
  normalized_phone text := nullif(btrim(target_whatsapp_phone), '');
  token_digest text;
  existing_session public.marketplace_customer_sessions%rowtype;
  existing_customer public.customers%rowtype;
  created_customer_id uuid;
  created_session_id uuid;
  expires_value timestamptz := now() + interval '30 days';
begin
  if normalized_name is null then raise exception 'CUSTOMER_DISPLAY_NAME_REQUIRED' using errcode = '22023'; end if;
  if normalized_phone is null or normalized_phone !~ '^[+][1-9][0-9]{7,14}$' then raise exception 'CUSTOMER_WHATSAPP_INVALID' using errcode = '22023'; end if;
  if target_session_token is null or char_length(target_session_token) < 32 or char_length(target_session_token) > 512 then raise exception 'CUSTOMER_SESSION_INVALID' using errcode = '22023'; end if;
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023'; end if;
  select project.id into target_project_id from public.projects project where project.slug = 'tuktuk-control';
  if target_project_id is null then raise exception 'MARKETPLACE_PROJECT_NOT_FOUND'; end if;
  token_digest := encode(extensions.digest(convert_to(target_session_token, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tuktuk:customer-session:idempotency:' || target_project_id::text || ':' || target_idempotency_key::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tuktuk:customer-session:token:' || target_project_id::text || ':' || token_digest, 0));

  select * into existing_session from public.marketplace_customer_sessions session
  where session.project_id = target_project_id and session.start_idempotency_key = target_idempotency_key for update;
  if found then
    select * into existing_customer from public.customers customer where customer.project_id = target_project_id and customer.id = existing_session.customer_id;
    if existing_session.token_hash = token_digest and btrim(existing_customer.display_name) = normalized_name and existing_customer.whatsapp_phone = normalized_phone then
      return query select existing_session.id, existing_session.customer_id, existing_session.expires_at, now(); return;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' using errcode = '22023';
  end if;
  select * into existing_session from public.marketplace_customer_sessions session
  where session.project_id = target_project_id and session.token_hash = token_digest for update;
  if found then
    select * into existing_customer from public.customers customer where customer.project_id = target_project_id and customer.id = existing_session.customer_id;
    if existing_session.status = 'active' and now() < existing_session.expires_at and btrim(existing_customer.display_name) = normalized_name and existing_customer.whatsapp_phone = normalized_phone then
      return query select existing_session.id, existing_session.customer_id, existing_session.expires_at, now(); return;
    end if;
    if existing_session.status <> 'active' or now() >= existing_session.expires_at then
      raise exception 'CUSTOMER_SESSION_TOKEN_REQUIRES_ROTATION' using errcode = '22023';
    end if;
    raise exception 'CUSTOMER_SESSION_TOKEN_ALREADY_IN_USE' using errcode = '22023';
  end if;
  insert into public.customers(project_id, display_name, whatsapp_phone)
  values(target_project_id, normalized_name, normalized_phone) returning id into created_customer_id;
  insert into public.marketplace_customer_sessions(project_id, customer_id, token_hash, start_idempotency_key, expires_at)
  values(target_project_id, created_customer_id, token_digest, target_idempotency_key, expires_value) returning id into created_session_id;
  return query select created_session_id, created_customer_id, expires_value, now();
end;
$$;

create or replace function public.get_my_marketplace_work_access(target_vehicle_id text)
returns table(server_time timestamptz, vehicle_id text, onboarding_complete boolean, driver_active boolean,
  vehicle_available boolean, trial_started boolean, trial_active boolean, trial_started_at timestamptz,
  trial_ends_at timestamptz, initial_deposit_confirmed boolean, suite_active boolean,
  can_start_trial boolean, can_accept_new_job boolean, next_billing_mode text)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); pid uuid; dp public.driver_profiles%rowtype; dva public.driver_vehicle_assignments%rowtype;
  v public.vehicles%rowtype; trial public.marketplace_work_trials%rowtype; deposit boolean; complete boolean; active boolean;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  select * into dp from public.driver_profiles where project_id=pid and user_id=actor;
  select * into dva from public.driver_vehicle_assignments where project_id=pid and driver_user_id=actor and vehicle_id=target_vehicle_id;
  select * into v from public.vehicles where project_id=pid and id=target_vehicle_id;
  select * into trial from public.marketplace_work_trials where project_id=pid and user_id=actor;
  complete := coalesce(app_private.marketplace_onboarding_requirements_complete(actor,target_vehicle_id),false);
  active := dp.user_id is not null and dp.status='active' and dp.activated_at is not null and dp.suspended_at is null;
  deposit := coalesce(app_private.has_confirmed_marketplace_initial_deposit(actor),false);
  return query select now(), target_vehicle_id, complete, active,
    coalesce(dva.is_active and dva.is_available and v.marketplace_status='active' and v.deleted_at is null,false),
    trial.user_id is not null, coalesce(trial.started_at<=now() and now()<trial.ends_at and active,false), trial.started_at, trial.ends_at,
    deposit, coalesce(active and (app_private.has_active_marketplace_work_trial(actor) or deposit),false),
    coalesce(complete and dp.status <> 'suspended' and trial.user_id is null,false),
    coalesce(complete and active and dva.is_active and dva.is_available and v.marketplace_status='active' and v.deleted_at is null and (app_private.has_active_marketplace_work_trial(actor) or deposit),false),
    case when app_private.has_active_marketplace_work_trial(actor) then 'trial_free' when deposit then 'wallet_commission' else null end;
end;
$$;

create or replace function public.list_my_marketplace_available_jobs(target_vehicle_id text, target_limit integer default 50,
  target_before_created_at timestamptz default null, target_before_job_id uuid default null)
returns table(job_id uuid, service_code text, origin_text text, destination_text text, scheduled_for timestamptz,
  passenger_count integer, cargo_weight_kg numeric, cargo_volume_m3 numeric, cargo_length_cm numeric, cargo_width_cm numeric,
  cargo_height_cm numeric, required_body_type text, recommended_price numeric, final_price numeric, currency text, expires_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); pid uuid; safe_limit integer:=least(greatest(coalesce(target_limit,50),1),100);
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if (target_before_created_at is null) <> (target_before_job_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if;
  select id into pid from public.projects where slug='tuktuk-control';
  if not exists(select 1 from public.driver_profiles d where d.project_id=pid and d.user_id=actor and d.status='active' and d.activated_at is not null and d.suspended_at is null)
    or not app_private.marketplace_onboarding_requirements_complete(actor,target_vehicle_id)
    or not (app_private.has_active_marketplace_work_trial(actor) or app_private.has_confirmed_marketplace_initial_deposit(actor))
    or not exists(select 1 from public.driver_vehicle_assignments a join public.vehicles v on v.project_id=a.project_id and v.id=a.vehicle_id where a.project_id=pid and a.driver_user_id=actor and a.vehicle_id=target_vehicle_id and a.is_active and a.is_available and v.marketplace_status='active' and v.deleted_at is null)
  then raise exception 'MARKETPLACE_WORK_ACCESS_DENIED' using errcode='42501'; end if;
  return query select j.id,j.service_code,r.origin_text,r.destination_text,r.scheduled_for,r.passenger_count,r.cargo_weight_kg,r.cargo_volume_m3,r.cargo_length_cm,r.cargo_width_cm,r.cargo_height_cm,r.required_body_type,j.recommended_price,j.final_price,j.currency,j.expires_at,j.created_at
  from public.jobs j join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id
  where j.project_id=pid and j.status='published' and (j.expires_at is null or j.expires_at>now())
    and exists(select 1 from public.vehicle_services s where s.project_id=pid and s.vehicle_id=target_vehicle_id and s.service_code=j.service_code and s.enabled)
    and exists(select 1 from public.vehicles v where v.project_id=pid and v.id=target_vehicle_id and (r.passenger_count is null or v.passenger_capacity>=r.passenger_count) and (r.cargo_weight_kg is null or v.cargo_capacity_kg>=r.cargo_weight_kg) and (r.cargo_volume_m3 is null or v.cargo_volume_m3>=r.cargo_volume_m3) and (r.cargo_length_cm is null or v.cargo_length_cm>=r.cargo_length_cm) and (r.cargo_width_cm is null or v.cargo_width_cm>=r.cargo_width_cm) and (r.cargo_height_cm is null or v.cargo_height_cm>=r.cargo_height_cm) and (r.required_body_type is null or lower(btrim(v.body_type))=lower(btrim(r.required_body_type))))
    and (target_before_created_at is null or (j.created_at,j.id)<(target_before_created_at,target_before_job_id))
  order by j.created_at desc,j.id desc limit safe_limit;
end;
$$;

create or replace function public.get_my_marketplace_customer_contact(target_job_id uuid)
returns table(job_id uuid, customer_display_name text, customer_whatsapp_phone text)
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); pid uuid;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select id into pid from public.projects where slug='tuktuk-control';
 if not exists(select 1 from public.jobs j join public.job_assignments a on a.project_id=j.project_id and a.job_id=j.id where j.project_id=pid and j.id=target_job_id and j.assigned_driver_user_id=actor and a.driver_user_id=actor and a.vehicle_id=j.assigned_vehicle_id) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 return query select j.id,c.display_name,c.whatsapp_phone from public.jobs j join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id join public.customers c on c.project_id=r.project_id and c.id=r.customer_id where j.project_id=pid and j.id=target_job_id;
end;
$$;

create or replace function public.get_marketplace_customer_job(target_session_id uuid,target_session_token text,target_job_id uuid)
returns table(job_id uuid,status text,service_code text,origin_text text,destination_text text,scheduled_for timestamptz,final_price numeric,currency text,published_at timestamptz,expires_at timestamptz,created_at timestamptz,driver_display_name text,driver_whatsapp_phone text,driver_photo_asset_id uuid,vehicle_id text,vehicle_name text,vehicle_category_code text,vehicle_brand text,vehicle_model text,vehicle_registration text,vehicle_main_photo_asset_id uuid)
language plpgsql security definer set search_path='' as $$
declare pid uuid; cid uuid;
begin
 cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token); select id into pid from public.projects where slug='tuktuk-control';
 if not exists(select 1 from public.jobs j join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id where j.project_id=pid and j.id=target_job_id and r.customer_id=cid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 return query select j.id,j.status,j.service_code,r.origin_text,r.destination_text,r.scheduled_for,j.final_price,j.currency,j.published_at,j.expires_at,j.created_at,
  case when j.assigned_driver_user_id is not null then p.display_name end,case when j.assigned_driver_user_id is not null then p.phone end,case when j.assigned_driver_user_id is not null then d.photo_asset_id end,
  case when j.assigned_driver_user_id is not null then v.id end,case when j.assigned_driver_user_id is not null then v.name end,case when j.assigned_driver_user_id is not null then v.category_code end,case when j.assigned_driver_user_id is not null then v.brand end,case when j.assigned_driver_user_id is not null then v.model end,case when j.assigned_driver_user_id is not null then v.registration end,case when j.assigned_driver_user_id is not null then v.main_photo_asset_id end
 from public.jobs j join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id left join public.driver_profiles d on d.project_id=j.project_id and d.user_id=j.assigned_driver_user_id left join public.profiles p on p.id=j.assigned_driver_user_id left join public.vehicles v on v.project_id=j.project_id and v.id=j.assigned_vehicle_id where j.project_id=pid and j.id=target_job_id;
end;
$$;

create or replace function public.cancel_marketplace_customer_job(target_session_id uuid,target_session_token text,target_job_id uuid,target_reason text,target_idempotency_key uuid)
returns table(job_id uuid,status text,server_time timestamptz) language plpgsql security definer set search_path='' as $$
declare pid uuid; cid uuid; j public.jobs%rowtype; a public.job_assignments%rowtype; w public.wallets%rowtype; r public.commission_reservations%rowtype; e public.job_events%rowtype; reason text:=nullif(btrim(target_reason),''); previous_status text;
begin
 if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if; if reason is null then raise exception 'CANCELLATION_REASON_REQUIRED' using errcode='22023'; end if;
 cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token); select id into pid from public.projects where slug='tuktuk-control';
 select * into j from public.jobs where project_id=pid and id=target_job_id for update; if not found then raise exception 'JOB_NOT_FOUND'; end if;
 select * into e from public.job_events where project_id=pid and operation_idempotency_key=target_idempotency_key;
 if found then if e.job_id=j.id and e.customer_id=cid and e.action='cancel_by_customer' and e.reason is not distinct from reason then return query select j.id,j.status,now(); return; end if; raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION' using errcode='22023'; end if;
 if not exists(select 1 from public.service_requests sr where sr.project_id=pid and sr.id=j.service_request_id and sr.customer_id=cid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if j.status in ('in_progress','completed','settled','incident') then raise exception 'CUSTOMER_CANCELLATION_REQUIRES_SUPPORT' using errcode='42501'; end if;
 if j.status not in ('requested','published','accepted','en_route','pickup') or not app_private.marketplace_job_transition_allowed(j.status,'cancelled_by_customer','customer') then raise exception 'INVALID_JOB_TRANSITION' using errcode='22023'; end if;
 previous_status:=j.status;
 if j.status in ('accepted','en_route','pickup') then
   select * into a from public.job_assignments where project_id=pid and job_id=j.id for update; if not found then raise exception 'JOB_ASSIGNMENT_NOT_FOUND'; end if;
   if a.billing_mode='wallet_commission' then select * into w from public.wallets where project_id=pid and user_id=a.driver_user_id for update; if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND'; end if; select * into r from public.commission_reservations where project_id=pid and job_id=j.id for update; if not found or r.status<>'open' or r.user_id<>a.driver_user_id then raise exception 'CANCELLATION_PRECONDITION_FAILED'; end if; update public.commission_reservations set status='released',released_at=now(),release_reason=reason where project_id=pid and id=r.id;
   elsif a.billing_mode<>'trial_free' or a.commission_amount_snapshot<>0 or exists(select 1 from public.commission_reservations cr where cr.project_id=pid and cr.job_id=j.id) then raise exception 'CANCELLATION_PRECONDITION_FAILED'; end if;
   update public.job_assignments set cancelled_at=now() where project_id=pid and id=a.id; update public.driver_vehicle_assignments set is_available=is_active where project_id=pid and driver_user_id=a.driver_user_id and vehicle_id=a.vehicle_id;
 end if;
 update public.jobs set status='cancelled_by_customer',state_version=state_version+1 where project_id=pid and id=j.id returning * into j;
 insert into public.job_events(project_id,job_id,from_status,to_status,action,actor_kind,customer_id,operation_idempotency_key,reason,metadata) values(pid,j.id,previous_status,'cancelled_by_customer','cancel_by_customer','customer',cid,target_idempotency_key,reason,'{}'::jsonb);
 return query select j.id,j.status,now();
end;
$$;

revoke all on function app_private.resolve_marketplace_customer_session(uuid,text) from public,anon,authenticated;
revoke all on function public.start_marketplace_customer_session(text,text,text,uuid),public.get_marketplace_customer_job(uuid,text,uuid),public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid),public.get_my_marketplace_work_access(text),public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid),public.get_my_marketplace_customer_contact(uuid) from public,anon,authenticated;
grant execute on function public.start_marketplace_customer_session(text,text,text,uuid),public.get_marketplace_customer_job(uuid,text,uuid),public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid) to anon,authenticated;
grant execute on function public.get_my_marketplace_work_access(text),public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid),public.get_my_marketplace_customer_contact(uuid) to authenticated;
