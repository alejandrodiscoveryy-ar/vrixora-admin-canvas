import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const wallet = source.slice(source.indexOf('<TabsContent value="billeteras"'), source.indexOf('<TabsContent value="recargas"'));
const topup = source.slice(source.indexOf('<TabsContent value="recargas"'), source.indexOf('<TabsContent value="incidencias"'));

test("Billeteras móvil concentra filtros sin perder saldos ni estados", () => {
  assert.match(wallet, /marketplace-mobile-finance-filter/);
  assert.match(wallet, /marketplace-desktop-finance-filters/);
  assert.match(wallet, /labelText="Filtrar billeteras" value=\{walletFilter\}/);
  for (const filter of ["deposit_pending", "deposit_confirmed", "has_available", "no_available"]) {
    assert.match(wallet, new RegExp('<option value="' + filter + '"'));
  }
  for (const metric of ['labelText="Disponible"', 'labelText="Reservado"', 'labelText="Saldo total"', 'labelText="Saldo real"', 'labelText="Saldo promocional"']) {
    assert.ok(wallet.includes(metric), metric);
  }
  assert.match(wallet, /<details className="marketplace-record-details group">/);
  assert.match(wallet, /marketplace-deposit-state/);
});

test("Recargas móvil muestra importe, estado, teléfono y referencia y mantiene gestión segura", () => {
  assert.match(topup, /marketplace-mobile-finance-filter/);
  assert.match(topup, /labelText="Estado de recarga" value=\{topupStatus\}/);
  for (const status of ["requested", "confirmed", "reconciled", "reversed", "rejected"]) {
    assert.match(topup, new RegExp('<option value="' + status + '"'));
  }
  for (const field of ["marketplace-topup-phone", "marketplace-topup-reference", "marketplace-topup-amount", "marketplace-topup-status", "marketplace-topup-actions"]) {
    assert.ok(topup.includes(field), field);
  }
  assert.match(topup, /Gestionar recarga pendiente/);
  assert.match(topup, /Enviar datos de pago/);
  assert.match(topup, /<details className="marketplace-record-details group">/);
  assert.match(topup, /marketplace-topup-correction/);
  assert.doesNotMatch(topup, /overflow-x-auto/);
});

test("Finanzas móvil usa ancho disponible, dos balances, acciones táctiles y detalles desplegables", () => {
  const mobile = css.slice(css.indexOf("/* Mobile-first financial workspace refinements"));
  assert.ok(mobile.length > 1000);
  assert.match(mobile, /@container \(max-width: 600px\)/);
  assert.match(mobile, /@container \(max-width: 330px\)/);
  assert.match(mobile, /\.marketplace-mobile-finance-filter \{ display: block; inline-size: 100%; \}/);
  assert.match(mobile, /\.marketplace-desktop-finance-filters \{ display: none; \}/);
  assert.match(mobile, /\.marketplace-topup-row \.marketplace-topup-amount \{\s*grid-column: 1;\s*grid-row: 2;/);
  assert.match(mobile, /\.marketplace-topup-row \.marketplace-topup-status \{\s*grid-column: 2;\s*grid-row: 2;/);
  assert.match(mobile, /\.marketplace-topup-row \.marketplace-topup-actions > \* \{\s*flex: 1 1 100%/);
  assert.match(mobile, /\.marketplace-wallet-row \.marketplace-wallet-metrics \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.marketplace-finance-row \.marketplace-record-summary \{[\s\S]*?min-block-size: 44px;/);
  assert.match(css, /\.marketplace-wallet-toolbar \.marketplace-finance-watermark/);
  assert.match(css, /\.marketplace-topup-toolbar \.marketplace-finance-watermark/);
});

test("Gestión de recarga en móvil conserva comprobación de ingreso y modal desplazable", () => {
  const dialog = source.slice(source.indexOf('open={Boolean(topup)}'), source.indexOf('type JobRadarImpact'));
  assert.match(dialog, /max-h-\[calc\(100dvh-1rem\)\]/);
  assert.match(dialog, /w-\[calc\(100vw-1rem\)\]/);
  assert.match(dialog, /overflow-y-auto/);
  assert.match(dialog, /\[_button\]:min-h-11/);
  assert.match(dialog, /verifiedPaymentReceived/);
  assert.match(dialog, /receivedPaymentReference\.trim\(\)/);
  assert.match(dialog, /confirm\.mutate\(\)/);
  assert.match(dialog, /reject\.mutate\(\)/);
});
