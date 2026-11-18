-- TukTuk Aliados V1: two independent links, isolated attribution and reporting.
-- No changes to prices, commission collections, wallets, dispatch or existing Impulsa rewards.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists app_private.marketplace_allies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,23}$' and right(slug,1)<>'-'),
  rate numeric(7,5) not null check (rate >= 0 and rate <= .15),
  status text not null default 'active' check(status in ('active','paused')),
  report_secret_hash bytea not null,
  report_expires_at timestamptz not null default (now()+interval '365 days'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,slug)
);
create index if not exists marketplace_allies_report_hash_idx on app_private.marketplace_allies(report_secret_hash);
create table if not exists app_private.marketplace_ally_events(
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id),
  ally_id uuid not null references app_private.marketplace_allies(id),
  event_type text not null check(event_type in
    ('link_open','app_open','origin_selected','destination_selected','quote_ready','request_started','request_created','survey_answer')),
  session_id uuid not null,
  channel text not null default 'unknown',
  created_at timestamptz not null default now(),
  unique(ally_id,event_type,session_id)
);
create index if not exists marketplace_ally_events_reporting_idx
  on app_private.marketplace_ally_events(ally_id,created_at desc,event_type);
create table if not exists app_private.marketplace_ally_attributions(
  job_id uuid primary key references public.jobs(id),
  project_id uuid not null references public.projects(id),
  service_request_id uuid not null unique references public.service_requests(id),
  ally_id uuid not null references app_private.marketplace_allies(id),
  rate_snapshot numeric(7,5) not null check(rate_snapshot between 0 and .15),
  created_at timestamptz not null default now()
);
create index if not exists marketplace_ally_attribution_report_idx
  on app_private.marketplace_ally_attributions(ally_id,created_at desc);
create table if not exists app_private.marketplace_ally_payments(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  ally_id uuid not null references app_private.marketplace_allies(id),
  amount numeric(12,2) not null check(amount>0),
  reference text not null check(char_length(btrim(reference)) between 3 and 160),
  created_by uuid not null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists marketplace_ally_payments_report_idx on app_private.marketplace_ally_payments(ally_id,paid_at desc);
alter table app_private.marketplace_allies enable row level security;
alter table app_private.marketplace_ally_events enable row level security;
alter table app_private.marketplace_ally_attributions enable row level security;
alter table app_private.marketplace_ally_payments enable row level security;
revoke all on app_private.marketplace_allies,app_private.marketplace_ally_events,
  app_private.marketplace_ally_attributions,app_private.marketplace_ally_payments
  from public,anon,authenticated,service_role;

-- One immutable revenue snapshot per verified customer request. No client-generated ride ID.
create or replace function public.create_marketplace_customer_request_ally_v1(
  target_session_id uuid,target_session_token text,target_service_code text,target_origin_text text,target_destination_text text,
  target_scheduled_for timestamptz,target_passenger_count integer,target_cargo_weight_kg numeric,target_cargo_volume_m3 numeric,
  target_cargo_length_cm numeric,target_cargo_width_cm numeric,target_cargo_height_cm numeric,target_required_body_type text,
  target_notes text,target_details jsonb,target_vehicle_category_code text,target_idempotency_key uuid,target_ally_slug text)
returns table(job_id uuid,service_request_id uuid,status text,recommended_price numeric,minimum_price numeric,
 low_price_warning_threshold numeric,currency text,pricing_version text,pricing_breakdown jsonb,server_time timestamptz)
language plpgsql security definer set search_path to '' as $$
declare pid uuid; cid uuid; existing_job uuid; partner record; made record;
begin
  if target_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  cid:=app_private.resolve_marketplace_customer_session(target_session_id,target_session_token);
  select id into pid from public.projects where slug='tuktuk-control';
  if pid is null then raise exception 'MARKETPLACE_PROJECT_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tuktuk:customer-request:'||pid::text||':'||cid::text||':'||target_idempotency_key::text,0));
  select job_id into existing_job from public.marketplace_customer_request_operations
    where project_id=pid and customer_id=cid and idempotency_key=target_idempotency_key;
  select * into made from public.create_marketplace_customer_request_v2(
    target_session_id,target_session_token,target_service_code,target_origin_text,target_destination_text,target_scheduled_for,
    target_passenger_count,target_cargo_weight_kg,target_cargo_volume_m3,target_cargo_length_cm,target_cargo_width_cm,target_cargo_height_cm,
    target_required_body_type,target_notes,target_details,target_vehicle_category_code,target_idempotency_key);
  if existing_job is not null then
    if exists(select 1 from app_private.marketplace_ally_attributions aa
      join app_private.marketplace_allies al on al.id=aa.ally_id
      where aa.job_id=existing_job and al.slug is distinct from target_ally_slug) then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_ALLY' using errcode='22023';
    end if;
  elsif target_ally_slug ~ '^[a-z0-9][a-z0-9-]{1,23}$' then
    select id,rate into partner from app_private.marketplace_allies
      where project_id=pid and slug=target_ally_slug and status='active';
    if found and not exists(select 1 from app_private.marketplace_driver_promo_attribution where job_id=made.job_id) then
      insert into app_private.marketplace_ally_attributions
       (job_id,project_id,service_request_id,ally_id,rate_snapshot)
      values(made.job_id,pid,made.service_request_id,partner.id,partner.rate);
    end if;
  end if;
  return query select made.job_id,made.service_request_id,made.status,made.recommended_price,made.minimum_price,
    made.low_price_warning_threshold,made.currency,made.pricing_version,made.pricing_breakdown,made.server_time;
end $$;
revoke all on function public.create_marketplace_customer_request_ally_v1(uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,text,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_marketplace_customer_request_ally_v1(uuid,text,text,text,text,timestamptz,integer,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,text,uuid,text)
  to service_role;

-- Admin-only creation; secrets are shown once and stored only as SHA-256 hashes.
create or replace function public.admin_create_marketplace_ally_v1(
  target_project_id uuid,target_name text,target_slug text,target_rate numeric
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare raw_key text; item app_private.marketplace_allies%rowtype;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  if not exists(select 1 from public.projects where id=target_project_id and slug='tuktuk-control') then
    raise exception 'NOT_TUKTUK_PROJECT' using errcode='42501'; end if;
  if target_name is null or char_length(btrim(target_name)) not between 2 and 80 or
    target_slug is null or target_slug !~ '^[a-z0-9][a-z0-9-]{1,23}$' or right(target_slug,1)='-' or
    target_rate is null or target_rate<0 or target_rate>.15 then
    raise exception 'INVALID_ALLY_DETAILS' using errcode='22023'; end if;
  raw_key:=encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.marketplace_allies(project_id,name,slug,rate,report_secret_hash,created_by)
    values(target_project_id,btrim(target_name),target_slug,target_rate,
      extensions.digest(pg_catalog.decode(raw_key,'hex'),'sha256'),auth.uid())
    returning * into item;
  return jsonb_build_object('id',item.id,'slug',item.slug,'name',item.name,
      'rate',item.rate,'report_key',raw_key,'expires_at',item.report_expires_at);
end $$;
revoke all on function public.admin_create_marketplace_ally_v1(uuid,text,text,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_create_marketplace_ally_v1(uuid,text,text,numeric) to authenticated;

create or replace function public.admin_update_marketplace_ally_v1(
  target_project_id uuid,target_ally_id uuid,target_name text,target_rate numeric,target_status text
) returns boolean language plpgsql security definer set search_path to '' as $$
begin
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  if target_name is null or char_length(btrim(target_name)) not between 2 and 80 or
    target_rate is null or target_rate<0 or target_rate>.15 or
    target_status not in ('active','paused') then
    raise exception 'INVALID_ALLY_DETAILS' using errcode='22023'; end if;
  update app_private.marketplace_allies set name=btrim(target_name),rate=target_rate,status=target_status,updated_at=now()
    where id=target_ally_id and project_id=target_project_id;
  if not found then raise exception 'ALLY_NOT_FOUND' using errcode='22023'; end if;
  return true;
end $$;
revoke all on function public.admin_update_marketplace_ally_v1(uuid,uuid,text,numeric,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_update_marketplace_ally_v1(uuid,uuid,text,numeric,text) to authenticated;

create or replace function public.admin_rotate_marketplace_ally_key_v1(
  target_project_id uuid,target_ally_id uuid
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare raw_key text; item app_private.marketplace_allies%rowtype;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  raw_key:=encode(extensions.gen_random_bytes(32),'hex');
  update app_private.marketplace_allies set
    report_secret_hash=extensions.digest(pg_catalog.decode(raw_key,'hex'),'sha256'),
    report_expires_at=now()+interval '365 days',updated_at=now()
    where id=target_ally_id and project_id=target_project_id returning * into item;
  if not found then raise exception 'ALLY_NOT_FOUND' using errcode='22023'; end if;
  return jsonb_build_object('slug',item.slug,'report_key',raw_key,'expires_at',item.report_expires_at);
end $$;
revoke all on function public.admin_rotate_marketplace_ally_key_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_rotate_marketplace_ally_key_v1(uuid,uuid) to authenticated;

-- Shared calculation: real, settled, non-test jobs without a competing Impulsa promoter.
create or replace function app_private.marketplace_ally_earned_v1(target_ally_id uuid)
returns numeric language sql stable security invoker set search_path to '' as $$
  select coalesce(sum(round(j.final_price*a.rate_snapshot,2)),0)
  from app_private.marketplace_ally_attributions a
  join public.jobs j on j.id=a.job_id and j.project_id=a.project_id
  where a.ally_id=target_ally_id and j.status='settled'
    and j.final_price>0 and j.currency='CUP'
    and coalesce(j.is_test,false)=false and j.test_deleted_at is null
    and not exists(select 1 from app_private.marketplace_driver_promo_attribution d where d.job_id=j.id)
$$;
revoke all on function app_private.marketplace_ally_earned_v1(uuid) from public,anon,authenticated,service_role;

create or replace function public.admin_record_marketplace_ally_payment_v1(
  target_project_id uuid,target_ally_id uuid,target_amount numeric,target_reference text
) returns uuid language plpgsql security definer set search_path to '' as $$
declare earned numeric; paid numeric; new_id uuid;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  perform app_private.require_project_permission(target_project_id,'payments.manage');
  if not exists(select 1 from public.projects where id=target_project_id and owner_id=auth.uid()) then
    raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  if target_amount is null or target_amount<=0 or target_amount>1000000 or
     target_reference is null or char_length(btrim(target_reference)) not between 3 and 160 then
    raise exception 'INVALID_PAYMENT' using errcode='22023'; end if;
  perform 1 from app_private.marketplace_allies where id=target_ally_id and project_id=target_project_id for update;
  if not found then raise exception 'ALLY_NOT_FOUND' using errcode='22023'; end if;
  select app_private.marketplace_ally_earned_v1(target_ally_id) into earned;
  select coalesce(sum(amount),0) into paid from app_private.marketplace_ally_payments where ally_id=target_ally_id;
  if target_amount>earned-paid then raise exception 'PAYMENT_EXCEEDS_EARNED' using errcode='22023'; end if;
  insert into app_private.marketplace_ally_payments(project_id,ally_id,amount,reference,created_by)
    values(target_project_id,target_ally_id,round(target_amount,2),btrim(target_reference),auth.uid())
    returning id into new_id;
  return new_id;
end $$;
revoke all on function public.admin_record_marketplace_ally_payment_v1(uuid,uuid,numeric,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_record_marketplace_ally_payment_v1(uuid,uuid,numeric,text) to authenticated;

create or replace function public.admin_list_marketplace_allies_v1(target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare response jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
    into response from (
    select a.id,a.name,a.slug,a.rate,a.status,a.created_at,a.report_expires_at,
      (select count(*) from app_private.marketplace_ally_events e where e.ally_id=a.id and e.event_type='link_open') as clicks,
      (select count(*) from app_private.marketplace_ally_attributions x where x.ally_id=a.id) as attributed,
      (select count(*) from app_private.marketplace_ally_attributions x join public.jobs j on j.id=x.job_id
       where x.ally_id=a.id and j.status='settled' and not coalesce(j.is_test,false) and j.test_deleted_at is null
         and not exists(select 1 from app_private.marketplace_driver_promo_attribution d where d.job_id=j.id)) as completed,
      app_private.marketplace_ally_earned_v1(a.id) as earned,
      (select coalesce(sum(amount),0) from app_private.marketplace_ally_payments p where p.ally_id=a.id) as paid
    from app_private.marketplace_allies a
    where a.project_id=target_project_id
  ) t;
  return response;
end $$;
revoke all on function public.admin_list_marketplace_allies_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_list_marketplace_allies_v1(uuid) to authenticated;

-- Anonymous event ingest is service-role only, behind existing edge rate limit and origin check.
create or replace function public.record_public_marketplace_ally_event_v1(
  target_event text,target_session_id uuid,target_slug text,target_channel text default 'unknown'
) returns boolean language plpgsql security definer set search_path to '' as $$
declare p record;
begin
  if target_event not in ('link_open','app_open','origin_selected','destination_selected',
    'quote_ready','request_started','request_created','survey_answer') or
    target_session_id is null or target_slug is null or
    target_slug !~ '^[a-z0-9][a-z0-9-]{1,23}$' or
    target_channel not in ('unknown','direct','whatsapp_private','whatsapp_groups',
      'whatsapp_status','facebook','instagram','qr','other') then return false; end if;
  select id,project_id into p from app_private.marketplace_allies
    where slug=target_slug and status='active'
      and project_id=(select id from public.projects where slug='tuktuk-control');
  if not found then return false; end if;
  insert into app_private.marketplace_ally_events(project_id,ally_id,event_type,session_id,channel)
    values(p.project_id,p.id,target_event,target_session_id,target_channel)
    on conflict do nothing;
  return true;
end $$;
revoke all on function public.record_public_marketplace_ally_event_v1(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_public_marketplace_ally_event_v1(text,uuid,text,text) to service_role;

-- Report access uses a high-entropy revocable capability, never a public slug.
-- Only aggregates; never customer contact, exact trip details or phone numbers.
create or replace function public.get_marketplace_ally_report_v1(target_key text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare partner record; earned numeric; paid numeric; result jsonb;
begin
  if target_key is null or target_key !~ '^[0-9a-f]{64}$' then return null; end if;
  select id,name,slug,rate,status,report_expires_at into partner
    from app_private.marketplace_allies
    where report_secret_hash=extensions.digest(pg_catalog.decode(target_key,'hex'),'sha256')
      and report_expires_at>now();
  if not found then return null; end if;
  select app_private.marketplace_ally_earned_v1(partner.id) into earned;
  select coalesce(sum(amount),0) into paid from app_private.marketplace_ally_payments where ally_id=partner.id;
  select jsonb_build_object(
    'name',partner.name,'slug',partner.slug,'rate',partner.rate,'status',partner.status,
    'visits',(select count(*) from app_private.marketplace_ally_events where ally_id=partner.id and event_type='link_open'),
    'quotes',(select count(*) from app_private.marketplace_ally_events where ally_id=partner.id and event_type='quote_ready'),
    'requests',(select count(*) from app_private.marketplace_ally_events where ally_id=partner.id and event_type='request_created'),
    'attributed',(select count(*) from app_private.marketplace_ally_attributions where ally_id=partner.id),
    'completed',(select count(*) from app_private.marketplace_ally_attributions a
      join public.jobs j on j.id=a.job_id where a.ally_id=partner.id and j.status='settled'
      and not coalesce(j.is_test,false) and j.test_deleted_at is null
      and not exists(select 1 from app_private.marketplace_driver_promo_attribution d where d.job_id=j.id)),
    'earned',earned,'paid',paid,'pending',greatest(earned-paid,0),
    'trend',coalesce((select jsonb_agg(to_jsonb(s) order by s.day) from (
       select (e.created_at at time zone 'America/Havana')::date as day,
         count(*) filter(where e.event_type='link_open') as visits,
         count(*) filter(where e.event_type='request_created') as requests
       from app_private.marketplace_ally_events e where e.ally_id=partner.id and e.created_at>now()-interval '30 days'
       group by 1 order by 1
     ) s),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.get_marketplace_ally_report_v1(text) from public,anon,authenticated,service_role;
grant execute on function public.get_marketplace_ally_report_v1(text) to anon,authenticated;
commit;
