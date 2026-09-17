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
end $$;
