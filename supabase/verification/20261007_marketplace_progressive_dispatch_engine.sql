do $$
declare
  definition text;
begin
  if to_regprocedure('app_private.marketplace_haversine_km(numeric,numeric,numeric,numeric)') is null then
    raise exception 'TEST_FAILED: haversine missing';
  end if;
  if to_regprocedure('app_private.marketplace_dispatch_candidate_state(uuid,uuid,text,uuid)') is null then
    raise exception 'TEST_FAILED: candidate state missing';
  end if;
  if to_regprocedure('app_private.dispatch_marketplace_offer_waves()') is null then
    raise exception 'TEST_FAILED: wave dispatcher missing';
  end if;
  if not exists(
    select 1 from pg_trigger
    where tgrelid='public.jobs'::regclass
      and tgname='marketplace_enforce_dispatch_policy'
      and not tgisinternal
  ) then
    raise exception 'TEST_FAILED: acceptance guard missing';
  end if;

  select lower(pg_get_functiondef(
    'public.list_my_marketplace_available_jobs(text,integer,timestamptz,uuid)'::regprocedure
  )) into definition;

  if definition not like '%marketplace_dispatch_policy_allows%' then
    raise exception 'TEST_FAILED: available jobs is not policy-aware';
  end if;

  if not exists(
    select 1 from cron.job
    where jobname='marketplace-dispatch-waves'
      and active
      and schedule='5 seconds'
  ) then
    raise exception 'TEST_FAILED: dispatch cron missing';
  end if;
end
$$;
