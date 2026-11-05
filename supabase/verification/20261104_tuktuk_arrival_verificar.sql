-- Solo lectura: evidencias de instalacion sin datos personales.
select to_regclass('app_private.marketplace_arrival_proximity')
  as tabla_proximidad;
select relrowsecurity as rls_activado from pg_class
  where oid='app_private.marketplace_arrival_proximity'::regclass;
select tgname,tgrelid::regclass::text as tabla,tgenabled
from pg_trigger where tgname in ('marketplace_autopickup_driver_location','admin_marketplace_pickup_event')
order by tgname;

select n.nspname,p.proname,has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='app_private'
  and p.proname in ('marketplace_autopickup_from_driver_location','admin_marketplace_pickup_event');
