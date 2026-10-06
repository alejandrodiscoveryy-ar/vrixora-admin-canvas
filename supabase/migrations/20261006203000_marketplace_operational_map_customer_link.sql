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
        when can_customers then c.display_name
      end as customer_display_name,
$needle$;

  select_replacement := $replacement$
      case
        when can_customers then c.id
      end as customer_id,
      case
        when can_customers then c.display_name
      end as customer_display_name,
$replacement$;

  json_needle := $needle$
          'route_duration_seconds', j.route_duration_seconds,
          'customer_display_name', j.customer_display_name,
$needle$;

  json_replacement := $replacement$
          'route_duration_seconds', j.route_duration_seconds,
          'customer_id', j.customer_id,
          'customer_display_name', j.customer_display_name,
$replacement$;

  if position(select_needle in ddl) = 0 then
    raise exception 'operational map customer select anchor not found';
  end if;

  if position(json_needle in ddl) = 0 then
    raise exception 'operational map customer json anchor not found';
  end if;

  ddl := replace(ddl, select_needle, select_replacement);
  ddl := replace(ddl, json_needle, json_replacement);

  execute ddl;
end
$$;

notify pgrst, 'reload schema';