-- Close the commercial transaction by allowing an explicitly confirmed client
-- WhatsApp correction inside the existing payment + license + receipt transaction.

create or replace function public.admin_charge_and_assign_plan_with_client_phone(
  target_license_id uuid,
  target_plan text,
  target_amount numeric,
  target_method text,
  target_reference text,
  target_charged_at timestamptz,
  target_notes text,
  target_application_rule text,
  target_idempotency_key uuid,
  target_client_phone text,
  target_confirm_phone_change boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  resolved_project_id uuid;
  resolved_user_id uuid;
  previous_phone text;
  normalized_previous_phone text;
  normalized_phone text;
  phone_changed boolean;
  receipt_snapshot jsonb;
  receipt_record public.billing_receipts%rowtype;
begin
  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;

  select * into receipt_record
  from public.billing_receipts
  where idempotency_key = target_idempotency_key;

  if found then
    perform app_private.require_project_permission(
      receipt_record.project_id,
      'payments.manage'
    );
    return receipt_record.snapshot;
  end if;

  select license.project_id, license.user_id
    into resolved_project_id, resolved_user_id
  from public.licenses license
  where license.id = target_license_id;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_permission(
    resolved_project_id,
    'payments.manage'
  );

  select profile.phone
    into previous_phone
  from public.profiles profile
  where profile.id = resolved_user_id
  for update;

  normalized_phone := nullif(regexp_replace(coalesce(target_client_phone, ''), '[[:space:]()-]', '', 'g'), '');
  normalized_previous_phone := nullif(regexp_replace(coalesce(previous_phone, ''), '[[:space:]()-]', '', 'g'), '');

  if normalized_phone is not null
     and normalized_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'INVALID_CLIENT_WHATSAPP' using errcode = '22023';
  end if;

  phone_changed := normalized_phone is not null
    and normalized_phone is distinct from normalized_previous_phone;

  if phone_changed and not coalesce(target_confirm_phone_change, false) then
    raise exception 'CLIENT_WHATSAPP_CHANGE_CONFIRMATION_REQUIRED'
      using errcode = '22023';
  end if;

  receipt_snapshot := public.admin_charge_and_assign_plan(
    target_license_id,
    target_plan,
    target_amount,
    target_method,
    target_reference,
    target_charged_at,
    target_notes,
    target_application_rule,
    target_idempotency_key
  );

  if phone_changed then
    update public.profiles
    set phone = normalized_phone,
        updated_at = now()
    where id = resolved_user_id;
  end if;

  receipt_snapshot := receipt_snapshot || jsonb_build_object(
    'client_whatsapp', case when phone_changed then normalized_phone else previous_phone end,
    'previous_client_whatsapp', previous_phone,
    'client_whatsapp_updated', phone_changed,
    'client_whatsapp_origin', 'payment_confirmation',
    'client_whatsapp_verification', case
      when phone_changed then 'confirmed_manually_by_operator'
      else 'unchanged'
    end
  );

  update public.billing_receipts
  set snapshot = receipt_snapshot
  where payment_id = (receipt_snapshot ->> 'payment_id')::uuid;

  if phone_changed then
    insert into public.license_audit_log (
      project_id, license_id, action, detail, actor_id, metadata
    )
    values (
      resolved_project_id,
      target_license_id,
      'client_whatsapp_updated',
      'WhatsApp confirmado manualmente por operador durante el cobro',
      actor,
      jsonb_build_object(
        'payment_id', receipt_snapshot ->> 'payment_id',
        'previous_phone', previous_phone,
        'new_phone', normalized_phone,
        'origin', 'payment_confirmation',
        'verification_method', 'confirmed_manually_by_operator',
        'confirmed_at', now()
      )
    );
  end if;

  return receipt_snapshot;
end;
$$;

revoke all on function public.admin_charge_and_assign_plan_with_client_phone(
  uuid, text, numeric, text, text, timestamptz, text, text, uuid, text, boolean
) from public, anon;

grant execute on function public.admin_charge_and_assign_plan_with_client_phone(
  uuid, text, numeric, text, text, timestamptz, text, text, uuid, text, boolean
) to authenticated;
