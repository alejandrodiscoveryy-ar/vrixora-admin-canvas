-- TukTuk: official communication campaign using the existing client app URL.
-- No tables, RLS changes, financial adjustments, customer/driver assignments or pushes.
-- Installed telemetry remains best-effort; no IP or PII is stored.
begin;
create or replace function public.record_public_marketplace_impulsa_event_v1(
 target_event text,
 target_session_id uuid,
 target_promo_code text default null,
 target_channel text default 'unknown',
 target_campaign text default null,
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
     or (target_campaign is not null and target_campaign !~ '^[a-z0-9_-]{1,32}$')
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
  -- Official TukTuk campaigns have no driver promoter. Keep an explicit,
  -- allowlisted campaign namespace distinct from true organic visits.
  if promoter is null and target_promo_code is null and
     target_campaign ~ '^tuktuk($|_[a-z0-9_]{1,22}$)' then
    scope := target_campaign;
  end if;
  if target_event='link_open' and promoter is null and scope='organic' then
    return false;
  end if;
  if target_price_cup is not null then
    bucket := case
      when target_price_cup<500 then 'under_500'
      when target_price_cup<1500 then '500_1500'
      when target_price_cup<3000 then '1500_3000'
      when target_price_cup<5000 then '3000_5000'
      else 'over_5000' end;
  end if;
  insert into app_private.marketplace_impulsa_communication_events
    (project_id,driver_user_id,event_type,channel,campaign,session_id,scope_code,reason,price_band)
  values(pid,promoter,target_event,target_channel,target_campaign,target_session_id,scope,target_reason,bucket)
  on conflict do nothing;
  return true;
end $$;

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
  all_events as (
    select * from app_private.marketplace_impulsa_communication_events
    where project_id=target_project_id
      and created_at >= now()-make_interval(days=>target_days)
  ),
  -- Do not conflate organic clients with visitors of Impulsa links.
  e as (
    select * from all_events where driver_user_id is not null
  ),
  organic_totals as (
    select
      count(*) filter(where event_type='app_open') as app_opens,
      count(*) filter(where event_type='quote_ready') as quotes,
      count(*) filter(where event_type='request_created') as requests_created
    from all_events where driver_user_id is null and (campaign is null or campaign !~ '^tuktuk($|_)')
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
    select channel, campaign,
      count(*) filter(where event_type='share_attempt') as shares,
      count(*) filter(where event_type='link_open') as clicks,
      count(distinct session_id) filter(where event_type='link_open') as sessions,
      count(*) filter(where event_type='quote_ready') as quotes,
      count(*) filter(where event_type='request_created') as requests
    from e group by channel,campaign
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
  price_segments as (
    select q.price_band,count(*) as quoted_sessions,
      count(*) filter(where exists(
        select 1 from e x where x.event_type='request_created'
         and x.session_id=q.session_id and x.scope_code=q.scope_code
      )) as sessions_with_request
    from e q
    where q.event_type='quote_ready' and q.price_band is not null
    group by q.price_band
  ),
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
    'organic_totals',(select to_jsonb(o) from organic_totals o),
    'drivers',coalesce((select jsonb_agg(to_jsonb(l) order by l.clicks desc,l.shares desc,l.name) from leaders l),'[]'::jsonb),
    'channels',coalesce((select jsonb_agg(to_jsonb(c) order by c.clicks desc,c.shares desc) from channels c),'[]'::jsonb),
    'trend',coalesce((select jsonb_agg(to_jsonb(t) order by t.day) from trend t),'[]'::jsonb),
    'reasons',coalesce((select jsonb_agg(to_jsonb(r) order by r.total desc) from reasons r),'[]'::jsonb),
    'price_segments',coalesce((select jsonb_agg(to_jsonb(s) order by s.price_band) from price_segments s),'[]'::jsonb)
  ) into result;
  return result;
end $$;


-- Commercial employees record *their own* official share controls; these
-- are interface actions, never proof that a post was delivered to a recipient.
create or replace function public.admin_record_marketplace_tuktuk_share_action_v1(
  target_project_id uuid,
  target_action text,
  target_channel text default 'direct',
  target_campaign text default 'tuktuk'
) returns boolean
language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  perform app_private.require_project_permission(target_project_id,'commercial.manage');
  if not exists (select 1 from public.projects
    where id=target_project_id and slug='tuktuk-control') then
    raise exception 'NOT_TUKTUK_PROJECT' using errcode='42501';
  end if;
  if target_action not in ('share_attempt','link_copied','message_copied')
    or target_channel not in ('unknown','direct','whatsapp_private','whatsapp_groups',
                              'whatsapp_status','facebook','instagram','qr','other')
    or target_campaign is null
    or target_campaign !~ '^tuktuk($|_[a-z0-9_]{1,22}$)'
  then
    raise exception 'INVALID_CAMPAIGN_ACTION' using errcode='22023';
  end if;
  if (select count(*) from app_private.marketplace_impulsa_communication_events
      where project_id=target_project_id and driver_user_id is null
      and campaign=target_campaign and created_at>=now()-interval '1 hour'
      and event_type in ('share_attempt','link_copied','message_copied'))>=250 then
    return false;
  end if;
  insert into app_private.marketplace_impulsa_communication_events
    (project_id,driver_user_id,event_type,channel,campaign,scope_code)
    values(target_project_id,null,target_action,target_channel,target_campaign,'official_share');
  return true;
end;
$function$;
revoke all on function public.admin_record_marketplace_tuktuk_share_action_v1(uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_record_marketplace_tuktuk_share_action_v1(uuid,text,text,text)
  to authenticated;

-- Campaign is explicitly tagged tuktuk or tuktuk_<action>. Untagged
-- traffic and all personal Impulsa referrals are excluded from this report.
create or replace function public.admin_get_marketplace_tuktuk_communications_v1(
  target_project_id uuid,
  target_days integer default 30
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'commercial.view');
  if target_days not in (7,30,90) then
    raise exception 'INVALID_ANALYTICS_PERIOD' using errcode='22023';
  end if;
  if not exists (select 1 from public.projects
      where id=target_project_id and slug='tuktuk-control') then
    raise exception 'NOT_TUKTUK_PROJECT' using errcode='42501';
  end if;

  with e as (
    select event_type,channel,campaign,scope_code,session_id,reason,price_band,created_at
    from app_private.marketplace_impulsa_communication_events
    where project_id=target_project_id
      and driver_user_id is null
      and campaign ~ '^tuktuk($|_[a-z0-9_]{1,22}$)'
      and created_at>=now()-make_interval(days=>target_days)
  ),
  totals as (
    select
      count(*) filter(where event_type='share_attempt') as share_attempts,
      count(*) filter(where event_type in ('link_copied','message_copied')) as copies,
      count(*) filter(where event_type='link_open') as link_opens,
      count(distinct session_id) filter(where event_type='link_open') as visitor_sessions,
      count(*) filter(where event_type='app_open') as app_opens,
      count(*) filter(where event_type='origin_selected') as origins,
      count(*) filter(where event_type='destination_selected') as destinations,
      count(*) filter(where event_type='quote_ready') as quotes,
      count(*) filter(where event_type='request_started') as requests_started,
      count(*) filter(where event_type='request_created') as requests_created,
      count(*) filter(where event_type='survey_answer') as survey_answers
    from e
  ),
  channels as (
    select channel,count(*) filter(where event_type='share_attempt') as share_attempts,
      count(*) filter(where event_type='link_open') as link_opens,
      count(*) filter(where event_type='quote_ready') as quotes,
      count(*) filter(where event_type='request_created') as requests_created
    from e group by channel
  ),
  campaigns as (
    select campaign,
      count(*) filter(where event_type='share_attempt') as share_attempts,
      count(*) filter(where event_type='link_open') as link_opens,
      count(distinct session_id) filter(where event_type='link_open') as visitor_sessions,
      count(*) filter(where event_type='quote_ready') as quotes,
      count(*) filter(where event_type='request_created') as requests_created
    from e group by campaign
  ),
  trend as (
    select (created_at at time zone 'America/Havana')::date as day,
      count(*) filter(where event_type='link_open') as link_opens,
      count(*) filter(where event_type='quote_ready') as quotes,
      count(*) filter(where event_type='request_created') as requests_created
    from e group by 1
  ),
  reasons as (
    select reason,count(*) as total
    from e where event_type='survey_answer' and reason is not null group by reason
  ),
  price_segments as (
    select q.price_band,
      count(*) as quoted_sessions,
      count(*) filter(where exists(
        select 1 from e r
        where r.event_type='request_created' and r.session_id=q.session_id
          and r.scope_code=q.scope_code
      )) as sessions_with_request
    from e q where q.event_type='quote_ready' and q.price_band is not null
    group by q.price_band
  )
  select jsonb_build_object(
    'days',target_days,
    'source','TukTuk official campaign',
    'measured_since',(select min(created_at)
      from app_private.marketplace_impulsa_communication_events a
      where a.project_id=target_project_id and a.driver_user_id is null
      and a.campaign ~ '^tuktuk($|_[a-z0-9_]{1,22}$)'),
    'totals',(select to_jsonb(t) from totals t),
    'channels',coalesce((select jsonb_agg(to_jsonb(c) order by c.link_opens desc,c.channel)
      from channels c),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.link_opens desc,c.campaign)
      from campaigns c),'[]'::jsonb),
    'trend',coalesce((select jsonb_agg(to_jsonb(t) order by t.day)
      from trend t),'[]'::jsonb),
    'reasons',coalesce((select jsonb_agg(to_jsonb(r) order by r.total desc)
      from reasons r),'[]'::jsonb),
    'price_segments',coalesce((select jsonb_agg(to_jsonb(s) order by s.price_band)
      from price_segments s),'[]'::jsonb)
  ) into result;
  return result;
end;
$function$;
revoke all on function public.admin_get_marketplace_tuktuk_communications_v1(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_get_marketplace_tuktuk_communications_v1(uuid,integer)
  to authenticated;

commit;
