-- Read-only agency vitality. Applied to TukTuk via migration 20261120205213.
-- Contract: period metrics refer to jobs CREATED in range; current statuses are read at query time.
-- Control cohort uses the FIRST project-scoped user_registered analytics event.
-- This is an observed cohort, not an inventory of all Control installations.
create or replace function public.admin_get_agency_vitality_v1(
  target_project_id uuid,
  target_from date,
  target_to date
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  can_marketplace boolean;
  can_customers boolean;
  can_payments boolean;
  t_from timestamptz;
  t_until timestamptz;
  t_prev timestamptz;
  payload jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'analytics.view');
  if target_from is null or target_to is null or target_to < target_from
     or target_to - target_from > 400 then
    raise exception 'INVALID_ANALYTICS_RANGE' using errcode = '22023';
  end if;
  can_marketplace := app_private.has_project_permission(target_project_id, 'marketplace.view');
  can_customers := app_private.has_project_permission(target_project_id, 'customers.view');
  can_payments := app_private.has_project_permission(target_project_id, 'payments.view');
  t_from := target_from::timestamptz;
  t_until := (target_to + 1)::timestamptz;
  t_prev := (target_from - (target_to - target_from + 1))::timestamptz;

  with control_first as (
    select e.user_id, min(e.occurred_at) as first_registered
    from public.analytics_events e
    where e.project_id = target_project_id and e.event_name = 'user_registered'
      and e.user_id is not null
    group by e.user_id
  ), control_current as (
    select c.user_id, c.first_registered, d.created_at as started_at,
      d.activated_at, d.status as driver_status
    from control_first c
    left join public.driver_profiles d
      on d.project_id = target_project_id and d.user_id = c.user_id
    where c.first_registered >= t_from and c.first_registered < t_until
  ), valid_jobs as (
    select j.id, j.created_at, j.status, j.assigned_driver_user_id, j.final_price,
      j.currency, s.customer_id
    from public.jobs j
    left join public.service_requests s
      on s.project_id = j.project_id and s.id = j.service_request_id
    where j.project_id = target_project_id
      and coalesce(j.is_test, false) = false and j.test_deleted_at is null
  ), current_jobs as (
    select * from valid_jobs where created_at >= t_from and created_at < t_until
  ), previous_jobs as (
    select * from valid_jobs where created_at >= t_prev and created_at < t_from
  )
  select jsonb_build_object(
    'from', target_from,
    'to', target_to,
    'computed_at', now(),
    'control', jsonb_build_object(
      'registered', (select count(*) from control_current),
      'previous_registered', (select count(*) from control_first
        where first_registered >= t_prev and first_registered < t_from),
      'only_control', (select count(*) from control_current c
        where c.started_at is null or c.started_at >= t_until),
      'started', (select count(*) from control_current c
        where c.started_at is not null and c.started_at < t_until
          and c.started_at >= c.first_registered),
      'activated', (select count(*) from control_current c
        where c.activated_at is not null and c.activated_at < t_until
          and c.activated_at >= c.first_registered),
      'first_ride', (select count(*) from control_current c
        where c.activated_at is not null and c.activated_at < t_until
          and exists (
            select 1 from valid_jobs j
            where j.assigned_driver_user_id = c.user_id
              and j.status = 'settled'
              and j.created_at >= c.activated_at and j.created_at < t_until
          ))
    ),
    'clients', case when can_customers then jsonb_build_object(
      'total', (select count(*) from public.customers c
        where c.project_id = target_project_id and c.created_at < t_until),
      'new', (select count(*) from public.customers c
        where c.project_id = target_project_id and c.created_at >= t_from and c.created_at < t_until),
      'previous_new', (select count(*) from public.customers c
        where c.project_id = target_project_id and c.created_at >= t_prev and c.created_at < t_from),
      'served', (select count(distinct customer_id) from current_jobs
        where status in ('completed','settled') and customer_id is not null),
      'recurrent', (select count(*) from (
        select customer_id from valid_jobs
        where status = 'settled' and customer_id is not null and created_at < t_until
        group by customer_id having count(*) >= 2
      ) recurring)
    ) else null end,
    'rides', case when can_marketplace then jsonb_build_object(
      'requested', (select count(*) from current_jobs),
      'completed', (select count(*) from current_jobs where status in ('completed','settled')),
      'settled', (select count(*) from current_jobs where status = 'settled'),
      'cancelled', (select count(*) from current_jobs where status like 'cancelled%'),
      'unassigned', (select count(*) from current_jobs where status = 'published'),
      'previous_completed', (select count(*) from previous_jobs where status in ('completed','settled'))
    ) else null end,
    'finance', case when can_payments then jsonb_build_object(
      'cup', (select coalesce(sum(final_price),0) from current_jobs where status='settled' and currency='CUP'),
      'usd', (select coalesce(sum(final_price),0) from current_jobs where status='settled' and currency='USD'),
      'eur', (select coalesce(sum(final_price),0) from current_jobs where status='settled' and currency='EUR'),
      'other', (select count(*) from current_jobs where status='settled' and currency not in ('CUP','USD','EUR'))
    ) else null end,
    'operation', case when can_marketplace then jsonb_build_object(
      'profiles_total', (select count(*) from public.driver_profiles d where d.project_id = target_project_id),
      'profiles_active', (select count(*) from public.driver_profiles d
        where d.project_id = target_project_id and d.status = 'active' and d.suspended_at is null),
      'incidents_open', (select count(*) from valid_jobs j where j.status='incident'),
      'topups_pending', case when can_payments then
        (select count(*) from public.topups t where t.project_id=target_project_id and t.status='requested')
        else null end
    ) else null end
  ) into payload;
  return payload;
end;
$$;

revoke all on function public.admin_get_agency_vitality_v1(uuid,date,date)
  from public, anon, authenticated;
grant execute on function public.admin_get_agency_vitality_v1(uuid,date,date) to authenticated;
