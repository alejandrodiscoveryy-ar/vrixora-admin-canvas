import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/services/supabase.ts", import.meta.url), "utf8");
const contract = readFileSync(new URL("../src/lib/services/types.ts", import.meta.url), "utf8");
const demo = readFileSync(new URL("../src/lib/services/demo.ts", import.meta.url), "utf8");
const topups = admin.slice(admin.indexOf('<TabsContent value="recargas"'), admin.indexOf('<TabsContent value="incidencias"'));
const dialog = admin.slice(admin.indexOf('open={Boolean(topupReversal)}'), admin.indexOf('open={Boolean(topup)}'));

test("La corrección financiera solo está disponible para administradores autorizados y recargas confirmadas", () => {
  assert.match(admin, /permissions\.includes\("payments.correct"\)/);
  assert.match(topups, /canCorrectPayments && canManagePayments && \["confirmed", "reconciled"\]\.includes\(item\.status\) && !isTopupReversed && financialDocumentHistoryComplete/);
  assert.match(topups, /Anular recarga/);
  assert.match(admin, /financialDocuments\.data\?\.length \?\? 0\) < 200/);
});

test("La anulación usa RPC existente sin escribir directamente en tablas ni saldos", () => {
  assert.match(contract, /reverseTopup\(projectId: string, topupId: string, reason: string, idempotencyKey: string\): Promise<void>/);
  const action = api.slice(api.indexOf('async reverseTopup('), api.indexOf('async updateFinancialSettings('));
  assert.match(action, /requireOnline\("Anular recarga confirmada"\)/);
  assert.match(action, /rpc\("admin_reverse_marketplace_topup"/);
  for (const field of ['target_project_id', 'target_topup_id', 'target_reason', 'target_idempotency_key']) assert.ok(action.includes(field));
  assert.doesNotMatch(action, /\.from\(/);
  assert.match(demo, /async reverseTopup\(\)/);
});

test("Motivo, doble confirmación e idempotencia evitan reversiones accidentales", () => {
  assert.match(dialog, /topupReversalReason\.trim\(\)\.length < 8/);
  assert.match(dialog, /topupReversalAcknowledged/);
  assert.match(dialog, /Anular y corregir saldo/);
  assert.match(dialog, /reverse\.isPending/);
  assert.match(admin, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(admin, /topupReversal\.idempotencyKey/);
  assert.match(admin, /"marketplace-wallets"/);
  assert.match(admin, /"marketplace-financial-documents"/);
});

test("Las recargas anuladas no se notifican como confirmadas y conservan comprobante y nota de corrección", () => {
  assert.match(topups, /creditNotesByTopup\.get\(item\.topupId\)/);
  assert.match(topups, /!isTopupReversed && \["confirmed", "reconciled", "rejected"\]/);
  assert.match(topups, /data-topup-status=\{isTopupReversed \? "reversed" : item\.status\}/);
  assert.match(topups, /Anulada/);
  assert.match(topups, /Nota de corrección/);
  assert.match(topups, /Comprobante original/);
  assert.match(admin, /document\.documentType === "topup_receipt"/);
  assert.match(admin, /document\.documentType === "credit_note"/);
});

test("La anulación peligrosa queda fuera de la fila y detrás de dos niveles de detalle", () => {
  const firstRow = topups.slice(topups.indexOf('return <article key={item.topupId}'));
  const main = firstRow.slice(firstRow.indexOf('<div className="marketplace-topup-main">'), firstRow.indexOf('<details className="marketplace-record-details group">'));
  const expanded = firstRow.slice(firstRow.indexOf('<details className="marketplace-record-details group">'), firstRow.indexOf('</article>'));
  const correctionStart = expanded.indexOf('<details className="marketplace-topup-correction');
  const buttonAt = expanded.indexOf('Anular recarga');
  assert.doesNotMatch(main, /Anular recarga|setTopupReversal\(\{/);
  assert.ok(correctionStart > -1, "el control se muestra solo tras abrir el detalle");
  assert.ok(buttonAt > correctionStart, "el botón está dentro de la sección administrativa");
  assert.match(expanded, /Correcciones administrativas/);
  assert.match(expanded, /Anulación excepcional/);
  assert.match(expanded, /border-t border-border-default pt-3/);
  assert.match(expanded, /canCorrectPayments && canManagePayments/);
  assert.match(expanded, /\["confirmed", "reconciled"\]\.includes\(item\.status\) && !isTopupReversed/);
  assert.match(expanded, /min-h-11 w-full.*sm:w-auto/);
});
