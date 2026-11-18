-- TukTuk 2.0: broadcasts to active driver profiles rather than legacy licenses.
-- All other projects retain their prior license-based audience.
-- This migration changes selection only; it does not enqueue/send notifications.
CREATE OR REPLACE FUNCTION public.admin_get_mobile_push_audience(target_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  android_users integer := 0;
  android_tokens integer := 0;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.view');

  select count(distinct l.user_id)::integer
  into android_users
  from (
    select d.project_id, d.user_id
    from public.driver_profiles d
    where d.project_id = 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid and d.status = 'active'
    union all
    select l.project_id, l.user_id
    from public.licenses l
    where l.project_id <> 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid
      and l.status = 'active'
      and (l.expires_at is null or l.expires_at > now())
  ) l
  where l.project_id = target_project_id
    and exists (
      select 1
      from public.push_device_tokens t
      where t.project_id = l.project_id
        and t.user_id = l.user_id
        and t.enabled = true
        and t.platform = 'android'
    );

  select count(*)::integer
  into android_tokens
  from public.push_device_tokens t
  where t.project_id = target_project_id
    and t.enabled = true
    and t.platform = 'android'
    and exists (
      select 1
      from (
    select d.project_id, d.user_id
    from public.driver_profiles d
    where d.project_id = 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid and d.status = 'active'
    union all
    select l.project_id, l.user_id
    from public.licenses l
    where l.project_id <> 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid
      and l.status = 'active'
      and (l.expires_at is null or l.expires_at > now())
  ) l
      where l.project_id = t.project_id
        and l.user_id = t.user_id
    );

  return jsonb_build_object(
    'project_id', target_project_id,
    'eligible_android_users', android_users,
    'enabled_android_tokens', android_tokens
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_send_mobile_announcement(target_project_id uuid, target_category text, target_title text, target_body text, target_release_version text DEFAULT NULL::text, target_action_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
  broadcast_id uuid := gen_random_uuid();
  queued_users integer := 0;
  notice_kind text;
  notification_day date;
  timezone_name text := 'America/Havana';
  dispatch_request_id bigint;
  dispatch_triggered boolean := false;
  dispatch_secret text;
begin
  actor := app_private.require_project_permission(target_project_id, 'settings.manage');

  if target_category not in ('general', 'app_update') then
    raise exception 'INVALID_ANNOUNCEMENT_CATEGORY' using errcode = '22023';
  end if;
  if nullif(btrim(target_title), '') is null or length(btrim(target_title)) > 100 then
    raise exception 'INVALID_ANNOUNCEMENT_TITLE' using errcode = '22023';
  end if;
  if nullif(btrim(target_body), '') is null or length(btrim(target_body)) > 500 then
    raise exception 'INVALID_ANNOUNCEMENT_BODY' using errcode = '22023';
  end if;
  if target_release_version is not null and length(btrim(target_release_version)) > 40 then
    raise exception 'INVALID_RELEASE_VERSION' using errcode = '22023';
  end if;
  if target_action_url is not null and length(btrim(target_action_url)) > 500 then
    raise exception 'INVALID_ACTION_URL' using errcode = '22023';
  end if;

  select coalesce(settings.daily_rate_notification_timezone, timezone_name)
  into timezone_name
  from public.project_exchange_settings as settings
  where settings.project_id = target_project_id;

  timezone_name := coalesce(timezone_name, 'America/Havana');
  notification_day := timezone(timezone_name, now())::date;
  notice_kind := case when target_category = 'app_update' then 'app_update' else 'app_announcement' end;

  insert into public.notification_outbox(
    project_id, user_id, kind, notification_date, dedupe_key, title, body, data
  )
  select distinct
    target_project_id,
    license.user_id,
    notice_kind,
    notification_day,
    'announcement:' || broadcast_id::text,
    btrim(target_title),
    btrim(target_body),
    jsonb_strip_nulls(jsonb_build_object(
      'announcement_id', broadcast_id,
      'category', target_category,
      'target_platform', 'android',
      'release_version', nullif(btrim(coalesce(target_release_version, '')), ''),
      'action_url', nullif(btrim(coalesce(target_action_url, '')), ''),
      'created_by', actor,
      'created_at', now()
    ))
  from (
    select d.project_id, d.user_id
    from public.driver_profiles d
    where d.project_id = 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid and d.status = 'active'
    union all
    select l.project_id, l.user_id
    from public.licenses l
    where l.project_id <> 'dfb41cea-a812-46f2-b511-7a60bd3d78af'::uuid
      and l.status = 'active'
      and (l.expires_at is null or l.expires_at > now())
  ) as license
  where license.project_id = target_project_id
    and exists (
      select 1
      from public.push_device_tokens as token
      where token.project_id = license.project_id
        and token.user_id = license.user_id
        and token.enabled
        and token.platform = 'android'
    )
  on conflict (project_id, user_id, kind, dedupe_key) do nothing;

  get diagnostics queued_users = row_count;

  if queued_users > 0 then
    begin
      select secret.decrypted_secret
      into dispatch_secret
      from vault.decrypted_secrets as secret
      where secret.name = 'tuktuk_push_dispatch_secret'
      limit 1;

      if nullif(dispatch_secret, '') is not null then
        select net.http_post(
          url := 'https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/send-push-notifications',
          body := jsonb_build_object('limit', 100),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-tuktuk-dispatch-secret', dispatch_secret
          ),
          timeout_milliseconds := 5000
        ) into dispatch_request_id;
        dispatch_triggered := dispatch_request_id is not null;
      end if;
    exception when others then
      dispatch_request_id := null;
      dispatch_triggered := false;
    end;
  end if;

  insert into public.audit_events(project_id, actor_id, action, entity_type, entity_id, metadata)
  values(
    target_project_id,
    actor,
    'send',
    'push_announcement',
    broadcast_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'category', target_category,
      'title', btrim(target_title),
      'release_version', nullif(btrim(coalesce(target_release_version, '')), ''),
      'action_url', nullif(btrim(coalesce(target_action_url, '')), ''),
      'target_platform', 'android',
      'queued_users', queued_users,
      'dispatch_triggered', dispatch_triggered,
      'dispatch_request_id', dispatch_request_id
    ))
  );

  return jsonb_build_object(
    'ok', true,
    'broadcast_id', broadcast_id,
    'kind', notice_kind,
    'target_platform', 'android',
    'queued_users', queued_users,
    'dispatch_triggered', dispatch_triggered,
    'dispatch_request_id', dispatch_request_id
  );
end;
$function$
;
