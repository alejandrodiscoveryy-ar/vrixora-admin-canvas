-- Block 11 follow-up: preserve legacy daily-rate producer after dedupe_key.
create or replace function app_private.enqueue_daily_rate_notification(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cfg public.project_exchange_settings%rowtype;
  local_now timestamp; local_date date; local_hour int; inserted_count int := 0; formatted_rate text;
begin
  select * into cfg from public.project_exchange_settings where project_id=target_project_id for update;
  if not found or not cfg.daily_rate_notification_enabled then return jsonb_build_object('ok',true,'status','disabled'); end if;
  local_now := timezone(cfg.daily_rate_notification_timezone, now()); local_date := local_now::date;
  local_hour := extract(hour from local_now)::int;
  if local_hour <> cfg.daily_rate_notification_hour then return jsonb_build_object('ok',true,'status','not_due'); end if;
  if cfg.last_daily_rate_notification_date = local_date then return jsonb_build_object('ok',true,'status','already_queued'); end if;
  if cfg.rate_mode <> 'automatic' or cfg.last_auto_sync_status <> 'ok' or cfg.last_auto_sync_at is null or cfg.last_auto_sync_at < now()-interval '2 hours' then return jsonb_build_object('ok',false,'status','rate_not_fresh'); end if;
  formatted_rate := trim(to_char(cfg.current_rate, 'FM999999990.00'));
  insert into public.notification_outbox(project_id,user_id,kind,notification_date,dedupe_key,title,body,data)
  select distinct target_project_id,l.user_id,'daily_exchange_rate',local_date,
    'daily-rate:' || local_date::text,'Tasa de cambio de hoy',
    '1 ' || cfg.base_currency || ' = ' || formatted_rate || ' ' || cfg.charge_currency || '. Fuente: elTOQUE. Valor referencial.',
    jsonb_build_object('rate',cfg.current_rate,'base_currency',cfg.base_currency,'charge_currency',cfg.charge_currency,'source','elTOQUE','updated_at',cfg.rate_updated_at)
  from public.licenses l left join public.user_notification_preferences pref on pref.project_id=l.project_id and pref.user_id=l.user_id
  where l.project_id=target_project_id and l.status='active' and l.license_type <> 'admin'
    and (l.expires_at is null or l.expires_at > now()) and coalesce(pref.daily_rate_enabled,true)
  on conflict (project_id,user_id,kind,dedupe_key) do nothing;
  get diagnostics inserted_count = row_count;
  update public.project_exchange_settings set last_daily_rate_notification_date=local_date,updated_at=now() where project_id=target_project_id;
  return jsonb_build_object('ok',true,'status','queued','count',inserted_count,'date',local_date);
end;
$$;

-- Regression contract: daily notifications are deduped by local date while
-- Marketplace notifications remain deduped by their job-specific key.
do $$ begin
  if position('dedupe_key' in pg_get_functiondef('app_private.enqueue_daily_rate_notification(uuid)'::regprocedure)) = 0 then
    raise exception 'daily rate producer does not provide dedupe_key';
  end if;
end $$;
