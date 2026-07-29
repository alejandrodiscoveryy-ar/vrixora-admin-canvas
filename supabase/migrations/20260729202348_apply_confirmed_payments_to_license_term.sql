alter table public.payments
  add column license_applied_at timestamptz;

comment on column public.payments.license_applied_at is
  'Timestamp when this confirmed payment was applied to the license term. Prevents duplicate extensions.';

create or replace function app_private.apply_confirmed_payment_to_license(
  target_payment_id uuid
)
returns public.licenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  previous_license public.licenses%rowtype;
  updated_license public.licenses%rowtype;
  plan_config public.license_plans%rowtype;
begin
  select *
  into payment_record
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
  into previous_license
  from public.licenses
  where id = payment_record.license_id
  for update;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if payment_record.status not in ('paid', 'complimentary')
     or payment_record.license_applied_at is not null then
    return previous_license;
  end if;

  select *
  into plan_config
  from public.license_plans
  where code = payment_record.plan
    and active
  for share;

  if not found then
    raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002';
  end if;

  update public.licenses
  set
    plan = plan_config.code,
    license_type = plan_config.license_type,
    status = 'active',
    activated_at = coalesce(activated_at, now()),
    max_devices = plan_config.max_devices,
    features = plan_config.features
  where id = previous_license.id
  returning * into updated_license;

  if plan_config.duration_days is null then
    update public.licenses
    set
      duration_days = null,
      expires_at = null
    where id = previous_license.id
    returning * into updated_license;
  else
    update public.licenses
    set
      duration_days = plan_config.duration_days,
      expires_at = greatest(
        now(),
        coalesce(previous_license.expires_at, now())
      ) + make_interval(days => plan_config.duration_days)
    where id = previous_license.id
    returning * into updated_license;
  end if;

  update public.payments
  set license_applied_at = now()
  where id = payment_record.id;

  insert into public.license_audit_log (
    project_id,
    license_id,
    action,
    detail,
    actor_id,
    metadata
  )
  values (
    previous_license.project_id,
    previous_license.id,
    'license_renewed',
    'Vigencia aplicada por pago confirmado',
    payment_record.recorded_by,
    jsonb_build_object(
      'payment_id', payment_record.id,
      'plan', plan_config.code,
      'previous_expires_at', previous_license.expires_at,
      'new_expires_at', updated_license.expires_at
    )
  );

  return updated_license;
end;
$$;

revoke all on function app_private.apply_confirmed_payment_to_license(uuid)
  from public, anon, authenticated;

create or replace function public.admin_record_license_payment(
  target_license_id uuid,
  target_plan text,
  target_method text,
  target_reference text,
  target_notes text default null,
  target_override_amount numeric default null,
  target_adjustment_reason text default null,
  target_payment_status text default 'paid'
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  current_license public.licenses%rowtype;
  plan_config public.license_plans%rowtype;
  recorded_payment public.payments%rowtype;
  paid_amount numeric;
  discount_amount numeric;
  payment_reference text;
begin
  select *
  into current_license
  from public.licenses
  where id = target_license_id
  for share;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_owner(current_license.project_id);

  select *
  into plan_config
  from public.license_plans
  where code = target_plan
    and active
  for share;

  if not found then
    raise exception 'PLAN_NOT_FOUND_OR_INACTIVE' using errcode = 'P0002';
  end if;

  if target_payment_status not in (
    'pending',
    'paid',
    'cancelled',
    'refunded',
    'complimentary'
  ) then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;

  paid_amount := case
    when target_payment_status = 'complimentary' then 0
    else coalesce(target_override_amount, plan_config.price)
  end;

  if paid_amount <> plan_config.price
     and nullif(btrim(target_adjustment_reason), '') is null then
    raise exception 'PRICE_ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;

  if paid_amount < 0 or paid_amount > plan_config.price then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023';
  end if;

  discount_amount := plan_config.price - paid_amount;
  payment_reference := coalesce(
    nullif(btrim(target_reference), ''),
    'PAY-' || upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16))
  );

  insert into public.payments (
    project_id,
    user_id,
    license_id,
    plan,
    list_price,
    discount,
    amount,
    currency,
    method,
    reference,
    status,
    recorded_by,
    notes
  )
  values (
    current_license.project_id,
    current_license.user_id,
    current_license.id,
    plan_config.code,
    plan_config.price,
    discount_amount,
    paid_amount,
    plan_config.currency,
    target_method,
    payment_reference,
    target_payment_status,
    actor,
    concat_ws(
      ' · ',
      nullif(btrim(target_notes), ''),
      nullif(btrim(target_adjustment_reason), '')
    )
  )
  returning * into recorded_payment;

  insert into public.license_audit_log (
    project_id,
    license_id,
    action,
    detail,
    actor_id,
    metadata
  )
  values (
    current_license.project_id,
    current_license.id,
    'payment_recorded',
    'Pago registrado desde el panel administrativo',
    actor,
    jsonb_build_object(
      'payment_id', recorded_payment.id,
      'status', recorded_payment.status,
      'amount', recorded_payment.amount,
      'currency', recorded_payment.currency,
      'plan', recorded_payment.plan
    )
  );

  if recorded_payment.status in ('paid', 'complimentary') then
    perform app_private.apply_confirmed_payment_to_license(recorded_payment.id);
    select * into recorded_payment
    from public.payments
    where id = recorded_payment.id;
  end if;

  return recorded_payment;
end;
$$;

create or replace function public.admin_update_payment_status(
  target_payment_id uuid,
  target_status text,
  target_notes text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  previous_payment public.payments%rowtype;
  updated_payment public.payments%rowtype;
begin
  select *
  into previous_payment
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_owner(previous_payment.project_id);

  if target_status not in (
    'pending',
    'paid',
    'cancelled',
    'refunded',
    'complimentary'
  ) then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;

  if target_status = 'complimentary' and previous_payment.amount <> 0 then
    raise exception 'COMPLIMENTARY_PAYMENT_MUST_BE_ZERO' using errcode = '22023';
  end if;

  update public.payments
  set
    status = target_status,
    notes = coalesce(nullif(btrim(target_notes), ''), notes)
  where id = target_payment_id
  returning * into updated_payment;

  insert into public.license_audit_log (
    project_id,
    license_id,
    action,
    detail,
    actor_id,
    metadata
  )
  values (
    updated_payment.project_id,
    updated_payment.license_id,
    'payment_status_updated',
    'Estado del pago actualizado desde el panel administrativo',
    actor,
    jsonb_build_object(
      'payment_id', updated_payment.id,
      'previous_status', previous_payment.status,
      'new_status', updated_payment.status
    )
  );

  if updated_payment.status in ('paid', 'complimentary') then
    perform app_private.apply_confirmed_payment_to_license(updated_payment.id);
    select * into updated_payment
    from public.payments
    where id = updated_payment.id;
  end if;

  return updated_payment;
end;
$$;

revoke all on function public.admin_record_license_payment(
  uuid, text, text, text, text, numeric, text, text
) from public, anon;
revoke all on function public.admin_update_payment_status(uuid, text, text)
  from public, anon;

grant execute on function public.admin_record_license_payment(
  uuid, text, text, text, text, numeric, text, text
) to authenticated;
grant execute on function public.admin_update_payment_status(uuid, text, text)
  to authenticated;
