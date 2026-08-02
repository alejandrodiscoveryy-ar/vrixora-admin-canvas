-- Replace physical DELETE for confirmed payments with a safe void operation.
-- Physical deletion is only permitted for truly pending payments with no side effects.

-- 1. Extend the payments status check to include 'voided'.
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments
  add constraint payments_status_check
    check (status in ('pending','paid','cancelled','refunded','complimentary','voided'));

-- 2. Add audit columns for void operations.
alter table public.payments
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text;

-- 3. Add a voided flag to billing_receipts so receipts reflect the void state.
alter table public.billing_receipts
  add column if not exists voided_at timestamptz;

create index if not exists payments_voided_at_idx
  on public.payments(project_id, voided_at) where voided_at is not null;

-- 4. Void a confirmed payment (safe, idempotent, non-destructive).
create or replace function public.admin_void_payment_record(
  target_payment_id uuid,
  target_reason     text
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor           uuid;
  payment_rec     public.payments%rowtype;
  reason          text := nullif(btrim(target_reason), '');
begin
  select * into payment_rec
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_permission(payment_rec.project_id, 'payments.correct');

  if reason is null then
    raise exception 'VOID_REASON_REQUIRED' using errcode = '22023';
  end if;

  -- Idempotency: already voided is fine.
  if payment_rec.status = 'voided' then
    return payment_rec;
  end if;

  if payment_rec.status = 'pending' then
    raise exception 'PENDING_PAYMENT_USE_DELETE' using errcode = '22023';
  end if;

  -- Update payment to voided.
  update public.payments
  set
    status      = 'voided',
    voided_at   = now(),
    voided_by   = actor,
    void_reason = reason
  where id = target_payment_id
  returning * into payment_rec;

  -- Mark the associated receipt as voided.
  update public.billing_receipts
  set voided_at = now()
  where payment_id = target_payment_id
    and voided_at is null;

  insert into public.license_audit_log
    (project_id, license_id, action, detail, actor_id, metadata)
  values (
    payment_rec.project_id,
    payment_rec.license_id,
    'payment_voided',
    'Pago anulado desde el panel administrativo',
    actor,
    jsonb_build_object(
      'payment_id',           payment_rec.id,
      'reference',            payment_rec.reference,
      'reason',               reason,
      'license_term_unchanged', true
    )
  );

  return payment_rec;
end;
$$;

-- 5. Restrict physical deletion to genuinely pending, unlinked payments only.
create or replace function public.admin_delete_payment_record(
  target_payment_id uuid,
  target_reason     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor       uuid;
  payment_rec public.payments%rowtype;
  reason      text := nullif(btrim(target_reason), '');
begin
  select * into payment_rec
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_permission(payment_rec.project_id, 'payments.correct');

  if reason is null then
    raise exception 'DELETE_REASON_REQUIRED' using errcode = '22023';
  end if;

  -- Only pending payments may be physically deleted.
  if payment_rec.status <> 'pending' then
    raise exception 'CONFIRMED_PAYMENT_USE_VOID' using errcode = '22023';
  end if;

  -- Refuse if a receipt exists.
  if exists (
    select 1 from public.billing_receipts where payment_id = target_payment_id
  ) then
    raise exception 'PAYMENT_HAS_RECEIPT_USE_VOID' using errcode = '22023';
  end if;

  -- Refuse if a license points to this payment.
  if exists (
    select 1 from public.licenses where last_payment_id = target_payment_id
  ) then
    raise exception 'PAYMENT_LINKED_TO_LICENSE_USE_VOID' using errcode = '22023';
  end if;

  insert into public.license_audit_log
    (project_id, license_id, action, detail, actor_id, metadata)
  values (
    payment_rec.project_id,
    payment_rec.license_id,
    'payment_deleted',
    'Pago pendiente eliminado por el superadministrador',
    actor,
    jsonb_build_object(
      'payment', to_jsonb(payment_rec) - 'recorded_by',
      'reason', reason,
      'license_term_unchanged', true
    )
  );

  delete from public.payments where id = target_payment_id;
end;
$$;

-- 6. Ensure the analytics trigger excludes voided payments from income metrics.
create or replace function app_private.track_payment_analytics()
returns trigger language plpgsql security definer set search_path=''
as $$
declare payment_row public.payments%rowtype;
begin
  payment_row := case when tg_op = 'DELETE' then old else new end;
  delete from public.analytics_events
  where project_id = payment_row.project_id
    and event_name = 'payment_confirmed'
    and dedupe_key = 'payment:' || payment_row.id::text;
  if tg_op <> 'DELETE'
     and new.status = 'paid'
     and new.voided_at is null then
    perform app_private.insert_analytics_event(
      new.project_id, new.user_id, new.license_id,
      'payment_confirmed',
      coalesce(new.created_at, now()),
      null, null, null, null, null, null, null, null,
      new.plan, null,
      'payment:' || new.id::text,
      jsonb_build_object(
        'amount',     new.amount,
        'currency',   new.currency,
        'payment_id', new.id
      )
    );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- 7. Revoke / grant permissions.
revoke all on function public.admin_void_payment_record(uuid, text)   from public, anon;
revoke all on function public.admin_delete_payment_record(uuid, text) from public, anon;
grant execute on function public.admin_void_payment_record(uuid, text)   to authenticated;
grant execute on function public.admin_delete_payment_record(uuid, text) to authenticated;
