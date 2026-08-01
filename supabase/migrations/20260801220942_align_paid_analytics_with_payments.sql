-- Paid-license analytics must reflect confirmed payment records, not generic license activations.

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
    count(distinct filtered.license_id) filter(where filtered.event_name='payment_confirmed'),
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
