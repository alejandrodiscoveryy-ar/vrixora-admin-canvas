-- TUKTUK Marketplace
-- Customer cards must use the same real-operation criteria as Customer 360.
-- Test jobs and test-deleted jobs are excluded.

create or replace function public.admin_list_marketplace_customers(
  target_project_id uuid,
  target_limit integer default 100,
  target_before_created_at timestamptz default null,
  target_before_customer_id uuid default null
)
returns table(
  customer_id uuid,
  display_name text,
  whatsapp_phone text,
  created_at timestamptz,
  jobs_total bigint,
  jobs_active bigint,
  jobs_settled bigint,
  last_job_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  perform app_private.require_project_permission(target_project_id, 'customers.view');

  if (target_before_created_at is null) <> (target_before_customer_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR' using errcode = '22023';
  end if;

  return query
  with customer_jobs as (
    select
      c.id as customer_id,
      j.id as job_id,
      j.created_at as job_created_at,
      case
        when j.status = 'incident' and ir.resolution = 'completed' then 'settled'
        when j.status = 'incident' and ir.resolution = 'cancelled' then 'cancelled'
        else j.status
      end as effective_status
    from public.customers c
    left join public.service_requests sr
      on sr.project_id = c.project_id
     and sr.customer_id = c.id
    left join public.jobs j
      on j.project_id = sr.project_id
     and j.service_request_id = sr.id
     and coalesce(j.is_test, false) = false
     and j.test_deleted_at is null
    left join public.marketplace_incident_resolutions ir
      on ir.project_id = j.project_id
     and ir.job_id = j.id
    where c.project_id = target_project_id
  ),
  job_summary as (
    select
      cj.customer_id,
      count(cj.job_id)::bigint as jobs_total,
      count(cj.job_id) filter (
        where cj.effective_status in (
          'accepted',
          'en_route',
          'pickup',
          'in_progress',
          'completed'
        )
      )::bigint as jobs_active,
      count(cj.job_id) filter (
        where cj.effective_status = 'settled'
      )::bigint as jobs_settled,
      max(cj.job_created_at) as last_job_at
    from customer_jobs cj
    group by cj.customer_id
  )
  select
    c.id,
    c.display_name,
    c.whatsapp_phone,
    c.created_at,
    coalesce(js.jobs_total, 0)::bigint,
    coalesce(js.jobs_active, 0)::bigint,
    coalesce(js.jobs_settled, 0)::bigint,
    js.last_job_at
  from public.customers c
  left join job_summary js
    on js.customer_id = c.id
  where c.project_id = target_project_id
    and (
      target_before_created_at is null
      or (c.created_at, c.id) < (target_before_created_at, target_before_customer_id)
    )
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(target_limit, 100), 1), 200);
end;
$$;