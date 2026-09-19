-- TukTuk Marketplace V1, Block 10: anonymous customer hardening.
-- This migration intentionally stores only derived hashes for throttling.  It
-- never stores an IP address, browser/device fingerprint, CAPTCHA response or
-- raw customer-session token.

create table public.marketplace_customer_ratings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid not null,
  customer_id uuid not null,
  driver_user_id uuid not null references auth.users(id) on delete restrict,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (project_id, job_id),
  unique (project_id, customer_id, idempotency_key),
  foreign key (project_id, job_id) references public.jobs(project_id, id) on delete restrict,
  foreign key (project_id, customer_id) references public.customers(project_id, id) on delete restrict
);

create index marketplace_customer_ratings_driver_idx
  on public.marketplace_customer_ratings(project_id, driver_user_id, created_at desc);

create table public.marketplace_customer_abuse_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  captcha_required boolean not null default false,
  captcha_provider text,
  updated_at timestamptz not null default now(),
  check (not captcha_required or nullif(btrim(captcha_provider), '') is not null)
);

-- A rolling, opaque operation counter. subject_hash is SHA-256 of a session or
-- caller-generated nonce and is not a business identifier.
create table public.marketplace_customer_operation_limits (
  project_id uuid not null references public.projects(id) on delete cascade,
  operation_name text not null check (operation_name in ('session', 'request', 'publish', 'read', 'cancel', 'rating', 'media')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  primary key (project_id, operation_name, subject_hash)
);

alter table public.marketplace_customer_ratings enable row level security;
alter table public.marketplace_customer_abuse_settings enable row level security;
alter table public.marketplace_customer_operation_limits enable row level security;
revoke all on public.marketplace_customer_ratings, public.marketplace_customer_abuse_settings,
  public.marketplace_customer_operation_limits from public, anon, authenticated;

create trigger marketplace_customer_abuse_settings_set_updated_at
before update on public.marketplace_customer_abuse_settings
for each row execute function app_private.set_updated_at();

create trigger audit_marketplace_customer_ratings after insert
on public.marketplace_customer_ratings for each row execute function app_private.capture_audit_event();

create or replace function app_private.enforce_marketplace_customer_limit(
  target_project_id uuid, target_operation text, target_subject text,
  target_limit integer, target_window interval, target_captcha_token text default null
) returns void language plpgsql security definer set search_path='' as $$
declare digest_value text; row_value public.marketplace_customer_operation_limits%rowtype;
  settings public.marketplace_customer_abuse_settings%rowtype;
begin
  if target_subject is null or char_length(target_subject) < 16 then
    raise exception 'CUSTOMER_ABUSE_SUBJECT_INVALID' using errcode='22023';
  end if;
  -- CAPTCHA verification is performed before this function by the Edge
  -- gateway. This SQL helper is also used by service_role-only internal RPCs
  -- and never receives or persists a CAPTCHA proof.
  digest_value:=encode(extensions.digest(convert_to(target_subject,'UTF8'),'sha256'),'hex');
  insert into public.marketplace_customer_operation_limits(project_id,operation_name,subject_hash)
  values(target_project_id,target_operation,digest_value)
  on conflict(project_id,operation_name,subject_hash) do nothing;
  select * into row_value from public.marketplace_customer_operation_limits
  where project_id=target_project_id and operation_name=target_operation and subject_hash=digest_value for update;
  if row_value.window_started_at + target_window <= now() then
    update public.marketplace_customer_operation_limits set window_started_at=now(),request_count=1
    where project_id=target_project_id and operation_name=target_operation and subject_hash=digest_value;
  elsif row_value.request_count >= target_limit then
    raise exception 'CUSTOMER_RATE_LIMITED' using errcode='42901';
  else
    update public.marketplace_customer_operation_limits set request_count=request_count+1
    where project_id=target_project_id and operation_name=target_operation and subject_hash=digest_value;
  end if;
end; $$;

create or replace function app_private.marketplace_customer_project_id()
returns uuid language sql stable security definer set search_path='' as $$
  select id from public.projects where slug='tuktuk-control'
$$;

create or replace function app_private.marketplace_customer_abuse_check(
  target_operation text, target_subject text, target_limit integer,
  target_window interval, target_captcha_token text default null
) returns void language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
  pid:=app_private.marketplace_customer_project_id();
  if pid is null then raise exception 'MARKETPLACE_PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  perform app_private.enforce_marketplace_customer_limit(pid,target_operation,target_subject,target_limit,target_window,target_captcha_token);
end; $$;

-- The protected RPCs replace the previously public anonymous surface. They
-- retain the established contracts while adding a throttle boundary.
create or replace function public.start_marketplace_customer_session_protected(
  target_display_name text,target_whatsapp_phone text,target_session_token text,
  target_idempotency_key uuid,target_captcha_token text default null
) returns table(session_id uuid,customer_id uuid,expires_at timestamptz,server_time timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.marketplace_customer_abuse_check('session',target_session_token,5,interval '10 minutes',target_captcha_token);
  return query select * from public.start_marketplace_customer_session(target_display_name,target_whatsapp_phone,target_session_token,target_idempotency_key);
end; $$;

create or replace function public.get_marketplace_customer_job_protected(target_session_id uuid,target_session_token text,target_job_id uuid)
returns table(job_id uuid,status text,service_code text,origin_text text,destination_text text,scheduled_for timestamptz,final_price numeric,currency text,published_at timestamptz,expires_at timestamptz,created_at timestamptz,driver_display_name text,driver_whatsapp_phone text,driver_photo_asset_id uuid,vehicle_id text,vehicle_name text,vehicle_category_code text,vehicle_brand text,vehicle_model text,vehicle_registration text,vehicle_main_photo_asset_id uuid)
language plpgsql security definer set search_path='' as $$ begin
  perform app_private.marketplace_customer_abuse_check('read',target_session_id::text,60,interval '10 minutes');
  return query select * from public.get_marketplace_customer_job(target_session_id,target_session_token,target_job_id);
end; $$;

create or replace function public.cancel_marketplace_customer_job_protected(target_session_id uuid,target_session_token text,target_job_id uuid,target_reason text,target_idempotency_key uuid)
returns table(job_id uuid,status text,server_time timestamptz)
language plpgsql security definer set search_path='' as $$ begin
  perform app_private.marketplace_customer_abuse_check('cancel',target_session_id::text,6,interval '10 minutes');
  return query select * from public.cancel_marketplace_customer_job(target_session_id,target_session_token,target_job_id,target_reason,target_idempotency_key);
end; $$;

create or replace function public.create_marketplace_customer_request_protected(target_session_id uuid,target_session_token text,target_service_code text,target_origin_text text,target_destination_text text,target_scheduled_for timestamptz,target_passenger_count integer,target_cargo_weight_kg numeric,target_cargo_volume_m3 numeric,target_cargo_length_cm numeric,target_cargo_width_cm numeric,target_cargo_height_cm numeric,target_required_body_type text,target_notes text,target_details jsonb,target_idempotency_key uuid)
returns table(job_id uuid,service_request_id uuid,status text,recommended_price numeric,minimum_price numeric,low_price_warning_threshold numeric,currency text,pricing_version text,pricing_breakdown jsonb,server_time timestamptz)
language plpgsql security definer set search_path='' as $$ begin
  perform app_private.marketplace_customer_abuse_check('request',target_session_id::text,12,interval '1 hour');
  return query select * from public.create_marketplace_customer_request(target_session_id,target_session_token,target_service_code,target_origin_text,target_destination_text,target_scheduled_for,target_passenger_count,target_cargo_weight_kg,target_cargo_volume_m3,target_cargo_length_cm,target_cargo_width_cm,target_cargo_height_cm,target_required_body_type,target_notes,target_details,target_idempotency_key);
end; $$;

create or replace function public.publish_marketplace_customer_job_protected(target_session_id uuid,target_session_token text,target_job_id uuid,target_final_price numeric,target_price_warning_acknowledged boolean,target_idempotency_key uuid)
returns table(job_id uuid,status text,recommended_price numeric,final_price numeric,minimum_price numeric,low_price_warning_threshold numeric,price_warning_required boolean,price_warning_acknowledged boolean,currency text,pricing_version text,pricing_breakdown jsonb,published_at timestamptz,expires_at timestamptz,server_time timestamptz)
language plpgsql security definer set search_path='' as $$ begin
  perform app_private.marketplace_customer_abuse_check('publish',target_session_id::text,8,interval '1 hour');
  return query select * from public.publish_marketplace_customer_job(target_session_id,target_session_token,target_job_id,target_final_price,target_price_warning_acknowledged,target_idempotency_key);
end; $$;

create or replace function public.create_marketplace_customer_rating(
  target_session_id uuid,target_session_token text,target_job_id uuid,target_stars smallint,
  target_comment text,target_idempotency_key uuid
) returns table(job_id uuid,stars smallint,comment text,created_at timestamptz,server_time timestamptz)
language plpgsql security definer set search_path='' as $$
declare pid uuid; cid uuid; job_row public.jobs%rowtype; existing public.marketplace_customer_ratings%rowtype;
  clean_comment text:=nullif(btrim(target_comment),'');
begin
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  if target_stars not between 1 and 5 then raise exception 'RATING_STARS_INVALID' using errcode='22023'; end if;
  if clean_comment is not null and char_length(clean_comment)>1000 then raise exception 'RATING_COMMENT_TOO_LONG' using errcode='22023'; end if;
  perform app_private.marketplace_customer_abuse_check('rating',target_session_id::text,8,interval '1 hour');
  cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token); pid:=app_private.marketplace_customer_project_id();
  select j.* into job_row from public.jobs j join public.service_requests r on r.project_id=j.project_id and r.id=j.service_request_id
    where j.project_id=pid and j.id=target_job_id and r.customer_id=cid for update;
  if not found then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if job_row.status<>'settled' or job_row.assigned_driver_user_id is null then raise exception 'RATING_NOT_AVAILABLE' using errcode='22023'; end if;
  select * into existing from public.marketplace_customer_ratings where project_id=pid and customer_id=cid and idempotency_key=target_idempotency_key;
  if found then
    if existing.job_id=target_job_id and existing.stars=target_stars and existing.comment is not distinct from clean_comment then
      return query select existing.job_id,existing.stars,existing.comment,existing.created_at,now(); return;
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION' using errcode='22023';
  end if;
  insert into public.marketplace_customer_ratings(project_id,job_id,customer_id,driver_user_id,stars,comment,idempotency_key)
  values(pid,target_job_id,cid,job_row.assigned_driver_user_id,target_stars,clean_comment,target_idempotency_key)
  returning * into existing;
  return query select existing.job_id,existing.stars,existing.comment,existing.created_at,now();
end; $$;

create or replace function public.get_marketplace_customer_rating(target_session_id uuid,target_session_token text,target_job_id uuid)
returns table(job_id uuid,stars smallint,comment text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare pid uuid; cid uuid;
begin
  perform app_private.marketplace_customer_abuse_check('read',target_session_id::text,60,interval '10 minutes');
  cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token); pid:=app_private.marketplace_customer_project_id();
  if not exists(select 1 from public.service_requests r join public.jobs j on j.project_id=r.project_id and j.service_request_id=r.id where j.project_id=pid and j.id=target_job_id and r.customer_id=cid) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  return query select r.job_id,r.stars,r.comment,r.created_at from public.marketplace_customer_ratings r where r.project_id=pid and r.job_id=target_job_id and r.customer_id=cid;
end; $$;

revoke all on function app_private.enforce_marketplace_customer_limit(uuid,text,text,integer,interval,text),app_private.marketplace_customer_project_id(),app_private.marketplace_customer_abuse_check(text,text,integer,interval,text) from public,anon,authenticated;
revoke all on function public.start_marketplace_customer_session(text,text,text,uuid),public.get_marketplace_customer_job(uuid,text,uuid),public.cancel_marketplace_customer_job(uuid,text,uuid,text,uuid) from anon,authenticated;
revoke all on function public.create_marketplace_customer_request(uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,uuid),public.publish_marketplace_customer_job(uuid,text,uuid,numeric,boolean,uuid) from anon,authenticated;
grant execute on function public.start_marketplace_customer_session_protected(text,text,text,uuid,text),public.get_marketplace_customer_job_protected(uuid,text,uuid),public.cancel_marketplace_customer_job_protected(uuid,text,uuid,text,uuid),public.create_marketplace_customer_rating(uuid,text,uuid,smallint,text,uuid),public.get_marketplace_customer_rating(uuid,text,uuid) to anon,authenticated;
grant execute on function public.create_marketplace_customer_request_protected(uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,uuid),public.publish_marketplace_customer_job_protected(uuid,text,uuid,numeric,boolean,uuid) to anon,authenticated;
