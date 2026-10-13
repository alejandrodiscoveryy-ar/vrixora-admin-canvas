-- TukTuk Marketplace | Centro de pruebas V2 | Fase de compatibilidad.
-- PREPARADA, NO APLICAR A PRODUCCION EN ESTA ETAPA.
-- Esta migracion no altera el modo de prueba actual, las reglas de publicacion,
-- la visibilidad de trabajos, su aceptacion ni el dispatch existente.
-- Las carreras creadas antes conservan su destino individual legado.

create table if not exists public.marketplace_test_audience (
  project_id uuid not null references public.projects(id) on delete cascade,
  driver_user_id uuid not null,
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz not null default now(),
  primary key (project_id, driver_user_id),
  foreign key (project_id, driver_user_id)
    references public.driver_profiles(project_id, user_id) on delete restrict
);

create table if not exists public.marketplace_test_job_recipients (
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid not null,
  driver_user_id uuid not null,
  selected_at timestamptz not null default now(),
  primary key (project_id, job_id, driver_user_id),
  foreign key (project_id, job_id)
    references public.jobs(project_id, id) on delete restrict,
  foreign key (project_id, driver_user_id)
    references public.driver_profiles(project_id, user_id) on delete restrict
);

create index if not exists marketplace_test_job_recipients_driver_idx
  on public.marketplace_test_job_recipients(project_id, driver_user_id, job_id);

create table if not exists public.marketplace_admin_test_jobs (
  project_id uuid not null references public.projects(id) on delete restrict,
  job_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  idempotency_key uuid not null,
  destination_mode text not null check (destination_mode in ('individual','group')),
  recipient_count integer not null check (recipient_count between 1 and 30),
  created_at timestamptz not null default now(),
  primary key (project_id, job_id),
  unique (project_id, idempotency_key),
  foreign key (project_id, job_id)
    references public.jobs(project_id, id) on delete restrict
);

-- No crear politicas SELECT/INSERT/UPDATE/DELETE generales: acceso unicamente
-- a traves de funciones administrativas con verificacion de permisos.
alter table public.marketplace_test_audience enable row level security;
alter table public.marketplace_test_job_recipients enable row level security;
alter table public.marketplace_admin_test_jobs enable row level security;
revoke all on public.marketplace_test_audience from public, anon, authenticated;
revoke all on public.marketplace_test_job_recipients from public, anon, authenticated;
revoke all on public.marketplace_admin_test_jobs from public, anon, authenticated;

-- Proteger el snapshot: nunca se cambia la audiencia de una carrera emitida.
-- La captura se crea exclusivamente antes de publicar una carrera de prueba.
create or replace function app_private.protect_marketplace_test_job_recipients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_job public.jobs%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'TEST_JOB_RECIPIENTS_IMMUTABLE' using errcode='23514';
  end if;

  select * into target_job
  from public.jobs j
  where j.project_id = new.project_id and j.id = new.job_id
  for key share;

  if not found or not target_job.is_test or target_job.status <> 'requested'
     or target_job.test_deleted_at is not null then
    raise exception 'TEST_JOB_RECIPIENTS_INVALID_STATE' using errcode='23514';
  end if;

  return new;
end;
$function$;

create trigger marketplace_test_job_recipients_immutable
before insert or update or delete on public.marketplace_test_job_recipients
for each row execute function app_private.protect_marketplace_test_job_recipients();
revoke all on function app_private.protect_marketplace_test_job_recipients()
  from public, anon, authenticated;

-- API de lectura: no revela telefonos, datos financieros ni usuarios de otro proyecto.
create or replace function public.admin_get_marketplace_test_audience(target_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  perform app_private.require_project_permission(target_project_id, 'settings.view');

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'driver_user_id', a.driver_user_id,
      'display_name', coalesce(p.display_name, 'Conductor'),
      'status', d.status,
      'selected_at', a.selected_at
    ) order by lower(coalesce(p.display_name, '')), a.driver_user_id)
    from public.marketplace_test_audience a
    join public.driver_profiles d
      on d.project_id=a.project_id and d.user_id=a.driver_user_id
    left join public.profiles p on p.id=a.driver_user_id
    where a.project_id=target_project_id
  ), '[]'::jsonb);
end;
$function$;

-- Configuracion del grupo, deliberadamente desacoplada del antiguo switch.
-- En esta fase NO cambia las reglas de entrega ni la audiencia de carreras
-- ya publicadas. La copia a cada trabajo se implementara en la siguiente fase.
create or replace function public.admin_set_marketplace_test_audience(
  target_project_id uuid,
  target_driver_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  normalized uuid[];
  target_count integer;
  valid_count integer;
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.manage');
  perform app_private.require_project_permission(target_project_id, 'settings.manage');

  -- Serializar dos guardados concurrentes sin bloquear operaciones reales.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'marketplace-test-audience:' || target_project_id::text, 0
  ));

  if target_driver_user_ids is null
     or pg_catalog.array_position(target_driver_user_ids, null) is not null then
    raise exception 'TEST_AUDIENCE_INVALID' using errcode='22023';
  end if;

  select array_agg(id order by id), count(*)
  into normalized, target_count
  from (select distinct unnest(target_driver_user_ids) as id) targets;

  if target_count < 1 or target_count > 30 then
    raise exception 'TEST_AUDIENCE_SIZE_INVALID' using errcode='22023';
  end if;

  select count(*) into valid_count
  from public.driver_profiles d
  where d.project_id=target_project_id
    and d.user_id=any(normalized)
    and d.status='active'
    and d.activated_at is not null
    and d.suspended_at is null;

  if valid_count <> target_count then
    raise exception 'TEST_AUDIENCE_INELIGIBLE_DRIVER' using errcode='22023';
  end if;

  delete from public.marketplace_test_audience a
  where a.project_id=target_project_id
    and not(a.driver_user_id=any(normalized));

  insert into public.marketplace_test_audience(project_id,driver_user_id,selected_by)
  select target_project_id, unnest(normalized), actor
  on conflict (project_id,driver_user_id) do nothing;

  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
  values(
    target_project_id,actor,'marketplace_test_audience_set',
    'marketplace_test_audience',target_project_id::text,
    jsonb_build_object('driver_user_ids', to_jsonb(normalized), 'count', target_count)
  );

  return jsonb_build_object('driver_user_ids', to_jsonb(normalized), 'count',target_count);
end;
$function$;

-- Helper encapsulado para la futura aceptacion: nunca sustituir por un filtro
-- del cliente. Respeta el destinatario legado solo cuando no existe snapshot.
create or replace function app_private.marketplace_test_job_targets_driver(
  target_project_id uuid, target_job_id uuid, target_driver_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.jobs j
    where j.project_id=target_project_id
      and j.id=target_job_id
      and j.is_test
      and j.test_deleted_at is null
      and (
        exists (
          select 1 from public.marketplace_test_job_recipients r
          where r.project_id=j.project_id and r.job_id=j.id
            and r.driver_user_id=target_driver_user_id
        )
        or (
          not exists (
            select 1 from public.marketplace_test_job_recipients r
            where r.project_id=j.project_id and r.job_id=j.id
          )
          and j.test_driver_user_id=target_driver_user_id
        )
      )
  );
$function$;

revoke all on function public.admin_get_marketplace_test_audience(uuid) from public, anon;
revoke all on function public.admin_set_marketplace_test_audience(uuid,uuid[]) from public, anon;
grant execute on function public.admin_get_marketplace_test_audience(uuid) to authenticated;
grant execute on function public.admin_set_marketplace_test_audience(uuid,uuid[]) to authenticated;
revoke all on function app_private.marketplace_test_job_targets_driver(uuid,uuid,uuid) from public, anon, authenticated;
