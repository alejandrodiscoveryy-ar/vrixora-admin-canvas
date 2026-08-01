revoke all on function public.admin_add_project_member_by_email(uuid, text)
  from public, anon, authenticated;

drop function public.admin_list_audit_events(uuid, integer);

create function public.admin_list_audit_events(
  target_project_id uuid,
  target_limit integer default 100
)
returns table (
  id bigint,
  actor_id uuid,
  actor_email text,
  action text,
  entity_type text,
  entity_id text,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'audit.view');
  return query
  select
    event.id,
    event.actor_id,
    profile.email,
    event.action,
    event.entity_type,
    event.entity_id,
    event.metadata,
    event.ip_address,
    event.user_agent,
    event.created_at
  from public.audit_events event
  left join public.profiles profile on profile.id = event.actor_id
  where event.project_id = target_project_id
  order by event.created_at desc
  limit least(greatest(coalesce(target_limit, 100), 1), 500);
end;
$$;

revoke all on function public.admin_list_audit_events(uuid, integer)
  from public, anon;
grant execute on function public.admin_list_audit_events(uuid, integer)
  to authenticated;
