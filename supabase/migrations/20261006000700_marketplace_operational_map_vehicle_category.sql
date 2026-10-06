do $migration$
declare
  fn_oid oid;
  ddl text;
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

  if position('v.name as vehicle_name,' in ddl) = 0 then
    raise exception 'vehicle name anchor not found';
  end if;

  ddl := replace(
    ddl,
    '      v.name as vehicle_name,' || E'\n' ||
    '      active_job.job_id,',
    '      v.name as vehicle_name,' || E'\n' ||
    '      v.category_code as vehicle_category_code,' || E'\n' ||
    '      active_job.job_id,'
  );

  ddl := replace(
    ddl,
    '      a.vehicle_name,' || E'\n' ||
    '      a.accepting_jobs,',
    '      a.vehicle_name,' || E'\n' ||
    '      a.vehicle_category_code,' || E'\n' ||
    '      a.accepting_jobs,'
  );

  ddl := replace(
    ddl,
    '      v.name as vehicle_name,' || E'\n' ||
    '      j.created_at,',
    '      v.name as vehicle_name,' || E'\n' ||
    '      v.category_code as vehicle_category_code,' || E'\n' ||
    '      j.created_at,'
  );

  ddl := replace(
    ddl,
    '          ''vehicle_name'', d.vehicle_name,' || E'\n' ||
    '          ''accepting_jobs'', d.accepting_jobs,',
    '          ''vehicle_name'', d.vehicle_name,' || E'\n' ||
    '          ''vehicle_category_code'', d.vehicle_category_code,' || E'\n' ||
    '          ''accepting_jobs'', d.accepting_jobs,'
  );

  ddl := replace(
    ddl,
    '          ''vehicle_name'', j.vehicle_name,' || E'\n' ||
    '          ''created_at'', j.created_at,',
    '          ''vehicle_name'', j.vehicle_name,' || E'\n' ||
    '          ''vehicle_category_code'', j.vehicle_category_code,' || E'\n' ||
    '          ''created_at'', j.created_at,'
  );

  execute ddl;
end;
$migration$;
