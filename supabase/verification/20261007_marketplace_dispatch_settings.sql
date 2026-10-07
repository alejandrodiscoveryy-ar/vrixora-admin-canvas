do $$
declare
  definition text;
begin
  if to_regclass(
    'public.project_marketplace_dispatch_settings'
  ) is null then

    raise exception
      'TEST_FAILED: dispatch settings table missing';
  end if;

  if not exists(
    select 1
    from pg_class
    where oid =
      'public.project_marketplace_dispatch_settings'::regclass
      and relrowsecurity
  ) then

    raise exception
      'TEST_FAILED: dispatch settings RLS missing';
  end if;

  if to_regprocedure(
    'public.admin_get_marketplace_dispatch_settings(uuid)'
  ) is null then

    raise exception
      'TEST_FAILED: dispatch settings read RPC missing';
  end if;

  if to_regprocedure(
    'public.admin_set_marketplace_dispatch_settings(uuid,boolean,boolean,boolean,numeric,boolean,numeric,boolean,numeric,boolean,integer,boolean,boolean,numeric,boolean,integer,boolean,boolean,boolean,text)'
  ) is null then

    raise exception
      'TEST_FAILED: dispatch settings write RPC missing';
  end if;

  select lower(
    pg_get_functiondef(
      'public.admin_get_marketplace_dispatch_settings(uuid)'::regprocedure
    )
  )
  into definition;

  if definition not like '%security definer%'
     or definition not like '%set search_path = ''''%'
     or definition not like '%settings.view%' then

    raise exception
      'TEST_FAILED: dispatch read RPC not hardened';
  end if;

  select lower(
    pg_get_functiondef(
      'public.admin_set_marketplace_dispatch_settings(uuid,boolean,boolean,boolean,numeric,boolean,numeric,boolean,numeric,boolean,integer,boolean,boolean,numeric,boolean,integer,boolean,boolean,boolean,text)'::regprocedure
    )
  )
  into definition;

  if definition not like '%security definer%'
     or definition not like '%set search_path = ''''%'
     or definition not like '%settings.manage%'
     or definition not like '%radius_1_km%'
     or definition not like '%preferred_min_rating%'
     or definition not like '%allow_outside_max_radius%' then

    raise exception
      'TEST_FAILED: dispatch write RPC incomplete';
  end if;

  if not exists(
    select 1
    from pg_trigger
    where tgrelid =
      'public.project_marketplace_dispatch_settings'::regclass
      and tgname =
        'audit_marketplace_dispatch_settings'
      and not tgisinternal
  ) then

    raise exception
      'TEST_FAILED: dispatch settings audit missing';
  end if;
end
$$;