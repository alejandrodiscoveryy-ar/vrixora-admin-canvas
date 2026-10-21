-- Control independiente de publicacion de modalidades del Marketplace.
-- Publicacion NO es activacion del tipo de vehiculo, NI del conductor, NI de la tarifa.
-- No modifica publicaciones existentes: ausencia de fila se interpreta como publicada.
create table if not exists public.marketplace_modality_visibility (
  project_id uuid not null references public.projects(id) on delete cascade,
  service_code text not null,
  vehicle_category_code text not null,
  is_published boolean not null default true,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  primary key (project_id, service_code, vehicle_category_code)
);
alter table public.marketplace_modality_visibility enable row level security;
revoke all on public.marketplace_modality_visibility from public, anon, authenticated;

create or replace function public.admin_list_marketplace_modality_visibility(target_project_id uuid)
returns table(service_code text, vehicle_category_code text, is_published boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_project_permission(target_project_id, 'marketplace.view');
  return query
  select s.code, c.code, coalesce(v.is_published, true)
  from public.service_types s
  cross join public.vehicle_categories c
  left join public.marketplace_modality_visibility v on
       v.project_id=target_project_id and v.service_code=s.code and v.vehicle_category_code=c.code
  where s.project_id=target_project_id and c.project_id=target_project_id
    and s.active and c.active and s.code in ('passenger','cargo','courier')
    and (s.code <> 'passenger' or c.code in ('motorcycle','bicitaxi','tricycle','light_car'))
  order by s.code,c.code;
end;
$$;

create or replace function public.admin_set_marketplace_modality_visibility(
  target_project_id uuid, target_service_code text, target_vehicle_category_code text,
  target_is_published boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := app_private.require_project_permission(target_project_id, 'marketplace.pricing.manage');
  if target_is_published is null or target_service_code not in ('passenger','cargo','courier') then
    raise exception 'MODALITY_PUBLICATION_INVALID' using errcode='22023';
  end if;
  if target_service_code = 'passenger' and
     target_vehicle_category_code not in ('motorcycle','bicitaxi','tricycle','light_car') then
    raise exception 'PASSENGER_CATEGORY_INVALID' using errcode='22023';
  end if;
  if not exists(select 1 from public.service_types s where s.project_id=target_project_id and s.code=target_service_code and s.active)
     or not exists(select 1 from public.vehicle_categories c where c.project_id=target_project_id and c.code=target_vehicle_category_code and c.active) then
    raise exception 'MODALITY_NOT_FOUND' using errcode='P0002';
  end if;
  if target_is_published and not exists (
    select 1 from public.marketplace_pricing_tariffs t
    where t.project_id=target_project_id and t.service_code=target_service_code
      and t.vehicle_category_code=target_vehicle_category_code
      and t.status='active' and t.effective_from <= now()
      and (t.effective_to is null or t.effective_to > now())
  ) then
    raise exception 'MODALITY_TARIFF_NOT_CONFIGURED' using errcode='22023';
  end if;
  insert into public.marketplace_modality_visibility
    (project_id,service_code,vehicle_category_code,is_published,changed_by,changed_at)
  values (target_project_id,target_service_code,target_vehicle_category_code,target_is_published,actor,now())
  on conflict (project_id,service_code,vehicle_category_code)
  do update set is_published=excluded.is_published,changed_by=excluded.changed_by,changed_at=now();
end;
$$;

-- Catalogo publico: no incluye tarifas, datos personales ni permisos administrativos.
-- Solo muestra combinaciones con tarifa vigente y expresamente NO ocultas.
create or replace function public.list_marketplace_published_modalities(target_project_slug text)
returns table(service_code text, vehicle_category_code text)
language sql stable security definer set search_path = '' as $$
  select distinct s.code, c.code
  from public.projects p
  join public.service_types s on s.project_id=p.id and s.active
  join public.vehicle_categories c on c.project_id=p.id and c.active
  join public.marketplace_pricing_tariffs t on t.project_id=p.id
    and t.service_code=s.code and t.vehicle_category_code=c.code
    and t.status='active' and t.effective_from <= now()
    and (t.effective_to is null or t.effective_to > now())
  left join public.marketplace_modality_visibility v on v.project_id=p.id
    and v.service_code=s.code and v.vehicle_category_code=c.code
  where p.slug=target_project_slug and s.code in ('passenger','cargo','courier')
    and (s.code <> 'passenger' or c.code in ('motorcycle','bicitaxi','tricycle','light_car'))
    and coalesce(v.is_published,true)
  order by s.code,c.code;
$$;

revoke all on function public.admin_list_marketplace_modality_visibility(uuid) from public,anon;
revoke all on function public.admin_set_marketplace_modality_visibility(uuid,text,text,boolean) from public,anon;
revoke all on function public.list_marketplace_published_modalities(text) from public;
grant execute on function public.admin_list_marketplace_modality_visibility(uuid) to authenticated;
grant execute on function public.admin_set_marketplace_modality_visibility(uuid,text,text,boolean) to authenticated;
grant execute on function public.list_marketplace_published_modalities(text) to anon,authenticated,service_role;