-- Reversion limitada al nuevo comportamiento. Ejecutar solo con autorizacion.
drop trigger if exists marketplace_autopickup_driver_location on public.marketplace_driver_locations;
drop trigger if exists admin_marketplace_pickup_event on public.jobs;
drop function if exists app_private.marketplace_autopickup_from_driver_location();
drop function if exists app_private.admin_marketplace_pickup_event();
drop table if exists app_private.marketplace_arrival_proximity;
-- No se borran carreras, ubicaciones ni notificaciones historicas.
