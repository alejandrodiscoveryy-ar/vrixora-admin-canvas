drop policy if exists "Project members can create license audit logs"
  on public.license_audit_log;

revoke insert, update, delete on public.license_audit_log
  from authenticated;
