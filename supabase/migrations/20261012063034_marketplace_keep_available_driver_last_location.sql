-- Vrixora Admin / TukTuk: conservar la ultima posicion operativa
-- de los conductores que permanecen en Trabajando, aunque deje de ser reciente.
-- No habilita seguimiento en segundo plano ni historicos de recorrido.
-- El mapa distingue ubicacion reciente de ubicacion antigua por captured_at.
-- Las restricciones de acceso, los permisos GPS y la limpieza explicita
-- cuando el conductor activa Descansando siguen vigentes.

do $migration$
declare
  function_oid oid;
  definition text;
  needle text;
  location_rpc regprocedure := to_regprocedure(
    'public.update_my_marketplace_driver_location(text,numeric,numeric,numeric,numeric,numeric,timestamptz)'
  );
  admin_rpc regprocedure := to_regprocedure(
    'public.admin_get_marketplace_operational_map(uuid)'
  );
begin
  if location_rpc is null or admin_rpc is null then
    raise exception 'LAST_LOCATION_ABORT: required operational map functions missing';
  end if;

  -- La captura de un conductor no debe borrar la ultima posicion de los demas.
  function_oid := location_rpc::oid;
  definition := pg_get_functiondef(function_oid);
  needle := E'  delete from public.marketplace_driver_locations l\n  where l.project_id = pid\n    and l.captured_at < now() - interval ''15 minutes'';\n';

  if length(definition) - length(replace(definition, needle, '')) <> length(needle) then
    raise exception 'LAST_LOCATION_ABORT: unexpected update RPC definition';
  end if;

  execute replace(definition, needle, E'  -- El registro guarda una sola posicion por conductor; no purgar por antiguedad.\n');

  -- Consultar el mapa no debe borrar una posicion historica todavia util.
  function_oid := admin_rpc::oid;
  definition := pg_get_functiondef(function_oid);
  needle := E'  delete from public.marketplace_driver_locations l\n  where l.project_id = target_project_id\n    and l.captured_at < now() - interval ''15 minutes'';\n';

  if length(definition) - length(replace(definition, needle, '')) <> length(needle) then
    raise exception 'LAST_LOCATION_ABORT: unexpected admin map RPC definition';
  end if;
  if position('last_latitude' in definition) = 0
     or position('last_longitude' in definition) = 0 then
    raise exception 'LAST_LOCATION_ABORT: admin map lacks last-known-coordinate fields';
  end if;

  execute replace(definition, needle, E'  -- No eliminar ubicaciones antiguas al consultar el mapa.\n');

  -- Defensa: el mapa sigue restringido a usuarios autorizados.
  if not has_function_privilege('authenticated', admin_rpc, 'EXECUTE') then
    raise exception 'LAST_LOCATION_ABORT: expected authorized access is missing';
  end if;
end;
$migration$;
