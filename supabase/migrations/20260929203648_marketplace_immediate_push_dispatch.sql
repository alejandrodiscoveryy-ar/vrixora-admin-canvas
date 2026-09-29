-- TukTuk Marketplace: dispatch driver push notifications immediately after a job is published.
-- The existing five-minute cron remains active as a durable retry/fallback path.

create or replace function app_private.enqueue_marketplace_job_offers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  inserted_rows integer;
  enqueued_count integer := 0;
begin
  if old.status <> 'requested' or new.status <> 'published' then
    return new;
  end if;

  for candidate in
    select distinct a.driver_user_id
    from public.driver_vehicle_assignments a
    where a.project_id = new.project_id
      and app_private.marketplace_driver_can_receive_job(
        new.project_id, a.driver_user_id, a.vehicle_id, new.id
      )
  loop
    insert into public.notification_outbox(
      project_id, user_id, kind, notification_date,
      dedupe_key, title, body, data
    ) values (
      new.project_id,
      candidate.driver_user_id,
      'marketplace_job_available',
      current_date,
      'marketplace-job:' || new.id::text,
      'Nueva solicitud disponible',
      'Abre Trabajos para ver una solicitud disponible.',
      jsonb_build_object(
        'event_type', 'marketplace_job_available',
        'job_id', new.id
      )
    )
    on conflict (project_id, user_id, kind, dedupe_key) do nothing;

    get diagnostics inserted_rows = row_count;
    enqueued_count := enqueued_count + inserted_rows;
  end loop;

  if enqueued_count > 0 then
    begin
      perform net.http_post(
        url := 'https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/send-push-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-tuktuk-dispatch-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'tuktuk_push_dispatch_secret'
            limit 1
          )
        ),
        body := jsonb_build_object(
          'limit', 100,
          'max_batches', 10,
          'concurrency', 8,
          'time_budget_ms', 45000
        ),
        timeout_milliseconds := 5000
      );
    exception
      when others then
        null;
    end;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enqueue_marketplace_job_offers()
from public, anon, authenticated;