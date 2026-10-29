-- Update Center: release metadata only; off by default.
-- Existing projects.minimum_version and projects.force_update remain authoritative.
create table if not exists public.project_app_releases (
  project_id uuid not null references public.projects(id) on delete cascade,
  platform text not null default 'android' check (platform = 'android'),
  enabled boolean not null default false,
  latest_version text not null default '',
  latest_build integer not null default 0 check (latest_build >= 0),
  download_url text not null default '',
  release_notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (project_id, platform),
  constraint app_release_version_limit check (char_length(latest_version) <= 24),
  constraint app_release_url_limit check (char_length(download_url) <= 1500),
  constraint app_release_notes_limit check (char_length(release_notes) <= 1800)
);

alter table public.project_app_releases enable row level security;
revoke all on public.project_app_releases from public, anon, authenticated;

-- Access is deliberately RPC-only. Keep the release table invisible to
-- the Data API, including internal updated_by metadata. The public function
-- exposes only its explicit release fields.

create or replace function public.get_public_app_release(
  target_project_id uuid, target_platform text default 'android'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare payload jsonb;
begin
  if target_platform <> 'android' then return null; end if;
  select jsonb_build_object(
    'enabled', r.enabled,
    'latest_version', r.latest_version,
    'latest_build', r.latest_build,
    'download_url', r.download_url,
    'release_notes', r.release_notes,
    'minimum_version', coalesce(p.minimum_version, ''),
    'force_update', coalesce(p.force_update, false)
  ) into payload
  from public.project_app_releases r
  join public.projects p on p.id = r.project_id
  where r.project_id = target_project_id and r.platform = target_platform and r.enabled = true;
  return payload;
end;
$$;
revoke all on function public.get_public_app_release(uuid,text) from public;
grant execute on function public.get_public_app_release(uuid,text) to anon, authenticated;

create or replace function public.admin_get_app_release(
  target_project_id uuid, target_platform text default 'android'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare payload jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.manage');
  select jsonb_build_object(
    'enabled', enabled,
    'latest_version', latest_version,
    'latest_build', latest_build,
    'download_url', download_url,
    'release_notes', release_notes
  ) into payload
  from public.project_app_releases
  where project_id = target_project_id and platform = target_platform;
  return coalesce(payload, jsonb_build_object(
    'enabled', false, 'latest_version', '', 'latest_build', 0,
    'download_url', '', 'release_notes', ''
  ));
end;
$$;
revoke all on function public.admin_get_app_release(uuid,text) from public, anon;
grant execute on function public.admin_get_app_release(uuid,text) to authenticated;

create or replace function public.admin_set_app_release(
  target_project_id uuid,
  target_platform text,
  target_enabled boolean,
  target_latest_version text,
  target_latest_build integer,
  target_download_url text,
  target_release_notes text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  normalized_version text := coalesce(btrim(target_latest_version), '');
  normalized_url text := coalesce(btrim(target_download_url), '');
  normalized_notes text := coalesce(btrim(target_release_notes), '');
begin
  perform app_private.require_project_permission(target_project_id, 'settings.manage');
  if target_platform <> 'android' then
    raise exception 'INVALID_PLATFORM' using errcode = '22023';
  end if;
  if coalesce(target_enabled, false) and (
      normalized_version !~ '^[0-9]+([.][0-9]+){1,3}$' or
      coalesce(target_latest_build, 0) <= 0 or
      normalized_url !~ '^https://[^[:space:]/@]+(/[^[:space:]]*)?$'
    ) then
    raise exception 'INVALID_RELEASE_CONFIGURATION' using errcode = '22023';
  end if;
  if char_length(normalized_version) > 24 or char_length(normalized_url) > 1500
     or char_length(normalized_notes) > 1800 then
    raise exception 'RELEASE_FIELD_TOO_LONG' using errcode = '22023';
  end if;
  insert into public.project_app_releases (
    project_id, platform, enabled, latest_version, latest_build,
    download_url, release_notes, updated_at, updated_by
  ) values (
    target_project_id, target_platform, coalesce(target_enabled, false),
    normalized_version, greatest(coalesce(target_latest_build, 0), 0),
    normalized_url, normalized_notes, now(), auth.uid()
  )
  on conflict (project_id, platform) do update set
    enabled = excluded.enabled,
    latest_version = excluded.latest_version,
    latest_build = excluded.latest_build,
    download_url = excluded.download_url,
    release_notes = excluded.release_notes,
    updated_at = now(), updated_by = auth.uid();
end;
$$;
revoke all on function public.admin_set_app_release(uuid,text,boolean,text,integer,text,text) from public, anon;
grant execute on function public.admin_set_app_release(uuid,text,boolean,text,integer,text,text) to authenticated;
