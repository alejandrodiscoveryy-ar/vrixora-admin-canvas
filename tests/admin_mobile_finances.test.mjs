import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const wallets = source.slice(source.indexOf('<TabsContent value="billeteras"'), source.indexOf('<TabsContent value="recargas"'));
const topups = source.slice(source.indexOf('<TabsContent value="recargas"'), source.indexOf('<TabsContent value="incidencias"'));

test("billeteras: un resumen responsive, importes críticos visibles y desglose financiero plegable", () => {
  assert.match(wallets, /data-marketplace-record="wallet"/);
  assert.match(wallets, /marketplace-wallet-summary/);
  assert.equal((wallets.match(/filteredWalletRows\.map/g) ?? []).length, 1);
  const summary = wallets.slice(0, wallets.indexOf('<details'));
  assert.match(summary, /labelText="Disponible" value=\{formatAmount\(wallet\.availableBalance, wallet\.currency\)\}/);
  assert.match(summary, /labelText="Reservado" value=\{formatAmount\(reserved, wallet\.currency\)\}/);
  assert.match(summary, /labelText="Saldo total" value=\{formatAmount\(wallet\.totalBalance, wallet\.currency\)\}/);
  assert.match(summary, /wallet\.initialDepositConfirmed \? "Depósito OK" : "Depósito pendiente"/);
  assert.match(wallets, /<details className="marketplace-record-details group">/);
  assert.match(wallets, /<summary className="marketplace-record-summary flex min-h-11 cursor-pointer/);
  assert.match(wallets, /Ver detalles de la billetera/);
  for (const property of ["realBalance","promotionalBalance","realReservedBalance","promotionalReservedBalance","promotionalAvailableBalance","updatedAt"]) assert.ok(wallets.includes("wallet." + property));
  assert.match(wallets, /PaginationButton query=\{wallets\}/);
});

test("recargas: importe, estado y gestión de pendientes fuera del detalle", () => {
  assert.equal((topups.match(/filteredTopupRows\.map/g) ?? []).length, 1);
  const summary = topups.slice(0, topups.indexOf("<details"));
  assert.match(summary, /<StatusBadge status=\{item\.status\} \/>/);
  assert.match(summary, /formatAmount\(item\.amount, item\.currency\)/);
  assert.match(summary, /Gestionar recarga pendiente/);
  assert.match(summary, /canManagePayments && item\.status === "requested"/);
  assert.match(summary, /setTopup\(\{/);
  assert.match(summary, /crypto\.randomUUID\(\)/);
  assert.match(topups, /Ver detalles de la recarga/);
});

test("recargas: documentos, fechas, referencia, motivos y acciones siguen accesibles", () => {
  for (const term of ["item.driverPhone","item.reference","item.notes","item.rejectionReason","item.confirmedAt","item.rejectedAt","receipt.documentNumber","receipt.issuedAt"]) assert.ok(topups.includes(term), term);
  assert.match(topups, /setTopupStatus\(value\)/);
  assert.match(topups, /setNewTopup\(true\)/);
  assert.match(topups, /receiptsByTopup\.get\(item\.topupId\)/);
  assert.match(topups, /PaginationButton query=\{topups\}/);
});

test("finanzas: búsqueda explícitamente local, recuperación y diseño sin duplicación", () => {
  for (const block of [wallets, topups]) {
    assert.match(block, /RecordSearch/);
    assert.match(block, /Cargar más para ampliar la búsqueda/);
    assert.match(block, /RecordLoadError/);
    assert.doesNotMatch(block, /sm:hidden|sm:block|admin-premium\/wallets\.svg|admin-premium\/topups\.svg/);
  }
  assert.match(css, /marketplace-record-workspace \{ container-type: inline-size; \}/);
  assert.match(css, /@container \(min-width: 680px\)/);
  assert.match(css, /marketplace-record-summary:focus-visible/);
});

 test("finanzas: tarjetas acotadas, rejilla adaptativa y consultas por tarjeta", () => {
  assert.match(css, /grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 22rem\), 1fr\)\)/);
  assert.match(css, /max-inline-size: 36rem;\s*container-type: inline-size;/);
  assert.match(css, /\.marketplace-finance-row \.marketplace-topup-summary\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@container \(min-width: 300px\)/);
  assert.match(css, /@container \(max-width: 260px\)/);
});
