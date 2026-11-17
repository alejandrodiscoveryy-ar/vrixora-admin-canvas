
-- Impulsa Analytics · communication-only observability. No jobs, ledgers,
-- push, geolocation or payment modifications. Anonymous browser sessions are
-- ephemeral; IP, user-agent and precise locations are never stored.
begin;

create table if not exists app_private.marketplace_impulsa_communication_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id),
  driver_user_id uuid,
  event_type text not null check (event_type in (
    'share_attempt','link_copied','message_copied','card_downloaded',
    'link_open','app_open','origin_selected','destination_selected',
    'quote_ready','request_started','request_created','survey_answer'
  )),
  channel text not null check (channel in (
    'unknown','direct','whatsapp_private','whatsapp_groups','whatsapp_status',
    'facebook','instagram','qr','other'
  )),
  session_id uuid,
  scope_code text not null default 'organic',
  reason text check (reason is null or reason in ('price','comparing','no_driver','difficult','later','other')),
  price_band text check (price_band is null or price_band in ('under_500','500_1500','1500_3000','3000_5000','over_5000')),
  created_at timestamptz not null default now(),
  check (session_id is not null or event_type in ('share_attempt','link_copied','message_copied','card_downloaded')),
  check (reason is null or event_type='survey_answer'),
  check (price_band is null or event_type='quote_ready')
);
create unique index if not exists marketplace_impulsa_communication_session_dedupe
on app_private.marketplace_impulsa_communication_events(project_id,event_type,scope_code,session_id)
where session_id is not null;
create index if not exists marketplace_impulsa_communication_reporting_idx
on app_private.marketplace_impulsa_communication_events(project_id,created_at desc,driver_user_id,event_type);
alter table app_private.marketplace_impulsa_communication_events enable row level security;
revoke all on app_private.marketplace_impulsa_communication_events from public,anon,authenticated,service_role;

-- The authenticated driver can only record his/her own actions. A share
-- attempt means opening the share sheet, not confirmed delivery to a channel.
create or replace function public.record_my_marketplace_impulsa_share_action_v1(
  target_action text, target_channel text default 'unknown'
) returns boolean
language plpgsql security definer set search_path to ''
as $$
declare
  actor uuid := auth.uid();
  pid uuid;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if target_action not in ('share_attempt','link_copied','message_copied','card_downloaded')
    or target_channel not in ('unknown','direct','whatsapp_private','whatsapp_groups','whatsapp_status','facebook','instagram','qr','other')
  then raise exception 'INVALID_ANALYTICS_EVENT' using errcode='22023'; end if;
  select p.project_id into pid
  from app_private.marketplace_driver_promo_profiles p
  join public.driver_profiles d on d.project_id=p.project_id and d.user_id=p.driver_user_id
  where p.driver_user_id=actor and p.revoked_at is null
    and d.status='active' and d.activated_at is not null and d.suspended_at is null
  order by p.consented_at desc limit 1;
  if pid is null then return false; end if;
  -- Excessive activity should never flood the telemetry table.
  if (select count(*) from app_private.marketplace_impulsa_communication_events e
      where e.project_id=pid and e.driver_user_id=actor
        and e.event_type in ('share_attempt','link_copied','message_copied','card_downloaded')
        and e.created_at>=now()-interval '1 hour') >= 120 then
    return false;
  end if;
  insert into app_private.marketplace_impulsa_communication_events
    (project_id,driver_user_id,event_type,channel,scope_code)
  values(pid,actor,target_action,target_channel,'driver_action');
  return true;
end $$;
revoke all on function public.record_my_marketplace_impulsa_share_action_v1(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_my_marketplace_impulsa_share_action_v1(text,text) to authenticated;

-- Only the server-side Edge Function, using service_role after dedicated
-- rate limits, can record public landing/booking signals. Never trust client
-- identifiers as proof of completed/paid services.
create or replace function public.record_public_marketplace_impulsa_event_v1(
 target_event text,
 target_session_id uuid,
 target_promo_code text default null,
 target_channel text default 'unknown',
 target_reason text default null,
 target_price_cup numeric default null
) returns boolean
language plpgsql security definer set search_path to ''
as $$
declare
  pid uuid;
  promoter uuid;
  scope text := 'organic';
  bucket text;
begin
  if target_event not in ('link_open','app_open','origin_selected','destination_selected',
       'quote_ready','request_started','request_created','survey_answer')
     or target_session_id is null
     or target_channel not in ('unknown','direct','whatsapp_private','whatsapp_groups','whatsapp_status','facebook','instagram','qr','other')
     or (target_reason is not null and target_reason not in ('price','comparing','no_driver','difficult','later','other'))
     or (target_event='survey_answer' and target_reason is null)
     or (target_reason is not null and target_event<>'survey_answer')
     or (target_price_cup is not null and (target_event<>'quote_ready' or target_price_cup<0 or target_price_cup>1000000))
  then return false; end if;

  select id into pid from public.projects where slug='tuktuk-control' limit 1;
  if pid is null then return false; end if;
  if target_promo_code is not null then
    if target_promo_code !~ '^[0-9a-f]{32}$' then return false; end if;
    select p.driver_user_id into promoter
      from app_private.marketplace_driver_promo_profiles p
      join public.driver_profiles d on d.project_id=p.project_id and d.user_id=p.driver_user_id
      where p.project_id=pid and p.code=target_promo_code
       and p.revoked_at is null and d.status='active'
       and d.suspended_at is null and d.activated_at is not null;
    if promoter is null then return false; end if;
    scope := target_promo_code;
  end if;
  if target_event='link_open' and promoter is null then return false; end if;
  if target_price_cup is not null then
    bucket := case
      when target_price_cup<500 then 'under_500'
      when target_price_cup<1500 then '500_1500'
      when target_price_cup<3000 then '1500_3000'
      when target_price_cup<5000 then '3000_5000'
      else 'over_5000' end;
  end if;
  insert into app_private.marketplace_impulsa_communication_events
    (project_id,driver_user_id,event_type,channel,session_id,scope_code,reason,price_band)
  values(pid,promoter,target_event,target_channel,target_session_id,scope,target_reason,bucket)
  on conflict do nothing;
  return true;
end $$;
revoke all on function public.record_public_marketplace_impulsa_event_v1(text,uuid,text,text,text,numeric)
 from public,anon,authenticated,service_role;
grant execute on function public.record_public_marketplace_impulsa_event_v1(text,uuid,text,text,text,numeric)
 to service_role;

-- Dashboard summary: financial data is intentionally not included. "Real
-- completed jobs" derive exclusively from trusted job & attribution tables.
create or replace function public.admin_get_marketplace_impulsa_communications_v1(
 target_project_id uuid, target_days integer default 30
) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  if target_days not in (7,30,90) then
    raise exception 'INVALID_ANALYTICS_PERIOD' using errcode='22023';
  end if;
  with
  e as (
    select * from app_private.marketplace_impulsa_communication_events
    where project_id=target_project_id
      and created_at >= now()-make_interval(days=>target_days)
  ),
  live_profiles as (
    select p.driver_user_id, p.public_name, p.revoked_at is null as active
    from app_private.marketplace_driver_promo_profiles p
    where p.project_id=target_project_id
  ),
  per_driver as (
    select
      p.driver_user_id,
      p.public_name as name,
      p.active,
      count(e.id) filter(where e.event_type='share_attempt') as shares,
      count(e.id) filter(where e.event_type in ('link_copied','message_copied')) as copies,
      count(e.id) filter(where e.event_type='card_downloaded') as downloads,
      count(e.id) filter(where e.event_type='link_open') as clicks,
      count(distinct e.session_id) filter(where e.event_type='link_open') as sessions,
      count(e.id) filter(where e.event_type='quote_ready') as quotes,
      count(e.id) filter(where e.event_type='request_created') as requests
    from live_profiles p left join e on e.driver_user_id=p.driver_user_id
    group by p.driver_user_id,p.public_name,p.active
  ),
  real_jobs as (
    select a.driver_user_id,
      count(*) filter(where not j.is_test) as attributed_real,
      count(*) filter(where not j.is_test and j.status='settled') as completed_real
    from app_private.marketplace_driver_promo_attribution a
    join public.jobs j on j.project_id=a.project_id and j.id=a.job_id
    where a.project_id=target_project_id
      and a.created_at>=now()-make_interval(days=>target_days)
    group by a.driver_user_id
  ),
  leaders as (
    select p.*, coalesce(r.attributed_real,0) as attributed_real,
      coalesce(r.completed_real,0) as completed_real
    from per_driver p left join real_jobs r using(driver_user_id)
    order by p.clicks desc,p.shares desc,p.name
  ),
  channels as (
    select channel,
      count(*) filter(where event_type='share_attempt') as shares,
      count(*) filter(where event_type='link_open') as clicks,
      count(distinct session_id) filter(where event_type='link_open') as sessions,
      count(*) filter(where event_type='quote_ready') as quotes,
      count(*) filter(where event_type='request_created') as requests
    from e group by channel
  ),
  trend as (
    select (created_at at time zone 'America/Havana')::date as day,
      count(*) filter(where event_type='share_attempt') as shares,
      count(*) filter(where event_type='link_open') as clicks,
      count(*) filter(where event_type='quote_ready') as quotes,
      count(*) filter(where event_type='request_created') as requests
    from e group by 1
  ),
  reasons as (select reason,count(*) as total from e
    where event_type='survey_answer' and reason is not null group by reason),
  totals as (
    select
      count(*) filter(where event_type='share_attempt') as shares,
      count(*) filter(where event_type in ('link_copied','message_copied')) as copies,
      count(*) filter(where event_type='link_open') as clicks,
      count(distinct session_id) filter(where event_type='link_open') as sessions,
      count(*) filter(where event_type='app_open') as app_opens,
      count(*) filter(where event_type='origin_selected') as origins,
      count(*) filter(where event_type='destination_selected') as destinations,
      count(*) filter(where event_type='quote_ready') as quotes,
      count(*) filter(where event_type='request_started') as requests_started,
      count(*) filter(where event_type='request_created') as requests_created,
      count(*) filter(where event_type='survey_answer') as surveyed
    from e
  )
  select jsonb_build_object(
    'days',target_days,
    'source','Impulsa Analytics v1',
    'measured_since',(select min(created_at) from app_private.marketplace_impulsa_communication_events where project_id=target_project_id),
    'totals',(select to_jsonb(t) from totals t),
    'drivers',coalesce((select jsonb_agg(to_jsonb(l) order by l.clicks desc,l.shares desc,l.name) from leaders l),'[]'::jsonb),
    'channels',coalesce((select jsonb_agg(to_jsonb(c) order by c.clicks desc,c.shares desc) from channels c),'[]'::jsonb),
    'trend',coalesce((select jsonb_agg(to_jsonb(t) order by t.day) from trend t),'[]'::jsonb),
    'reasons',coalesce((select jsonb_agg(to_jsonb(r) order by r.total desc) from reasons r),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_get_marketplace_impulsa_communications_v1(uuid,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.admin_get_marketplace_impulsa_communications_v1(uuid,integer)
 to authenticated;
commit;
