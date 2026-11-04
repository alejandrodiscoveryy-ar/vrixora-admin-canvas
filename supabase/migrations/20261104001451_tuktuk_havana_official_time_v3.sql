-- TUKTUK Smart Pricing V3 / Entrega 1: tiempo civil oficial de Cuba.
-- Solo corrige la conversion horaria. No cambia tarifas, recargos ni viajes.
-- Cambio confirmado en IANA tzdb 2026f; compatibilidad hasta actualizar tzdb del servidor.
-- La hora normal vuelve previsiblemente el 07-11-2027 a las 01:00 locales (05:00Z).

create or replace function app_private.marketplace_havana_official_time(
  target_at timestamptz,
  timezone_name text
)
returns timestamp without time zone
language sql
stable
set search_path = pg_catalog
as $fn$
  select case
    when timezone_name = 'America/Havana'
     and target_at >= timestamptz '2026-11-01 04:00:00+00'
     and target_at <  timestamptz '2027-11-07 05:00:00+00'
      then target_at at time zone 'Etc/GMT+4'
    else target_at at time zone timezone_name
  end
$fn$;

-- Funcion interna: no exponerla como API publica.
revoke all on function app_private.marketplace_havana_official_time(timestamptz,text)
from public, anon, authenticated;

-- Parche limitado a UNA llamada en el motor existente, sin reescribir las reglas monetarias.
do $patch$
declare
  current_source text;
  replacement_source text;
  needle constant text := 'local_effective := timezone(cfg.timezone,effective_at);';
  replacement constant text := 'local_effective := app_private.marketplace_havana_official_time(effective_at,cfg.timezone);';
begin
  select pg_get_functiondef(
    'app_private.calculate_marketplace_customer_quote_smart_v1(uuid,text,text,integer,timestamptz,jsonb)'::regprocedure
  ) into current_source;

  if current_source is null
     or length(current_source) - length(replace(current_source, needle, '')) <> length(needle)
  then
    raise exception 'TUKTUK_V3_HAVANA_CONTRACT_CHANGED';
  end if;

  replacement_source := replace(current_source, needle, replacement);
  execute replacement_source;
end
$patch$;

-- La migracion falla completa si se produce un desfase en cualquiera de estos casos.
do $verify$
begin
  if app_private.marketplace_havana_official_time('2026-11-01 04:30:00+00','America/Havana')
     <> timestamp '2026-11-01 00:30:00' then
    raise exception 'TUKTUK_V3_CUBA_NOV1_2026_INVALID';
  end if;
  if app_private.marketplace_havana_official_time('2026-11-03 18:00:00+00','America/Havana')
     <> timestamp '2026-11-03 14:00:00' then
    raise exception 'TUKTUK_V3_CUBA_NOV3_2026_INVALID';
  end if;
  if app_private.marketplace_havana_official_time('2027-04-01 04:00:00+00','America/Havana')
     <> timestamp '2027-04-01 00:00:00' then
    raise exception 'TUKTUK_V3_CUBA_APR2027_INVALID';
  end if;
  if app_private.marketplace_havana_official_time('2027-11-07 08:00:00+00','America/Havana')
     <> timestamp '2027-11-07 03:00:00' then
    raise exception 'TUKTUK_V3_CUBA_NOV2027_INVALID';
  end if;
end
$verify$;
