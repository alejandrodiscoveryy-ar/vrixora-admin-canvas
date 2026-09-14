-- Block 3 verification. Dynamic driver-profile checks are conditional and always rolled back.
begin;

do $$
declare
  required_function regprocedure;
  policy_record record;
  policy_definition text;
  fixture public.driver_profiles%rowtype;
  sync_columns text[];
  entity_type_check text;
  authenticated_oid oid := 'authenticated'::regrole::oid;
begin
  foreach required_function in array array[
    'app_private.has_active_marketplace_suite(uuid)'::regprocedure,
    'app_private.has_control_write_entitlement(uuid)'::regprocedure,
    'app_private.current_user_has_control_write_entitlement()'::regprocedure
  ] loop
    if not exists (
      select 1 from pg_proc procedure where procedure.oid = required_function and procedure.prosecdef
    ) then
      raise exception 'TEST_FAILED: % must exist as SECURITY DEFINER', required_function;
    end if;
    if not exists (
      select 1 from pg_proc procedure
      where procedure.oid = required_function
        and coalesce(procedure.proconfig, array[]::text[]) @> array['search_path=']
    ) then
      raise exception 'TEST_FAILED: % must set an empty search_path', required_function;
    end if;
  end loop;

  if has_function_privilege('anon', 'app_private.has_active_marketplace_suite(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'app_private.has_active_marketplace_suite(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'app_private.has_control_write_entitlement(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'app_private.has_control_write_entitlement(uuid)', 'EXECUTE') then
    raise exception 'TEST_FAILED: generic entitlement helpers must not be client-executable';
  end if;

  if has_function_privilege('anon', 'app_private.current_user_has_control_write_entitlement()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'app_private.current_user_has_control_write_entitlement()', 'EXECUTE') then
    raise exception 'TEST_FAILED: current-user entitlement execute grants are incorrect';
  end if;

  if to_regprocedure('app_private.has_active_write_license(uuid)') is null then
    raise exception 'TEST_FAILED: has_active_write_license is missing';
  end if;

  foreach policy_record in
    select policy.polname, policy.polcmd, policy.polroles, policy.polqual, policy.polwithcheck
    from pg_policy policy
    join pg_class relation on relation.oid = policy.polrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sync_entities'
      and policy.polname in (
        'Active users insert their synchronized data',
        'Active users update their synchronized data',
        'Active users delete their synchronized data'
      )
  loop
    if policy_record.polroles is distinct from array[authenticated_oid] then
      raise exception 'TEST_FAILED: policy % is not restricted exactly to authenticated',
        policy_record.polname;
    end if;

    if (policy_record.polname = 'Active users insert their synchronized data' and policy_record.polcmd <> 'a')
      or (policy_record.polname = 'Active users update their synchronized data' and policy_record.polcmd <> 'w')
      or (policy_record.polname = 'Active users delete their synchronized data' and policy_record.polcmd <> 'd') then
      raise exception 'TEST_FAILED: policy % has the wrong command type', policy_record.polname;
    end if;

    policy_definition := coalesce(pg_get_expr(policy_record.polqual, 'public.sync_entities'::regclass), '')
      || ' ' || coalesce(pg_get_expr(policy_record.polwithcheck, 'public.sync_entities'::regclass), '');

    if position('current_user_has_control_write_entitlement' in policy_definition) = 0
      or position('auth.uid()' in policy_definition) = 0
      or position('user_id' in policy_definition) = 0 then
      raise exception 'TEST_FAILED: policy % lacks effective entitlement or ownership',
        policy_record.polname;
    end if;

    if position('has_active_write_license' in policy_definition) > 0 then
      raise exception 'TEST_FAILED: policy % still calls the legacy license helper directly',
        policy_record.polname;
    end if;
  end loop;

  if (select count(*) from pg_policy policy
      join pg_class relation on relation.oid = policy.polrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = 'sync_entities'
        and policy.polname in (
          'Active users insert their synchronized data',
          'Active users update their synchronized data',
          'Active users delete their synchronized data'
        )) <> 3 then
    raise exception 'TEST_FAILED: expected sync_entities write policies are missing';
  end if;

  -- Preserve the historical read policy exactly as a self-read policy for authenticated users.
  if not exists (
    select 1
    from pg_policy policy
    join pg_class relation on relation.oid = policy.polrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'sync_entities'
      and policy.polname = 'Users read only their synchronized data'
      and policy.polcmd = 'r'
      and policy.polroles = array[authenticated_oid]
      and position(
        'auth.uid()'
        in coalesce(pg_get_expr(policy.polqual, 'public.sync_entities'::regclass), '')
      ) > 0
      and position(
        'user_id'
        in coalesce(pg_get_expr(policy.polqual, 'public.sync_entities'::regclass), '')
      ) > 0
      and position(
        'current_user_has_control_write_entitlement'
        in coalesce(pg_get_expr(policy.polqual, 'public.sync_entities'::regclass), '')
      ) = 0
  ) then
    raise exception 'TEST_FAILED: historical sync_entities SELECT policy changed';
  end if;

  -- The client sync contract itself must remain byte-compatible at the relational boundary.
  select array_agg(column_info.column_name order by column_info.ordinal_position)
  into sync_columns
  from information_schema.columns column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'sync_entities';

  if sync_columns is distinct from array[
    'user_id', 'vehicle_id', 'entity_type', 'entity_id', 'device_id',
    'payload', 'updated_at', 'deleted_at'
  ] then
    raise exception 'TEST_FAILED: sync_entities structure changed: %', sync_columns;
  end if;

  select pg_get_constraintdef(constraint_info.oid)
  into entity_type_check
  from pg_constraint constraint_info
  join pg_class relation on relation.oid = constraint_info.conrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'sync_entities'
    and constraint_info.contype = 'c'
    and pg_get_constraintdef(constraint_info.oid) ilike '%entity_type%'
  order by constraint_info.oid
  limit 1;

  if entity_type_check is null
    or position('dailyRecord' in entity_type_check) = 0
    or position('maintenance' in entity_type_check) = 0
    or position('vehicle' in entity_type_check) = 0
    or position('settings' in entity_type_check) = 0
    or position('job' in lower(entity_type_check)) > 0
    or position('wallet' in lower(entity_type_check)) > 0
    or position('topup' in lower(entity_type_check)) > 0
    or position('commission' in lower(entity_type_check)) > 0 then
    raise exception 'TEST_FAILED: sync_entities entity_type contract changed: %', entity_type_check;
  end if;

  if exists (
    select 1 from information_schema.columns column_info
    where column_info.table_schema = 'public' and column_info.table_name = 'sync_entities'
      and column_info.column_name in (
        'marketplace_status', 'wallet_balance', 'topup_id', 'job_id', 'commission_reservation_id'
      )
  ) then
    raise exception 'TEST_FAILED: sync_entities has forbidden Marketplace columns';
  end if;

  if not has_table_privilege('authenticated', 'public.sync_entities', 'SELECT')
    or not has_table_privilege('authenticated', 'public.sync_entities', 'INSERT')
    or not has_table_privilege('authenticated', 'public.sync_entities', 'UPDATE')
    or not has_table_privilege('authenticated', 'public.sync_entities', 'DELETE')
    or has_table_privilege('anon', 'public.sync_entities', 'INSERT')
    or has_table_privilege('anon', 'public.sync_entities', 'UPDATE')
    or has_table_privilege('anon', 'public.sync_entities', 'DELETE')
    or has_table_privilege('anon', 'public.sync_entities', 'TRUNCATE') then
    raise exception 'TEST_FAILED: sync_entities table grants changed unexpectedly';
  end if;

  if to_regclass('public.jobs') is not null
    or to_regclass('public.service_requests') is not null
    or to_regclass('public.job_assignments') is not null
    or to_regclass('public.job_events') is not null
    or to_regclass('public.wallets') is not null
    or to_regclass('public.wallet_transactions') is not null
    or to_regclass('public.topups') is not null
    or to_regclass('public.commission_reservations') is not null then
    raise exception 'TEST_FAILED: Block 3 contains out-of-scope jobs or wallet tables';
  end if;

  -- A fixture is conditional; no auth user or permanent driver state is created for this test.
  select driver_profile.* into fixture
  from public.driver_profiles driver_profile
  join public.projects project on project.id = driver_profile.project_id
  where project.slug = 'tuktuk-control'
  limit 1;

  if found then
    update public.driver_profiles
    set status = 'incomplete', activated_at = null, suspended_at = null
    where project_id = fixture.project_id and user_id = fixture.user_id;
    if app_private.has_active_marketplace_suite(fixture.user_id) then
      raise exception 'TEST_FAILED: incomplete driver counted as active suite';
    end if;

    update public.driver_profiles
    set status = 'pending_topup', activated_at = null, suspended_at = null
    where project_id = fixture.project_id and user_id = fixture.user_id;
    if app_private.has_active_marketplace_suite(fixture.user_id) then
      raise exception 'TEST_FAILED: pending_topup driver counted as active suite';
    end if;

    update public.driver_profiles
    set status = 'active', activated_at = null, suspended_at = null
    where project_id = fixture.project_id and user_id = fixture.user_id;
    if app_private.has_active_marketplace_suite(fixture.user_id) then
      raise exception 'TEST_FAILED: active driver without activation counted as active suite';
    end if;

    update public.driver_profiles
    set status = 'active', activated_at = now(), suspended_at = null
    where project_id = fixture.project_id and user_id = fixture.user_id;
    if not app_private.has_active_marketplace_suite(fixture.user_id) then
      raise exception 'TEST_FAILED: activated active driver was not counted as active suite';
    end if;

    update public.driver_profiles
    set status = 'suspended', activated_at = now(), suspended_at = now()
    where project_id = fixture.project_id and user_id = fixture.user_id;
    if app_private.has_active_marketplace_suite(fixture.user_id) then
      raise exception 'TEST_FAILED: suspended driver counted as active suite';
    end if;
  end if;
end;
$$;

rollback;
