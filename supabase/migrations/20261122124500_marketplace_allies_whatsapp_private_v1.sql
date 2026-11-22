-- Agencia TukTuk: número de WhatsApp administrativo para gestores/Aliados.
-- Las URL públicas, el dashboard privado del aliado y la contabilidad no cambian.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table app_private.marketplace_allies
  add column if not exists whatsapp_contact text;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'app_private.marketplace_allies'::regclass
      and conname = 'marketplace_allies_whatsapp_e164'
  ) then
    alter table app_private.marketplace_allies
      add constraint marketplace_allies_whatsapp_e164
      check (whatsapp_contact is null or whatsapp_contact ~ '^[+][1-9][0-9]{7,14}$');
  end if;
end;
$constraint$;

comment on column app_private.marketplace_allies.whatsapp_contact is
  'Contacto privado del gestor, E.164 (+535xxxxxxx). Solo administradores con commercial.manage; nunca en enlaces ni informes públicos.';

-- Admite número móvil de Cuba (8 dígitos empezando 5), 53 + móvil, y +código internacional.
create or replace function app_private.normalize_marketplace_ally_whatsapp_v1(raw_phone text)
returns text language plpgsql immutable set search_path = ''
as $body$
declare input_phone text := btrim(raw_phone);
        digits text;
        normalized text;
begin
  if input_phone is null or input_phone = '' then return null; end if;
  if input_phone !~ '^[+0-9() .-]+$'
     or (position('+' in input_phone) > 0 and input_phone !~ '^[+][^+]+$') then
    raise exception 'INVALID_ALLY_WHATSAPP' using errcode='22023';
  end if;
  digits := regexp_replace(input_phone, '[^0-9]', '', 'g');
  if left(input_phone, 1) = '+' then
    normalized := '+' || digits;
  elsif digits ~ '^5[0-9]{7}$' then
    normalized := '+53' || digits;
  elsif digits ~ '^535[0-9]{7}$' then
    normalized := '+' || digits;
  else
    raise exception 'INVALID_ALLY_WHATSAPP' using errcode='22023';
  end if;
  if normalized !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'INVALID_ALLY_WHATSAPP' using errcode='22023';
  end if;
  return normalized;
end;
$body$;

create or replace function public.admin_create_marketplace_ally_with_contact_v1(
  target_project_id uuid, target_name text, target_slug text,
  target_rate numeric, target_identity_card_number text, target_whatsapp text
) returns jsonb
language plpgsql security definer set search_path = ''
as $body$
declare v_result jsonb;
        v_phone text;
begin
  perform app_private.require_project_permission(target_project_id, 'commercial.manage');
  v_phone := app_private.normalize_marketplace_ally_whatsapp_v1(target_whatsapp);
  -- La creación de perfil/carnet y contacto es atómica.
  v_result := public.admin_create_marketplace_ally_with_identity_v1(
    target_project_id, target_name, target_slug, target_rate, target_identity_card_number
  );
  if v_phone is not null then
    update app_private.marketplace_allies
      set whatsapp_contact = v_phone, updated_at = now()
      where id = (v_result ->> 'id')::uuid and project_id = target_project_id;
    insert into public.audit_events(project_id, actor_id, action, entity_type, entity_id, metadata)
      values (target_project_id, auth.uid(), 'ally_whatsapp_recorded', 'marketplace_ally',
        v_result ->> 'id', jsonb_build_object('whatsapp_present',true));
  end if;
  return v_result;
end;
$body$;

create or replace function public.admin_update_marketplace_ally_with_contact_v1(
  target_project_id uuid, target_ally_id uuid, target_name text, target_rate numeric,
  target_status text, target_identity_card_number text, target_whatsapp text
) returns boolean
language plpgsql security definer set search_path = ''
as $body$
declare v_phone text;
        v_old_phone text;
begin
  perform app_private.require_project_permission(target_project_id, 'commercial.manage');
  if target_whatsapp is not null then
    v_phone := app_private.normalize_marketplace_ally_whatsapp_v1(target_whatsapp);
  end if;
  perform public.admin_update_marketplace_ally_with_identity_v1(
    target_project_id, target_ally_id, target_name, target_rate, target_status,
    target_identity_card_number
  );
  -- NULL conserva el contacto; '' lo quita, previa confirmación en la interfaz.
  if target_whatsapp is not null then
    select whatsapp_contact into v_old_phone
      from app_private.marketplace_allies
      where project_id=target_project_id and id=target_ally_id for update;
    if not found then raise exception 'ALLY_NOT_FOUND' using errcode='22023'; end if;
    if v_old_phone is distinct from v_phone then
      update app_private.marketplace_allies
        set whatsapp_contact = v_phone, updated_at = now()
        where project_id=target_project_id and id=target_ally_id;
      insert into public.audit_events(project_id, actor_id, action, entity_type, entity_id, metadata)
        values(target_project_id, auth.uid(),
          case when v_phone is null then 'ally_whatsapp_cleared' else 'ally_whatsapp_updated' end,
          'marketplace_ally',target_ally_id::text,
          jsonb_build_object('whatsapp_present',v_phone is not null));
    end if;
  end if;
  return true;
end;
$body$;

-- Solo comercial.manage puede consultar números completos para contactar por WhatsApp.
create or replace function public.admin_list_marketplace_ally_contacts_v1(
  target_project_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $body$
declare v_response jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'commercial.manage');
  select coalesce(
    jsonb_agg(jsonb_build_object('id',a.id,'whatsapp',a.whatsapp_contact)
       order by a.created_at desc), '[]'::jsonb
  ) into v_response
  from app_private.marketplace_allies a
  where a.project_id=target_project_id and a.whatsapp_contact is not null;
  return v_response;
end;
$body$;

revoke all on function app_private.normalize_marketplace_ally_whatsapp_v1(text) from public,anon,authenticated;
revoke all on function public.admin_create_marketplace_ally_with_contact_v1(uuid,text,text,numeric,text,text) from public,anon;
revoke all on function public.admin_update_marketplace_ally_with_contact_v1(uuid,uuid,text,numeric,text,text,text) from public,anon;
revoke all on function public.admin_list_marketplace_ally_contacts_v1(uuid) from public,anon;

grant execute on function public.admin_create_marketplace_ally_with_contact_v1(uuid,text,text,numeric,text,text) to authenticated;
grant execute on function public.admin_update_marketplace_ally_with_contact_v1(uuid,uuid,text,numeric,text,text,text) to authenticated;
grant execute on function public.admin_list_marketplace_ally_contacts_v1(uuid) to authenticated;

commit;
