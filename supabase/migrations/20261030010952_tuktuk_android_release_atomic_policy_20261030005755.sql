-- Guardado atomico del centro de actualizaciones Android.
create or replace function public.admin_save_app_release_policy(
  target_project_id uuid,
  target_platform text,
  target_enabled boolean,
  target_latest_version text,
  target_latest_build integer,
  target_download_url text,
  target_release_notes text,
  target_mandatory boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_enabled boolean := coalesce(target_enabled, false);
  v_mandatory boolean := coalesce(target_mandatory, false);
  v_version text := btrim(coalesce(target_latest_version, ''));
  v_url text := btrim(coalesce(target_download_url, ''));
  v_notes text := btrim(coalesce(target_release_notes, ''));
  v_build integer := greatest(coalesce(target_latest_build, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform app_private.require_project_permission(
    target_project_id, 'settings.manage'
  );

  if target_platform is distinct from 'android' then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;

  if char_length(v_version) > 24
     or char_length(v_url) > 1500
     or char_length(v_notes) > 1800 then
    raise exception 'RELEASE_FIELD_TOO_LONG' using errcode = '22023';
  end if;

  if v_enabled and (
    v_version !~ '^[0-9]+([.][0-9]+){1,3}$'
    or v_build <= 0
    or v_url !~ '^https://[^[:space:]/@]+(/[^[:space:]]*)?$'
  ) then
    raise exception 'INVALID_RELEASE_CONFIGURATION' using errcode = '22023';
  end if;

  update public.projects set
    minimum_version =
      case when v_enabled and v_mandatory then v_version else null end,
    force_update = v_enabled and v_mandatory,
    updated_at = now()
  where id = target_project_id;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.project_app_releases (
    project_id, platform, enabled, latest_version, latest_build,
    download_url, release_notes, updated_at, updated_by
  ) values (
    target_project_id, 'android', v_enabled, v_version, v_build,
    v_url, v_notes, now(), auth.uid()
  )
  on conflict (project_id, platform) do update set
    enabled = excluded.enabled,
    latest_version = excluded.latest_version,
    latest_build = excluded.latest_build,
    download_url = excluded.download_url,
    release_notes = excluded.release_notes,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

revoke all on function public.admin_save_app_release_policy(
  uuid,text,boolean,text,integer,text,text,boolean
) from public, anon;

grant execute on function public.admin_save_app_release_policy(
  uuid,text,boolean,text,integer,text,text,boolean
) to authenticated;