-- Follow-up reporting refinement: keep organic sessions separate from Impulsa.
-- Uses only CREATE OR REPLACE FUNCTION, no data modification.
begin;
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
    from all_events where driver_user_id is null
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
revoke all on function public.admin_get_marketplace_impulsa_communications_v1(uuid,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.admin_get_marketplace_impulsa_communications_v1(uuid,integer)
 to authenticated;
commit;
