-- TukTuk Aliados/Gestores: carnet de identidad privado (11 dígitos).
-- Conserva RPC v1, URLs compartidas, informes personales y contabilidad sin cambios.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table app_private.marketplace_allies
  add column if not exists identity_card_number text;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'app_private.marketplace_allies'::regclass
      and conname = 'marketplace_allies_identity_card_format'
  ) then
    alter table app_private.marketplace_allies
      add constraint marketplace_allies_identity_card_format
      check (identity_card_number is null or identity_card_number ~ '^[0-9]{11}$');
  end if;
end;
$constraint$;

-- Evita reutilizar un carnet entre gestores del mismo proyecto.
create unique index if not exists marketplace_allies_project_identity_card_unique
  on app_private.marketplace_allies (project_id, identity_card_number)
  where identity_card_number is not null;

comment on column app_private.marketplace_allies.identity_card_number
  is 'Dato personal privado: CI cubano de 11 dígitos. No incluir en enlaces ni dashboard del gestor.';

create or replace function public.admin_create_marketplace_ally_with_identity_v1(
  target_project_id uuid, target_name text, target_slug text,
  target_rate numeric, target_identity_card_number text
) returns jsonb
language plpgsql security definer set search_path = ''
as $body$
declare
  result jsonb;
  card text := nullif(btrim(target_identity_card_number), '');
begin
  perform app_private.require_project_permission(target_project_id, 'commercial.manage');
  if card is not null and card !~ '^[0-9]{11}$' then
    raise exception 'INVALID_ALLY_IDENTITY_CARD' using errcode='22023';
  end if;
  -- Misma lógica atómica del alta actual, incluidos nick, comisión y secreto privado.
  result := public.admin_create_marketplace_ally_v1(
    target_project_id, target_name, target_slug, target_rate
  );
  if card is not null then
    update app_private.marketplace_allies
      set identity_card_number = card, updated_at = now()
      where id = (result ->> 'id')::uuid and project_id = target_project_id;
    insert into public.audit_events(project_id, actor_id, action, entity_type, entity_id, metadata)
      values(target_project_id, auth.uid(), 'ally_identity_recorded', 'marketplace_ally',
             result ->> 'id', jsonb_build_object('identity_card_present', true));
  end if;
  return result;
end;
$body$;

create or replace function public.admin_update_marketplace_ally_with_identity_v1(
  target_project_id uuid, target_ally_id uuid, target_name text,
  target_rate numeric, target_status text, target_identity_card_number text
) returns boolean
language plpgsql security definer set search_path = ''
as $body$
declare
  card text := nullif(btrim(target_identity_card_number), '');
  old_card text;
begin
  perform app_private.require_project_permission(target_project_id, 'commercial.manage');
  if target_identity_card_number is not null and card is not null
     and card !~ '^[0-9]{11}$' then
    raise exception 'INVALID_ALLY_IDENTITY_CARD' using errcode='22023';
  end if;

  -- La actualización del perfil y la del carnet ocurren en una misma transacción.
  perform public.admin_update_marketplace_ally_v1(
    target_project_id, target_ally_id, target_name, target_rate, target_status
  );
  if target_identity_card_number is not null then
    select identity_card_number into old_card
      from app_private.marketplace_allies
      where id=target_ally_id and project_id=target_project_id for update;
    if not found then raise exception 'ALLY_NOT_FOUND' using errcode='22023'; end if;
    if old_card is distinct from card then
      update app_private.marketplace_allies
        set identity_card_number=card, updated_at=now()
        where id=target_ally_id and project_id=target_project_id;
      insert into public.audit_events(project_id, actor_id, action, entity_type, entity_id, metadata)
        values(target_project_id, auth.uid(),
               case when card is null then 'ally_identity_cleared' else 'ally_identity_updated' end,
               'marketplace_ally', target_ally_id::text,
               jsonb_build_object('identity_card_present', card is not null));
    end if;
  end if;
  return true;
end;
$body$;

-- No retorna el carnet completo, ni siquiera a la pantalla de listado.
create or replace function public.admin_list_marketplace_ally_identity_status_v1(
  target_project_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $body$
declare response jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'commercial.manage');
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', a.id,
      'masked', '••••' || right(a.identity_card_number, 4)
    ) order by a.created_at desc), '[]'::jsonb
  )
  into response
  from app_private.marketplace_allies a
  where a.project_id=target_project_id and a.identity_card_number is not null;
  return response;
end;
$body$;

revoke all on function public.admin_create_marketplace_ally_with_identity_v1(uuid,text,text,numeric,text) from public, anon;
revoke all on function public.admin_update_marketplace_ally_with_identity_v1(uuid,uuid,text,numeric,text,text) from public, anon;
revoke all on function public.admin_list_marketplace_ally_identity_status_v1(uuid) from public, anon;

grant execute on function public.admin_create_marketplace_ally_with_identity_v1(uuid,text,text,numeric,text) to authenticated;
grant execute on function public.admin_update_marketplace_ally_with_identity_v1(uuid,uuid,text,numeric,text,text) to authenticated;
grant execute on function public.admin_list_marketplace_ally_identity_status_v1(uuid) to authenticated;

-- La tabla privada ya tiene RLS y no expone privilegios directos de lectura.
commit;
