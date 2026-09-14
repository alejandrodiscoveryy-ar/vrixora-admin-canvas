-- TukTuk Marketplace V1, Block 3: effective Control write entitlement.
-- This recognizes an already-active Marketplace suite; it does not activate drivers.

create or replace function app_private.has_active_marketplace_suite(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null
    and exists (
      select 1
      from public.driver_profiles driver_profile
      join public.projects project on project.id = driver_profile.project_id
      where project.slug = 'tuktuk-control'
        and driver_profile.user_id = target_user_id
        and driver_profile.status = 'active'
        and driver_profile.activated_at is not null
        and driver_profile.suspended_at is null
    );
$$;

create or replace function app_private.has_control_write_entitlement(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app_private.has_active_write_license(target_user_id), false)
    or coalesce(app_private.has_active_marketplace_suite(target_user_id), false);
$$;

create or replace function app_private.current_user_has_control_write_entitlement()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    else app_private.has_control_write_entitlement(auth.uid())
  end;
$$;

revoke all on function app_private.has_active_marketplace_suite(uuid)
  from public, anon, authenticated;
revoke all on function app_private.has_control_write_entitlement(uuid)
  from public, anon, authenticated;
revoke all on function app_private.current_user_has_control_write_entitlement()
  from public, anon;
grant execute on function app_private.current_user_has_control_write_entitlement() to authenticated;

alter policy "Active users insert their synchronized data"
on public.sync_entities
with check (
  (select auth.uid()) = user_id
  and app_private.current_user_has_control_write_entitlement()
);

alter policy "Active users update their synchronized data"
on public.sync_entities
using (
  (select auth.uid()) = user_id
  and app_private.current_user_has_control_write_entitlement()
)
with check (
  (select auth.uid()) = user_id
  and app_private.current_user_has_control_write_entitlement()
);

alter policy "Active users delete their synchronized data"
on public.sync_entities
using (
  (select auth.uid()) = user_id
  and app_private.current_user_has_control_write_entitlement()
);
