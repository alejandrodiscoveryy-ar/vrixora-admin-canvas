-- TukTuk: cola de sincronizacion territorial OSM. No activa carreras ni tarifas.
-- Aplicar ANTES de desplegar la version nueva del gateway y del panel.
-- Todo el contenido solo es accesible al service_role. Los usuarios pasan por
-- el gateway autenticado y comprobacion de 'marketplace.map.manage'.

create table if not exists public.marketplace_poi_provinces (
  code text primary key check (code ~ '^CU-[0-9]{2}$'),
  name text not null,
  catalog_ready boolean not null default false,
  poi_count integer not null default 0 check (poi_count >= 0),
  last_updated_at timestamptz,
  last_source_md5 text,
  updated_at timestamptz not null default now()
);

insert into public.marketplace_poi_provinces(code,name) values
('CU-01','Pinar del Río'),('CU-03','La Habana'),('CU-04','Matanzas'),
('CU-05','Villa Clara'),('CU-06','Cienfuegos'),('CU-07','Sancti Spíritus'),
('CU-08','Ciego de Ávila'),('CU-09','Camagüey'),('CU-10','Las Tunas'),
('CU-11','Holguín'),('CU-12','Granma'),('CU-13','Santiago de Cuba'),
('CU-14','Guantánamo'),('CU-15','Artemisa'),('CU-16','Mayabeque'),
('CU-99','Isla de la Juventud')
on conflict (code) do nothing;

-- Tabla multiprovincial: los datos actuales de La Habana se conservan y copian.
create table if not exists public.marketplace_poi_places (
  province_code text not null references public.marketplace_poi_provinces(code),
  source_id text not null check (source_id ~ '^osm:(node|way|relation):[0-9]+$'),
  name text not null check (length(btrim(name)) between 2 and 180),
  category text not null,
  municipality text,
  address text,
  aliases text[] not null default '{}'::text[],
  lat double precision not null check (lat between 19 and 24),
  lon double precision not null check (lon between -85.5 and -73),
  search_terms text not null,
  source text not null default 'openstreetmap' check (source = 'openstreetmap'),
  updated_at timestamptz not null default now(),
  primary key (province_code,source_id)
);
create index if not exists marketplace_poi_places_search_idx on public.marketplace_poi_places
  using gin(search_terms extensions.gin_trgm_ops);
create index if not exists marketplace_poi_places_category_idx
  on public.marketplace_poi_places(province_code,category);

insert into public.marketplace_poi_places
(province_code,source_id,name,category,municipality,address,aliases,lat,lon,search_terms,source,updated_at)
select 'CU-03',source_id,name,category,municipality,address,aliases,lat,lon,search_terms,source,updated_at
from public.marketplace_havana_places where source = 'openstreetmap'
on conflict (province_code,source_id) do nothing;

update public.marketplace_poi_provinces
set catalog_ready=true,
    poi_count=(select count(*) from public.marketplace_poi_places where province_code='CU-03'),
    last_updated_at=coalesce(last_updated_at,now()), updated_at=now()
where code='CU-03' and not catalog_ready;

create table if not exists public.marketplace_poi_refresh_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  province_code text not null references public.marketplace_poi_provinces(code),
  requested_by uuid not null references auth.users(id),
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  processed_count integer,
  source_md5 text,
  error_message text
);
-- Evita que se ejecuten dos sincronizaciones simultaneas de la misma provincia.
create unique index if not exists marketplace_poi_refresh_one_active_idx
 on public.marketplace_poi_refresh_jobs(province_code)
 where status in ('queued','running');
create index if not exists marketplace_poi_refresh_jobs_recent_idx
 on public.marketplace_poi_refresh_jobs(created_at desc);

create table if not exists public.marketplace_poi_stage (
  job_id uuid not null references public.marketplace_poi_refresh_jobs(id) on delete cascade,
  source_id text not null check (source_id ~ '^osm:(node|way|relation):[0-9]+$'),
  name text not null check (length(btrim(name)) between 2 and 180),
  category text not null,
  municipality text,
  address text,
  aliases text[] not null default '{}'::text[],
  lat double precision not null check (lat between 19 and 24),
  lon double precision not null check (lon between -85.5 and -73),
  search_terms text not null,
  primary key(job_id,source_id)
);

alter table public.marketplace_poi_provinces enable row level security;
alter table public.marketplace_poi_places enable row level security;
alter table public.marketplace_poi_refresh_jobs enable row level security;
alter table public.marketplace_poi_stage enable row level security;
revoke all on table public.marketplace_poi_provinces,public.marketplace_poi_places,
  public.marketplace_poi_refresh_jobs,public.marketplace_poi_stage from public,anon,authenticated;
grant select,insert,update,delete on table public.marketplace_poi_provinces,
  public.marketplace_poi_places,public.marketplace_poi_refresh_jobs,
  public.marketplace_poi_stage to service_role;

-- El gateway ya verifico el JWT y el permiso map.manage antes de llamar esto.
-- El usuario normal no puede ejecutar esta funcion.
create or replace function public.marketplace_poi_queue_refresh(
  target_project_id uuid, target_province_code text, target_requested_by uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare result_id uuid;
begin
  if not exists(select 1 from public.projects where id=target_project_id and slug='tuktuk-control') then
    raise exception 'POI_PROJECT_INVALID';
  end if;
  if not exists(select 1 from public.marketplace_poi_provinces where code=target_province_code) then
    raise exception 'POI_PROVINCE_INVALID';
  end if;
  if not exists(select 1 from public.project_members
                where project_id=target_project_id and user_id=target_requested_by) then
    raise exception 'POI_ACTOR_INVALID';
  end if;
  insert into public.marketplace_poi_refresh_jobs(project_id,province_code,requested_by)
    values(target_project_id,target_province_code,target_requested_by)
    on conflict(province_code) where status in ('queued','running')
    do update set province_code=excluded.province_code
  returning id into result_id;
  return result_id;
end; $$;

create or replace function public.marketplace_poi_cancel_queued(
  target_job_id uuid, target_error text
) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update public.marketplace_poi_refresh_jobs
    set status='failed',finished_at=now(),error_message=left(coalesce(target_error,'DISPATCH_FAILED'),450)
    where id=target_job_id and status='queued';
  return found;
end; $$;

create or replace function public.marketplace_poi_claim_refresh()
returns table(job_id uuid,province_code text)
language plpgsql security invoker set search_path='' as $$
begin
  -- Permite recuperar una tarea si un ejecutor se interrumpe sin avisar.
  update public.marketplace_poi_refresh_jobs
    set status='failed',finished_at=now(),error_message='WORKER_TIMEOUT'
    where status='running' and started_at < now()-interval '90 minutes';
  -- Solo un worker: el lock y la transicion de estado son atomicos.
  return query
  with choice as (
    select j.id from public.marketplace_poi_refresh_jobs j
    where j.status='queued'
    order by j.created_at asc
    limit 1 for update skip locked
  )
  update public.marketplace_poi_refresh_jobs j
    set status='running',started_at=now(),finished_at=null,error_message=null
    from choice where j.id=choice.id
    returning j.id,j.province_code;
end; $$;

create or replace function public.marketplace_poi_mark_failed(
  target_job_id uuid,target_error text
) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update public.marketplace_poi_refresh_jobs
  set status='failed',finished_at=now(),error_message=left(coalesce(target_error,'ERROR_DESCONOCIDO'),450)
  where id=target_job_id and status='running';
  if not found then return false; end if;
  delete from public.marketplace_poi_stage where job_id=target_job_id;
  return true;
end; $$;

create or replace function public.marketplace_poi_finalize_refresh(
  target_job_id uuid,target_expected_count integer,target_source_md5 text
) returns integer
language plpgsql security invoker set search_path='' as $$
declare item public.marketplace_poi_refresh_jobs%rowtype;
declare found_count integer;
declare previous_count integer;
declare min_required integer;
begin
  select * into item from public.marketplace_poi_refresh_jobs
    where id=target_job_id for update;
  if not found or item.status <> 'running' then raise exception 'POI_JOB_NOT_RUNNING'; end if;
  if target_source_md5 !~ '^[a-f0-9]{32}$' then raise exception 'POI_MD5_INVALID'; end if;
  select count(*) into found_count from public.marketplace_poi_stage where job_id=target_job_id;
  min_required := case when item.province_code='CU-99' then 30 else 100 end;
  if found_count < min_required or found_count > 300000 or found_count <> target_expected_count then
    raise exception 'POI_DATASET_INVALID: %',found_count;
  end if;
  select poi_count into previous_count from public.marketplace_poi_provinces
    where code=item.province_code for update;
  if previous_count > 0 and found_count < ceil(previous_count * 0.65) then
    raise exception 'POI_ABNORMAL_LOSS: % -> %',previous_count,found_count;
  end if;
  -- Los cambios de una provincia son atomicos. No se alteran datos si algo falla.
  delete from public.marketplace_poi_places p
    where p.province_code=item.province_code and not exists
      (select 1 from public.marketplace_poi_stage s where s.job_id=target_job_id and s.source_id=p.source_id);
  insert into public.marketplace_poi_places
  (province_code,source_id,name,category,municipality,address,aliases,lat,lon,search_terms,source,updated_at)
  select item.province_code,s.source_id,s.name,s.category,s.municipality,s.address,
         s.aliases,s.lat,s.lon,s.search_terms,'openstreetmap',now()
  from public.marketplace_poi_stage s where s.job_id=target_job_id
  on conflict(province_code,source_id) do update
  set name=excluded.name,category=excluded.category,municipality=excluded.municipality,
      address=excluded.address,aliases=excluded.aliases,lat=excluded.lat,lon=excluded.lon,
      search_terms=excluded.search_terms,updated_at=now();

  -- Compatibilidad con buscador ya operativo: La Habana conserva su tabla.
  if item.province_code='CU-03' then
    delete from public.marketplace_havana_places h
    where h.source='openstreetmap' and not exists
      (select 1 from public.marketplace_poi_stage s where s.job_id=target_job_id and s.source_id=h.source_id);
    insert into public.marketplace_havana_places
    (source_id,name,category,municipality,address,aliases,lat,lon,search_terms,source,updated_at)
    select s.source_id,s.name,s.category,s.municipality,s.address,s.aliases,
      s.lat,s.lon,s.search_terms,'openstreetmap',now()
    from public.marketplace_poi_stage s where s.job_id=target_job_id
    on conflict(source_id) do update
    set name=excluded.name,category=excluded.category,municipality=excluded.municipality,
      address=excluded.address,aliases=excluded.aliases,lat=excluded.lat,lon=excluded.lon,
      search_terms=excluded.search_terms,updated_at=now();
  end if;
  update public.marketplace_poi_provinces
    set catalog_ready=true,poi_count=found_count,last_updated_at=now(),
        last_source_md5=target_source_md5,updated_at=now()
    where code=item.province_code;
  update public.marketplace_poi_refresh_jobs
    set status='succeeded',processed_count=found_count,source_md5=target_source_md5,
        finished_at=now(),error_message=null where id=target_job_id;
  delete from public.marketplace_poi_stage where job_id=target_job_id;
  return found_count;
end; $$;

revoke all on function public.marketplace_poi_queue_refresh(uuid,text,uuid),
 public.marketplace_poi_claim_refresh(),public.marketplace_poi_mark_failed(uuid,text),
 public.marketplace_poi_cancel_queued(uuid,text),
 public.marketplace_poi_finalize_refresh(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.marketplace_poi_queue_refresh(uuid,text,uuid),
 public.marketplace_poi_claim_refresh(),public.marketplace_poi_mark_failed(uuid,text),
 public.marketplace_poi_cancel_queued(uuid,text),
 public.marketplace_poi_finalize_refresh(uuid,integer,text) to service_role;

comment on table public.marketplace_poi_provinces is
'Provincia y estado del catalogo OSM de TukTuk (no habilita viajes). © OpenStreetMap contributors, ODbL 1.0.';
