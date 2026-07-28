create index if not exists licenses_created_by_idx
  on public.licenses(created_by);
create index if not exists licenses_license_type_idx
  on public.licenses(license_type);
create index if not exists licenses_plan_idx
  on public.licenses(plan);
create index if not exists license_audit_log_license_project_idx
  on public.license_audit_log(license_id, project_id);
create index if not exists payments_license_project_user_idx
  on public.payments(license_id, project_id, user_id);

drop policy "Users can view their license devices"
  on public.license_devices;
drop policy "Project members can view license devices"
  on public.license_devices;

create policy "Authorized users can view license devices"
on public.license_devices for select
to authenticated
using (
  exists (
    select 1
    from public.licenses
    where licenses.id = license_devices.license_id
      and (
        licenses.user_id = (select auth.uid())
        or app_private.can_access_project(licenses.project_id)
      )
  )
);
