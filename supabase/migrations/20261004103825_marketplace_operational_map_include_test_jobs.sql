do $$
declare
  fn_oid oid;
  ddl text;
  needle text := '      and coalesce(j.is_test, false) = false';
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

  if position(needle in ddl) = 0 then
    raise exception 'expected test-job filter not found';
  end if;

  ddl := replace(ddl, needle || E'\n', '');
  execute ddl;
end
$$;