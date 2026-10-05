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
      case
        when sr.details #>> '{route_destination,lon}'
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{route_destination,lon}')::numeric
      end as destination_lon,
      case
        when can_customers then c.display_name
      end as customer_display_name,
$needle$;

  select_replacement := $replacement$
      case
        when sr.details #>> '{route_destination,lon}'
          ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{route_destination,lon}')::numeric
      end as destination_lon,
      case
        when sr.details #>> '{estimated_distance_km}'
          ~ '^[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{estimated_distance_km}')::numeric
      end as estimated_distance_km,
      case
        when sr.details #>> '{route_duration_seconds}'
          ~ '^[0-9]+(\.[0-9]+)?$'
        then (sr.details #>> '{route_duration_seconds}')::numeric
      end as route_duration_seconds,
      case
        when can_customers then c.display_name
      end as customer_display_name,
$replacement$;

  json_needle := $needle$
          'destination_lon', j.destination_lon,
          'customer_display_name', j.customer_display_name,
$needle$;

  json_replacement := $replacement$
          'destination_lon', j.destination_lon,
          'estimated_distance_km', j.estimated_distance_km,
          'route_duration_seconds', j.route_duration_seconds,
          'customer_display_name', j.customer_display_name,
$replacement$;

  if position(select_needle in ddl) = 0 then
    raise exception 'operational map route metric select insertion point not found';
  end if;

  if position(json_needle in ddl) = 0 then
    raise exception 'operational map route metric json insertion point not found';
  end if;

  ddl := replace(ddl, select_needle, select_replacement);
  ddl := replace(ddl, json_needle, json_replacement);
  execute ddl;
end
$$;