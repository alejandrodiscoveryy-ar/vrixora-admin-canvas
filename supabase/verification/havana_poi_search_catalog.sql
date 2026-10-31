-- TukTuk - catalogo geografico exclusivo de La Habana (solo revision PR).
-- No ejecutar directamente en produccion sin aprobar el despliegue.
-- Fuente: OpenStreetMap / ODbL 1.0; conservar atribucion y origen.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.marketplace_havana_places (
  source_id text primary key,
  name text not null check (length(trim(name)) between 2 and 180),
  category text not null,
  municipality text,
  address text,
  aliases text[] not null default '{}'::text[],
  lat double precision not null check (lat between 22.7 and 23.35),
  lon double precision not null check (lon between -82.75 and -81.95),
  search_terms text not null,
  source text not null default 'openstreetmap'
    check (source in ('openstreetmap', 'local_verified')),
  updated_at timestamptz not null default now()
);

-- La ubicacion administrativa exacta se comprueba al importar usando el area
-- provincial de OpenStreetMap. El CHECK solo es una defensa adicional.
create index if not exists marketplace_havana_places_search_trgm_idx
  on public.marketplace_havana_places
  using gin (search_terms extensions.gin_trgm_ops);
create index if not exists marketplace_havana_places_category_idx
  on public.marketplace_havana_places (category);

alter table public.marketplace_havana_places enable row level security;
revoke all on table public.marketplace_havana_places from public, anon, authenticated;
grant select on table public.marketplace_havana_places to service_role;
-- El importador autorizado debe usar acceso de administrador en una operacion
-- separada y controlada; no se concede escritura a clientes.

create or replace function public.search_marketplace_havana_places(
  target_query text,
  target_lat double precision default null,
  target_lon double precision default null,
  target_limit integer default 12
)
returns table (
  source_id text,
  name text,
  category text,
  municipality text,
  address text,
  lat double precision,
  lon double precision,
  distance_km double precision
)
language sql stable security invoker set search_path = '' as $$
with q as (
  select lower(trim(coalesce(target_query,''))) as term,
    case when target_lat between 22.7 and 23.35 then target_lat else 23.1136 end as near_lat,
    case when target_lon between -82.75 and -81.95 then target_lon else -82.3666 end as near_lon
), matched as (
  select p.source_id,p.name,p.category,p.municipality,p.address,p.lat,p.lon,
    p.search_terms,
    q.term,
    6371.0 * 2.0 * asin(least(1.0, sqrt(
      power(sin(radians((p.lat-q.near_lat)/2.0)),2) +
      cos(radians(q.near_lat))*cos(radians(p.lat))*
      power(sin(radians((p.lon-q.near_lon)/2.0)),2)
    ))) as km,
    extensions.word_similarity(q.term,p.search_terms) as textual_similarity
  from public.marketplace_havana_places p cross join q
  where length(q.term) between 3 and 100
    and (p.search_terms like ('%' || replace(replace(q.term,'%',''), '_','') || '%')
      or extensions.word_similarity(q.term,p.search_terms) >= 0.42)
)
select m.source_id,m.name,m.category,m.municipality,m.address,m.lat,m.lon,
  round(m.km::numeric,2)::double precision as distance_km
from matched m
order by
  case
    when lower(m.name) = m.term then 0
    when m.category = m.term then 1
    when lower(m.name) like m.term || '%' then 2
    else 3
  end,
  m.textual_similarity desc,
  m.km asc,
  m.name asc
limit greatest(1,least(coalesce(target_limit,12),20));
$$;

revoke all on function public.search_marketplace_havana_places(text,double precision,double precision,integer)
  from public,anon,authenticated;
grant execute on function public.search_marketplace_havana_places(text,double precision,double precision,integer)
  to service_role;

comment on table public.marketplace_havana_places is
 'POI de La Habana; atribucion © OpenStreetMap contributors (ODbL), fuente conservada en source_id';
