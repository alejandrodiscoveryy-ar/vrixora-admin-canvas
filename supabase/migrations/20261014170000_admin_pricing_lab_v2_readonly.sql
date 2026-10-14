-- Laboratorio Precios V2: acceso administrativo de solo lectura.
-- Requiere marketplace.view y conserva cerrada la funcion publica v2.
create or replace function public.admin_preview_marketplace_quote_lab_v2(
  target_service_code text,
  target_vehicle_category_code text,
  target_passenger_count integer,
  target_distance_km numeric,
  target_stop_count integer,
  target_scheduled_for timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  select id into v_project_id from public.projects where slug = 'tuktuk-control';
  if v_project_id is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform app_private.require_project_permission(v_project_id, 'marketplace.view');
  return public.preview_marketplace_customer_quote_v2(
    target_service_code, target_vehicle_category_code, target_passenger_count,
    target_distance_km, target_stop_count, target_scheduled_for
  );
end;
$$;
revoke all on function public.admin_preview_marketplace_quote_lab_v2(
  text, text, integer, numeric, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_preview_marketplace_quote_lab_v2(
  text, text, integer, numeric, integer, timestamptz
) to authenticated;
