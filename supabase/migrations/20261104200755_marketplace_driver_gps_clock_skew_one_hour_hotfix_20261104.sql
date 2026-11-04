-- TUKTUK: hotfix GPS aplicado en produccion el 2026-11-04.
-- Version registrado en Supabase: 20261104200755.
-- Corrige exclusivamente desfases horarios proximos a +/- 1h.
-- Mantiene las validaciones originales de autenticacion y antiguedad.

do $migration$
declare
  location_rpc regprocedure := to_regprocedure(
    'public.update_my_marketplace_driver_location(text,numeric,numeric,numeric,numeric,numeric,timestamptz)'
  );
  definition text;
  anchor text := $old_guard$
  if captured > now() + interval '5 minutes'
     or captured < now() - interval '10 minutes' then
    raise exception 'DRIVER_LOCATION_TIMESTAMP_INVALID'
      using errcode = '22023';
  end if;
$old_guard$;
  replacement text := $new_guard$
  -- TUKTUK_GPS_CLOCK_SKEW_1H_FIX_20261104:
  -- Solo desplazar +/- 3600 segundos, con margen de 120 segundos.
  -- El resto de las validaciones de tiempo siguen siendo obligatorias.
  if (captured > now() + interval '5 minutes'
      or captured < now() - interval '10 minutes')
     and abs(abs(extract(epoch from (captured - now()))) - 3600) <= 120 then
    captured := captured + case
      when captured > now() then interval '-1 hour'
      else interval '1 hour'
    end;
  end if;

  if captured > now() + interval '5 minutes'
     or captured < now() - interval '10 minutes' then
    raise exception 'DRIVER_LOCATION_TIMESTAMP_INVALID'
      using errcode = '22023';
  end if;
$new_guard$;
begin
  if location_rpc is null then
    raise exception 'TUKTUK_GPS_HOTFIX_ABORT: location RPC absent';
  end if;

  definition := pg_get_functiondef(location_rpc::oid);

  if position('TUKTUK_GPS_CLOCK_SKEW_1H_FIX_20261104' in definition) = 0 then
    if length(definition) - length(replace(definition, anchor, '')) <> length(anchor) then
      raise exception 'TUKTUK_GPS_HOTFIX_ABORT: unexpected function body';
    end if;

    if position('DRIVER_LOCATION_NOT_ALLOWED' in definition) = 0
       or position('AUTHENTICATION_REQUIRED' in definition) = 0 then
      raise exception 'TUKTUK_GPS_HOTFIX_ABORT: lost authorization checks';
    end if;

    execute replace(definition, anchor, replacement);
  end if;

  definition := pg_get_functiondef(location_rpc::oid);

  if position('TUKTUK_GPS_CLOCK_SKEW_1H_FIX_20261104' in definition) = 0
     or position('DRIVER_LOCATION_TIMESTAMP_INVALID' in definition) = 0 then
    raise exception 'TUKTUK_GPS_HOTFIX_ABORT: patch not installed';
  end if;

  if not has_function_privilege('authenticated', location_rpc, 'EXECUTE')
     or has_function_privilege('anon', location_rpc, 'EXECUTE') then
    raise exception 'TUKTUK_GPS_HOTFIX_ABORT: permission contract changed';
  end if;
end;
$migration$;
