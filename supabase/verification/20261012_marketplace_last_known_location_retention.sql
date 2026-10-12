-- Ejecutar despues de la migracion, en una consulta de solo lectura.
select
  p.proname,
  position('delete from public.marketplace_driver_locations' in pg_get_functiondef(p.oid)) = 0
    as without_auto_purge,
  case when p.proname = 'admin_get_marketplace_operational_map'
    then position('last_latitude' in pg_get_functiondef(p.oid)) > 0
     and position('last_longitude' in pg_get_functiondef(p.oid)) > 0
    else true end as has_last_location_fallback
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_get_marketplace_operational_map',
    'update_my_marketplace_driver_location'
  );
