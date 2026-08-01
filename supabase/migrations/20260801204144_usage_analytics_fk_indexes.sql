-- Cover foreign-key lookups used by deletes and user-scoped RLS checks.
create index analytics_events_user_id_idx
  on public.analytics_events(user_id);

create index analytics_events_license_id_idx
  on public.analytics_events(license_id)
  where license_id is not null;

create index user_attribution_user_id_idx
  on public.user_attribution(user_id);
