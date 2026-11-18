-- Captura verificable de la version realmente instalada por conductor.
-- No presupone que recibir un push equivalga a instalar la APK.
-- La version 1.0.22 (24) no emite estos datos; la primera medicion
-- comenzara con una futura APK que incluya el registro.

create table if not exists public.driver_android_installs (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  installed_version text not null
    check (installed_version ~ '^[0-9]+([.][0-9]+){1,3}$'),
  installed_build integer not null check (installed_build > 0),
  last_reported_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists driver_android_installs_recent_idx
  on public.driver_android_installs(project_id, last_reported_at desc);

alter table public.driver_android_installs enable row level security;
revoke all on public.driver_android_installs from anon, authenticated;

create or replace function public.driver_report_android_install(
  target_project_id uuid, target_version text, target_build integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_version text := btrim(coalesce(target_version, ''));
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if v_version !~ '^[0-9]+([.][0-9]+){1,3}$'
     or length(v_version) > 24 or target_build is null
     or target_build <= 0 then
    raise exception 'INVALID_APP_BUILD' using errcode = '22023';
  end if;
  -- Never accept a user_id from the client.
  if not exists (
    select 1 from public.driver_profiles d
    where d.project_id = target_project_id and d.user_id = v_user
  ) then
    raise exception 'DRIVER_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  insert into public.driver_android_installs
    (project_id, user_id, installed_version, installed_build, last_reported_at)
  values (target_project_id, v_user, v_version, target_build, now())
  on conflict (project_id, user_id) do update
    set installed_version = excluded.installed_version,
        installed_build = excluded.installed_build,
        last_reported_at = now()
  where public.driver_android_installs.installed_version is distinct from excluded.installed_version
     or public.driver_android_installs.installed_build is distinct from excluded.installed_build
     or public.driver_android_installs.last_reported_at < now() - interval '15 minutes';
end;
$function$;

revoke all on function public.driver_report_android_install(uuid, text, integer) from public;
grant execute on function public.driver_report_android_install(uuid, text, integer) to authenticated;

create or replace function public.admin_get_driver_android_adoption(target_project_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  v_build integer;
  v_version text;
  v_total integer := 0;
  v_current integer := 0;
  v_outdated integer := 0;
  v_unknown integer := 0;
  v_stale integer := 0;
  v_last_report timestamptz;
begin
  perform app_private.require_project_permission(target_project_id, 'settings.view');

  select r.latest_build, r.latest_version
    into v_build, v_version
  from public.project_app_releases r
  where r.project_id = target_project_id and r.platform = 'android';

  select count(*)::integer,
    count(*) filter (
      where i.last_reported_at >= now() - interval '30 days'
        and i.installed_build >= coalesce(v_build, 2147483647)
    )::integer,
    count(*) filter (
      where i.last_reported_at >= now() - interval '30 days'
        and i.installed_build < coalesce(v_build, 0)
    )::integer,
    count(*) filter (
      where i.user_id is null or i.last_reported_at < now() - interval '30 days'
    )::integer,
    count(*) filter (
      where i.user_id is not null and i.last_reported_at < now() - interval '30 days'
    )::integer,
    max(i.last_reported_at)
  into v_total, v_current, v_outdated, v_unknown, v_stale, v_last_report
  from public.driver_profiles d
  left join public.driver_android_installs i
    on i.project_id = d.project_id and i.user_id = d.user_id
  where d.project_id = target_project_id and d.status = 'active';

  return jsonb_build_object(
    'target_version', coalesce(v_version, ''),
    'target_build', coalesce(v_build, 0),
    'active_drivers', v_total,
    'current_drivers', v_current,
    'outdated_drivers', v_outdated,
    'unknown_drivers', v_unknown,
    'stale_reports', v_stale,
    'last_reported_at', v_last_report
  );
end;
$function$;

revoke all on function public.admin_get_driver_android_adoption(uuid) from public;
grant execute on function public.admin_get_driver_android_adoption(uuid) to authenticated;
