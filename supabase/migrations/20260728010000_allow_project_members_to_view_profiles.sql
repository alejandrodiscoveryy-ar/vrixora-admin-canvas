create policy "Project members can view fellow member profiles"
on public.profiles for select
to authenticated
using (
  exists (
    select 1
    from public.project_members
    where project_members.user_id = profiles.id
      and app_private.can_access_project(project_members.project_id)
  )
);
