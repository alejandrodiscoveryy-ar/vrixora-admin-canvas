do $verification$
declare
  ddl text;
begin
  select pg_get_functiondef(
    'public.admin_get_marketplace_operational_map(uuid)'::regprocedure
  )
  into ddl;

  if position(
    'a.accepting_jobs' || chr(10) ||
    '        or active_job.job_id is not null'
    in ddl
  ) > 0 then
    raise exception 'TEST_FAILED: drivers still filtered by accepting_jobs';
  end if;

  if position(
    'where coalesce(accepting_jobs, false)' in ddl
  ) = 0 then
    raise exception 'TEST_FAILED: working driver summary missing';
  end if;

  if position(
    'where not coalesce(accepting_jobs, false)' in ddl
  ) = 0 then
    raise exception 'TEST_FAILED: resting driver summary missing';
  end if;
end;
$verification$;