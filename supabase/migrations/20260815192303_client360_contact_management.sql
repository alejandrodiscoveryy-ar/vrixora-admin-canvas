-- Cliente 360: edición segura del teléfono/WhatsApp del cliente.
-- La actualización requiere customers.manage, valida pertenencia al proyecto,
-- normaliza el número y registra el cambio en Auditoría empresarial.

create or replace function public.admin_update_client_contact(
  target_project_id uuid,
  target_client_id uuid,
  target_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  previous_profile public.profiles%rowtype;
  normalized_phone text;
  request_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
begin
  actor := app_private.require_project_permission(
    target_project_id,
    'customers.manage'
  );

  if not exists (
    select 1
    from public.licenses license
    where license.project_id = target_project_id
      and license.user_id = target_client_id
    union all
    select 1
    from public.payments payment
    where payment.project_id = target_project_id
      and payment.user_id = target_client_id
    union all
    select 1
    from public.commercial_leads lead
    where lead.project_id = target_project_id
      and lead.user_id = target_client_id
      and lead.archived_at is null
  ) then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
  into previous_profile
  from public.profiles profile
  where profile.id = target_client_id
  for update;

  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  normalized_phone := nullif(
    regexp_replace(
      btrim(coalesce(target_phone, '')),
      '[[:space:]().-]',
      '',
      'g'
    ),
    ''
  );

  if normalized_phone is not null
     and normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_CLIENT_PHONE'
      using errcode = '22023';
  end if;

  if previous_profile.phone is not distinct from normalized_phone then
    return jsonb_build_object(
      'client_id', previous_profile.id,
      'phone', previous_profile.phone,
      'changed', false
    );
  end if;

  update public.profiles
  set phone = normalized_phone,
      updated_at = now()
  where id = target_client_id;

  insert into public.audit_events (
    project_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    ip_address,
    user_agent
  )
  values (
    target_project_id,
    actor,
    'update',
    'profiles',
    target_client_id::text,
    jsonb_build_object(
      'reason', 'Contacto del cliente actualizado desde Cliente 360',
      'old', jsonb_build_object(
        'id', previous_profile.id,
        'phone', previous_profile.phone
      ),
      'new', jsonb_build_object(
        'id', previous_profile.id,
        'phone', normalized_phone
      )
    ),
    coalesce(
      request_headers->>'cf-connecting-ip',
      request_headers->>'x-forwarded-for'
    ),
    request_headers->>'user-agent'
  );

  return jsonb_build_object(
    'client_id', previous_profile.id,
    'phone', normalized_phone,
    'changed', true
  );
end;
$$;

revoke all on function public.admin_update_client_contact(uuid, uuid, text)
from public, anon;

grant execute on function public.admin_update_client_contact(uuid, uuid, text)
to authenticated;
