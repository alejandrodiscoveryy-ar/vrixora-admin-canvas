-- Read-only pricing preview for the server-side map gateway.
-- Reuses the same pricing engine as request creation.

create function public.preview_marketplace_customer_quote(
  target_service_code text,
  target_passenger_count integer,
  target_cargo_weight_kg numeric,
  target_cargo_volume_m3 numeric,
  target_distance_km numeric,
  target_stop_count integer,
  target_load_help boolean,
  target_unload_help boolean,
  target_urgent boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  project_id uuid;
begin
  if target_distance_km is null
    or target_distance_km <= 0
    or target_distance_km > 5000
    or target_stop_count is null
    or target_stop_count < 0
    or target_stop_count > 20
  then
    raise exception 'ROUTE_QUOTE_INPUT_INVALID' using errcode = '22023';
  end if;

  select id into project_id
  from public.projects
  where slug = 'tuktuk-control';

  if project_id is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return app_private.calculate_marketplace_customer_quote(
    project_id,
    target_service_code,
    target_passenger_count,
    target_cargo_weight_kg,
    target_cargo_volume_m3,
    jsonb_build_object(
      'estimated_distance_km', target_distance_km,
      'distance_source', 'provider',
      'stop_count', target_stop_count,
      'load_help', coalesce(target_load_help, false),
      'unload_help', coalesce(target_unload_help, false),
      'urgent', coalesce(target_urgent, false)
    )
  );
end;
$$;

revoke all on function public.preview_marketplace_customer_quote(
  text, integer, numeric, numeric, numeric, integer, boolean, boolean,
  boolean
) from public, anon, authenticated;

grant execute on function public.preview_marketplace_customer_quote(
  text, integer, numeric, numeric, numeric, integer, boolean, boolean,
  boolean
) to service_role;
