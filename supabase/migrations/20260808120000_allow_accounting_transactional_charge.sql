-- Allow accounting operators to preview and execute the authorized transactional
-- charge flow without granting general license-management capabilities.

create or replace function public.admin_preview_charge_plan(
  target_license_id uuid,
  target_plan text,
  target_rule text default 'after_expiry'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_project_id uuid;
begin
  select license.project_id
    into resolved_project_id
  from public.licenses license
  where license.id = target_license_id;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform app_private.require_project_permission(
    resolved_project_id,
    'payments.manage'
  );

  return app_private.billing_plan_preview(
    target_license_id,
    target_plan,
    target_rule,
    now()
  );
end;
$$;

create or replace function public.admin_charge_and_assign_plan(
  target_license_id uuid,
  target_plan text,
  target_amount numeric,
  target_method text,
  target_reference text,
  target_charged_at timestamptz,
  target_notes text,
  target_application_rule text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  current_license public.licenses%rowtype;
  updated_license public.licenses%rowtype;
  config public.license_plans%rowtype;
  payment_record public.payments%rowtype;
  preview jsonb;
  receipt public.billing_receipts%rowtype;
  project_record public.projects%rowtype;
  client_record public.profiles%rowtype;
  operator_email text;
  receipt_snapshot jsonb;
begin
  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;

  select * into receipt
  from public.billing_receipts
  where idempotency_key = target_idempotency_key;

  if found then
    perform app_private.require_project_permission(
      receipt.project_id,
      'payments.manage'
    );
    return receipt.snapshot;
  end if;

  select * into current_license
  from public.licenses
  where id = target_license_id
  for update;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_permission(
    current_license.project_id,
    'payments.manage'
  );

  if current_license.license_type = 'admin' then
    raise exception 'SPECIAL_LICENSE_PROTECTED' using errcode = '42501';
  end if;

  select * into config
  from public.license_plans
  where project_id = current_license.project_id
    and code = target_plan
    and active
  for share;

  if not found then
    raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002';
  end if;
  if target_method not in ('cash', 'transfer', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;
  if target_amount < 0 or target_amount > config.price then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023';
  end if;
  if target_amount <> config.price
     and nullif(btrim(target_notes), '') is null then
    raise exception 'PRICE_ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if target_charged_at is null
     or target_charged_at > now() + interval '5 minutes' then
    raise exception 'INVALID_CHARGED_AT' using errcode = '22023';
  end if;

  preview := app_private.billing_plan_preview(
    target_license_id,
    target_plan,
    target_application_rule,
    now()
  );

  insert into public.payments (
    project_id, user_id, license_id, plan, list_price, discount, amount,
    currency, method, reference, status, recorded_by, notes, charged_at,
    idempotency_key, license_applied_at
  )
  values (
    current_license.project_id, current_license.user_id, current_license.id,
    config.code, config.price, config.price - target_amount, target_amount,
    config.currency, target_method,
    coalesce(
      nullif(btrim(target_reference), ''),
      'PAY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
    ),
    'paid', actor, nullif(btrim(target_notes), ''), target_charged_at,
    target_idempotency_key, now()
  )
  returning * into payment_record;

  update public.licenses
  set plan = config.code,
      license_type = config.license_type,
      status = 'active',
      activated_at = (preview ->> 'new_started_at')::timestamptz,
      expires_at = nullif(preview ->> 'new_expires_at', '')::timestamptz,
      duration_days = config.duration_days,
      max_devices = config.max_devices,
      features = config.features,
      revoked_at = null,
      last_renewed_at = now(),
      last_payment_id = payment_record.id,
      updated_at = now()
  where id = current_license.id
  returning * into updated_license;

  select * into project_record
  from public.projects
  where id = current_license.project_id;

  select * into client_record
  from public.profiles
  where id = current_license.user_id;

  select email into operator_email
  from public.profiles
  where id = actor;

  receipt_snapshot := jsonb_build_object(
    'receipt_id', gen_random_uuid(),
    'receipt_number', 'VRX-' || to_char(now(), 'YYYYMMDD') || '-' ||
      upper(substr(replace(payment_record.id::text, '-', ''), 1, 8)),
    'payment_id', payment_record.id,
    'license_id', current_license.id,
    'project_id', current_license.project_id,
    'project_name', project_record.name,
    'client_name', coalesce(client_record.display_name, client_record.email),
    'client_email', client_record.email,
    'masked_license_key', 'VRX-****-' || right(current_license.license_key, 4),
    'previous_plan', current_license.plan,
    'plan', config.code,
    'plan_name', config.name,
    'duration_days', config.duration_days,
    'list_price', config.price,
    'amount', payment_record.amount,
    'currency', config.currency,
    'method', payment_record.method,
    'reference', payment_record.reference,
    'charged_at', payment_record.charged_at,
    'started_at', updated_license.activated_at,
    'expires_at', updated_license.expires_at,
    'status', updated_license.status,
    'max_devices', updated_license.max_devices,
    'operator_email', operator_email,
    'notes', payment_record.notes,
    'whatsapp', project_record.whatsapp,
    'support_email', project_record.support_email,
    'application_rule', preview ->> 'application_rule'
  );

  insert into public.billing_receipts (
    id, project_id, payment_id, license_id, user_id, idempotency_key,
    receipt_number, snapshot, created_by
  )
  values (
    (receipt_snapshot ->> 'receipt_id')::uuid,
    current_license.project_id,
    payment_record.id,
    current_license.id,
    current_license.user_id,
    target_idempotency_key,
    receipt_snapshot ->> 'receipt_number',
    receipt_snapshot,
    actor
  )
  returning * into receipt;

  insert into public.license_audit_log (
    project_id, license_id, action, detail, actor_id, metadata
  )
  values (
    current_license.project_id,
    current_license.id,
    case
      when current_license.license_type = 'trial' then 'trial_converted'
      else 'license_renewed'
    end,
    'Pago registrado y plan aplicado en una operación transaccional',
    actor,
    jsonb_build_object(
      'payment_id', payment_record.id,
      'receipt_id', receipt.id,
      'previous_plan', current_license.plan,
      'new_plan', config.code,
      'previous_expires_at', current_license.expires_at,
      'new_expires_at', updated_license.expires_at,
      'duration_days', config.duration_days,
      'amount', payment_record.amount,
      'currency', payment_record.currency,
      'method', payment_record.method,
      'reference', payment_record.reference,
      'application_rule', preview ->> 'application_rule'
    )
  );

  return receipt_snapshot;
exception
  when unique_violation then
    select * into receipt
    from public.billing_receipts
    where idempotency_key = target_idempotency_key;

    if found then
      return receipt.snapshot;
    end if;
    raise;
end;
$$;

revoke all on function public.admin_preview_charge_plan(uuid, text, text)
  from public, anon;
revoke all on function public.admin_charge_and_assign_plan(
  uuid, text, numeric, text, text, timestamptz, text, text, uuid
) from public, anon;

grant execute on function public.admin_preview_charge_plan(uuid, text, text)
  to authenticated;
grant execute on function public.admin_charge_and_assign_plan(
  uuid, text, numeric, text, text, timestamptz, text, text, uuid
) to authenticated;
