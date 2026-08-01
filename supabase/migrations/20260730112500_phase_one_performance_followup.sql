drop policy if exists "Project members can view license audit logs"
  on public.license_audit_log;

create index licenses_project_plan_idx
  on public.licenses(project_id, plan);
create index project_members_role_idx
  on public.project_members(role);
create index project_role_permissions_permission_idx
  on public.project_role_permissions(permission_code);
create index projects_default_trial_plan_composite_idx
  on public.projects(id, default_trial_plan)
  where default_trial_plan is not null;
