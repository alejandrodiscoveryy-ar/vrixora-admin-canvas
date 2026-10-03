do $verification$
declare
  definition text;
begin
  if to_regclass('public.marketplace_driver_locations') is null then
    raise exception 'TEST_FAILED: marketplace_driver_locations missing';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.marketplace_driver_locations'::regclass
      and relrowsecurity
  ) then
    raise exception 'TEST_FAILED: location table RLS missing';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.marketplace_driver_locations',
    'select'
  ) or has_table_privilege(
    'authenticated',
    'public.marketplace_driver_locations',
    'insert'
  ) or has_table_privilege(
    'authenticated',
    'public.marketplace_driver_locations',
    'update'
  ) then
    raise exception 'TEST_FAILED: direct location table privileges exposed';
  end if;

  if to_regprocedure(
    'public.update_my_marketplace_driver_location(text,numeric,numeric,numeric,numeric,numeric,timestamptz)'
  ) is null then
    raise exception 'TEST_FAILED: driver location RPC missing';
  end if;

  if to_regprocedure(
    'public.admin_get_marketplace_operational_map(uuid)'
  ) is null then
    raise exception 'TEST_FAILED: admin operational map RPC missing';
  end if;

  select lower(
    pg_get_functiondef(
      'public.update_my_marketplace_driver_location(text,numeric,numeric,numeric,numeric,numeric,timestamptz)'::regprocedure
    )
  )
  into definition;

  if definition not like '%auth.uid()%'
     or definition not like '%accepting_jobs%'
     or definition not like '%marketplace_driver_locations%'
     or definition not like '%on conflict%' then
    raise exception 'TEST_FAILED: driver location security contract incomplete';
  end if;

  select lower(
    pg_get_functiondef(
      'public.admin_get_marketplace_operational_map(uuid)'::regprocedure
    )
  )
  into definition;

  if definition not like '%marketplace.view%'
     or definition not like '%route_origin%'
     or definition not like '%location_fresh%' then
    raise exception 'TEST_FAILED: admin map contract incomplete';
  end if;
end;
$verification$;