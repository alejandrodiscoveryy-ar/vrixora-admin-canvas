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

test("recargas: importe y estado visibles, gestión de pendientes accesible sin desplegar", () => {
  assert.equal((topups.match(/filteredTopupRows\.map/g) ?? []).length, 1);
  const summary = topups.slice(0, topups.indexOf("<details"));
  assert.match(summary, /<StatusBadge status=\{item\.status\} \/>/);
  assert.match(summary, /formatAmount\(item\.amount, item\.currency\)/);
  assert.match(summary, /Gestionar recarga pendiente/);
  assert.match(summary, /Enviar datos de pago/);
  assert.match(summary, /canManagePayments && item\.status === "requested"/);
  assert.match(summary, /setTopup\(\{/);
  assert.match(summary, /crypto\.randomUUID\(\)/);
  const detail = topups.slice(topups.indexOf("<details"));
  assert.doesNotMatch(detail, /Gestionar recarga pendiente/);
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

test("finanzas: filas compactas y flecha accesible sin barra adicional", () => {
  for (const block of [wallets, topups]) {
    assert.match(block, /<span className="sr-only">Ver detalles de la/);
    assert.match(block, /group-open:rotate-180/);
    assert.match(block, /marketplace-finance-row/);
  }
  assert.match(css, /\.marketplace-finance-row\s*\{\s*position: relative;\s*display: block;/);
  assert.match(css, /\.marketplace-finance-row \.marketplace-record-summary\s*\{\s*position: absolute;/);
  assert.match(css, /inline-size: 44px;\s*min-block-size: 44px;/);
  assert.match(css, /\.marketplace-finance-row \.marketplace-record-details\[open\]/);
  assert.match(css, /@container \(min-width: 600px\)/);
  assert.doesNotMatch(css, /repeat\(auto-fill, minmax\(min\(100%, 22rem\), 1fr\)\)/);
});

test("Recargas premium alinea importes y estados en columnas compartidas, con marcas de agua de cabecera", () => {
  const recargas = source.slice(source.indexOf('<TabsContent value="recargas"'), source.indexOf('<TabsContent value="incidencias"'));
  const account = readFileSync(new URL("../src/features/admin/MarketplaceTopupPaymentDestination.tsx", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 135px 165px 128px 112px 398px/);
  assert.match(css, /@container \(max-width: 1250px\)/);
  assert.match(css, /@container \(min-width: 1000px\)/);
  assert.match(recargas, /marketplace-topup-toolbar-top/);
  assert.match(recargas, /marketplace-topup-search/);
  assert.match(recargas, /marketplace-topup-create/);
  assert.match(css, /\.marketplace-topup-row \.marketplace-topup-summary\s*\{\s*display: contents/);
  assert.match(css, /\.marketplace-topup-row \.marketplace-topup-amount\s*\{\s*grid-column: 4/);
  assert.match(css, /\.marketplace-topup-row \.marketplace-topup-status\s*\{\s*grid-column: 5/);
  assert.match(css, /\.marketplace-topup-row \.marketplace-topup-actions\s*\{\s*grid-column: 6/);
  assert.match(css, /@container \(max-width: 1250px\)/);
  assert.match(css, /@container \(max-width: 560px\)/);
  assert.match(recargas, /<Banknote aria-hidden="true" className="pointer-events-none absolute/);
  assert.match(account, /data-topup-account-panel/);
  assert.match(account, /<Banknote aria-hidden="true" className="pointer-events-none absolute/);
  assert.match(recargas, /setTopup\(\{/);
  assert.match(recargas, /href=\{instructionLink\.desktop\}/);
  assert.match(recargas, /href=\{notificationLink\.desktop\}/);
});

test("billeteras premium: ancho completo, saldos alineados y jerarquía compacta", () => {
  const walletBlock = source.slice(source.indexOf('<TabsContent value="billeteras"'), source.indexOf('<TabsContent value="recargas"'));
  assert.match(walletBlock, /marketplace-wallet-toolbar/);
  assert.match(walletBlock, /premiumHeaderSurface/);
  assert.match(walletBlock, /<h2[^>]*>Billeteras<\/h2>/);
  assert.match(walletBlock, /<WalletCards aria-hidden="true" className="pointer-events-none absolute/);
  assert.match(walletBlock, /marketplace-wallet-search/);
  assert.match(walletBlock, /marketplace-wallet-row/);
  assert.match(walletBlock, /marketplace-wallet-metrics/);
  assert.match(css, /\.marketplace-record-workspace\[aria-label="Billeteras"\] \{\s*max-inline-size: none;/);
  assert.match(css, /\.marketplace-wallet-row \.marketplace-wallet-summary\s*\{[\s\S]*?grid-template-columns: minmax\(230px, \.88fr\) minmax\(0, 2\.12fr\)/);
  assert.match(css, /\.marketplace-wallet-row \.marketplace-wallet-metrics\s*\{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(max-width: 760px\)/);
  assert.match(css, /@container \(max-width: 420px\)/);
  for (const term of ['wallet.availableBalance', 'wallet.totalBalance', 'wallet.initialDepositConfirmed', 'wallet.realBalance', 'wallet.promotionalBalance', 'wallet.realReservedBalance', 'wallet.promotionalReservedBalance']) {
    assert.ok(walletBlock.includes(term), "Indicador conservado: "+term);
  }
  assert.match(walletBlock, /PaginationButton query=\{wallets\}/);
  assert.match(walletBlock, /<details className="marketplace-record-details group">/);
});

test("Billeteras filtra depósitos y disponibilidad con las mismas pastillas que Recargas", () => {
  const walletView = source.slice(source.indexOf('<TabsContent value="billeteras"'), source.indexOf('<TabsContent value="recargas"'));
  assert.match(source, /const \[walletFilter, setWalletFilter\] = useState/);
  assert.match(source, /case "deposit_pending": return !wallet\.initialDepositConfirmed/);
  assert.match(source, /case "deposit_confirmed": return wallet\.initialDepositConfirmed/);
  assert.match(source, /case "has_available": return Number\(wallet\.availableBalance\) > 0/);
  assert.match(source, /case "no_available": return Number\(wallet\.availableBalance\) <= 0/);
  assert.match(source, /recordMatches\(walletSearch, wallet\.driverDisplayName, wallet\.driverPhone\)/);
  assert.match(walletView, /aria-label="Filtrar billeteras"/);
  for (const label of ["Todas", "Depósito pendiente", "Depósito OK", "Con disponible", "Sin disponible"]) {
    assert.ok(walletView.includes(`"${label}"`), label);
  }
  assert.match(walletView, /className="marketplace-record-filter min-h-11 sm:min-h-8"/);
  assert.match(walletView, /aria-pressed=\{walletFilter === value\}/);
  assert.match(walletView, /onClick=\{\(\) => setWalletFilter\(value\)\}/);
  assert.match(walletView, /setWalletSearch\(""\)/);
  assert.match(walletView, /setWalletFilter\(""\)/);
  assert.match(walletView, /No hay billeteras con estos filtros/);
  assert.match(walletView, /Los filtros se aplican a las billeteras cargadas/);
  assert.match(walletView, /PaginationButton query=\{wallets\}/);
});

test("Finanzas premium: marcas de agua visibles y colores semánticos de estados", () => {
  const wallet = source.slice(source.indexOf('<TabsContent value="billeteras"'), source.indexOf('<TabsContent value="recargas"'));
  const topup = source.slice(source.indexOf('<TabsContent value="recargas"'), source.indexOf('<TabsContent value="incidencias"'));
  const account = readFileSync(new URL("../src/features/admin/MarketplaceTopupPaymentDestination.tsx", import.meta.url), "utf8");
  assert.match(wallet, /<WalletCards aria-hidden="true" className="pointer-events-none absolute marketplace-finance-watermark"/);
  assert.match(topup, /<Banknote aria-hidden="true" className="pointer-events-none absolute marketplace-finance-watermark"/);
  assert.match(account, /marketplace-finance-watermark-account/);
  assert.match(wallet, /data-deposit-state=\{wallet\.initialDepositConfirmed \? "confirmed" : "pending"\}/);
  assert.match(wallet, /data-finance-tone=\{value === "deposit_pending"/);
  assert.match(topup, /data-finance-tone=\{value === "requested"/);
  assert.match(css, /\.marketplace-record-filter\[data-finance-tone="warning"\]/);
  assert.match(css, /\.marketplace-record-filter\[data-finance-tone="success"\]/);
  assert.match(css, /\.marketplace-record-filter\[data-finance-tone="danger"\]/);
  assert.match(css, /\.marketplace-wallet-row\[data-deposit-state="confirmed"\]/);
  assert.match(css, /\.marketplace-topup-row::before \{ inline-size: 4px; \}/);
  assert.match(css, /\.dark \.marketplace-wallet-toolbar \.marketplace-finance-watermark/);
  assert.match(css, /@container \(max-width: 600px\)/);
  assert.doesNotMatch(wallet, /marketplace-finance-watermark[^"]*hidden/);
  assert.doesNotMatch(topup, /marketplace-finance-watermark[^"]*hidden/);
});
test("Recargas muestra teléfono y referencia en todas las filas sin duplicarlos en el detalle", () => {
  const summary = topups.slice(0, topups.indexOf('<details className="marketplace-record-details group">'));
  const detail = topups.slice(topups.indexOf('<details className="marketplace-record-details group">'));
  assert.match(summary, /className="marketplace-topup-phone min-w-0"/);
  assert.match(summary, /item\.driverPhone \|\| "Sin registrar"/);
  assert.match(summary, /className="marketplace-topup-reference min-w-0"/);
  assert.match(summary, /item\.reference \|\| \(item\.method === "transfer" \? "Sin referencia" : "No aplica"\)/);
  assert.match(summary, /marketplace-topup-amount/);
  assert.match(summary, /marketplace-topup-status/);
  assert.match(summary, /marketplace-topup-actions/);
  assert.doesNotMatch(detail, /labelText="Teléfono" value=\{item\.driverPhone\}/);
  assert.doesNotMatch(detail, /labelText="Referencia" value=\{item\.reference\}/);
  assert.match(css, /\.marketplace-topup-row \.marketplace-topup-phone \{ grid-column: 2; \}/);
  assert.match(css, /\.marketplace-topup-row \.marketplace-topup-reference \{ grid-column: 3; \}/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /@container \(max-width: 900px\)/);
  assert.match(css, /@container \(max-width: 560px\)/);
});

test("Recargas abre en Pendientes y restablece esa vista al regresar", () => {
  assert.match(source, /const \[topupStatus, setTopupStatus\] = useState\("requested"\)/);
  assert.match(source, /useEffect\(\(\) => \{\s*if \(tab !== "recargas"\) return;\s*setTopupStatus\("requested"\);\s*setTopupSearch\(""\);\s*\}, \[tab\]\)/);
  assert.match(source, /queryKey: \["marketplace-topups", projectId, topupStatus\]/);
  assert.match(source, /status: topupStatus \|\| undefined/);
  assert.match(topups, /\["", "Todas"\]/);
  assert.match(topups, /\["requested", "Pendientes"\]/);
  assert.match(topups, /onClick=\{\(\) => setTopupStatus\(value\)\}/);
  assert.match(topups, /setTopupStatus\(""\)/);
});
