import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/services/supabase.ts", import.meta.url), "utf8");
const start = source.indexOf('<DialogTitle>Gestionar recarga de');
const end = source.indexOf('type JobRadarImpact', start);
const dialog = source.slice(start, end);
const rejected = dialog.slice(dialog.indexOf('aria-labelledby="topup-reject-heading"'), dialog.indexOf('aria-labelledby="topup-confirm-heading"'));
const confirmed = dialog.slice(dialog.indexOf('aria-labelledby="topup-confirm-heading"'));

test("Rechazar tiene un motivo claro, visible y separado de la referencia bancaria", () => {
  assert.ok(start > 0 && end > start);
  assert.match(rejected, /Rechazar solicitud/);
  assert.match(rejected, /htmlFor="topup-rejection-reason"/);
  assert.match(rejected, /id="topup-rejection-reason"/);
  assert.match(rejected, /value=\{reason\}/);
  assert.match(rejected, /onChange=\{\(event\) => setReason\(event\.target\.value\)\}/);
  assert.match(rejected, /Motivo del rechazo \(obligatorio\)/);
  assert.match(rejected, /No necesitas marcar la casilla del ingreso/);
  assert.doesNotMatch(rejected, /value=\{receivedPaymentReference\}|checked=\{verifiedPaymentReceived\}/);
});

test("La acción roja solo requiere un motivo y no confunde el rechazo con confirmar", () => {
  assert.match(rejected, /disabled=\{reject\.isPending \|\| confirm\.isPending \|\| !reason\.trim\(\)\}/);
  assert.match(rejected, /onClick=\{\(\) => reject\.mutate\(\)\}/);
  assert.match(rejected, /variant="destructive"/);
  assert.match(rejected, /Usar motivo: No procede/);
  assert.match(rejected, /setReason\("No procede"\)/);
  assert.match(rejected, /setVerifiedPaymentReceived\(false\)/);
  assert.match(source, /marketplace\.rejectTopup\(projectId, topup!\.id, reason\)/);
  assert.match(api, /rpc\("admin_reject_marketplace_topup"/);
});

test("La confirmación mantiene referencia bancaria y verificación real como requisitos separados", () => {
  assert.match(confirmed, /Confirmar pago recibido/);
  assert.match(confirmed, /htmlFor="topup-received-reference"/);
  assert.match(confirmed, /value=\{receivedPaymentReference\}/);
  assert.match(confirmed, /checked=\{verifiedPaymentReceived\}/);
  assert.match(confirmed, /!receivedPaymentReference\.trim\(\) \|\| !verifiedPaymentReceived/);
  assert.match(confirmed, /onClick=\{\(\) => confirm\.mutate\(\)\}/);
  assert.doesNotMatch(confirmed, /Motivo obligatorio solo para rechazar/);
});

test("Ambas operaciones muestran un resultado claro y conservan el cierre del diálogo", () => {
  assert.match(source, /Solicitud rechazada\. No se acreditó saldo/);
  assert.match(source, /No se pudo rechazar la solicitud/);
  assert.match(source, /Recarga confirmada\. Pulsa Notificar por WhatsApp para enviar el comprobante/);
  assert.match(source, /setReason\(""\)/);
  assert.match(source, /setReceivedPaymentReference\(""\)/);
  assert.match(source, /setVerifiedPaymentReceived\(false\)/);
});
