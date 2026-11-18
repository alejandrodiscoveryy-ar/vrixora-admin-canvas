-- Centro unificado de actualizaciones Android para conductores.
-- No activa avisos ni envía notificaciones al aplicar esta migración.
-- Los avisos push son manuales, idempotentes por compilación y dirigidos
-- exclusivamente a conductores activos con token Android habilitado.

create or replace function public.admin_get_driver_app_update_audience(
  target_project_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_users integer := 0;
  v_tokens integer := 0;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.view');

  select count(distinct d.user_id)::integer, count(distinct t.id)::integer
  into v_users, v_tokens
  from public.driver_profiles d
  join public.push_device_tokens t
    on t.project_id = d.project_id and t.user_id = d.user_id
  where d.project_id = target_project_id
    and d.status = 'active'
    and t.platform = 'android'
    and t.enabled = true;

  return jsonb_build_object(
    'project_id', target_project_id,
    'eligible_android_users', v_users,
    'enabled_android_tokens', v_tokens
  );
end;
$$;

revoke all on function public.admin_get_driver_app_update_audience(uuid) from public, anon;
grant execute on function public.admin_get_driver_app_update_audience(uuid) to authenticated;

create or replace function public.admin_send_driver_app_update(
  target_project_id uuid,
  target_release_version text,
  target_release_build integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid;
  v_release public.project_app_releases%rowtype;
  v_audience integer := 0;
  v_dispatch_id bigint;
  v_dispatch_triggered boolean := false;
  v_dispatch_secret text;
  v_broadcast uuid := gen_random_uuid();
  v_body text;
  v_dedupe text;
begin
  v_actor := app_private.require_project_permission(target_project_id, 'settings.manage');

  select * into v_release
  from public.project_app_releases
  where project_id = target_project_id and platform = 'android'
  for update;

  if not found or v_release.enabled is distinct from true
     or v_release.latest_version !~ '^[0-9]+([.][0-9]+){1,3}$'
     or v_release.latest_build <= 0 then
    raise exception 'ANDROID_RELEASE_NOT_ENABLED' using errcode = '22023';
  end if;

  -- La notificación ha de referirse a la misma publicación que está guardada.
  if v_release.latest_version is distinct from btrim(coalesce(target_release_version, ''))
     or v_release.latest_build is distinct from target_release_build then
    raise exception 'ANDROID_RELEASE_CHANGED_REFRESH' using errcode = '22023';
  end if;

  if v_release.download_url is distinct from
     'https://play.google.com/store/apps/details?id=com.alejandrocruz.tuktukcontrol' then
    raise exception 'INVALID_OFFICIAL_PLAY_URL' using errcode = '22023';
  end if;

  v_body := left(
    btrim(regexp_replace(regexp_replace(coalesce(v_release.release_notes, ''), '[*#`]', '', 'g'), '[[:space:]]+', ' ', 'g')),
    500
  );
  if v_body = '' then
    v_body := 'Ya puedes actualizar TukTuk Conductor desde Google Play.';
  end if;

  -- Impide envíos duplicados del mismo número de compilación aunque se repita el clic.
  v_dedupe := 'driver_android_release:' || v_release.latest_build::text;

  insert into public.notification_outbox(
    project_id, user_id, kind, notification_date,
    dedupe_key, title, body, data
  )
  select distinct
    target_project_id, d.user_id, 'app_update',
    timezone('America/Havana', now())::date,
    v_dedupe, 'Nueva versión de TukTuk Conductor', v_body,
    jsonb_build_object(
      'announcement_id', v_broadcast,
      'category', 'app_update',
      'target_platform', 'android',
      'release_version', v_release.latest_version,
      'release_build', v_release.latest_build,
      'action_url', v_release.download_url,
      'created_by', v_actor,
      'created_at', now()
    )
  from public.driver_profiles d
  where d.project_id = target_project_id
    and d.status = 'active'
    and exists (
      select 1 from public.push_device_tokens t
      where t.project_id = d.project_id
        and t.user_id = d.user_id
        and t.platform = 'android'
        and t.enabled = true
    )
  on conflict (project_id, user_id, kind, dedupe_key) do nothing;

  get diagnostics v_audience = row_count;

  if v_audience > 0 then
    begin
      select s.decrypted_secret into v_dispatch_secret
      from vault.decrypted_secrets s
      where s.name = 'tuktuk_push_dispatch_secret'
      limit 1;

      if nullif(v_dispatch_secret, '') is not null then
        select net.http_post(
          url := 'https://vvxvnywzgtqhlaqpxyqh.supabase.co/functions/v1/send-push-notifications',
          body := jsonb_build_object('limit', 100),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-tuktuk-dispatch-secret', v_dispatch_secret
          ),
          timeout_milliseconds := 5000
        ) into v_dispatch_id;
        v_dispatch_triggered := v_dispatch_id is not null;
      end if;
    exception when others then
      v_dispatch_id := null;
      v_dispatch_triggered := false;
    end;
  end if;

  insert into public.audit_events(project_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    target_project_id, v_actor, 'send', 'push_announcement', v_broadcast::text,
    jsonb_build_object(
      'category', 'app_update',
      'release_version', v_release.latest_version,
      'release_build', v_release.latest_build,
      'queued_users', v_audience,
      'dispatch_triggered', v_dispatch_triggered,
      'target_population', 'active_drivers'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'broadcast_id', v_broadcast,
    'kind', 'app_update',
    'target_platform', 'android',
    'queued_users', v_audience,
    'dispatch_triggered', v_dispatch_triggered
  );
end;
$$;

revoke all on function public.admin_send_driver_app_update(uuid,text,integer) from public, anon;
grant execute on function public.admin_send_driver_app_update(uuid,text,integer) to authenticated;
