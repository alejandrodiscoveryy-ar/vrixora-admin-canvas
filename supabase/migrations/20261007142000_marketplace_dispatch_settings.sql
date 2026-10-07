-- TukTuk Marketplace
-- Configuracion gestionable de la politica de busqueda de conductores.
-- Este bloque define configuracion y persistencia.
-- Todavia NO conecta esta politica con el motor real de despacho.

create table public.project_marketplace_dispatch_settings (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null unique
    references public.projects(id)
    on update cascade
    on delete cascade,

  enabled boolean not null default false,

  radius_search_enabled boolean not null default true,

  radius_1_enabled boolean not null default true,
  radius_1_km numeric(6,2) not null default 1.00
    check (radius_1_km > 0 and radius_1_km <= 100),

  radius_2_enabled boolean not null default true,
  radius_2_km numeric(6,2) not null default 2.00
    check (radius_2_km > 0 and radius_2_km <= 100),

  radius_3_enabled boolean not null default true,
  radius_3_km numeric(6,2) not null default 3.00
    check (radius_3_km > 0 and radius_3_km <= 100),

  expansion_enabled boolean not null default true,

  expansion_seconds integer not null default 30
    check (expansion_seconds between 5 and 600),

  rating_priority_enabled boolean not null default true,

  preferred_min_rating_enabled boolean not null default true,

  preferred_min_rating numeric(2,1) not null default 4.0
    check (preferred_min_rating between 1 and 5),

  minimum_rating_count_enabled boolean not null default true,

  minimum_rating_count integer not null default 5
    check (minimum_rating_count between 0 and 1000),

  allow_below_preferred boolean not null default true,

  allow_outside_max_radius boolean not null default false,

  apply_to_test_jobs boolean not null default false,

  tie_breaker text not null default 'rating_then_distance'
    check (
      tie_breaker in (
        'rating_then_distance',
        'distance_then_rating'
      )
    ),

  updated_by uuid null
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

alter table public.project_marketplace_dispatch_settings
  enable row level security;

revoke all
on public.project_marketplace_dispatch_settings
from public, anon, authenticated;

create trigger audit_marketplace_dispatch_settings
after insert or update
on public.project_marketplace_dispatch_settings
for each row
execute function app_private.capture_audit_event();


create or replace function public.admin_get_marketplace_dispatch_settings(
  target_project_id uuid
)
returns table(
  enabled boolean,
  radius_search_enabled boolean,

  radius_1_enabled boolean,
  radius_1_km numeric,

  radius_2_enabled boolean,
  radius_2_km numeric,

  radius_3_enabled boolean,
  radius_3_km numeric,

  expansion_enabled boolean,
  expansion_seconds integer,

  rating_priority_enabled boolean,

  preferred_min_rating_enabled boolean,
  preferred_min_rating numeric,

  minimum_rating_count_enabled boolean,
  minimum_rating_count integer,

  allow_below_preferred boolean,
  allow_outside_max_radius boolean,

  apply_to_test_jobs boolean,

  tie_breaker text,

  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform app_private.require_project_permission(
    target_project_id,
    'settings.view'
  );

  return query
  select
    coalesce(s.enabled, false),

    coalesce(s.radius_search_enabled, true),

    coalesce(s.radius_1_enabled, true),
    coalesce(s.radius_1_km, 1.00::numeric),

    coalesce(s.radius_2_enabled, true),
    coalesce(s.radius_2_km, 2.00::numeric),

    coalesce(s.radius_3_enabled, true),
    coalesce(s.radius_3_km, 3.00::numeric),

    coalesce(s.expansion_enabled, true),
    coalesce(s.expansion_seconds, 30),

    coalesce(s.rating_priority_enabled, true),

    coalesce(s.preferred_min_rating_enabled, true),
    coalesce(s.preferred_min_rating, 4.0::numeric),

    coalesce(s.minimum_rating_count_enabled, true),
    coalesce(s.minimum_rating_count, 5),

    coalesce(s.allow_below_preferred, true),

    coalesce(s.allow_outside_max_radius, false),

    coalesce(s.apply_to_test_jobs, false),

    coalesce(
      s.tie_breaker,
      'rating_then_distance'
    ),

    s.updated_at,
    s.updated_by

  from public.projects p

  left join public.project_marketplace_dispatch_settings s
    on s.project_id = p.id

  where p.id = target_project_id;
end;
$function$;


create or replace function public.admin_set_marketplace_dispatch_settings(
  target_project_id uuid,

  target_enabled boolean,

  target_radius_search_enabled boolean,

  target_radius_1_enabled boolean,
  target_radius_1_km numeric,

  target_radius_2_enabled boolean,
  target_radius_2_km numeric,

  target_radius_3_enabled boolean,
  target_radius_3_km numeric,

  target_expansion_enabled boolean,
  target_expansion_seconds integer,

  target_rating_priority_enabled boolean,

  target_preferred_min_rating_enabled boolean,
  target_preferred_min_rating numeric,

  target_minimum_rating_count_enabled boolean,
  target_minimum_rating_count integer,

  target_allow_below_preferred boolean,

  target_allow_outside_max_radius boolean,

  target_apply_to_test_jobs boolean,

  target_tie_breaker text
)
returns table(
  enabled boolean,
  radius_search_enabled boolean,

  radius_1_enabled boolean,
  radius_1_km numeric,

  radius_2_enabled boolean,
  radius_2_km numeric,

  radius_3_enabled boolean,
  radius_3_km numeric,

  expansion_enabled boolean,
  expansion_seconds integer,

  rating_priority_enabled boolean,

  preferred_min_rating_enabled boolean,
  preferred_min_rating numeric,

  minimum_rating_count_enabled boolean,
  minimum_rating_count integer,

  allow_below_preferred boolean,

  allow_outside_max_radius boolean,

  apply_to_test_jobs boolean,

  tie_breaker text,

  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid;
begin
  actor := app_private.require_project_permission(
    target_project_id,
    'settings.manage'
  );

  if target_enabled is null
     or target_radius_search_enabled is null
     or target_radius_1_enabled is null
     or target_radius_2_enabled is null
     or target_radius_3_enabled is null
     or target_expansion_enabled is null
     or target_rating_priority_enabled is null
     or target_preferred_min_rating_enabled is null
     or target_minimum_rating_count_enabled is null
     or target_allow_below_preferred is null
     or target_allow_outside_max_radius is null
     or target_apply_to_test_jobs is null then

    raise exception
      'INVALID_MARKETPLACE_DISPATCH_SETTINGS'
      using errcode = '22023';
  end if;

  if target_radius_1_km is null
     or target_radius_1_km <= 0
     or target_radius_1_km > 100
     or target_radius_2_km is null
     or target_radius_2_km <= 0
     or target_radius_2_km > 100
     or target_radius_3_km is null
     or target_radius_3_km <= 0
     or target_radius_3_km > 100 then

    raise exception
      'INVALID_MARKETPLACE_DISPATCH_RADIUS'
      using errcode = '22023';
  end if;

  if target_radius_search_enabled
     and not (
       target_radius_1_enabled
       or target_radius_2_enabled
       or target_radius_3_enabled
     ) then

    raise exception
      'MARKETPLACE_DISPATCH_RADIUS_REQUIRED'
      using errcode = '22023';
  end if;

  if target_radius_1_enabled
     and target_radius_2_enabled
     and target_radius_2_km <= target_radius_1_km then

    raise exception
      'MARKETPLACE_DISPATCH_RADIUS_ORDER_INVALID'
      using errcode = '22023';
  end if;

  if target_radius_2_enabled
     and target_radius_3_enabled
     and target_radius_3_km <= target_radius_2_km then

    raise exception
      'MARKETPLACE_DISPATCH_RADIUS_ORDER_INVALID'
      using errcode = '22023';
  end if;

  if target_radius_1_enabled
     and not target_radius_2_enabled
     and target_radius_3_enabled
     and target_radius_3_km <= target_radius_1_km then

    raise exception
      'MARKETPLACE_DISPATCH_RADIUS_ORDER_INVALID'
      using errcode = '22023';
  end if;

  if target_expansion_seconds is null
     or target_expansion_seconds < 5
     or target_expansion_seconds > 600 then

    raise exception
      'INVALID_MARKETPLACE_DISPATCH_EXPANSION_TIME'
      using errcode = '22023';
  end if;

  if target_preferred_min_rating is null
     or target_preferred_min_rating < 1
     or target_preferred_min_rating > 5 then

    raise exception
      'INVALID_MARKETPLACE_DISPATCH_RATING'
      using errcode = '22023';
  end if;

  if target_minimum_rating_count is null
     or target_minimum_rating_count < 0
     or target_minimum_rating_count > 1000 then

    raise exception
      'INVALID_MARKETPLACE_DISPATCH_RATING_COUNT'
      using errcode = '22023';
  end if;

  if target_tie_breaker is null
     or target_tie_breaker not in (
       'rating_then_distance',
       'distance_then_rating'
     ) then

    raise exception
      'INVALID_MARKETPLACE_DISPATCH_TIE_BREAKER'
      using errcode = '22023';
  end if;

  insert into public.project_marketplace_dispatch_settings(
    project_id,

    enabled,

    radius_search_enabled,

    radius_1_enabled,
    radius_1_km,

    radius_2_enabled,
    radius_2_km,

    radius_3_enabled,
    radius_3_km,

    expansion_enabled,
    expansion_seconds,

    rating_priority_enabled,

    preferred_min_rating_enabled,
    preferred_min_rating,

    minimum_rating_count_enabled,
    minimum_rating_count,

    allow_below_preferred,

    allow_outside_max_radius,

    apply_to_test_jobs,

    tie_breaker,

    updated_by,
    updated_at
  )
  values(
    target_project_id,

    target_enabled,

    target_radius_search_enabled,

    target_radius_1_enabled,
    target_radius_1_km,

    target_radius_2_enabled,
    target_radius_2_km,

    target_radius_3_enabled,
    target_radius_3_km,

    target_expansion_enabled,
    target_expansion_seconds,

    target_rating_priority_enabled,

    target_preferred_min_rating_enabled,
    target_preferred_min_rating,

    target_minimum_rating_count_enabled,
    target_minimum_rating_count,

    target_allow_below_preferred,

    target_allow_outside_max_radius,

    target_apply_to_test_jobs,

    target_tie_breaker,

    actor,
    now()
  )

  on conflict (project_id)
  do update set
    enabled =
      excluded.enabled,

    radius_search_enabled =
      excluded.radius_search_enabled,

    radius_1_enabled =
      excluded.radius_1_enabled,

    radius_1_km =
      excluded.radius_1_km,

    radius_2_enabled =
      excluded.radius_2_enabled,

    radius_2_km =
      excluded.radius_2_km,

    radius_3_enabled =
      excluded.radius_3_enabled,

    radius_3_km =
      excluded.radius_3_km,

    expansion_enabled =
      excluded.expansion_enabled,

    expansion_seconds =
      excluded.expansion_seconds,

    rating_priority_enabled =
      excluded.rating_priority_enabled,

    preferred_min_rating_enabled =
      excluded.preferred_min_rating_enabled,

    preferred_min_rating =
      excluded.preferred_min_rating,

    minimum_rating_count_enabled =
      excluded.minimum_rating_count_enabled,

    minimum_rating_count =
      excluded.minimum_rating_count,

    allow_below_preferred =
      excluded.allow_below_preferred,

    allow_outside_max_radius =
      excluded.allow_outside_max_radius,

    apply_to_test_jobs =
      excluded.apply_to_test_jobs,

    tie_breaker =
      excluded.tie_breaker,

    updated_by =
      actor,

    updated_at =
      now();

  return query
  select
    s.enabled,

    s.radius_search_enabled,

    s.radius_1_enabled,
    s.radius_1_km,

    s.radius_2_enabled,
    s.radius_2_km,

    s.radius_3_enabled,
    s.radius_3_km,

    s.expansion_enabled,
    s.expansion_seconds,

    s.rating_priority_enabled,

    s.preferred_min_rating_enabled,
    s.preferred_min_rating,

    s.minimum_rating_count_enabled,
    s.minimum_rating_count,

    s.allow_below_preferred,

    s.allow_outside_max_radius,

    s.apply_to_test_jobs,

    s.tie_breaker,

    s.updated_at,
    s.updated_by

  from public.project_marketplace_dispatch_settings s

  where s.project_id = target_project_id;
end;
$function$;


revoke all
on function public.admin_get_marketplace_dispatch_settings(uuid)
from public, anon, authenticated;

grant execute
on function public.admin_get_marketplace_dispatch_settings(uuid)
to authenticated;


revoke all
on function public.admin_set_marketplace_dispatch_settings(
  uuid,
  boolean,
  boolean,
  boolean,
  numeric,
  boolean,
  numeric,
  boolean,
  numeric,
  boolean,
  integer,
  boolean,
  boolean,
  numeric,
  boolean,
  integer,
  boolean,
  boolean,
  boolean,
  text
)
from public, anon, authenticated;

grant execute
on function public.admin_set_marketplace_dispatch_settings(
  uuid,
  boolean,
  boolean,
  boolean,
  numeric,
  boolean,
  numeric,
  boolean,
  numeric,
  boolean,
  integer,
  boolean,
  boolean,
  numeric,
  boolean,
  integer,
  boolean,
  boolean,
  boolean,
  text
)
to authenticated;