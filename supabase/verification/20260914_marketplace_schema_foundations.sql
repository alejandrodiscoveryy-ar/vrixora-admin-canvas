-- Block 1 verification. Run locally after migrations; this script performs no writes.
begin;

do $$
declare
  table_name text;
  role_name text;
  privilege_name text;
  expected_tables text[] := array[
    'vehicle_categories', 'propulsion_types', 'service_types', 'media_assets',
    'driver_profiles', 'vehicles', 'driver_vehicle_assignments', 'vehicle_services'
  ];
  expected_codes text[];
begin
  foreach table_name in array expected_tables loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'TEST_FAILED: missing table public.%', table_name;
    end if;
    if not exists (
      select 1 from pg_class class
      join pg_namespace namespace on namespace.oid = class.relnamespace
      where namespace.nspname = 'public' and class.relname = table_name and class.relrowsecurity
    ) then
      raise exception 'TEST_FAILED: RLS is not enabled on public.%', table_name;
    end if;
    foreach role_name in array array['anon', 'authenticated'] loop
      foreach privilege_name in array array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ] loop
        if has_table_privilege(role_name, 'public.' || table_name, privilege_name) then
          raise exception 'TEST_FAILED: direct % privilege % exists on public.%',
            role_name, privilege_name, table_name;
        end if;
      end loop;
    end loop;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles'
      and column_name = 'id' and data_type = 'text'
  ) then
    raise exception 'TEST_FAILED: vehicles.id must be text';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_info
    join pg_class class on class.oid = constraint_info.conrelid
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'vehicles'
      and constraint_info.contype = 'p'
      and pg_get_constraintdef(constraint_info.oid) = 'PRIMARY KEY (project_id, id)'
  ) then
    raise exception 'TEST_FAILED: vehicles primary key must be project-scoped (project_id, id)';
  end if;

  foreach table_name in array expected_tables loop
    if not exists (
      select 1 from information_schema.columns column_info
      where column_info.table_schema = 'public'
        and column_info.table_name = table_name
        and column_info.column_name = 'project_id'
    ) then
      raise exception 'TEST_FAILED: public.% lacks project_id', table_name;
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles'
      and column_name in ('category_code', 'propulsion_code', 'brand', 'model',
                          'passenger_capacity', 'cargo_capacity_kg', 'main_photo_asset_id')
      and is_nullable <> 'YES'
  ) then
    raise exception 'TEST_FAILED: Marketplace vehicle fields must preserve legacy NULL compatibility';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'driver_profiles_project_id_photo_asset_id_fkey')
    or not exists (select 1 from pg_constraint where conname = 'vehicles_project_id_category_code_fkey')
    or not exists (select 1 from pg_constraint where conname = 'vehicles_project_id_propulsion_code_fkey')
    or not exists (select 1 from pg_constraint where conname = 'vehicles_project_id_main_photo_asset_id_fkey')
    or not exists (select 1 from pg_constraint where conname = 'driver_vehicle_assignments_project_id_driver_user_id_fkey')
    or not exists (select 1 from pg_constraint where conname = 'driver_vehicle_assignments_project_id_vehicle_id_fkey')
    or not exists (select 1 from pg_constraint where conname = 'vehicle_services_project_id_vehicle_id_fkey')
    or not exists (select 1 from pg_constraint where conname = 'vehicle_services_project_id_service_code_fkey') then
    raise exception 'TEST_FAILED: a project-scoped FK is missing';
  end if;

  if to_regclass('public.jobs') is not null
    or to_regclass('public.job_assignments') is not null
    or to_regclass('public.job_events') is not null
    or to_regclass('public.wallet') is not null
    or to_regclass('public.wallets') is not null
    or to_regclass('public.wallet_transactions') is not null
    or to_regclass('public.topups') is not null
    or to_regclass('public.ledger') is not null
    or to_regclass('public.commission_reservations') is not null
    or to_regclass('public.service_requests') is not null then
    raise exception 'TEST_FAILED: Block 1 must not create jobs or wallet domain tables';
  end if;

  if to_regclass('public.profiles') is null
    or to_regclass('public.licenses') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.audit_events') is null then
    raise exception 'TEST_FAILED: required existing foundation is missing';
  end if;

  if to_regprocedure('app_private.has_active_write_license(uuid)') is null then
    raise exception 'TEST_FAILED: existing has_active_write_license function is missing';
  end if;

  if exists (select 1 from public.projects where slug = 'tuktuk-control') then
    select array_agg(code order by code) into expected_codes
    from public.vehicle_categories category
    join public.projects project on project.id = category.project_id
    where project.slug = 'tuktuk-control';
    if expected_codes is distinct from array['light_car','motorcycle','other','tricycle','truck','van'] then
      raise exception 'TEST_FAILED: vehicle category seed values are not exact';
    end if;

    select array_agg(code order by code) into expected_codes
    from public.propulsion_types propulsion
    join public.projects project on project.id = propulsion.project_id
    where project.slug = 'tuktuk-control';
    if expected_codes is distinct from array['combustion','electric','hybrid'] then
      raise exception 'TEST_FAILED: propulsion seed values are not exact';
    end if;

    select array_agg(code order by code) into expected_codes
    from public.service_types service
    join public.projects project on project.id = service.project_id
    where project.slug = 'tuktuk-control';
    if expected_codes is distinct from array['cargo','courier','passenger','tourism'] then
      raise exception 'TEST_FAILED: service seed values are not exact';
    end if;
  end if;
end;
$$;

rollback;
