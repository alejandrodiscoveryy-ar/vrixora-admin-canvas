-- Bulk client adoption summary for the Admin Clientes list.
-- Uses the same authoritative adoption calculation as Cliente 360.

create or replace function public.admin_list_client_adoption(
  target_project_id uuid
)
returns table(
  user_id uuid,
  score integer,
  level text,
  usage_profile text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(
    target_project_id,
    'customers.view'
  );

  return query
  with clients as (
    select scoped_license.user_id
    from public.licenses scoped_license
    where scoped_license.project_id = target_project_id

    union

    select scoped_payment.user_id
    from public.payments scoped_payment
    where scoped_payment.project_id = target_project_id

    union

    select scoped_lead.user_id
    from public.commercial_leads scoped_lead
    where scoped_lead.project_id = target_project_id
      and scoped_lead.user_id is not null
      and scoped_lead.archived_at is null
  )
  select
    client.user_id,
    coalesce((adoption.data ->> 'score')::integer, 0) as score,
    coalesce(adoption.data ->> 'level', 'Sin actividad') as level,
    coalesce(adoption.data ->> 'usage_profile', 'Sin actividad') as usage_profile
  from clients client
  cross join lateral (
    select public.admin_get_client_adoption(
      target_project_id,
      client.user_id
    ) as data
  ) adoption;
end;
$$;

revoke all
on function public.admin_list_client_adoption(uuid)
from public, anon;

grant execute
on function public.admin_list_client_adoption(uuid)
to authenticated;
