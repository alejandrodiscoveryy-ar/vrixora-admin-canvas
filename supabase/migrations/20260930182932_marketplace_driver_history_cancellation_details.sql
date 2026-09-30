create or replace function public.list_my_marketplace_job_cancellations(
  target_job_ids uuid[]
)
returns table(
  job_id uuid,
  cancelled_by text,
  cancellation_reason text,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  pid uuid;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  if target_job_ids is null or cardinality(target_job_ids) = 0 then
    return;
  end if;

  if cardinality(target_job_ids) > 100 then
    raise exception 'TOO_MANY_JOB_IDS'
      using errcode = '22023';
  end if;

  select id
    into pid
  from public.projects
  where slug = 'tuktuk-control';

  return query
  select distinct on (e.job_id)
    e.job_id,
    case
      when e.action = 'cancel_by_driver' then 'driver'
      when e.action = 'cancel_by_customer' then 'customer'
      else e.actor_kind
    end as cancelled_by,
    e.reason as cancellation_reason,
    e.created_at as cancelled_at
  from public.job_events e
  join public.jobs j
    on j.project_id = e.project_id
   and j.id = e.job_id
  join public.job_assignments a
    on a.project_id = j.project_id
   and a.job_id = j.id
   and a.driver_user_id = actor
  where e.project_id = pid
    and j.assigned_driver_user_id = actor
    and e.job_id = any(target_job_ids)
    and e.action in ('cancel_by_driver', 'cancel_by_customer')
  order by e.job_id, e.created_at desc, e.id desc;
end;
$function$;

revoke all
on function public.list_my_marketplace_job_cancellations(uuid[])
from public;

revoke all
on function public.list_my_marketplace_job_cancellations(uuid[])
from anon;

grant execute
on function public.list_my_marketplace_job_cancellations(uuid[])
to authenticated;

comment on function public.list_my_marketplace_job_cancellations(uuid[])
is 'Returns cancellation actor, reason and timestamp only for the authenticated driver own assigned marketplace jobs.';
