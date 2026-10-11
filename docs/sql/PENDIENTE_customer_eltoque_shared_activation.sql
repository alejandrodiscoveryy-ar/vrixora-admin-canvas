-- FUTURE ACTIVATION ONLY. Not under supabase/migrations, not auto-executed.
-- Owner: Vrixora Admin. Prerequisite already applied: 20261011141714.
-- No table/RPC recreation, no historical backfill, no cron or Edge deployment.
begin;

create or replace function app_private.enqueue_marketplace_customer_eltoque_push()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  previous_rate numeric;
begin
  if new.project_id <> 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid
     or new.rate_source is distinct from 'elTOQUE'
     or new.rate_mode is distinct from 'automatic'
     or new.base_currency is distinct from 'USD'
     or new.charge_currency is distinct from 'CUP'
     or new.changed_by is not null
     or new.rate is null or new.rate <= 0
     or new.created_at < statement_timestamp() - interval '10 minutes'
     or new.created_at > statement_timestamp() + interval '1 minute' then
    return new;
  end if;
  if not exists (
    select 1 from public.project_exchange_settings c
    where c.project_id = new.project_id and c.auto_sync_enabled
      and c.rate_mode = 'automatic' and c.auto_provider = 'eltoque'
      and c.auto_currency = 'USD' and c.base_currency = 'USD'
      and c.charge_currency = 'CUP' and c.last_auto_sync_status = 'ok'
      and c.last_auto_sync_at >= statement_timestamp() - interval '2 hours'
      and c.current_rate = new.rate
  ) then return new; end if;

  select h.rate into previous_rate
  from public.project_exchange_rate_history h
  where h.project_id = new.project_id and h.rate_source = 'elTOQUE'
    and h.base_currency = 'USD' and h.charge_currency = 'CUP'
    and h.id < new.id
  order by h.id desc limit 1;
  -- First observation is not a proven change. Equal observations never queue.
  if previous_rate is null or previous_rate = new.rate then return new; end if;

  insert into public.marketplace_customer_eltoque_push_deliveries(subscription_id, rate_history_id)
  select s.id, new.id from public.marketplace_customer_eltoque_push_subscriptions s
  where s.enabled and s.expires_at > statement_timestamp()
    and s.created_at < new.created_at
  on conflict (subscription_id, rate_history_id) do nothing;
  return new;
end;
$function$;

revoke all on function app_private.enqueue_marketplace_customer_eltoque_push() from public, anon, authenticated;
-- Fail if an unexpected trigger already exists: review before replacing it.
create trigger trg_marketplace_customer_eltoque_push
  after insert on public.project_exchange_rate_history
  for each row execute function app_private.enqueue_marketplace_customer_eltoque_push();

commit;
