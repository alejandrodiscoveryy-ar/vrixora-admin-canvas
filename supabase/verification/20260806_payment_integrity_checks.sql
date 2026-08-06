-- Payment integrity verification checklist (P0)
-- Run in a non-production environment after applying migration:
--   supabase/migrations/20260806120000_payment_integrity_guardrails.sql
--
-- This script is intentionally reproducible and manual-safe.
-- Replace UUID placeholders before executing each section.
--
-- SAFETY BY DEFAULT:
-- - This script aborts unless an explicit session flag is enabled.
-- - It also requires a database name that looks like dev/test/staging/local.
-- - All write checks run inside a transaction and are rolled back.
--
-- Manual activation (example in psql/sql editor session):
--   set local app.vrixora_allow_payment_integrity_checks = 'ENABLE_WRITE_CHECKS';
--
-- Required sessions:
--   A) OWNER session (has payments.correct)
--   B) NON-OWNER session (without payments.correct)

do $$
declare
  opt_in text := current_setting('app.vrixora_allow_payment_integrity_checks', true);
begin
  if opt_in is distinct from 'ENABLE_WRITE_CHECKS' then
    raise exception
      'SAFETY_GUARD_BLOCKED: set app.vrixora_allow_payment_integrity_checks=ENABLE_WRITE_CHECKS in-session to run write checks.'
      using errcode = '42501';
  end if;

  if current_database() !~* '(dev|test|staging|local)' then
    raise exception
      'SAFETY_GUARD_BLOCKED: current_database()=% is not an allowed non-production pattern.'
      , current_database()
      using errcode = '42501';
  end if;
end;
$$;

begin;

-- -----------------------------------------------------------------------------
-- Parameters to replace manually
-- -----------------------------------------------------------------------------
-- :project_id                  UUID of target project
-- :license_id                  UUID of an existing license in that project
-- :owner_payment_id_pending    UUID generated in test case #2
-- :owner_payment_id_paid       UUID generated in test case #3
-- :non_owner_payment_id        Any payment UUID in same project

-- -----------------------------------------------------------------------------
-- 1) Impedir borrar un pago confirmado
-- -----------------------------------------------------------------------------
-- OWNER SESSION
-- Expect: CONFIRMED_PAYMENT_DELETE_FORBIDDEN
select public.admin_delete_payment_record(
  ':owner_payment_id_paid'::uuid,
  'Intento de borrado de pago confirmado (debe fallar)'
);

-- -----------------------------------------------------------------------------
-- 2) Permitir borrar únicamente un pendiente válido
-- -----------------------------------------------------------------------------
-- OWNER SESSION
-- Create a pending payment with no receipt and no financial effects.
with seeded as (
  select public.admin_record_license_payment(
    ':license_id'::uuid,
    'standard',
    'transfer',
    'P0-PENDING-DELETE-001',
    'Pago pendiente para prueba de borrado',
    null,
    null,
    'pending'
  ) as payment_row
)
select (payment_row).id as owner_payment_id_pending
from seeded;

-- OWNER SESSION
-- Expect: success
select public.admin_delete_payment_record(
  ':owner_payment_id_pending'::uuid,
  'Borrado válido de pendiente sin efectos financieros'
);

-- OWNER SESSION
-- Expect: row count = 0
select count(*) as payment_exists_after_delete
from public.payments
where id = ':owner_payment_id_pending'::uuid;

-- -----------------------------------------------------------------------------
-- 3) Exigir motivo al anular
-- -----------------------------------------------------------------------------
-- OWNER SESSION
-- Prepare a confirmed payment
with seeded as (
  select public.admin_record_license_payment(
    ':license_id'::uuid,
    'standard',
    'transfer',
    'P0-CANCEL-REASON-001',
    'Pago confirmado para prueba de anulación',
    null,
    null,
    'paid'
  ) as payment_row
)
select (payment_row).id as owner_payment_id_paid
from seeded;

-- OWNER SESSION
-- Expect: CANCELLATION_REASON_REQUIRED
select public.admin_update_payment_status(
  ':owner_payment_id_paid'::uuid,
  'cancelled',
  null
);

-- -----------------------------------------------------------------------------
-- 4) Anular el recibo asociado
-- -----------------------------------------------------------------------------
-- OWNER SESSION
-- Expect: success
select public.admin_update_payment_status(
  ':owner_payment_id_paid'::uuid,
  'cancelled',
  'Anulación manual autorizada para prueba'
);

-- OWNER SESSION
-- Expect: receipt marked as voided
select
  receipt.id,
  receipt.voided_at,
  receipt.voided_by,
  receipt.void_reason,
  receipt.snapshot ->> 'receipt_status' as receipt_status,
  receipt.snapshot ->> 'payment_status' as payment_status
from public.billing_receipts receipt
where receipt.payment_id = ':owner_payment_id_paid'::uuid;

-- -----------------------------------------------------------------------------
-- 5) Excluir el importe anulado de ingresos
-- -----------------------------------------------------------------------------
-- OWNER SESSION
-- Expect: no confirmed-payment analytics event for cancelled payment
select count(*) as confirmed_event_count
from public.analytics_events event
where event.event_name = 'payment_confirmed'
  and event.dedupe_key = 'payment:' || ':owner_payment_id_paid';

-- -----------------------------------------------------------------------------
-- 6) Confirmar que la licencia no cambia al anular
-- -----------------------------------------------------------------------------
-- OWNER SESSION
-- Snapshot before/after can be captured around cancellation.
-- At this point (post-cancel), check that status transition did not rewrite
-- license term due to cancellation itself.
select
  license.id,
  license.last_payment_id,
  license.activated_at,
  license.expires_at,
  license.last_renewed_at
from public.licenses license
where license.id = ':license_id'::uuid;

-- -----------------------------------------------------------------------------
-- 7) Verificar permisos de owner y rechazo a roles no autorizados
-- -----------------------------------------------------------------------------
-- NON-OWNER SESSION
-- Expect: PERMISSION_DENIED:payments.correct (or equivalent 42501)
select public.admin_update_payment_status(
  ':non_owner_payment_id'::uuid,
  'cancelled',
  'Intento no autorizado'
);

-- NON-OWNER SESSION
-- Expect: PERMISSION_DENIED:payments.correct (or equivalent 42501)
select public.admin_delete_payment_record(
  ':non_owner_payment_id'::uuid,
  'Intento no autorizado de borrado'
);

-- -----------------------------------------------------------------------------
-- 8) Prevenir ejecuciones duplicadas (idempotencia)
-- -----------------------------------------------------------------------------
-- OWNER SESSION
-- Repeat cancellation on already-cancelled payment.
-- Expect: success without reversion and without duplicate voiding.
select public.admin_update_payment_status(
  ':owner_payment_id_paid'::uuid,
  'cancelled',
  'Anulación manual autorizada para prueba'
);

-- OWNER SESSION
-- Expect: still a single receipt row for payment and stable void metadata
select
  count(*) as receipt_rows,
  min(receipt.voided_at) as first_voided_at,
  max(receipt.voided_at) as last_voided_at
from public.billing_receipts receipt
where receipt.payment_id = ':owner_payment_id_paid'::uuid;

-- OWNER SESSION
-- Optional: verify only one payment_cancelled audit entry
select count(*) as cancellation_audit_rows
from public.license_audit_log log
where log.metadata ->> 'payment_id' = ':owner_payment_id_paid'
  and log.action = 'payment_cancelled';

rollback;
