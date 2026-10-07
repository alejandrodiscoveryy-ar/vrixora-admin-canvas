-- TUKTUK Marketplace
-- Customer Directory V2.
-- Search + ranking by real completed distance.
-- Internal ranking rule: 1 completed real km = 1 point.
-- This migration is source-only until explicitly approved for production.

create or replace function public.admin_list_marketplace_customers_v2(
  target_project_id uuid,
  target_search text default null,
  target_sort text default 'points_desc',
  target_limit integer default 25,
  target_before_created_at timestamptz default null,
  target_before_points bigint default null,
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
  last_job_at timestamptz,
  distance_km numeric,
  points bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(target_search), '');
begin
  perform app_private.require_project_permission(
    target_project_id,
    'marketplace.view'
  );

  perform app_private.require_project_permission(
    target_project_id,
    'customers.view'
  );

  if target_sort not in ('recent', 'points_desc') then
    raise exception 'INVALID_CUSTOMER_SORT'
      using errcode = '22023';
  end if;

  if target_sort = 'recent' then
    if
      (target_before_created_at is null)
        <> (target_before_customer_id is null)
      or target_before_points is not null
    then
      raise exception 'INVALID_PAGINATION_CURSOR'
        using errcode = '22023';
    end if;
  else
    if
      (target_before_points is null)
        <> (target_before_customer_id is null)
      or target_before_created_at is not null
    then
      raise exception 'INVALID_PAGINATION_CURSOR'
        using errcode = '22023';
    end if;
  end if;

  return query
  with customer_jobs as (
    select
      c.id as customer_id,
      j.id as job_id,
      j.created_at as job_created_at,
      case
        when j.status = 'incident'
          and ir.resolution = 'completed'
          then 'settled'
        when j.status = 'incident'
          and ir.resolution = 'cancelled'
          then 'cancelled'
        else j.status
      end as effective_status,
      case
        when
          (j.pricing_breakdown ->> 'distance_km')
            ~ '^[0-9]+([.][0-9]+)?$'
        then
          (j.pricing_breakdown ->> 'distance_km')::numeric
        else null
      end as distance_km
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
      max(cj.job_created_at) as last_job_at,
      coalesce(
        sum(cj.distance_km) filter (
          where cj.effective_status in ('completed', 'settled')
        ),
        0
      )::numeric as distance_km
    from customer_jobs cj
    group by cj.customer_id
  ),
  directory as (
    select
      c.id as customer_id,
      c.display_name,
      c.whatsapp_phone,
      c.created_at,
      coalesce(js.jobs_total, 0)::bigint as jobs_total,
      coalesce(js.jobs_active, 0)::bigint as jobs_active,
      coalesce(js.jobs_settled, 0)::bigint as jobs_settled,
      js.last_job_at,
      coalesce(js.distance_km, 0)::numeric as distance_km,
      floor(coalesce(js.distance_km, 0))::bigint as points
    from public.customers c
    left join job_summary js
      on js.customer_id = c.id
    where c.project_id = target_project_id
      and (
        normalized_search is null
        or c.display_name ilike '%' || normalized_search || '%'
        or c.whatsapp_phone ilike '%' || normalized_search || '%'
      )
  )
  select
    d.customer_id,
    d.display_name,
    d.whatsapp_phone,
    d.created_at,
    d.jobs_total,
    d.jobs_active,
    d.jobs_settled,
    d.last_job_at,
    d.distance_km,
    d.points
  from directory d
  where
    (
      target_sort = 'recent'
      and (
        target_before_created_at is null
        or
        (d.created_at, d.customer_id)
          < (target_before_created_at, target_before_customer_id)
      )
    )
    or
    (
      target_sort = 'points_desc'
      and (
        target_before_points is null
        or
        (d.points, d.customer_id)
          < (target_before_points, target_before_customer_id)
      )
    )
  order by
    case
      when target_sort = 'points_desc'
      then d.points
    end desc,
    case
      when target_sort = 'recent'
      then d.created_at
    end desc,
    d.customer_id desc
  limit least(
    greatest(coalesce(target_limit, 25), 1),
    100
  );
end;
$$;

revoke all on function
  public.admin_list_marketplace_customers_v2(
    uuid,
    text,
    text,
    integer,
    timestamptz,
    bigint,
    uuid
  )
from public, anon;

grant execute on function
  public.admin_list_marketplace_customers_v2(
    uuid,
    text,
    text,
    integer,
    timestamptz,
    bigint,
    uuid
  )
to authenticated;