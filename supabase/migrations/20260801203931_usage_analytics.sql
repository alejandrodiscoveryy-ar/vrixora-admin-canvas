-- Product usage analytics, separate from administrative audit events.

create table public.analytics_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  license_id uuid references public.licenses(id) on delete set null,
  event_name text not null check (event_name in (
    'user_registered','login_success','app_open','session_started','trial_started',
    'license_activated','license_expired','license_renewed','payment_confirmed'
  )),
  occurred_at timestamptz not null default now(),
  session_id text,
  device_id_hash text,
  app_version text,
  platform text check (platform is null or platform in ('android','ios','web','windows','macos','linux','unknown')),
  acquisition_source text,
  acquisition_medium text,
  campaign text,
  referral_code text,
  plan text,
  license_status text,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096
  ),
  created_at timestamptz not null default now(),
  unique (project_id, user_id, event_name, dedupe_key)
);

create table public.user_attribution (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  first_source text,
  first_medium text,
  first_campaign text,
  first_referral_code text,
  first_touched_at timestamptz,
  last_source text,
  last_medium text,
  last_campaign text,
  last_referral_code text,
  last_touched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index analytics_events_project_event_time_idx
  on public.analytics_events(project_id, event_name, occurred_at desc);
create index analytics_events_project_user_time_idx
  on public.analytics_events(project_id, user_id, occurred_at desc);
create index analytics_events_project_license_idx
  on public.analytics_events(project_id, license_id)
  where license_id is not null;
create index analytics_events_project_campaign_time_idx
  on public.analytics_events(project_id, campaign, occurred_at desc)
  where campaign is not null;
create index analytics_events_project_version_time_idx
  on public.analytics_events(project_id, app_version, occurred_at desc)
  where app_version is not null;
create index analytics_events_session_idx
  on public.analytics_events(session_id)
  where session_id is not null;
create index user_attribution_source_idx
  on public.user_attribution(project_id, first_source)
  where first_source is not null;

alter table public.analytics_events enable row level security;
alter table public.user_attribution enable row level security;

revoke all on public.analytics_events, public.user_attribution from public, anon, authenticated;
grant select on public.analytics_events, public.user_attribution to authenticated;

create policy analytics_events_select_own
on public.analytics_events for select to authenticated
using ((select auth.uid()) = user_id);

create policy user_attribution_select_own
on public.user_attribution for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function app_private.insert_analytics_event(
  target_project_id uuid,
  target_user_id uuid,
  target_license_id uuid,
  target_event_name text,
  target_occurred_at timestamptz,
  target_session_id text,
  target_device_id_hash text,
  target_app_version text,
  target_platform text,
  target_source text,
  target_medium text,
  target_campaign text,
  target_referral_code text,
  target_plan text,
  target_license_status text,
  target_dedupe_key text,
  target_metadata jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare event_id bigint;
begin
  insert into public.analytics_events(
    project_id,user_id,license_id,event_name,occurred_at,session_id,device_id_hash,
    app_version,platform,acquisition_source,acquisition_medium,campaign,referral_code,
    plan,license_status,dedupe_key,metadata
  ) values (
    target_project_id,target_user_id,target_license_id,target_event_name,target_occurred_at,
    nullif(left(btrim(target_session_id),128),''),nullif(target_device_id_hash,''),
    nullif(left(btrim(target_app_version),64),''),nullif(left(lower(btrim(target_platform)),24),''),
    nullif(left(lower(btrim(target_source)),100),''),nullif(left(lower(btrim(target_medium)),100),''),
    nullif(left(btrim(target_campaign),150),''),nullif(left(btrim(target_referral_code),100),''),
    nullif(left(btrim(target_plan),100),''),nullif(left(btrim(target_license_status),30),''),
    left(target_dedupe_key,240),coalesce(target_metadata,'{}'::jsonb)
  )
  on conflict (project_id,user_id,event_name,dedupe_key) do nothing
  returning id into event_id;

  if event_id is null then
    select id into event_id from public.analytics_events
    where project_id=target_project_id and user_id=target_user_id
      and event_name=target_event_name and dedupe_key=left(target_dedupe_key,240);
  end if;
  return event_id;
end;
$$;

revoke all on function app_private.insert_analytics_event(
  uuid,uuid,uuid,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;

create or replace function public.record_app_event(
  target_project_id uuid,
  target_event_name text,
  target_session_id text,
  target_device_id text default null,
  target_app_version text default null,
  target_platform text default 'unknown',
  target_source text default null,
  target_medium text default null,
  target_campaign text default null,
  target_referral_code text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_license public.licenses%rowtype;
  event_time timestamptz := now();
  normalized_session text := nullif(left(btrim(target_session_id),128),'');
  dedupe text;
  device_hash text;
  result_id bigint;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if target_event_name not in ('login_success','app_open','session_started') then
    raise exception 'EVENT_NOT_ALLOWED' using errcode='22023';
  end if;
  if normalized_session is null then raise exception 'SESSION_ID_REQUIRED' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(target_metadata,'{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(target_metadata,'{}'::jsonb)) > 4096 then
    raise exception 'INVALID_METADATA' using errcode='22023';
  end if;

  select * into current_license from public.licenses
  where project_id=target_project_id and user_id=actor
  order by case when status='active' then 0 else 1 end, created_at desc limit 1;
  if not found then raise exception 'PROJECT_ACCESS_REQUIRED' using errcode='42501'; end if;

  dedupe := case
    when target_event_name='app_open' then normalized_session||':'||floor(extract(epoch from event_time)/900)::bigint::text
    else normalized_session
  end;
  device_hash := case when nullif(target_device_id,'') is null then null else
    encode(extensions.digest(convert_to(target_device_id,'UTF8'),'sha256'),'hex') end;

  result_id := app_private.insert_analytics_event(
    target_project_id,actor,current_license.id,target_event_name,event_time,normalized_session,
    device_hash,target_app_version,target_platform,target_source,target_medium,target_campaign,
    target_referral_code,current_license.plan,current_license.status,dedupe,target_metadata
  );

  if coalesce(nullif(target_source,''),nullif(target_medium,''),nullif(target_campaign,''),nullif(target_referral_code,'')) is not null then
    insert into public.user_attribution(
      project_id,user_id,first_source,first_medium,first_campaign,first_referral_code,first_touched_at,
      last_source,last_medium,last_campaign,last_referral_code,last_touched_at
    ) values (
      target_project_id,actor,nullif(target_source,''),nullif(target_medium,''),nullif(target_campaign,''),
      nullif(target_referral_code,''),event_time,nullif(target_source,''),nullif(target_medium,''),
      nullif(target_campaign,''),nullif(target_referral_code,''),event_time
    ) on conflict (project_id,user_id) do update set
      last_source=coalesce(excluded.last_source,public.user_attribution.last_source),
      last_medium=coalesce(excluded.last_medium,public.user_attribution.last_medium),
      last_campaign=coalesce(excluded.last_campaign,public.user_attribution.last_campaign),
      last_referral_code=coalesce(excluded.last_referral_code,public.user_attribution.last_referral_code),
      last_touched_at=excluded.last_touched_at,updated_at=now();
  end if;
  return result_id;
end;
$$;

revoke all on function public.record_app_event(uuid,text,text,text,text,text,text,text,text,text,jsonb)
  from public, anon;
grant execute on function public.record_app_event(uuid,text,text,text,text,text,text,text,text,text,jsonb)
  to authenticated;

create or replace function app_private.track_license_analytics()
returns trigger language plpgsql security definer set search_path=''
as $$
declare profile_created timestamptz;
begin
  if tg_op='INSERT' then
    select created_at into profile_created from public.profiles where id=new.user_id;
    if not exists (
      select 1 from public.analytics_events where project_id=new.project_id
        and user_id=new.user_id and event_name='user_registered'
    ) then
      perform app_private.insert_analytics_event(new.project_id,new.user_id,new.id,'user_registered',
        coalesce(profile_created,new.created_at),null,null,null,null,null,null,null,null,new.plan,new.status,
        'registration:'||new.user_id::text,'{}'::jsonb);
    end if;
    if new.license_type='trial' then
      perform app_private.insert_analytics_event(new.project_id,new.user_id,new.id,'trial_started',new.created_at,
        null,null,null,null,null,null,null,null,new.plan,new.status,'trial:'||new.id::text,
        jsonb_build_object('expires_at',new.expires_at));
    elsif new.status='active' then
      perform app_private.insert_analytics_event(new.project_id,new.user_id,new.id,'license_activated',new.created_at,
        null,null,null,null,null,null,null,null,new.plan,new.status,'activation:'||new.id::text,
        jsonb_build_object('license_type',new.license_type));
    end if;
  else
    if new.status='expired' and old.status is distinct from new.status then
      perform app_private.insert_analytics_event(new.project_id,new.user_id,new.id,'license_expired',now(),
        null,null,null,null,null,null,null,null,new.plan,new.status,'expired:'||new.id::text||':'||now()::date,
        jsonb_build_object('expires_at',new.expires_at));
    end if;
    if new.status='active' and old.status is distinct from new.status and new.license_type<>'trial' then
      perform app_private.insert_analytics_event(new.project_id,new.user_id,new.id,'license_activated',now(),
        null,null,null,null,null,null,null,null,new.plan,new.status,'activation:'||new.id::text||':'||now()::date,
        jsonb_build_object('previous_status',old.status));
    end if;
    if new.expires_at is distinct from old.expires_at and new.expires_at > coalesce(old.expires_at,'-infinity'::timestamptz) then
      perform app_private.insert_analytics_event(new.project_id,new.user_id,new.id,'license_renewed',now(),
        null,null,null,null,null,null,null,null,new.plan,new.status,
        'renewal:'||new.id::text||':'||coalesce(new.expires_at::text,'lifetime'),
        jsonb_build_object('previous_expires_at',old.expires_at,'expires_at',new.expires_at));
    end if;
  end if;
  return new;
end;
$$;

create or replace function app_private.track_payment_analytics()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status='paid' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform app_private.insert_analytics_event(new.project_id,new.user_id,new.license_id,'payment_confirmed',
      coalesce(new.created_at,now()),null,null,null,null,null,null,null,null,new.plan,null,
      'payment:'||new.id::text,jsonb_build_object('amount',new.amount,'currency',new.currency,'payment_id',new.id));
  end if;
  return new;
end;
$$;

revoke all on function app_private.track_license_analytics() from public,anon,authenticated;
revoke all on function app_private.track_payment_analytics() from public,anon,authenticated;

create trigger analytics_licenses_changes after insert or update on public.licenses
for each row execute function app_private.track_license_analytics();
create trigger analytics_payments_changes after insert or update on public.payments
for each row execute function app_private.track_payment_analytics();

create or replace function public.admin_get_usage_analytics(
  target_project_id uuid,
  target_from date,
  target_to date,
  target_plan text default null,
  target_license_status text default null,
  target_source text default null,
  target_campaign text default null,
  target_app_version text default null
)
returns table(
  metric_date date,new_users bigint,trials bigint,paid_licenses bigint,active_users bigint,
  weekly_active_users bigint,monthly_active_users bigint,logins bigint,renewals bigint,expired bigint,
  revenue_cup numeric,revenue_usd numeric,revenue_eur numeric
)
language plpgsql security definer set search_path=''
as $$
begin
  perform app_private.require_project_permission(target_project_id,'analytics.view');
  if target_from is null or target_to is null or target_to<target_from or target_to-target_from>400 then
    raise exception 'INVALID_ANALYTICS_RANGE' using errcode='22023';
  end if;
  return query
  with days as (
    select generate_series(target_from,target_to,'1 day'::interval)::date as day
  ), filtered as (
    select event.* from public.analytics_events event
    left join public.user_attribution attribution
      on attribution.project_id=event.project_id and attribution.user_id=event.user_id
    where event.project_id=target_project_id
      and event.occurred_at>=(target_from-29)::timestamptz
      and event.occurred_at<(target_to+1)::timestamptz
      and (target_plan is null or event.plan=target_plan)
      and (target_license_status is null or event.license_status=target_license_status)
      and (target_source is null or attribution.first_source=target_source or event.acquisition_source=target_source)
      and (target_campaign is null or attribution.first_campaign=target_campaign or event.campaign=target_campaign)
      and (target_app_version is null or event.app_version=target_app_version)
  )
  select days.day,
    count(distinct filtered.user_id) filter(where filtered.event_name='user_registered'),
    count(distinct filtered.license_id) filter(where filtered.event_name='trial_started'),
    count(distinct filtered.license_id) filter(where filtered.event_name='license_activated'),
    count(distinct filtered.user_id) filter(where filtered.event_name in ('app_open','session_started') and filtered.license_status='active'),
    (select count(distinct weekly.user_id) from filtered weekly
      where weekly.event_name in ('app_open','session_started') and weekly.license_status='active'
        and weekly.occurred_at>=days.day::timestamptz-'6 days'::interval
        and weekly.occurred_at<(days.day+1)::timestamptz),
    (select count(distinct monthly.user_id) from filtered monthly
      where monthly.event_name in ('app_open','session_started') and monthly.license_status='active'
        and monthly.occurred_at>=days.day::timestamptz-'29 days'::interval
        and monthly.occurred_at<(days.day+1)::timestamptz),
    count(distinct filtered.user_id) filter(where filtered.event_name='login_success'),
    count(*) filter(where filtered.event_name='license_renewed'),
    count(distinct filtered.license_id) filter(where filtered.event_name='license_expired'),
    coalesce(sum((filtered.metadata->>'amount')::numeric) filter(where filtered.event_name='payment_confirmed' and filtered.metadata->>'currency'='CUP'),0),
    coalesce(sum((filtered.metadata->>'amount')::numeric) filter(where filtered.event_name='payment_confirmed' and filtered.metadata->>'currency'='USD'),0),
    coalesce(sum((filtered.metadata->>'amount')::numeric) filter(where filtered.event_name='payment_confirmed' and filtered.metadata->>'currency'='EUR'),0)
  from days left join filtered on filtered.occurred_at::date=days.day
  group by days.day order by days.day;
end;
$$;

revoke all on function public.admin_get_usage_analytics(uuid,date,date,text,text,text,text,text)
  from public,anon;
grant execute on function public.admin_get_usage_analytics(uuid,date,date,text,text,text,text,text)
  to authenticated;

create or replace function public.admin_get_usage_dimensions(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  perform app_private.require_project_permission(target_project_id,'analytics.view');
  return jsonb_build_object(
    'sources',coalesce((select jsonb_agg(value) from (select distinct first_source value from public.user_attribution where project_id=target_project_id and first_source is not null order by 1) s),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(value) from (select distinct first_campaign value from public.user_attribution where project_id=target_project_id and first_campaign is not null order by 1) c),'[]'::jsonb),
    'versions',coalesce((select jsonb_agg(value) from (select distinct app_version value from public.analytics_events where project_id=target_project_id and app_version is not null order by 1) v),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_usage_dimensions(uuid) from public,anon;
grant execute on function public.admin_get_usage_dimensions(uuid) to authenticated;

create or replace function public.admin_get_retention_metrics(
  target_project_id uuid,
  target_plan text default null,
  target_source text default null,
  target_campaign text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare cohort_count bigint; eligible_7 bigint; eligible_30 bigint; retained_7 bigint; retained_30 bigint; paid_users bigint; trial_users bigint;
begin
  perform app_private.require_project_permission(target_project_id,'analytics.view');
  with cohorts as (
    select registered.user_id,min(registered.occurred_at) registered_at
    from public.analytics_events registered
    left join public.user_attribution attribution
      on attribution.project_id=registered.project_id and attribution.user_id=registered.user_id
    where registered.project_id=target_project_id and registered.event_name='user_registered'
      and (target_plan is null or registered.plan=target_plan)
      and (target_source is null or attribution.first_source=target_source)
      and (target_campaign is null or attribution.first_campaign=target_campaign)
    group by registered.user_id
  )
  select count(*),
    count(*) filter(where registered_at<=now()-'7 days'::interval),
    count(*) filter(where registered_at<=now()-'30 days'::interval),
    count(*) filter(where registered_at<=now()-'7 days'::interval and exists(
      select 1 from public.analytics_events activity where activity.project_id=target_project_id
        and activity.user_id=cohorts.user_id and activity.event_name in ('app_open','session_started')
        and activity.occurred_at>=cohorts.registered_at+'7 days'::interval
        and activity.occurred_at<cohorts.registered_at+'8 days'::interval)),
    count(*) filter(where registered_at<=now()-'30 days'::interval and exists(
      select 1 from public.analytics_events activity where activity.project_id=target_project_id
        and activity.user_id=cohorts.user_id and activity.event_name in ('app_open','session_started')
        and activity.occurred_at>=cohorts.registered_at+'30 days'::interval
        and activity.occurred_at<cohorts.registered_at+'31 days'::interval))
  into cohort_count,eligible_7,eligible_30,retained_7,retained_30 from cohorts;

  select count(distinct user_id) filter(where event_name='trial_started'),
    count(distinct user_id) filter(where event_name in ('license_activated','payment_confirmed'))
  into trial_users,paid_users from public.analytics_events where project_id=target_project_id;
  return jsonb_build_object(
    'cohort_count',cohort_count,'eligible_7',eligible_7,'eligible_30',eligible_30,
    'retained_7',retained_7,'retained_30',retained_30,
    'retention_7_rate',case when eligible_7=0 then 0 else round(retained_7*100.0/eligible_7,1) end,
    'retention_30_rate',case when eligible_30=0 then 0 else round(retained_30*100.0/eligible_30,1) end,
    'trial_users',trial_users,'paid_users',paid_users,
    'trial_to_paid_rate',case when trial_users=0 then 0 else round(paid_users*100.0/trial_users,1) end
  );
end;
$$;

revoke all on function public.admin_get_retention_metrics(uuid,text,text,text) from public,anon;
grant execute on function public.admin_get_retention_metrics(uuid,text,text,text) to authenticated;

-- Backfill historical business events without changing licenses or payments.
insert into public.analytics_events(project_id,user_id,license_id,event_name,occurred_at,plan,license_status,dedupe_key,metadata)
select l.project_id,l.user_id,l.id,'user_registered',p.created_at,l.plan,l.status,'registration:'||l.user_id::text,'{}'::jsonb
from public.licenses l join public.profiles p on p.id=l.user_id
on conflict do nothing;

insert into public.analytics_events(project_id,user_id,license_id,event_name,occurred_at,plan,license_status,dedupe_key,metadata)
select l.project_id,l.user_id,l.id,
  case when l.license_type='trial' then 'trial_started' else 'license_activated' end,
  l.created_at,l.plan,l.status,
  case when l.license_type='trial' then 'trial:' else 'activation:' end||l.id::text,
  jsonb_build_object('license_type',l.license_type,'expires_at',l.expires_at)
from public.licenses l where l.license_type='trial' or l.status='active'
on conflict do nothing;

insert into public.analytics_events(project_id,user_id,license_id,event_name,occurred_at,plan,license_status,dedupe_key,metadata)
select p.project_id,p.user_id,p.license_id,'payment_confirmed',p.created_at,p.plan,l.status,
  'payment:'||p.id::text,jsonb_build_object('amount',p.amount,'currency',p.currency,'payment_id',p.id)
from public.payments p left join public.licenses l on l.id=p.license_id
where p.status='paid' on conflict do nothing;
