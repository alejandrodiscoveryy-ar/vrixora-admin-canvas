alter table public.project_exchange_settings
  add column if not exists fallback_rate numeric;

update public.project_exchange_settings
set fallback_rate = current_rate
where fallback_rate is null;

alter table public.project_exchange_settings
  alter column fallback_rate set default 1,
  alter column fallback_rate set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_exchange_settings_fallback_rate_check'
      and conrelid = 'public.project_exchange_settings'::regclass
  ) then
    alter table public.project_exchange_settings
      add constraint project_exchange_settings_fallback_rate_check
      check (fallback_rate > 0);
  end if;
end;
$$;

create or replace function app_private.eltoque_secret_name(target_project_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'eltoque_api_key_' || replace(target_project_id::text, '-', '');
$$;

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
  secret_name text;
begin
  select * into cfg
  from public.project_exchange_settings
  where project_id = target_project_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'settings_not_found');
  end if;

  if not cfg.auto_sync_enabled or cfg.rate_mode <> 'automatic' then
    return jsonb_build_object('ok', true, 'status', 'disabled');
  end if;

  if cfg.charge_currency <> 'CUP' then
    update public.project_exchange_settings
    set last_auto_sync_at = now(),
        last_auto_sync_status = 'unsupported_pair',
        last_auto_sync_error = 'elTOQUE se integra aquí como divisa/CUP',
        updated_at = now()
    where project_id = target_project_id;

    return jsonb_build_object(
      'ok', false,
      'status', 'unsupported_pair',
      'fallback_rate', cfg.fallback_rate
    );
  end if;

  secret_name := app_private.eltoque_secret_name(target_project_id);

  select decrypted_secret
  into api_token
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;

  if nullif(api_token, '') is null then
    select decrypted_secret
    into api_token
    from vault.decrypted_secrets
    where name = 'eltoque_api_key'
    limit 1;
  end if;

  if nullif(api_token, '') is null then
    update public.project_exchange_settings
    set last_auto_sync_at = now(),
        last_auto_sync_status = 'missing_secret',
        last_auto_sync_error = 'Falta la clave API de elTOQUE',
        updated_at = now()
    where project_id = target_project_id;

    return jsonb_build_object(
      'ok', false,
      'status', 'missing_secret',
      'fallback_rate', cfg.fallback_rate
    );
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

      update public.project_exchange_settings
      set last_auto_sync_at = now(),
          last_auto_sync_status = 'http_error',
          last_auto_sync_error = error_text,
          updated_at = now()
      where project_id = target_project_id;

      return jsonb_build_object(
        'ok', false,
        'status', 'http_error',
        'http_status', response.status,
        'fallback_rate', cfg.fallback_rate
      );
    end if;

    payload := response.content::jsonb;
    fetched_rate := nullif(payload -> 'tasas' ->> provider_code, '')::numeric;

    if fetched_rate is null or fetched_rate <= 0 then
      update public.project_exchange_settings
      set last_auto_sync_at = now(),
          last_auto_sync_status = 'invalid_payload',
          last_auto_sync_error = 'La respuesta no contiene una tasa válida para ' || provider_code,
          updated_at = now()
      where project_id = target_project_id;

      return jsonb_build_object(
        'ok', false,
        'status', 'invalid_payload',
        'fallback_rate', cfg.fallback_rate
      );
    end if;

    previous_rate := cfg.current_rate;

    update public.project_exchange_settings
    set current_rate = fetched_rate,
        rate_source = 'elTOQUE',
        rate_updated_at = now(),
        manual_updated_by = null,
        last_auto_sync_at = now(),
        last_auto_sync_status = 'ok',
        last_auto_sync_error = null,
        updated_at = now()
    where project_id = target_project_id;

    if previous_rate is distinct from fetched_rate then
      insert into public.project_exchange_rate_history(
        project_id,
        base_currency,
        charge_currency,
        rate,
        rate_mode,
        rate_source,
        changed_by
      )
      values(
        target_project_id,
        cfg.base_currency,
        cfg.charge_currency,
        fetched_rate,
        'automatic',
        'elTOQUE',
        null
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'ok',
      'rate', fetched_rate,
      'currency', cfg.auto_currency,
      'source', 'elTOQUE'
    );
  exception when others then
    error_text := left(sqlerrm, 500);

    update public.project_exchange_settings
    set last_auto_sync_at = now(),
        last_auto_sync_status = 'error',
        last_auto_sync_error = error_text,
        updated_at = now()
    where project_id = target_project_id;

    return jsonb_build_object(
      'ok', false,
      'status', 'error',
      'message', error_text,
      'fallback_rate', cfg.fallback_rate
    );
  end;
end;
$$;

create or replace function public.admin_get_eltoque_integration(target_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg public.project_exchange_settings%rowtype;
  project_secret_name text;
  project_secret_exists boolean := false;
  legacy_secret_exists boolean := false;
  enabled_push_tokens integer := 0;
  pending_notifications integer := 0;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.view');

  select * into cfg
  from public.project_exchange_settings
  where project_id = target_project_id;

  if not found then
    raise exception 'PROJECT_SETTINGS_NOT_FOUND' using errcode = 'P0002';
  end if;

  project_secret_name := app_private.eltoque_secret_name(target_project_id);

  select exists(
    select 1 from vault.secrets where name = project_secret_name
  ) into project_secret_exists;

  select exists(
    select 1 from vault.secrets where name = 'eltoque_api_key'
  ) into legacy_secret_exists;

  select count(*)::integer
  into enabled_push_tokens
  from public.push_device_tokens token
  where token.project_id = target_project_id
    and token.enabled;

  select count(*)::integer
  into pending_notifications
  from public.notification_outbox notice
  where notice.project_id = target_project_id
    and notice.delivery_status = 'pending';

  return jsonb_build_object(
    'project_id', target_project_id,
    'provider', 'elTOQUE',
    'api_key_configured', project_secret_exists or legacy_secret_exists,
    'api_key_scope', case
      when project_secret_exists then 'project'
      when legacy_secret_exists then 'legacy'
      else 'missing'
    end,
    'auto_sync_enabled', cfg.auto_sync_enabled,
    'auto_currency', cfg.auto_currency,
    'base_currency', cfg.base_currency,
    'charge_currency', cfg.charge_currency,
    'current_rate', cfg.current_rate,
    'fallback_rate', cfg.fallback_rate,
    'rate_source', cfg.rate_source,
    'rate_updated_at', cfg.rate_updated_at,
    'last_auto_sync_at', cfg.last_auto_sync_at,
    'last_auto_sync_status', cfg.last_auto_sync_status,
    'last_auto_sync_error', cfg.last_auto_sync_error,
    'daily_rate_notification_enabled', cfg.daily_rate_notification_enabled,
    'daily_rate_notification_hour', cfg.daily_rate_notification_hour,
    'daily_rate_notification_timezone', cfg.daily_rate_notification_timezone,
    'last_daily_rate_notification_date', cfg.last_daily_rate_notification_date,
    'sync_schedule', '5 * * * *',
    'enabled_push_tokens', enabled_push_tokens,
    'pending_notifications', pending_notifications,
    'can_manage', app_private.has_project_permission(target_project_id, 'settings.manage')
  );
end;
$$;

create or replace function public.admin_save_eltoque_integration(
  target_project_id uuid,
  target_api_key text,
  target_auto_sync_enabled boolean,
  target_auto_currency text,
  target_fallback_rate numeric,
  target_daily_notification_enabled boolean,
  target_notification_hour integer,
  target_notification_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  secret_name text;
  existing_secret_id uuid;
  sync_result jsonb;
  current_base text;
  current_charge text;
begin
  actor := app_private.require_project_permission(target_project_id, 'settings.manage');

  if target_auto_currency not in ('USD', 'EUR') then
    raise exception 'INVALID_ELTOQUE_CURRENCY' using errcode = '22023';
  end if;

  if target_fallback_rate is null or target_fallback_rate <= 0 then
    raise exception 'INVALID_FALLBACK_RATE' using errcode = '22023';
  end if;

  if target_notification_hour is null or target_notification_hour < 0 or target_notification_hour > 23 then
    raise exception 'INVALID_NOTIFICATION_HOUR' using errcode = '22023';
  end if;

  if nullif(btrim(target_notification_timezone), '') is null
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names
       where name = btrim(target_notification_timezone)
     ) then
    raise exception 'INVALID_NOTIFICATION_TIMEZONE' using errcode = '22023';
  end if;

  select base_currency, charge_currency
  into current_base, current_charge
  from public.project_exchange_settings
  where project_id = target_project_id
  for update;

  if not found then
    raise exception 'PROJECT_SETTINGS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if target_auto_sync_enabled and current_charge <> 'CUP' then
    raise exception 'ELTOQUE_REQUIRES_CUP_CHARGE' using errcode = '22023';
  end if;

  if target_auto_sync_enabled and current_base <> target_auto_currency then
    raise exception 'ELTOQUE_CURRENCY_MUST_MATCH_BASE' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(target_api_key, '')), '') is not null then
    if length(btrim(target_api_key)) < 20 then
      raise exception 'INVALID_ELTOQUE_API_KEY' using errcode = '22023';
    end if;

    secret_name := app_private.eltoque_secret_name(target_project_id);

    select id
    into existing_secret_id
    from vault.secrets
    where name = secret_name
    limit 1;

    if existing_secret_id is null then
      perform vault.create_secret(
        btrim(target_api_key),
        secret_name,
        'API oficial de Tasas elTOQUE para proyecto ' || target_project_id::text
      );
    else
      perform vault.update_secret(
        existing_secret_id,
        btrim(target_api_key),
        secret_name,
        'API oficial de Tasas elTOQUE para proyecto ' || target_project_id::text
      );
    end if;
  end if;

  update public.project_exchange_settings
  set rate_mode = case when target_auto_sync_enabled then 'automatic' else 'manual' end,
      auto_provider = 'eltoque',
      auto_currency = target_auto_currency,
      auto_sync_enabled = target_auto_sync_enabled,
      fallback_rate = target_fallback_rate,
      daily_rate_notification_enabled = target_daily_notification_enabled,
      daily_rate_notification_hour = target_notification_hour,
      daily_rate_notification_timezone = btrim(target_notification_timezone),
      updated_at = now()
  where project_id = target_project_id;

  if target_auto_sync_enabled then
    sync_result := app_private.sync_eltoque_exchange_rate(target_project_id);
  else
    sync_result := jsonb_build_object('ok', true, 'status', 'disabled');
  end if;

  insert into public.audit_events(
    project_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values(
    target_project_id,
    actor,
    'update',
    'project_exchange_settings',
    target_project_id::text,
    jsonb_build_object(
      'integration', 'elTOQUE',
      'api_key_changed', nullif(btrim(coalesce(target_api_key, '')), '') is not null,
      'auto_sync_enabled', target_auto_sync_enabled,
      'auto_currency', target_auto_currency,
      'fallback_rate', target_fallback_rate,
      'daily_rate_notification_enabled', target_daily_notification_enabled,
      'daily_rate_notification_hour', target_notification_hour,
      'daily_rate_notification_timezone', btrim(target_notification_timezone)
    )
  );

  return jsonb_build_object(
    'settings', public.admin_get_eltoque_integration(target_project_id),
    'sync', sync_result
  );
end;
$$;

create or replace function public.admin_sync_eltoque_now(target_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sync_result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.manage');

  sync_result := app_private.sync_eltoque_exchange_rate(target_project_id);

  return jsonb_build_object(
    'settings', public.admin_get_eltoque_integration(target_project_id),
    'sync', sync_result
  );
end;
$$;

revoke all on function public.admin_get_eltoque_integration(uuid)
from public, anon;
revoke all on function public.admin_save_eltoque_integration(uuid, text, boolean, text, numeric, boolean, integer, text)
from public, anon;
revoke all on function public.admin_sync_eltoque_now(uuid)
from public, anon;

grant execute on function public.admin_get_eltoque_integration(uuid)
to authenticated;
grant execute on function public.admin_save_eltoque_integration(uuid, text, boolean, text, numeric, boolean, integer, text)
to authenticated;
grant execute on function public.admin_sync_eltoque_now(uuid)
to authenticated;