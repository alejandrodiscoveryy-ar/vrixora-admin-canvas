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

  if position($anchor$
      'active_jobs',
      (select count(*) from active_jobs)
$anchor$ in ddl) = 0 then
    raise exception 'operational map summary anchor not found';
  end if;

  ddl := replace(
    ddl,
    $anchor$
      'active_jobs',
      (select count(*) from active_jobs)
$anchor$,
    $replacement$
      'inactive_drivers',
      greatest(
        0::bigint,
        (
          select count(distinct a.driver_user_id)
          from public.driver_vehicle_assignments a
          join public.driver_profiles d
            on d.project_id = a.project_id
           and d.user_id = a.driver_user_id
          join public.vehicles v
            on v.project_id = a.project_id
           and v.id = a.vehicle_id
          where a.project_id = target_project_id
            and a.is_active
            and d.status = 'active'
            and d.activated_at is not null
            and d.suspended_at is null
            and v.marketplace_status = 'active'
            and v.deleted_at is null
        ) - (select count(*) from drivers)
      ),
      'active_jobs',
      (select count(*) from active_jobs)
$replacement$
  );

  execute ddl;
end;
$migration$;
