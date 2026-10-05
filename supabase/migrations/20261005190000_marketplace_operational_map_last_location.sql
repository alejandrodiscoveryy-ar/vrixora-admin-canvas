do $$
declare
  fn_oid oid;
  ddl text;
  select_needle text;
  select_replacement text;
  json_needle text;
  json_replacement text;
begin
  select p.oid
    into fn_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_get_marketplace_operational_map'
  limit 1;

  if fn_oid is null then
    raise exception 'admin_get_marketplace_operational_map not found';
  end if;

  ddl := pg_get_functiondef(fn_oid);

  select_needle := $needle$
      case when freshness.location_fresh then l.latitude end as latitude,
      case when freshness.location_fresh then l.longitude end as longitude,
      case when freshness.location_fresh then l.accuracy_m end as accuracy_m,
      case when freshness.location_fresh then l.heading_degrees end as heading_degrees,
      case when freshness.location_fresh then l.speed_mps end as speed_mps,
      l.captured_at,
$needle$;

  select_replacement := $replacement$
      case when freshness.location_fresh then l.latitude end as latitude,
      case when freshness.location_fresh then l.longitude end as longitude,
      l.latitude as last_latitude,
      l.longitude as last_longitude,
      l.accuracy_m as last_accuracy_m,
      case when freshness.location_fresh then l.accuracy_m end as accuracy_m,
      case when freshness.location_fresh then l.heading_degrees end as heading_degrees,
      case when freshness.location_fresh then l.speed_mps end as speed_mps,
      l.captured_at,
$replacement$;

  json_needle := $needle$
          'latitude', d.latitude,
          'longitude', d.longitude,
          'accuracy_m', d.accuracy_m,
$needle$;

  json_replacement := $replacement$
          'latitude', d.latitude,
          'longitude', d.longitude,
          'last_latitude', d.last_latitude,
          'last_longitude', d.last_longitude,
          'last_accuracy_m', d.last_accuracy_m,
          'accuracy_m', d.accuracy_m,
$replacement$;

  if position(select_needle in ddl) = 0 then
    raise exception 'operational map driver last-location select insertion point not found';
  end if;

  if position(json_needle in ddl) = 0 then
    raise exception 'operational map driver last-location json insertion point not found';
  end if;

  ddl := replace(ddl, select_needle, select_replacement);
  ddl := replace(ddl, json_needle, json_replacement);
  execute ddl;
end
$$;
