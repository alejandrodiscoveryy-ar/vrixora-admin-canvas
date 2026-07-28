-- License mutations are an administrative API surface. Authenticated clients may
-- only read their own row; every write must pass through an owner-checked RPC.
drop policy if exists "Project members can view licenses" on public.licenses;
drop policy if exists "Project members can create licenses" on public.licenses;
drop policy if exists "Project members can update licenses" on public.licenses;
drop policy if exists "Project owners can delete licenses" on public.licenses;

drop policy if exists "Users can view their own licenses" on public.licenses;
create policy "Users can view their own licenses"
on public.licenses
for select
to authenticated
using (user_id = (select auth.uid()));

revoke insert (
  project_id,
  user_id,
  license_key,
  license_type,
  plan,
  status,
  duration_days,
  max_devices,
  features,
  notes,
  activated_at,
  expires_at,
  last_validation,
  revoked_at,
  created_by,
  created_at,
  updated_at
) on public.licenses from authenticated;

revoke update (
  project_id,
  user_id,
  license_key,
  license_type,
  plan,
  status,
  duration_days,
  max_devices,
  features,
  notes,
  activated_at,
  expires_at,
  last_validation,
  revoked_at,
  created_by,
  created_at,
  updated_at
) on public.licenses from authenticated;

revoke insert, update, delete on public.licenses from authenticated;
