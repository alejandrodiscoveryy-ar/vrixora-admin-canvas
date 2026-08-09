-- P4 production drift repair.
-- The P3 history RPC was corrected after its original migration had already
-- been exercised against production. Re-declare it under a new migration so
-- databases that recorded the earlier timestamp receive the final definition.

create or replace function public.admin_list_commercial_lead_history(
  target_project_id uuid,
  target_lead_id uuid
)
returns table(
  id bigint,
  event_type text,
  previous_value text,
  new_value text,
  note text,
  actor_id uuid,
  actor_name text,
  actor_email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'commercial.view');

  if not exists (
    select 1
    from public.commercial_leads lead
    where lead.id = target_lead_id
      and lead.project_id = target_project_id
      and lead.archived_at is null
  ) then
    raise exception 'LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  select
    history.id,
    history.event_type,
    history.previous_value,
    history.new_value,
    history.note,
    history.actor_id,
    profile.display_name,
    profile.email,
    history.created_at
  from public.commercial_lead_history history
  left join public.profiles profile on profile.id = history.actor_id
  where history.project_id = target_project_id
    and history.lead_id = target_lead_id
  order by history.created_at desc;
end;
$$;

revoke all on function public.admin_list_commercial_lead_history(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_list_commercial_lead_history(uuid, uuid)
  to authenticated;
