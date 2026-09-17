-- TukTuk Marketplace V1, Block 11: durable driver notifications.
-- Reuses the existing notification_outbox and push_device_tokens infrastructure.
-- Customer devices are deliberately excluded: Marketplace customer access is anonymous.

alter table public.notification_outbox
  add column if not exists dedupe_key text;

update public.notification_outbox
set dedupe_key = coalesce(dedupe_key, notification_date::text)
where dedupe_key is null;

alter table public.notification_outbox
  alter column dedupe_key set not null;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_project_id_user_id_kind_notification_date_key;

alter table public.notification_outbox
  add constraint notification_outbox_project_user_kind_dedupe_key
  unique (project_id, user_id, kind, dedupe_key);

alter table public.notification_outbox
  add column if not exists claim_id uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_delivery_status_check;
alter table public.notification_outbox
  add constraint notification_outbox_delivery_status_check
  check (delivery_status in ('pending', 'processing', 'sent', 'failed', 'skipped'));

create index if not exists notification_outbox_claimable_idx
  on public.notification_outbox(project_id, delivery_status, next_attempt_at, created_at)
  where delivery_status in ('pending', 'processing');
create index if not exists push_device_tokens_enabled_platform_idx
  on public.push_device_tokens(project_id, user_id, platform) where enabled;

-- One source of truth for the offer rules. This is intentionally the same
-- predicate used by list_my_marketplace_available_jobs and accept_job.
create or replace function app_private.marketplace_driver_can_receive_job(
  target_project_id uuid,
  target_driver_user_id uuid,
  target_vehicle_id text,
  target_job_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_project_id is not null and target_driver_user_id is not null
    and target_vehicle_id is not null and target_job_id is not null
    and exists (
      select 1
      from public.jobs j
      join public.service_requests r
        on r.project_id = j.project_id and r.id = j.service_request_id
      join public.driver_profiles d
        on d.project_id = j.project_id and d.user_id = target_driver_user_id
      join public.driver_vehicle_assignments a
        on a.project_id = j.project_id and a.driver_user_id = d.user_id
       and a.vehicle_id = target_vehicle_id
      join public.vehicles v
        on v.project_id = a.project_id and v.id = a.vehicle_id
      where j.project_id = target_project_id and j.id = target_job_id
        and j.status = 'published'
        and (j.expires_at is null or j.expires_at > now())
        and d.status = 'active' and d.activated_at is not null and d.suspended_at is null
        and a.is_active and a.is_available
        and v.marketplace_status = 'active' and v.deleted_at is null
        and app_private.marketplace_onboarding_requirements_complete(d.user_id, v.id)
        and (app_private.has_active_marketplace_work_trial(d.user_id)
          or app_private.has_confirmed_marketplace_initial_deposit(d.user_id))
        and exists (
          select 1 from public.vehicle_services vs
          where vs.project_id = j.project_id and vs.vehicle_id = v.id
            and vs.service_code = j.service_code and vs.enabled
        )
        and (r.passenger_count is null or v.passenger_capacity >= r.passenger_count)
        and (r.cargo_weight_kg is null or v.cargo_capacity_kg >= r.cargo_weight_kg)
        and (r.cargo_volume_m3 is null or v.cargo_volume_m3 >= r.cargo_volume_m3)
        and (r.cargo_length_cm is null or v.cargo_length_cm >= r.cargo_length_cm)
        and (r.cargo_width_cm is null or v.cargo_width_cm >= r.cargo_width_cm)
        and (r.cargo_height_cm is null or v.cargo_height_cm >= r.cargo_height_cm)
        and (r.required_body_type is null
          or lower(btrim(v.body_type)) = lower(btrim(r.required_body_type)))
    );
$$;

create or replace function app_private.enqueue_marketplace_job_offers()
returns trigger language plpgsql security definer set search_path = '' as $$
declare candidate record;
begin
  if old.status <> 'requested' or new.status <> 'published' then return new; end if;
  for candidate in
    select distinct a.driver_user_id
    from public.driver_vehicle_assignments a
    where a.project_id = new.project_id
      and app_private.marketplace_driver_can_receive_job(
        new.project_id, a.driver_user_id, a.vehicle_id, new.id
      )
  loop
    insert into public.notification_outbox(
      project_id, user_id, kind, notification_date, dedupe_key, title, body, data
    ) values (
      new.project_id, candidate.driver_user_id, 'marketplace_job_available', current_date,
      'marketplace-job:' || new.id::text,
      'Nueva solicitud disponible', 'Abre Trabajos para ver una solicitud disponible.',
      jsonb_build_object('event_type', 'marketplace_job_available', 'job_id', new.id)
    ) on conflict (project_id, user_id, kind, dedupe_key) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists marketplace_enqueue_job_offers on public.jobs;
create trigger marketplace_enqueue_job_offers
after update of status on public.jobs
for each row execute function app_private.enqueue_marketplace_job_offers();

-- The service-role worker calls this RPC. Leases make retries safe and ensure
-- that concurrent invocations cannot send the same outbox row concurrently.
create or replace function public.claim_push_notification_batch(
  target_project_id uuid, batch_limit integer default 100, lease_seconds integer default 300,
  max_attempts integer default 5, allowed_kinds text[] default array[
    'daily_exchange_rate','exchange_rate_update','app_announcement','app_update',
    'marketplace_job_available'
  ]::text[]
) returns setof public.notification_outbox language plpgsql security invoker set search_path = '' as $$
begin
  if batch_limit < 1 or batch_limit > 500 then raise exception 'INVALID_BATCH_LIMIT' using errcode='22023'; end if;
  if lease_seconds < 30 or lease_seconds > 900 then raise exception 'INVALID_LEASE_SECONDS' using errcode='22023'; end if;
  if max_attempts < 1 or max_attempts > 20 then raise exception 'INVALID_MAX_ATTEMPTS' using errcode='22023'; end if;
  update public.notification_outbox exhausted set delivery_status='failed',
    last_error=coalesce(exhausted.last_error,'Worker lease expired after maximum attempts'),
    claim_id=null, claimed_at=null, next_attempt_at=null
  where exhausted.project_id=target_project_id and exhausted.delivery_status='processing'
    and exhausted.claimed_at < now()-make_interval(secs=>lease_seconds)
    and exhausted.attempt_count >= max_attempts;
  return query with candidates as (
    select queued.id from public.notification_outbox queued
    where queued.project_id=target_project_id and queued.kind=any(allowed_kinds)
      and queued.attempt_count < max_attempts and (
        (queued.delivery_status='pending' and (queued.next_attempt_at is null or queued.next_attempt_at<=now()))
        or (queued.delivery_status='processing' and queued.claimed_at < now()-make_interval(secs=>lease_seconds))
      ) order by queued.created_at,queued.id for update skip locked limit batch_limit
  ), claimed as (
    update public.notification_outbox queued set delivery_status='processing',claim_id=gen_random_uuid(),
      claimed_at=now(),last_attempt_at=now(),next_attempt_at=null,attempt_count=queued.attempt_count+1
    from candidates where queued.id=candidates.id returning queued.*
  ) select * from claimed;
end;
$$;

revoke all on function app_private.marketplace_driver_can_receive_job(uuid,uuid,text,uuid),
  app_private.enqueue_marketplace_job_offers(),
  public.claim_push_notification_batch(uuid,integer,integer,integer,text[]) from public, anon, authenticated;
grant execute on function public.claim_push_notification_batch(uuid,integer,integer,integer,text[]) to service_role;
