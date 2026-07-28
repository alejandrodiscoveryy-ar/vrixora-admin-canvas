drop policy "Users read their profile" on public.profiles;
drop policy "Project members can view fellow member profiles" on public.profiles;

create policy "Users can view permitted profiles"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.project_members
    where project_members.user_id = profiles.id
      and app_private.can_access_project(project_members.project_id)
  )
);
