-- TUKTUK Marketplace
-- Driver -> customer rating plus private driver reputation queries.
--
-- Product rules:
-- 1. A driver may rate only a settled job assigned to that driver.
-- 2. One driver rating per job.
-- 3. Internal notes are stored for platform management and are never returned
--    by the driver-facing rating-history RPC.
-- 4. Driver ranking uses customer -> driver ratings already stored in
--    public.marketplace_customer_ratings.
-- 5. A driver needs at least 5 received ratings to enter the ranking.

create table public.marketplace_driver_customer_ratings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid not null,
  customer_id uuid not null,
  driver_user_id uuid not null references auth.users(id) on delete restrict,
  stars smallint not null check (stars between 1 and 5),
  internal_note text
    check (
      internal_note is null
      or char_length(internal_note) <= 1000
    ),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),

  unique (project_id, job_id),
  unique (project_id, driver_user_id, idempotency_key),

  foreign key (project_id, job_id)
    references public.jobs(project_id, id)
    on delete restrict,

  foreign key (project_id, customer_id)
    references public.customers(project_id, id)
    on delete restrict
);

create index marketplace_driver_customer_ratings_driver_idx
  on public.marketplace_driver_customer_ratings(
    project_id,
    driver_user_id,
    created_at desc
  );

create index marketplace_driver_customer_ratings_customer_idx
  on public.marketplace_driver_customer_ratings(
    project_id,
    customer_id,
    created_at desc
  );

alter table public.marketplace_driver_customer_ratings
  enable row level security;

revoke all
  on public.marketplace_driver_customer_ratings
  from public, anon, authenticated;

create trigger audit_marketplace_driver_customer_ratings
after insert on public.marketplace_driver_customer_ratings
for each row execute function app_private.capture_audit_event();


-- ============================================================
-- DRIVER CREATES CUSTOMER RATING
-- ============================================================

create or replace function public.create_my_marketplace_customer_rating(
  target_job_id uuid,
  target_stars smallint,
  target_internal_note text,
  target_idempotency_key uuid
)
returns table(
  job_id uuid,
  stars smallint,
  created_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  pid uuid;
  job_status text;
  customer_uuid uuid;
  existing public.marketplace_driver_customer_ratings%rowtype;
  clean_note text := nullif(btrim(target_internal_note), '');
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  if target_job_id is null then
    raise exception 'JOB_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED'
      using errcode = '22023';
  end if;

  if target_stars not between 1 and 5 then
    raise exception 'RATING_STARS_INVALID'
      using errcode = '22023';
  end if;

  if clean_note is not null and char_length(clean_note) > 1000 then
    raise exception 'RATING_INTERNAL_NOTE_TOO_LONG'
      using errcode = '22023';
  end if;

  select p.id
    into pid
  from public.projects p
  where p.slug = 'tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select j.status, sr.customer_id
    into job_status, customer_uuid
  from public.jobs j
  join public.service_requests sr
    on sr.project_id = j.project_id
   and sr.id = j.service_request_id
  where j.project_id = pid
    and j.id = target_job_id
    and j.assigned_driver_user_id = actor
  for update of j;

  if not found then
    raise exception 'ACCESS_DENIED'
      using errcode = '42501';
  end if;

  if job_status <> 'settled' then
    raise exception 'RATING_NOT_AVAILABLE'
      using errcode = '22023';
  end if;

  select r.*
    into existing
  from public.marketplace_driver_customer_ratings r
  where r.project_id = pid
    and r.driver_user_id = actor
    and r.idempotency_key = target_idempotency_key;

  if found then
    if existing.job_id = target_job_id
       and existing.stars = target_stars
       and existing.internal_note is not distinct from clean_note then

      return query
      select
        existing.job_id,
        existing.stars,
        existing.created_at,
        now();

      return;
    end if;

    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.marketplace_driver_customer_ratings r
    where r.project_id = pid
      and r.job_id = target_job_id
  ) then
    raise exception 'RATING_ALREADY_EXISTS'
      using errcode = '23505';
  end if;

  insert into public.marketplace_driver_customer_ratings(
    project_id,
    job_id,
    customer_id,
    driver_user_id,
    stars,
    internal_note,
    idempotency_key
  )
  values(
    pid,
    target_job_id,
    customer_uuid,
    actor,
    target_stars,
    clean_note,
    target_idempotency_key
  )
  returning *
    into existing;

  return query
  select
    existing.job_id,
    existing.stars,
    existing.created_at,
    now();
end;
$$;


-- ============================================================
-- DRIVER RATING HISTORY
--
-- Important:
-- Internal notes are intentionally NOT returned here.
-- ============================================================

create or replace function public.list_my_marketplace_ratings(
  target_limit integer default 100,
  target_before_created_at timestamptz default null,
  target_before_job_id uuid default null
)
returns table(
  job_id uuid,
  service_code text,
  service_date timestamptz,
  received_stars smallint,
  given_stars smallint,
  received_at timestamptz,
  given_at timestamptz,
  is_test boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  pid uuid;
  safe_limit integer := least(greatest(coalesce(target_limit, 100), 1), 200);
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  if (target_before_created_at is null)
     <> (target_before_job_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR'
      using errcode = '22023';
  end if;

  select p.id
    into pid
  from public.projects p
  where p.slug = 'tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  return query
  select
    j.id,
    j.service_code,
    j.updated_at as service_date,
    customer_rating.stars as received_stars,
    driver_rating.stars as given_stars,
    customer_rating.created_at as received_at,
    driver_rating.created_at as given_at,
    j.is_test
  from public.jobs j

  left join public.marketplace_customer_ratings customer_rating
    on customer_rating.project_id = j.project_id
   and customer_rating.job_id = j.id
   and customer_rating.driver_user_id = actor

  left join public.marketplace_driver_customer_ratings driver_rating
    on driver_rating.project_id = j.project_id
   and driver_rating.job_id = j.id
   and driver_rating.driver_user_id = actor

  where j.project_id = pid
    and j.assigned_driver_user_id = actor
    and j.status = 'settled'
    and (
      target_before_created_at is null
      or (j.created_at, j.id)
         < (target_before_created_at, target_before_job_id)
    )

  order by j.created_at desc, j.id desc
  limit safe_limit;
end;
$$;


-- ============================================================
-- DRIVER REPUTATION / RANKING
--
-- Ranking:
-- - only active drivers
-- - minimum 5 customer -> driver ratings
-- - average stars DESC
-- - number of ratings DESC
-- - equal score/count share the same rank
-- ============================================================

create or replace function public.get_my_marketplace_rating_summary()
returns table(
  average_stars numeric,
  rating_count bigint,
  rank_position bigint,
  ranked_driver_count bigint,
  ranking_eligible boolean,
  minimum_ratings integer
)
language plpgsql
security definer
set search_path = ''
as $
declare
  actor uuid := auth.uid();
  pid uuid;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  select p.id
    into pid
  from public.projects p
  where p.slug = 'tuktuk-control';

  if pid is null then
    raise exception 'MARKETPLACE_PROJECT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.driver_profiles dp
    where dp.project_id = pid
      and dp.user_id = actor
  ) then
    raise exception 'DRIVER_PROFILE_REQUIRED'
      using errcode = '42501';
  end if;

  return query
  with rating_stats as (
    select
      r.driver_user_id as user_id,
      count(r.id)::bigint as rating_count,
      avg(r.stars::numeric) as average_stars
    from public.marketplace_customer_ratings r
    join public.jobs j
      on j.project_id = r.project_id
     and j.id = r.job_id
    where r.project_id = pid
      and j.status = 'settled'
      and not j.is_test
    group by r.driver_user_id
  ),
  eligible_stats as (
    select
      dp.user_id,
      s.rating_count,
      s.average_stars
    from public.driver_profiles dp
    join rating_stats s
      on s.user_id = dp.user_id
    where dp.project_id = pid
      and dp.status = 'active'
      and dp.activated_at is not null
      and dp.suspended_at is null
      and s.rating_count >= 5
  ),
  ranked as (
    select
      e.user_id,
      e.rating_count,
      e.average_stars,
      dense_rank() over (
        order by
          e.average_stars desc,
          e.rating_count desc
      )::bigint as rank_position
    from eligible_stats e
  ),
  me as (
    select
      s.rating_count,
      s.average_stars
    from rating_stats s
    where s.user_id = actor
  ),
  me_active as (
    select exists (
      select 1
      from public.driver_profiles dp
      where dp.project_id = pid
        and dp.user_id = actor
        and dp.status = 'active'
        and dp.activated_at is not null
        and dp.suspended_at is null
    ) as is_active
  )
  select
    case
      when coalesce(me.rating_count, 0) = 0 then null
      else round(me.average_stars, 2)
    end,

    coalesce(me.rating_count, 0)::bigint,

    ranked.rank_position,

    (
      select count(*)::bigint
      from ranked
    ),

    (
      me_active.is_active
      and coalesce(me.rating_count, 0) >= 5
    ),

    5::integer

  from (select 1) anchor
  left join me
    on true
  left join ranked
    on ranked.user_id = actor
  cross join me_active;
end;
$;


-- ============================================================
-- ADMIN / GESTION INTERNA
--
-- Las notas internas solo se entregan por este contrato protegido.
-- ============================================================

create or replace function public.admin_list_marketplace_driver_customer_ratings(
  target_project_id uuid,
  target_limit integer default 100,
  target_before_created_at timestamptz default null,
  target_before_rating_id uuid default null
)
returns table(
  rating_id uuid,
  job_id uuid,
  customer_id uuid,
  customer_display_name text,
  driver_user_id uuid,
  driver_display_name text,
  stars smallint,
  internal_note text,
  is_test boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(target_limit, 100), 1), 200);
begin
  perform app_private.require_project_permission(
    target_project_id,
    'marketplace.view'
  );

  perform app_private.require_project_permission(
    target_project_id,
    'customers.view'
  );

  if (target_before_created_at is null)
     <> (target_before_rating_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR'
      using errcode = '22023';
  end if;

  return query
  select
    r.id,
    r.job_id,
    r.customer_id,
    c.display_name,
    r.driver_user_id,
    p.display_name,
    r.stars,
    r.internal_note,
    j.is_test,
    r.created_at
  from public.marketplace_driver_customer_ratings r
  join public.jobs j
    on j.project_id = r.project_id
   and j.id = r.job_id
  join public.customers c
    on c.project_id = r.project_id
   and c.id = r.customer_id
  left join public.profiles p
    on p.id = r.driver_user_id
  where r.project_id = target_project_id
    and (
      target_before_created_at is null
      or (r.created_at, r.id)
         < (target_before_created_at, target_before_rating_id)
    )
  order by r.created_at desc, r.id desc
  limit safe_limit;
end;
$$;

-- ============================================================
-- PERMISSIONS
-- ============================================================

revoke all on function public.create_my_marketplace_customer_rating(
  uuid,
  smallint,
  text,
  uuid
) from public, anon;

revoke all on function public.list_my_marketplace_ratings(
  integer,
  timestamptz,
  uuid
) from public, anon;

revoke all on function public.get_my_marketplace_rating_summary()
  from public, anon;

revoke all on function public.admin_list_marketplace_driver_customer_ratings(
  uuid,
  integer,
  timestamptz,
  uuid
) from public, anon;

grant execute on function public.create_my_marketplace_customer_rating(
  uuid,
  smallint,
  text,
  uuid
) to authenticated;

grant execute on function public.list_my_marketplace_ratings(
  integer,
  timestamptz,
  uuid
) to authenticated;

grant execute on function public.get_my_marketplace_rating_summary()
  to authenticated;

grant execute on function public.admin_list_marketplace_driver_customer_ratings(
  uuid,
  integer,
  timestamptz,
  uuid
) to authenticated;