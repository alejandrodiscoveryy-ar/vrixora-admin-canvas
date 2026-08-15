-- Auditoría empresarial:
-- 1. no registrar validaciones rutinarias de licencia como actividad administrativa;
-- 2. conservar el histórico existente sin borrarlo;
-- 3. ofrecer una consulta por período orientada a negocio;
-- 4. agrupar semánticamente área, importancia, actor y motivo.

create or replace function app_private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  request_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  resolved_project_id uuid;
begin
  -- Las validaciones de licencia son actividad técnica de la app, no Auditoría empresarial.
  -- Si solo cambian last_validation/updated_at, no se genera un evento nuevo.
  if tg_table_name = 'licenses'
     and tg_op = 'UPDATE'
     and (
       (to_jsonb(new) - 'last_validation' - 'updated_at')
       =
       (to_jsonb(old) - 'last_validation' - 'updated_at')
     ) then
    return new;
  end if;

  resolved_project_id := case
    when tg_table_name = 'projects' then (row_data->>'id')::uuid
    else (row_data->>'project_id')::uuid
  end;

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
    resolved_project_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(row_data->>'id', row_data->>'user_id', row_data->>'code'),
    jsonb_build_object(
      'old', old_data,
      'new', case when tg_op = 'DELETE' then null else row_data end
    ),
    coalesce(
      request_headers->>'cf-connecting-ip',
      request_headers->>'x-forwarded-for'
    ),
    request_headers->>'user-agent'
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app_private.capture_audit_event()
from public, anon, authenticated;


create or replace function public.admin_list_business_audit_events(
  target_project_id uuid,
  target_from timestamptz,
  target_to timestamptz,
  target_limit integer default 2000
)
returns table (
  id bigint,
  actor_id uuid,
  actor_email text,
  actor_name text,
  actor_role text,
  action text,
  action_label text,
  area text,
  importance text,
  entity_type text,
  entity_label text,
  entity_id text,
  reason text,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(
    target_project_id,
    'audit.view'
  );

  if target_from is null
     or target_to is null
     or target_from >= target_to then
    raise exception 'INVALID_AUDIT_PERIOD'
      using errcode = '22023';
  end if;

  return query
  with business_events as (
    select
      event.id,
      event.actor_id,
      profile.email as actor_email_value,
      coalesce(
        nullif(btrim(profile.display_name), ''),
        nullif(split_part(profile.email, '@', 1), ''),
        case when event.actor_id is null then 'Sistema' else 'Usuario' end
      ) as actor_name_value,
      case
        when event.actor_id is null then 'system'
        when member.role is not null then member.role
        else 'external'
      end as actor_role_value,
      event.action,
      event.entity_type,
      event.entity_id,
      event.metadata,
      event.ip_address,
      event.user_agent,
      event.created_at
    from public.audit_events event
    left join public.profiles profile
      on profile.id = event.actor_id
    left join public.project_members member
      on member.project_id = event.project_id
     and member.user_id = event.actor_id
    where event.project_id = target_project_id
      and event.created_at >= target_from
      and event.created_at < target_to

      -- Ruido histórico: validación técnica de licencia.
      and not (
        event.action = 'update'
        and event.entity_type = 'licenses'
        and (
          (
            coalesce(event.metadata->'new', '{}'::jsonb)
              - 'last_validation'
              - 'updated_at'
          )
          =
          (
            coalesce(event.metadata->'old', '{}'::jsonb)
              - 'last_validation'
              - 'updated_at'
          )
        )
      )

      -- Actualizaciones que solo cambian updated_at tampoco son una operación empresarial.
      and not (
        event.action = 'update'
        and (
          coalesce(event.metadata->'new', '{}'::jsonb) - 'updated_at'
        )
        =
        (
          coalesce(event.metadata->'old', '{}'::jsonb) - 'updated_at'
        )
      )

      -- Una confirmación de pago puede actualizar pago, licencia y prefactura
      -- dentro de la misma transacción. Para Auditoría empresarial se muestra
      -- como una sola operación: el pago confirmado.

      and not (
        event.entity_type = 'licenses'
        and event.action = 'update'
        and exists (
          select 1
          from public.audit_events payment_event
          where payment_event.project_id = event.project_id
            and payment_event.entity_type = 'payments'
            and payment_event.action = 'insert'
            and payment_event.metadata#>>'{new,license_id}' = event.entity_id
            and payment_event.actor_id is not distinct from event.actor_id
            and abs(
              extract(epoch from (payment_event.created_at - event.created_at))
            ) <= 5
        )
      )

      and not (
        event.entity_type = 'preinvoices'
        and event.action = 'update'
        and event.metadata#>>'{new,status}' = 'paid'
        and exists (
          select 1
          from public.audit_events payment_event
          where payment_event.project_id = event.project_id
            and payment_event.entity_type = 'payments'
            and payment_event.action = 'insert'
            and payment_event.metadata#>>'{new,preinvoice_id}' = event.entity_id
            and payment_event.actor_id is not distinct from event.actor_id
            and abs(
              extract(epoch from (payment_event.created_at - event.created_at))
            ) <= 5
        )
      )

      and not (
        event.entity_type = 'payments'
        and event.action = 'update'
        and exists (
          select 1
          from public.audit_events payment_event
          where payment_event.project_id = event.project_id
            and payment_event.entity_type = 'payments'
            and payment_event.action = 'insert'
            and payment_event.entity_id = event.entity_id
            and payment_event.actor_id is not distinct from event.actor_id
            and abs(
              extract(epoch from (payment_event.created_at - event.created_at))
            ) <= 5
        )
      )

      -- P0-E ya genera un evento semántico de anulación.
      -- Ocultamos el UPDATE técnico del mismo pago para no duplicar la operación.
      and not (
        event.entity_type = 'payments'
        and event.action = 'update'
        and event.metadata#>>'{new,status}' = 'cancelled'
        and coalesce(event.metadata#>>'{old,status}', '') in ('paid', 'complimentary')
        and exists (
          select 1
          from public.audit_events semantic_event
          where semantic_event.project_id = event.project_id
            and semantic_event.action = 'payment_cancelled_safe'
            and semantic_event.entity_id = event.entity_id
            and abs(
              extract(
                epoch from (semantic_event.created_at - event.created_at)
              )
            ) <= 120
        )
      )

      -- La prefactura cancelada como consecuencia del mismo pago queda
      -- representada dentro del evento semántico de anulación.
      and not (
        event.entity_type = 'preinvoices'
        and event.action = 'update'
        and event.metadata#>>'{new,status}' = 'cancelled'
        and exists (
          select 1
          from public.audit_events semantic_event
          where semantic_event.project_id = event.project_id
            and semantic_event.action = 'payment_cancelled_safe'
            and semantic_event.entity_id =
              event.metadata#>>'{new,paid_payment_id}'
            and abs(
              extract(
                epoch from (semantic_event.created_at - event.created_at)
              )
            ) <= 120
        )
      )

      -- Lo mismo para la corrección de licencia causada por una anulación segura.
      and not (
        event.entity_type = 'licenses'
        and event.action = 'update'
        and exists (
          select 1
          from public.audit_events semantic_event
          where semantic_event.project_id = event.project_id
            and semantic_event.action = 'payment_cancelled_safe'
            and semantic_event.metadata#>>'{payment,license_id}' =
              event.entity_id
            and abs(
              extract(
                epoch from (semantic_event.created_at - event.created_at)
              )
            ) <= 120
        )
      )
  ),
  classified as (
    select
      business_event.*,
      case
        when business_event.entity_type in (
          'payments',
          'payment',
          'preinvoices',
          'billing_receipts'
        ) then 'cobros'

        when business_event.entity_type in (
          'licenses',
          'license_plans',
          'license_devices'
        ) then 'licencias'

        when business_event.entity_type in (
          'commercial_leads',
          'commercial_campaigns',
          'referral_relationships',
          'referral_reward_ledger'
        ) then 'comercial'

        when business_event.entity_type = 'profiles'
          then 'clientes'

        when business_event.entity_type in (
          'projects',
          'project_members',
          'project_whatsapp_settings',
          'project_exchange_settings',
          'project_test_settings',
          'project_referral_settings'
        ) then 'administracion'

        else 'otros'
      end as area_value,

      case
        when business_event.entity_type in ('payments', 'payment')
          then 'Pago'
        when business_event.entity_type = 'preinvoices'
          then 'Prefactura'
        when business_event.entity_type = 'billing_receipts'
          then 'Documento de cobro'
        when business_event.entity_type = 'licenses'
          then 'Licencia'
        when business_event.entity_type = 'license_plans'
          then 'Plan'
        when business_event.entity_type = 'license_devices'
          then 'Dispositivo'
        when business_event.entity_type = 'profiles'
          then 'Cliente'
        when business_event.entity_type = 'commercial_leads'
          then 'Seguimiento comercial'
        when business_event.entity_type = 'commercial_campaigns'
          then 'Campaña'
        when business_event.entity_type = 'referral_relationships'
          then 'Referido'
        when business_event.entity_type = 'referral_reward_ledger'
          then 'Beneficio de referido'
        when business_event.entity_type = 'project_members'
          then 'Equipo y permisos'
        when business_event.entity_type = 'project_exchange_settings'
          then 'Tasa de cambio'
        when business_event.entity_type = 'project_whatsapp_settings'
          then 'WhatsApp'
        when business_event.entity_type = 'project_test_settings'
          then 'Modo de pruebas'
        when business_event.entity_type = 'project_referral_settings'
          then 'Configuración de referidos'
        when business_event.entity_type = 'projects'
          then 'Proyecto'
        else business_event.entity_type
      end as entity_label_value,

      case
        when business_event.action = 'payment_cancelled_safe'
          then 'critical'

        when business_event.entity_type = 'project_members'
          and business_event.action in ('insert', 'update', 'delete')
          then 'critical'

        when business_event.entity_type = 'project_exchange_settings'
          and business_event.action = 'update'
          then 'critical'

        when business_event.entity_type in ('payments', 'payment')
          and business_event.action = 'delete'
          then 'critical'

        when business_event.entity_type in (
          'payments',
          'payment',
          'preinvoices',
          'licenses',
          'license_plans',
          'referral_relationships',
          'referral_reward_ledger',
          'projects'
        ) then 'important'

        else 'normal'
      end as importance_value
    from business_events business_event
  ),
  decorated as (
    select
      classified.*,
      case
        when classified.action = 'payment_cancelled_safe'
          then 'Pago anulado'
        when classified.action = 'delete_inactive_plan'
          then 'Plan eliminado'
        when classified.entity_type in ('payments', 'payment')
          and classified.action = 'insert'
          and classified.metadata#>>'{new,status}' = 'paid'
          then 'Pago confirmado'

        when classified.entity_type in ('payments', 'payment')
          and classified.action = 'insert'
          then 'Pago registrado'

        when classified.action = 'insert'
          then 'Creación de ' || lower(classified.entity_label_value)
        when classified.action = 'update'
          then 'Actualización de ' || lower(classified.entity_label_value)
        when classified.action = 'delete'
          then 'Eliminación de ' || lower(classified.entity_label_value)
        else initcap(replace(classified.action, '_', ' '))
      end as action_label_value
    from classified
  )
  select
    decorated.id,
    decorated.actor_id,
    decorated.actor_email_value,
    decorated.actor_name_value,
    decorated.actor_role_value,
    decorated.action,
    decorated.action_label_value,
    decorated.area_value,
    decorated.importance_value,
    decorated.entity_type,
    decorated.entity_label_value,
    decorated.entity_id,
    nullif(btrim(decorated.metadata->>'reason'), ''),
    decorated.metadata,
    decorated.ip_address,
    decorated.user_agent,
    decorated.created_at,
    count(*) over() as total_count
  from decorated
  order by decorated.created_at desc, decorated.id desc
  limit least(
    greatest(coalesce(target_limit, 2000), 1),
    5000
  );
end;
$$;

revoke all on function public.admin_list_business_audit_events(
  uuid,
  timestamptz,
  timestamptz,
  integer
) from public, anon;

grant execute on function public.admin_list_business_audit_events(
  uuid,
  timestamptz,
  timestamptz,
  integer
) to authenticated;