DO $radar_performance$
DECLARE
  target regprocedure := to_regprocedure('public.admin_get_marketplace_radar_readiness(uuid)');
  src text;
  old_fragment text := 'with work as (';
  new_fragment text := 'with work as materialized (';
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'RADAR_READINESS_FUNCTION_MISSING';
  END IF;

  SELECT pg_get_functiondef(target) INTO src;

  IF md5(src) <> 'ebbb7bb8ba5fab8de02bec80f352bb11' THEN
    RAISE EXCEPTION 'RADAR_READINESS_SOURCE_CHANGED_REAUDIT_REQUIRED';
  END IF;

  IF length(src) - length(replace(src, old_fragment, '')) <> length(old_fragment) THEN
    RAISE EXCEPTION 'RADAR_READINESS_EXPECTED_CTE_NOT_UNIQUE';
  END IF;

  IF position('SECURITY DEFINER' IN src) = 0
     OR position('SET search_path TO' IN src) = 0 THEN
    RAISE EXCEPTION 'RADAR_READINESS_SECURITY_CONTRACT_CHANGED';
  END IF;

  PERFORM set_config('lock_timeout', '3s', true);
  EXECUTE replace(src, old_fragment, new_fragment);

  IF md5(pg_get_functiondef(target)) <> '129724640d7609df76ae4089951cf629' THEN
    RAISE EXCEPTION 'RADAR_READINESS_UNEXPECTED_RESULTING_DEFINITION';
  END IF;
  IF has_function_privilege('anon', target, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', target, 'EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p WHERE p.oid = target
         AND p.proowner = 'postgres'::regrole
         AND p.prosecdef AND p.provolatile = 's'
         AND p.proconfig = ARRAY['search_path=""']::text[]
         AND p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'
     ) THEN
    RAISE EXCEPTION 'RADAR_READINESS_SECURITY_CONTRACT_CHANGED';
  END IF;
END
$radar_performance$;
