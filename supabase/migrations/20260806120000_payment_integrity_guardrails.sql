-- P0 financial integrity guardrails for payment lifecycle.
-- Goals:
-- 1) Confirmed payments are never physically deleted.
-- 2) Cancellation/refund requires explicit reason and owner-level permission.
-- 3) Receipts are marked as voided when a confirmed payment is cancelled/refunded.
-- 4) Cancellation does not modify license validity.
-- 5) Duplicate cancellation executions are idempotent.

alter table public.billing_receipts
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text;

alter table public.billing_receipts
  drop constraint if exists billing_receipts_void_consistency_check,
  add constraint billing_receipts_void_consistency_check
  check (
    (
      voided_at is null
      and voided_by is null
      and void_reason is null
    )
    or (
      voided_at is not null
      and voided_by is not null
      and nullif(btrim(void_reason), '') is not null
    )
  );

create index if not exists billing_receipts_voided_at_idx
  on public.billing_receipts(voided_at)
  where voided_at is not null;

create or replace function app_private.void_billing_receipt_for_payment(
  target_payment_id uuid,
  target_actor uuid,
  target_reason text,
  target_final_status text
)
returns public.billing_receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  receipt_record public.billing_receipts%rowtype;
  reason text := nullif(btrim(target_reason), '');
  snapshot_patch jsonb;
begin
  if reason is null then
    raise exception 'CANCELLATION_REASON_REQUIRED' using errcode = '22023';
  end if;

  if target_final_status not in ('cancelled', 'refunded') then
    raise exception 'INVALID_FINAL_STATUS_FOR_VOID' using errcode = '22023';
  end if;

  select * into payment_record
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if payment_record.status not in ('paid', 'complimentary', 'cancelled', 'refunded') then
    raise exception 'PAYMENT_NOT_CONFIRMABLE_FOR_VOID' using errcode = '22023';
  end if;

  select * into receipt_record
  from public.billing_receipts
  where payment_id = target_payment_id
  for update;

  if not found then
    if payment_record.status in ('paid', 'complimentary') then
      perform app_private.create_billing_receipt_for_payment(
        target_payment_id,
        target_actor,
        'void_repair'
      );

      select * into receipt_record
      from public.billing_receipts
      where payment_id = target_payment_id
      for update;
    else
      raise exception 'RECEIPT_MISSING_FOR_FINALIZED_PAYMENT' using errcode = '23514';
    end if;
  end if;

  if receipt_record.voided_at is not null then
    return receipt_record;
  end if;

  snapshot_patch := coalesce(receipt_record.snapshot, '{}'::jsonb);
  snapshot_patch := jsonb_set(snapshot_patch, '{receipt_status}', '"voided"'::jsonb, true);
  snapshot_patch := jsonb_set(snapshot_patch, '{payment_status}', to_jsonb(target_final_status), true);
  snapshot_patch := jsonb_set(snapshot_patch, '{voided_at}', to_jsonb(now()), true);
  snapshot_patch := jsonb_set(snapshot_patch, '{voided_by}', to_jsonb(target_actor::text), true);
  snapshot_patch := jsonb_set(snapshot_patch, '{void_reason}', to_jsonb(reason), true);

  update public.billing_receipts
  set
    voided_at = now(),
    voided_by = target_actor,
    void_reason = reason,
    snapshot = snapshot_patch
  where id = receipt_record.id
  returning * into receipt_record;

  return receipt_record;
end;
$$;

revoke all on function app_private.void_billing_receipt_for_payment(uuid, uuid, text, text)
  from public, anon, authenticated;

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
  receipt_record public.billing_receipts%rowtype;
  reason text := nullif(btrim(target_notes), '');
begin
  select * into previous_payment
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if target_status not in ('pending', 'paid', 'cancelled', 'refunded', 'complimentary') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;

  if target_status = 'complimentary' and previous_payment.amount <> 0 then
    raise exception 'COMPLIMENTARY_PAYMENT_MUST_BE_ZERO' using errcode = '22023';
  end if;

  if target_status in ('cancelled', 'refunded') and reason is null then
    raise exception 'CANCELLATION_REASON_REQUIRED' using errcode = '22023';
  end if;

  if target_status in ('cancelled', 'refunded') then
    actor := app_private.require_project_permission(previous_payment.project_id, 'payments.correct');
  else
    actor := app_private.require_project_permission(previous_payment.project_id, 'payments.manage');
  end if;

  if previous_payment.status in ('cancelled', 'refunded')
     and previous_payment.status <> target_status then
    raise exception 'PAYMENT_ALREADY_FINALIZED' using errcode = '22023';
  end if;

  if target_status = 'pending' and previous_payment.status <> 'pending' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  if target_status in ('paid', 'complimentary')
     and previous_payment.status not in ('pending', target_status) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  if target_status in ('cancelled', 'refunded')
     and previous_payment.status not in ('paid', 'complimentary', target_status) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  if previous_payment.status = target_status then
    if target_status in ('cancelled', 'refunded') then
      perform app_private.void_billing_receipt_for_payment(
        previous_payment.id,
        actor,
        reason,
        target_status
      );
    end if;

    return previous_payment;
  end if;

  if target_status in ('cancelled', 'refunded') then
    receipt_record := app_private.void_billing_receipt_for_payment(
      previous_payment.id,
      actor,
      reason,
      target_status
    );
  end if;

  update public.payments
  set
    status = target_status,
    notes = coalesce(reason, notes)
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
    case
      when target_status = 'cancelled' then 'payment_cancelled'
      when target_status = 'refunded' then 'payment_refunded'
      else 'payment_status_updated'
    end,
    case
      when target_status = 'cancelled' then 'Pago confirmado anulado sin revertir vigencia'
      when target_status = 'refunded' then 'Pago confirmado marcado como reembolsado sin revertir vigencia'
      else 'Estado del pago actualizado desde el panel administrativo'
    end,
    actor,
    jsonb_build_object(
      'payment_id', updated_payment.id,
      'previous_status', previous_payment.status,
      'new_status', updated_payment.status,
      'reason', reason,
      'receipt_id', case when target_status in ('cancelled', 'refunded') then receipt_record.id else null end,
      'license_term_unchanged', target_status in ('cancelled', 'refunded')
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

create or replace function public.admin_update_payment_record(
  target_payment_id uuid,
  target_amount numeric,
  target_currency text,
  target_method text,
  target_reference text,
  target_status text,
  target_notes text,
  target_adjustment_reason text
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
  reason text := nullif(btrim(target_adjustment_reason), '');
  transition_note text;
begin
  select * into previous_payment
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_permission(previous_payment.project_id, 'payments.correct');

  if reason is null then
    raise exception 'ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;

  if target_status not in ('pending', 'paid', 'cancelled', 'refunded', 'complimentary') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;

  if target_currency not in ('CUP', 'USD', 'EUR') then
    raise exception 'INVALID_CURRENCY' using errcode = '22023';
  end if;

  if target_method not in ('card', 'transfer', 'cash', 'paypal', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;

  if target_amount < 0 or target_amount > previous_payment.list_price then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023';
  end if;

  if target_status = 'complimentary' and target_amount <> 0 then
    raise exception 'COMPLIMENTARY_PAYMENT_MUST_BE_ZERO' using errcode = '22023';
  end if;

  if nullif(btrim(target_reference), '') is null then
    raise exception 'PAYMENT_REFERENCE_REQUIRED' using errcode = '22023';
  end if;

  update public.payments
  set
    amount = target_amount,
    discount = list_price - target_amount,
    currency = target_currency,
    method = target_method,
    reference = btrim(target_reference),
    notes = nullif(btrim(target_notes), '')
  where id = target_payment_id
  returning * into updated_payment;

  if previous_payment.status is distinct from target_status then
    transition_note := coalesce(nullif(btrim(target_notes), ''), reason);
    select * into updated_payment
    from public.admin_update_payment_status(target_payment_id, target_status, transition_note);
  end if;

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
    'payment_updated',
    'Pago corregido por el superadministrador',
    actor,
    jsonb_build_object(
      'payment_id', updated_payment.id,
      'reason', reason,
      'before', to_jsonb(previous_payment) - 'recorded_by',
      'after', to_jsonb(updated_payment) - 'recorded_by'
    )
  );

  return updated_payment;
end;
$$;

create or replace function public.admin_delete_payment_record(
  target_payment_id uuid,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  removed_payment public.payments%rowtype;
  reason text := nullif(btrim(target_reason), '');
begin
  select * into removed_payment
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_permission(removed_payment.project_id, 'payments.correct');

  if reason is null then
    raise exception 'DELETE_REASON_REQUIRED' using errcode = '22023';
  end if;

  if removed_payment.status <> 'pending' then
    raise exception 'CONFIRMED_PAYMENT_DELETE_FORBIDDEN' using errcode = '22023';
  end if;

  if removed_payment.license_applied_at is not null then
    raise exception 'PAYMENT_WITH_LICENSE_EFFECT_FORBIDDEN' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.billing_receipts receipt
    where receipt.payment_id = removed_payment.id
  ) then
    raise exception 'PAYMENT_WITH_RECEIPT_FORBIDDEN' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.licenses license
    where license.last_payment_id = removed_payment.id
  ) then
    raise exception 'PAYMENT_LINKED_TO_LICENSE_FORBIDDEN' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.analytics_events event
    where event.project_id = removed_payment.project_id
      and event.event_name = 'payment_confirmed'
      and event.dedupe_key = 'payment:' || removed_payment.id::text
  ) then
    raise exception 'PAYMENT_WITH_FINANCIAL_EFFECT_FORBIDDEN' using errcode = '22023';
  end if;

  insert into public.license_audit_log (
    project_id,
    license_id,
    action,
    detail,
    actor_id,
    metadata
  )
  values (
    removed_payment.project_id,
    removed_payment.license_id,
    'payment_deleted_pending',
    'Pago pendiente eliminado sin efectos financieros',
    actor,
    jsonb_build_object(
      'payment', to_jsonb(removed_payment) - 'recorded_by',
      'reason', reason,
      'license_term_unchanged', true,
      'financial_effects', false
    )
  );

  delete from public.payments
  where id = target_payment_id;
end;
$$;

revoke all on function public.admin_update_payment_status(uuid, text, text)
  from public, anon;
revoke all on function public.admin_update_payment_record(uuid, numeric, text, text, text, text, text, text)
  from public, anon;
revoke all on function public.admin_delete_payment_record(uuid, text)
  from public, anon;

grant execute on function public.admin_update_payment_status(uuid, text, text)
  to authenticated;
grant execute on function public.admin_update_payment_record(uuid, numeric, text, text, text, text, text, text)
  to authenticated;
grant execute on function public.admin_delete_payment_record(uuid, text)
  to authenticated;
