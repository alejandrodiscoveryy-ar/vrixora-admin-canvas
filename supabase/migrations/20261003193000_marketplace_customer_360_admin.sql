-- TUKTUK Marketplace - Customer 360 admin read model.
-- Source only in this stage. Applying this migration requires explicit approval.

create or replace function public.admin_get_marketplace_customer_360(
  target_project_id uuid,
  target_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  perform app_private.require_project_permission(target_project_id, 'customers.view');

  if not exists (
    select 1
    from public.customers c
    where c.project_id = target_project_id
      and c.id = target_customer_id
  ) then
    raise exception 'MARKETPLACE_CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  with customer_jobs as (
    select
      j.id,
      j.status,
      j.service_code,
      coalesce(sr.vehicle_category_code, j.pricing_vehicle_category_code) as vehicle_category_code,
      j.final_price,
      j.currency,
      j.created_at,
      j.updated_at,
      case
        when (j.pricing_breakdown ->> 'distance_km') ~ '^[0-9]+([.][0-9]+)?$'
          then (j.pricing_breakdown ->> 'distance_km')::numeric
        else null
      end as distance_km
    from public.service_requests sr
    join public.jobs j
      on j.project_id = sr.project_id
     and j.service_request_id = sr.id
    where sr.project_id = target_project_id
      and sr.customer_id = target_customer_id
      and coalesce(j.is_test, false) = false
      and j.test_deleted_at is null
  ),
  request_summary as (
    select count(*)::bigint as requests_total
    from public.service_requests sr
    left join public.jobs j
      on j.project_id = sr.project_id
     and j.service_request_id = sr.id
    where sr.project_id = target_project_id
      and sr.customer_id = target_customer_id
      and (
        j.id is null
        or (
          coalesce(j.is_test, false) = false
          and j.test_deleted_at is null
        )
      )
  ),
  summary as (
    select
      count(*) filter (where status in ('completed', 'settled'))::bigint as trips_completed,
      count(*) filter (
        where status in ('cancelled_by_customer', 'cancelled_by_driver')
      )::bigint as cancellations,
      coalesce(sum(distance_km) filter (
        where status in ('completed', 'settled')
      ), 0)::numeric as distance_km,
      coalesce(sum(final_price) filter (
        where status in ('completed', 'settled')
      ), 0)::numeric as total_spent,
      coalesce(avg(final_price) filter (
        where status in ('completed', 'settled')
      ), 0)::numeric as average_ticket,
      max(updated_at) filter (
        where status in ('completed', 'settled')
      ) as last_service_at
    from customer_jobs
  ),
  modality_rows as (
    select
      service_code,
      vehicle_category_code,
      count(*)::bigint as trips_completed,
      coalesce(sum(distance_km), 0)::numeric as distance_km,
      coalesce(sum(final_price), 0)::numeric as total_spent
    from customer_jobs
    where status in ('completed', 'settled')
    group by service_code, vehicle_category_code
  ),
  modalities as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'service_code', service_code,
          'vehicle_category_code', vehicle_category_code,
          'trips_completed', trips_completed,
          'distance_km', distance_km,
          'total_spent', total_spent
        )
        order by trips_completed desc, service_code, vehicle_category_code
      ),
      '[]'::jsonb
    ) as value
    from modality_rows
  ),
  ratings as (
    select
      count(*)::bigint as given_count,
      round(coalesce(avg(r.stars), 0)::numeric, 2) as average_given
    from public.marketplace_customer_ratings r
    join public.jobs j
      on j.project_id = r.project_id
     and j.id = r.job_id
    where r.project_id = target_project_id
      and r.customer_id = target_customer_id
      and coalesce(j.is_test, false) = false
      and j.test_deleted_at is null
  )
  select jsonb_build_object(
    'customer', jsonb_build_object(
      'id', c.id,
      'display_name', c.display_name,
      'whatsapp_phone', c.whatsapp_phone,
      'email', c.email,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    ),
    'summary', jsonb_build_object(
      'requests_total', rs.requests_total,
      'trips_completed', s.trips_completed,
      'cancellations', s.cancellations,
      'distance_km', s.distance_km,
      'total_spent', s.total_spent,
      'currency', 'CUP',
      'average_ticket', s.average_ticket,
      'last_service_at', s.last_service_at
    ),
    'ratings', jsonb_build_object(
      'given_count', r.given_count,
      'average_given', r.average_given
    ),
    'modalities', m.value
  )
  into result
  from public.customers c
  cross join request_summary rs
  cross join summary s
  cross join modalities m
  cross join ratings r
  where c.project_id = target_project_id
    and c.id = target_customer_id;

  return result;
end;
$$;

create or replace function public.admin_list_marketplace_customer_history(
  target_project_id uuid,
  target_customer_id uuid,
  target_limit integer default 25,
  target_before_created_at timestamptz default null,
  target_before_job_id uuid default null
)
returns table(
  job_id uuid,
  service_code text,
  vehicle_category_code text,
  status text,
  origin_text text,
  destination_text text,
  scheduled_for timestamptz,
  final_price numeric,
  currency text,
  distance_km numeric,
  driver_user_id uuid,
  driver_display_name text,
  rating_stars smallint,
  rating_comment text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  perform app_private.require_project_permission(target_project_id, 'customers.view');

  if (target_before_created_at is null) <> (target_before_job_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.customers c
    where c.project_id = target_project_id
      and c.id = target_customer_id
  ) then
    raise exception 'MARKETPLACE_CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  select
    j.id,
    j.service_code,
    coalesce(sr.vehicle_category_code, j.pricing_vehicle_category_code),
    j.status,
    sr.origin_text,
    sr.destination_text,
    sr.scheduled_for,
    j.final_price,
    j.currency,
    case
      when (j.pricing_breakdown ->> 'distance_km') ~ '^[0-9]+([.][0-9]+)?$'
        then (j.pricing_breakdown ->> 'distance_km')::numeric
      else null
    end,
    j.assigned_driver_user_id,
    p.display_name,
    rating.stars,
    rating.comment,
    j.created_at,
    j.updated_at
  from public.service_requests sr
  join public.jobs j
    on j.project_id = sr.project_id
   and j.service_request_id = sr.id
  left join public.profiles p
    on p.id = j.assigned_driver_user_id
  left join public.marketplace_customer_ratings rating
    on rating.project_id = j.project_id
   and rating.job_id = j.id
  where sr.project_id = target_project_id
    and sr.customer_id = target_customer_id
    and coalesce(j.is_test, false) = false
    and j.test_deleted_at is null
    and (
      target_before_created_at is null
      or (j.created_at, j.id) < (target_before_created_at, target_before_job_id)
    )
  order by j.created_at desc, j.id desc
  limit least(greatest(coalesce(target_limit, 25), 1), 100);
end;
$$;

revoke all on function public.admin_get_marketplace_customer_360(uuid, uuid)
  from public, anon;
revoke all on function public.admin_list_marketplace_customer_history(
  uuid, uuid, integer, timestamptz, uuid
) from public, anon;

grant execute on function public.admin_get_marketplace_customer_360(uuid, uuid)
  to authenticated;
grant execute on function public.admin_list_marketplace_customer_history(
  uuid, uuid, integer, timestamptz, uuid
) to authenticated;