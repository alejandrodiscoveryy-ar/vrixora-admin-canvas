-- Conductor 360 V2: expediente de solo lectura, paginado y aislado por proyecto.
-- No elimina, modifica ni restaura registros históricos.
create or replace function public.admin_get_marketplace_driver_record(
  target_project_id uuid,
  target_driver_user_id uuid,
  target_limit integer default 10,
  target_before_created_at timestamptz default null,
  target_before_job_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(target_limit, 10), 1), 25);
  v_customers boolean;
  v_summary jsonb;
  v_jobs jsonb;
  v_count integer;
  v_last_at timestamptz;
  v_last_id uuid;
  v_rating_count integer;
  v_rating_average numeric;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');

  if (target_before_created_at is null) <> (target_before_job_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.driver_profiles d
    where d.project_id = target_project_id and d.user_id = target_driver_user_id
  ) then
    raise exception 'MARKETPLACE_DRIVER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_customers := app_private.has_project_permission(target_project_id, 'customers.view');

  -- No contar carreras de prueba ni carreras de prueba eliminadas como récord real.
  select jsonb_build_object(
    'services', count(*) filter (where not j.is_test),
    'completed', count(*) filter (where not j.is_test and j.status in ('completed', 'settled')),
    'active', count(*) filter (where not j.is_test and j.status in ('accepted', 'en_route', 'pickup', 'in_progress')),
    'incidents', count(*) filter (where not j.is_test and j.status = 'incident'),
    'cancelled', count(*) filter (where not j.is_test and j.status in ('cancelled', 'cancelled_by_customer', 'cancelled_by_driver')),
    'test_services', count(*) filter (where j.is_test)
  ) into v_summary
  from public.jobs j
  where j.project_id = target_project_id
    and j.assigned_driver_user_id = target_driver_user_id
    and j.test_deleted_at is null;

  select count(*), round(avg(r.stars)::numeric, 2)
    into v_rating_count, v_rating_average
  from public.marketplace_driver_customer_ratings r
  join public.jobs j on j.project_id = r.project_id and j.id = r.job_id
  where r.project_id = target_project_id
    and r.driver_user_id = target_driver_user_id
    and j.assigned_driver_user_id = target_driver_user_id
    and j.test_deleted_at is null
    and not j.is_test;

  v_summary := v_summary || jsonb_build_object(
    'rating_count', v_rating_count,
    'rating_average', v_rating_average
  );

  with recent as (
    select j.id, j.created_at, j.status, j.service_code, j.final_price,
      j.currency, j.is_test,
      case when v_customers then sr.origin_text else null end as origin_text,
      case when v_customers then sr.destination_text else null end as destination_text,
      (select r.stars
       from public.marketplace_driver_customer_ratings r
       where r.project_id = j.project_id
         and r.job_id = j.id
         and r.driver_user_id = target_driver_user_id
       order by r.created_at desc, r.id desc limit 1) as rating_stars
    from public.jobs j
    join public.service_requests sr
      on sr.project_id = j.project_id and sr.id = j.service_request_id
    where j.project_id = target_project_id
      and j.assigned_driver_user_id = target_driver_user_id
      and j.test_deleted_at is null
      and (target_before_created_at is null or
           (j.created_at, j.id) < (target_before_created_at, target_before_job_id))
    order by j.created_at desc, j.id desc
    limit v_limit + 1
  ), numbered as (
    select recent.*, row_number() over(order by created_at desc, id desc) as rn
    from recent
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'job_id', id, 'created_at', created_at, 'status', status,
      'service_code', service_code, 'final_price', final_price,
      'currency', currency, 'is_test', is_test,
      'origin_text', origin_text, 'destination_text', destination_text,
      'rating_stars', rating_stars
    ) order by created_at desc, id desc) filter (where rn <= v_limit), '[]'::jsonb),
    max(created_at) filter (where rn = v_limit),
    (max(id::text) filter (where rn = v_limit))::uuid
  into v_count, v_jobs, v_last_at, v_last_id
  from numbered;

  return jsonb_build_object(
    'summary', v_summary,
    'items', v_jobs,
    'next_cursor', case when v_count > v_limit then
      jsonb_build_object('at', v_last_at, 'id', v_last_id)
      else null end
  );
end;
$function$;

revoke all on function public.admin_get_marketplace_driver_record(uuid,uuid,integer,timestamptz,uuid) from public, anon;
grant execute on function public.admin_get_marketplace_driver_record(uuid,uuid,integer,timestamptz,uuid) to authenticated;