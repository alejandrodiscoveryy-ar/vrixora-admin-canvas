-- Static contract checks for Block 11. Run against a disposable database after migrations.
do $$ begin
  if not exists (select 1 from pg_trigger where tgname='marketplace_enqueue_job_offers') then
    raise exception 'missing Marketplace publication outbox trigger';
  end if;
  if not exists (select 1 from pg_proc where proname='marketplace_driver_can_receive_job') then
    raise exception 'missing shared eligibility predicate';
  end if;
  if not exists (select 1 from pg_constraint where conname='notification_outbox_project_user_kind_dedupe_key') then
    raise exception 'missing durable Marketplace dedupe constraint';
  end if;
  if position('dedupe_key' in pg_get_functiondef('app_private.enqueue_daily_rate_notification(uuid)'::regprocedure)) = 0
    or position('daily-rate:' in pg_get_functiondef('app_private.enqueue_daily_rate_notification(uuid)'::regprocedure)) = 0 then
    raise exception 'legacy daily-rate producer is not compatible with dedupe_key';
  end if;
  if position('marketplace-job:' in pg_get_functiondef('app_private.enqueue_marketplace_job_offers()'::regprocedure)) = 0 then
    raise exception 'Marketplace producer does not retain job-level deduplication';
  end if;
end $$;
