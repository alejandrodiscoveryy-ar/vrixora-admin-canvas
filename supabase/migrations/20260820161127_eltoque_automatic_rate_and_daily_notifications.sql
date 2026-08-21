create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

alter table public.project_exchange_settings
  add column if not exists auto_provider text not null default 'eltoque',
  add column if not exists auto_currency text not null default 'USD',
  add column if not exists auto_sync_enabled boolean not null default false,
  add column if not exists last_auto_sync_at timestamptz,
  add column if not exists last_auto_sync_status text not null default 'never',
  add column if not exists last_auto_sync_error text,
  add column if not exists daily_rate_notification_enabled boolean not null default false,
  add column if not exists daily_rate_notification_hour smallint not null default 8,
  add column if not exists daily_rate_notification_timezone text not null default 'America/Havana',
  add column if not exists last_daily_rate_notification_date date;

alter table public.project_exchange_settings
  drop constraint if exists project_exchange_settings_auto_provider_check,
  add constraint project_exchange_settings_auto_provider_check check (auto_provider in ('eltoque')),
  drop constraint if exists project_exchange_settings_auto_currency_check,
  add constraint project_exchange_settings_auto_currency_check check (auto_currency in ('USD','EUR','MLC')),
  drop constraint if exists project_exchange_settings_daily_rate_notification_hour_check,
  add constraint project_exchange_settings_daily_rate_notification_hour_check check (daily_rate_notification_hour between 0 and 23);

create table if not exists public.user_notification_preferences (
  project_id uuid not null references public.projects(id) on update cascade on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_rate_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on update cascade on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, token),
  constraint push_device_tokens_platform_check check (platform in ('android','ios','web'))
);

create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on update cascade on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  notification_date date not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  last_error text,
  unique (project_id, user_id, kind, notification_date),
  constraint notification_outbox_delivery_status_check check (delivery_status in ('pending','sent','failed','skipped'))
);

create index if not exists notification_outbox_pending_idx on public.notification_outbox(project_id, delivery_status, created_at);
create index if not exists push_device_tokens_user_idx on public.push_device_tokens(project_id, user_id) where enabled;

alter table public.user_notification_preferences enable row level security;
alter table public.push_device_tokens enable row level security;
alter table public.notification_outbox enable row level security;

drop policy if exists user_notification_preferences_own_select on public.user_notification_preferences;
create policy user_notification_preferences_own_select on public.user_notification_preferences for select to authenticated using (user_id = auth.uid());
drop policy if exists user_notification_preferences_own_insert on public.user_notification_preferences;
create policy user_notification_preferences_own_insert on public.user_notification_preferences for insert to authenticated with check (user_id = auth.uid());
drop policy if exists user_notification_preferences_own_update on public.user_notification_preferences;
create policy user_notification_preferences_own_update on public.user_notification_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_device_tokens_own_select on public.push_device_tokens;
create policy push_device_tokens_own_select on public.push_device_tokens for select to authenticated using (user_id = auth.uid());
drop policy if exists push_device_tokens_own_insert on public.push_device_tokens;
create policy push_device_tokens_own_insert on public.push_device_tokens for insert to authenticated with check (user_id = auth.uid());
drop policy if exists push_device_tokens_own_update on public.push_device_tokens;
create policy push_device_tokens_own_update on public.push_device_tokens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists push_device_tokens_own_delete on public.push_device_tokens;
create policy push_device_tokens_own_delete on public.push_device_tokens for delete to authenticated using (user_id = auth.uid());

drop policy if exists notification_outbox_own_select on public.notification_outbox;
create policy notification_outbox_own_select on public.notification_outbox for select to authenticated using (user_id = auth.uid());

create or replace function public.get_my_project_exchange_rate(target_project_id uuid)
returns table(
  base_currency text,
  charge_currency text,
  rate numeric,
  rate_source text,
  rate_updated_at timestamptz,
  is_referential boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor uuid;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.licenses l
    where l.project_id = target_project_id
      and l.user_id = actor
      and l.status = 'active'
      and (l.expires_at is null or l.expires_at > now())
  ) then
    raise exception 'ACTIVE_LICENSE_REQUIRED' using errcode='42501';
  end if;

  return query
  select s.base_currency, s.charge_currency, s.current_rate, s.rate_source, s.rate_updated_at, true
  from public.project_exchange_settings s
  where s.project_id = target_project_id;
end;
$$;

grant execute on function public.get_my_project_exchange_rate(uuid) to authenticated;

create or replace function public.mark_my_notification_read(target_notification_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid; affected integer;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  update public.notification_outbox
  set read_at = coalesce(read_at, now())
  where id = target_notification_id and user_id = actor;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

grant execute on function public.mark_my_notification_read(bigint) to authenticated;

create or replace function app_private.sync_eltoque_exchange_rate(target_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.project_exchange_settings%rowtype;
  api_token text;
  response extensions.http_response;
  payload jsonb;
  provider_code text;
  fetched_rate numeric;
  previous_rate numeric;
  error_text text;
begin
  select * into cfg from public.project_exchange_settings where project_id = target_project_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'settings_not_found');
  end if;
  if not cfg.auto_sync_enabled or cfg.rate_mode <> 'automatic' then
    return jsonb_build_object('ok', true, 'status', 'disabled');
  end if;
  if cfg.charge_currency <> 'CUP' then
    update public.project_exchange_settings set last_auto_sync_at=now(), last_auto_sync_status='unsupported_pair', last_auto_sync_error='elTOQUE se integra aquí como divisa/CUP', updated_at=now() where project_id=target_project_id;
    return jsonb_build_object('ok', false, 'status', 'unsupported_pair');
  end if;

  select decrypted_secret into api_token from vault.decrypted_secrets where name='eltoque_api_key' limit 1;
  if nullif(api_token,'') is null then
    update public.project_exchange_settings set last_auto_sync_at=now(), last_auto_sync_status='missing_secret', last_auto_sync_error='Falta el secreto eltoque_api_key en Supabase Vault', updated_at=now() where project_id=target_project_id;
    return jsonb_build_object('ok', false, 'status', 'missing_secret');
  end if;

  provider_code := case cfg.auto_currency when 'EUR' then 'ECU' else cfg.auto_currency end;
  begin
    response := extensions.http(
      row(
        'GET',
        'https://tasas.eltoque.com/v1/trmi',
        array[
          extensions.http_header('Authorization', 'Bearer ' || api_token),
          extensions.http_header('Accept', 'application/json')
        ],
        null,
        null
      )::extensions.http_request
    );

    if response.status <> 200 then
      error_text := 'HTTP ' || response.status::text;
      update public.project_exchange_settings set last_auto_sync_at=now(), last_auto_sync_status='http_error', last_auto_sync_error=error_text, updated_at=now() where project_id=target_project_id;
      return jsonb_build_object('ok', false, 'status', 'http_error', 'http_status', response.status);
    end if;

    payload := response.content::jsonb;
    fetched_rate := nullif(payload -> 'tasas' ->> provider_code, '')::numeric;
    if fetched_rate is null or fetched_rate <= 0 then
      update public.project_exchange_settings set last_auto_sync_at=now(), last_auto_sync_status='invalid_payload', last_auto_sync_error='La respuesta no contiene una tasa válida para ' || provider_code, updated_at=now() where project_id=target_project_id;
      return jsonb_build_object('ok', false, 'status', 'invalid_payload');
    end if;

    previous_rate := cfg.current_rate;
    update public.project_exchange_settings
    set current_rate=fetched_rate,
        rate_source='elTOQUE',
        rate_updated_at=now(),
        manual_updated_by=null,
        last_auto_sync_at=now(),
        last_auto_sync_status='ok',
        last_auto_sync_error=null,
        updated_at=now()
    where project_id=target_project_id;

    if previous_rate is distinct from fetched_rate then
      insert into public.project_exchange_rate_history(project_id, base_currency, charge_currency, rate, rate_mode, rate_source, changed_by)
      values(target_project_id, cfg.base_currency, cfg.charge_currency, fetched_rate, 'automatic', 'elTOQUE', null);
    end if;

    return jsonb_build_object('ok', true, 'status', 'ok', 'rate', fetched_rate, 'currency', cfg.auto_currency, 'source', 'elTOQUE');
  exception when others then
    error_text := left(sqlerrm, 500);
    update public.project_exchange_settings set last_auto_sync_at=now(), last_auto_sync_status='error', last_auto_sync_error=error_text, updated_at=now() where project_id=target_project_id;
    return jsonb_build_object('ok', false, 'status', 'error', 'message', error_text);
  end;
end;
$$;

create or replace function app_private.enqueue_daily_rate_notification(target_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.project_exchange_settings%rowtype;
  local_now timestamp;
  local_date date;
  local_hour int;
  inserted_count int := 0;
  formatted_rate text;
begin
  select * into cfg from public.project_exchange_settings where project_id=target_project_id for update;
  if not found or not cfg.daily_rate_notification_enabled then
    return jsonb_build_object('ok', true, 'status', 'disabled');
  end if;

  local_now := timezone(cfg.daily_rate_notification_timezone, now());
  local_date := local_now::date;
  local_hour := extract(hour from local_now)::int;

  if local_hour <> cfg.daily_rate_notification_hour then
    return jsonb_build_object('ok', true, 'status', 'not_due');
  end if;
  if cfg.last_daily_rate_notification_date = local_date then
    return jsonb_build_object('ok', true, 'status', 'already_queued');
  end if;
  if cfg.rate_mode <> 'automatic' or cfg.last_auto_sync_status <> 'ok' or cfg.last_auto_sync_at is null or cfg.last_auto_sync_at < now() - interval '2 hours' then
    return jsonb_build_object('ok', false, 'status', 'rate_not_fresh');
  end if;

  formatted_rate := trim(to_char(cfg.current_rate, 'FM999999990.00'));

  insert into public.notification_outbox(project_id, user_id, kind, notification_date, title, body, data)
  select distinct
    target_project_id,
    l.user_id,
    'daily_exchange_rate',
    local_date,
    'Tasa de cambio de hoy',
    '1 ' || cfg.base_currency || ' = ' || formatted_rate || ' ' || cfg.charge_currency || '. Fuente: elTOQUE. Valor referencial.',
    jsonb_build_object(
      'rate', cfg.current_rate,
      'base_currency', cfg.base_currency,
      'charge_currency', cfg.charge_currency,
      'source', 'elTOQUE',
      'updated_at', cfg.rate_updated_at
    )
  from public.licenses l
  left join public.user_notification_preferences pref
    on pref.project_id=l.project_id and pref.user_id=l.user_id
  where l.project_id=target_project_id
    and l.status='active'
    and l.license_type <> 'admin'
    and (l.expires_at is null or l.expires_at > now())
    and coalesce(pref.daily_rate_enabled, true)
  on conflict (project_id, user_id, kind, notification_date) do nothing;

  get diagnostics inserted_count = row_count;

  update public.project_exchange_settings
  set last_daily_rate_notification_date=local_date, updated_at=now()
  where project_id=target_project_id;

  return jsonb_build_object('ok', true, 'status', 'queued', 'count', inserted_count, 'date', local_date);
end;
$$;

create or replace function app_private.run_exchange_rate_automation(target_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare sync_result jsonb; notify_result jsonb;
begin
  sync_result := app_private.sync_eltoque_exchange_rate(target_project_id);
  notify_result := app_private.enqueue_daily_rate_notification(target_project_id);
  return jsonb_build_object('sync', sync_result, 'notification', notify_result);
end;
$$;

update public.project_exchange_settings
set rate_mode='automatic',
    auto_provider='eltoque',
    auto_currency='USD',
    auto_sync_enabled=true,
    daily_rate_notification_enabled=true,
    daily_rate_notification_hour=8,
    daily_rate_notification_timezone='America/Havana',
    rate_source=case when rate_source='manual' then 'manual' else rate_source end,
    updated_at=now()
where project_id='dfb41cea-a812-46f2-b511-7a60bd3d78af';

select cron.schedule(
  'tuktuk-eltoque-hourly',
  '5 * * * *',
  $$select app_private.run_exchange_rate_automation('dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid);$$
);
