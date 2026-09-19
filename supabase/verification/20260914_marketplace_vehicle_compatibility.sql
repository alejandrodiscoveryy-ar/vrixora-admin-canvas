-- Block 2 verification. Run locally after migrations; all dynamic fixtures are rolled back.
begin;

do $$
declare
  sync_columns text[];
  marketplace_columns text[] := array[
    'category_code', 'propulsion_code', 'category_other_description', 'brand', 'model',
    'year', 'passenger_capacity', 'cargo_capacity_kg', 'cargo_volume_m3', 'body_type',
    'main_photo_asset_id', 'marketplace_status'
  ];
  protected_name text;
  projection_definition text;
  fixture public.sync_entities%rowtype;
  tuktuk_project_id uuid;
  profiles_before bigint;
  assignments_before bigint;
  first_profile_id uuid;
  second_profile_id uuid;
  collision_vehicle_id text;
begin
  if to_regprocedure('app_private.project_legacy_vehicle_from_sync_entity(public.sync_entities)') is null
    or to_regprocedure('app_private.project_legacy_vehicle_sync_entity_trigger()') is null then
    raise exception 'TEST_FAILED: legacy vehicle projection functions are missing';
  end if;

  if has_function_privilege(
       'anon',
       'app_private.project_legacy_vehicle_from_sync_entity(public.sync_entities)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'app_private.project_legacy_vehicle_from_sync_entity(public.sync_entities)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'app_private.project_legacy_vehicle_sync_entity_trigger()',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'app_private.project_legacy_vehicle_sync_entity_trigger()',
       'EXECUTE'
     ) then
    raise exception 'TEST_FAILED: private projection functions are executable by client roles';
  end if;

  if not exists (
    select 1 from pg_trigger trigger_info
    join pg_class relation on relation.oid = trigger_info.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sync_entities'
      and trigger_info.tgname = 'sync_entities_project_legacy_vehicle'
      and not trigger_info.tgisinternal
  ) then
    raise exception 'TEST_FAILED: legacy vehicle sync trigger is missing';
  end if;

  if not exists (
    select 1 from pg_trigger trigger_info
    join pg_class relation on relation.oid = trigger_info.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sync_entities'
      and trigger_info.tgname = 'sync_entities_project_legacy_vehicle'
      and trigger_info.tgqual is not null
      and position('entity_type = ''vehicle''' in pg_get_triggerdef(trigger_info.oid)) > 0
  ) then
    raise exception 'TEST_FAILED: projection trigger is not limited to NEW.entity_type = vehicle';
  end if;

  select pg_get_functiondef('app_private.project_legacy_vehicle_from_sync_entity(public.sync_entities)'::regprocedure)
  into projection_definition;
  foreach protected_name in array marketplace_columns loop
    if position(protected_name in projection_definition) > 0 then
      raise exception 'TEST_FAILED: projection function mentions protected Marketplace field %', protected_name;
    end if;
  end loop;
  if position('vehicle_services' in projection_definition) > 0
    or position('driver_profiles' in projection_definition) > 0
    or position('driver_vehicle_assignments' in projection_definition) > 0 then
    raise exception 'TEST_FAILED: projection function mentions a protected Marketplace relation';
  end if;

  if position(
       'target_vehicle.owner_user_id = excluded.owner_user_id'
       in lower(projection_definition)
     ) = 0 then
    raise exception 'TEST_FAILED: legacy projection lacks the cross-owner reassignment guard';
  end if;

  if not exists (
    select 1 from pg_constraint constraint_info
    join pg_class relation on relation.oid = constraint_info.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'vehicles'
      and constraint_info.contype = 'p'
      and pg_get_constraintdef(constraint_info.oid) = 'PRIMARY KEY (project_id, id)'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles'
      and column_name = 'id' and data_type = 'text'
  ) then
    raise exception 'TEST_FAILED: vehicles legacy text identity changed';
  end if;

  select array_agg(column_info.column_name order by column_info.ordinal_position)
  into sync_columns
  from information_schema.columns column_info
  where column_info.table_schema = 'public' and column_info.table_name = 'sync_entities';
  if sync_columns is distinct from array[
    'user_id', 'vehicle_id', 'entity_type', 'entity_id', 'device_id',
    'payload', 'updated_at', 'deleted_at'
  ] then
    raise exception 'TEST_FAILED: sync_entities structure changed: %', sync_columns;
  end if;

  if exists (
    select 1 from information_schema.columns column_info
    where column_info.table_schema = 'public' and column_info.table_name = 'sync_entities'
      and column_info.column_name = any (marketplace_columns)
  ) then
    raise exception 'TEST_FAILED: sync_entities contains Marketplace columns';
  end if;

  if to_regprocedure('app_private.has_active_write_license(uuid)') is null then
    raise exception 'TEST_FAILED: has_active_write_license changed or is missing';
  end if;

  select project.id into tuktuk_project_id
  from public.projects project where project.slug = 'tuktuk-control';

  if tuktuk_project_id is not null and exists (
    select 1
    from public.sync_entities sync_entity
    join public.profiles profile on profile.id = sync_entity.user_id
    where sync_entity.entity_type = 'vehicle'
      and nullif(btrim(sync_entity.entity_id), '') is not null
      and not exists (
        select 1 from public.vehicles vehicle
        where vehicle.project_id = tuktuk_project_id and vehicle.id = sync_entity.entity_id
      )
  ) then
    raise exception 'TEST_FAILED: an eligible legacy vehicle was not projected';
  end if;

  -- A fixture is conditional: no auth user is invented if the local database has none.
  select sync_entity.* into fixture
  from public.sync_entities sync_entity
  join public.profiles profile on profile.id = sync_entity.user_id
  where sync_entity.entity_type = 'vehicle'
    and nullif(btrim(sync_entity.entity_id), '') is not null
  limit 1;

  if found and tuktuk_project_id is not null then
    perform app_private.project_legacy_vehicle_from_sync_entity(fixture);
    select count(*) into profiles_before from public.driver_profiles;
    select count(*) into assignments_before from public.driver_vehicle_assignments;

    update public.vehicles vehicle
    set category_code = 'tricycle',
        propulsion_code = 'electric',
        brand = 'Marketplace verification brand',
        model = 'Marketplace verification model',
        passenger_capacity = 3,
        cargo_capacity_kg = 100,
        cargo_volume_m3 = 1.5,
        body_type = 'verification',
        marketplace_status = 'active'
    where vehicle.project_id = tuktuk_project_id and vehicle.id = fixture.entity_id;

    insert into public.vehicle_services (project_id, vehicle_id, service_code, enabled)
    values (tuktuk_project_id, fixture.entity_id, 'passenger', true)
    on conflict (project_id, vehicle_id, service_code) do update set enabled = true;

    update public.sync_entities sync_entity
    set payload = coalesce(sync_entity.payload, '{}'::jsonb) || jsonb_build_object(
          'name', 'Legacy verification name',
          'registration', 'LEGACY-VERIFY',
          'initialOdometer', '123.45',
          'deletedAt', null
        ),
        deleted_at = null
    where sync_entity.user_id = fixture.user_id
      and sync_entity.entity_type = fixture.entity_type
      and sync_entity.entity_id = fixture.entity_id;

    if not exists (
      select 1 from public.vehicles vehicle
      where vehicle.project_id = tuktuk_project_id and vehicle.id = fixture.entity_id
        and vehicle.name = 'Legacy verification name'
        and vehicle.registration = 'LEGACY-VERIFY'
        and vehicle.initial_odometer = 123.45
        and vehicle.deleted_at is null
        and vehicle.category_code = 'tricycle'
        and vehicle.propulsion_code = 'electric'
        and vehicle.brand = 'Marketplace verification brand'
        and vehicle.model = 'Marketplace verification model'
        and vehicle.passenger_capacity = 3
        and vehicle.cargo_capacity_kg = 100
        and vehicle.cargo_volume_m3 = 1.5
        and vehicle.body_type = 'verification'
        and vehicle.marketplace_status = 'active'
    ) then
      raise exception 'TEST_FAILED: legacy update did not preserve Marketplace fields';
    end if;

    if not exists (
      select 1 from public.vehicle_services service
      where service.project_id = tuktuk_project_id and service.vehicle_id = fixture.entity_id
        and service.service_code = 'passenger' and service.enabled
    ) then
      raise exception 'TEST_FAILED: legacy update changed vehicle services';
    end if;

    if (select count(*) from public.driver_profiles) <> profiles_before
      or (select count(*) from public.driver_vehicle_assignments) <> assignments_before then
      raise exception 'TEST_FAILED: legacy projection created driver data';
    end if;
  end if;


  -- If at least two existing profiles are available locally, prove that one user's
  -- legacy sync row cannot hijack another user's relational vehicle by reusing its ID.
  if tuktuk_project_id is not null then
    select profile.id
    into first_profile_id
    from public.profiles profile
    order by profile.id
    limit 1;

    select profile.id
    into second_profile_id
    from public.profiles profile
    where profile.id is distinct from first_profile_id
    order by profile.id
    limit 1;

    if first_profile_id is not null and second_profile_id is not null then
      collision_vehicle_id := 'marketplace-owner-guard-' || gen_random_uuid()::text;

      insert into public.sync_entities (
        user_id, vehicle_id, entity_type, entity_id, device_id, payload, updated_at, deleted_at
      ) values (
        first_profile_id,
        collision_vehicle_id,
        'vehicle',
        collision_vehicle_id,
        'verification',
        jsonb_build_object(
          'name', 'Owner guard first',
          'registration', 'OWNER-A',
          'initialOdometer', 1
        ),
        now(),
        null
      );

      if not exists (
        select 1 from public.vehicles vehicle
        where vehicle.project_id = tuktuk_project_id
          and vehicle.id = collision_vehicle_id
          and vehicle.owner_user_id = first_profile_id
      ) then
        raise exception 'TEST_FAILED: initial owner-guard vehicle projection failed';
      end if;

      insert into public.sync_entities (
        user_id, vehicle_id, entity_type, entity_id, device_id, payload, updated_at, deleted_at
      ) values (
        second_profile_id,
        collision_vehicle_id,
        'vehicle',
        collision_vehicle_id,
        'verification',
        jsonb_build_object(
          'name', 'Owner guard second',
          'registration', 'OWNER-B',
          'initialOdometer', 2
        ),
        now(),
        null
      );

      if not exists (
        select 1 from public.vehicles vehicle
        where vehicle.project_id = tuktuk_project_id
          and vehicle.id = collision_vehicle_id
          and vehicle.owner_user_id = first_profile_id
          and vehicle.name = 'Owner guard first'
          and vehicle.registration = 'OWNER-A'
          and vehicle.initial_odometer = 1
      ) then
        raise exception 'TEST_FAILED: legacy projection allowed cross-owner vehicle reassignment';
      end if;
    end if;
  end if;
end;
$$;

rollback;
