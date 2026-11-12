import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url),
  "utf8",
);

test("billeteras: resumen móvil visible y desglose financiero plegable", () => {
  assert.match(source, /En móvil: resumen de los saldos críticos y desglose bajo demanda/);
  assert.match(source, /Ver detalles de la billetera/);
  // Preserve native expansion with the new graphite inset.
  const wallets = source.slice(source.indexOf('<TabsContent value="billeteras"'), source.indexOf('<TabsContent value="recargas"'));
  assert.match(wallets, /<details className="group rounded-xl border border-border\/60 bg-background\/40 admin-graphite-inset">/);
  assert.match(wallets, /<summary className="flex min-h-11 cursor-pointer/);
  assert.match(wallets, /Ver detalles de la billetera/);
  assert.match(source, /Saldo total: <span className="font-semibold text-foreground">/);
  assert.match(source, /formatAmount\(wallet\.availableBalance, wallet\.currency\)/);
  assert.match(source, /formatAmount\(reserved, wallet\.currency\)/);
  for (const property of ["realBalance", "promotionalBalance", "realReservedBalance", "promotionalReservedBalance", "promotionalAvailableBalance"]) {
    assert.ok(source.includes("wallet." + property), "No ocultar desglose: " + property);
  }
  assert.match(source, /wallet\.initialDepositConfirmed \? "Depósito OK" : "Depósito pendiente"/);
  assert.match(source, /relative hidden gap-3 sm:grid lg:grid-cols-\[minmax\(200px,0\.9fr\)/);
});

test("recargas: importe, estado y gestión de pendientes fuera del detalle", () => {
  assert.match(source, /En móvil: importe, estado y gestión pendientes siempre visibles/);
  assert.match(source, /<StatusBadge status=\{item\.status\} \/>/);
  assert.match(source, /formatAmount\(item\.amount, item\.currency\)/);
  assert.match(source, /Gestionar recarga pendiente/);
  assert.match(source, /canManagePayments && item\.status === "requested"/);
  assert.match(source, /Ver detalles de la recarga/);
  assert.match(source, /setTopup\(\{/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /relative hidden gap-3 sm:grid lg:grid-cols-\[minmax\(0,1\.05fr\)/);
});

test("recargas: documentos, fecha, referencia, motivos y acciones siguen accesibles", () => {
  for (const term of [
    "item.driverPhone", "item.reference", "item.notes", "item.rejectionReason",
    "item.confirmedAt", "item.rejectedAt", "receipt.documentNumber", "receipt.issuedAt",
  ]) {
    assert.ok(source.includes(term), "Campo de detalle ausente: " + term);
  }
  assert.match(source, /setTopupStatus\(value\)/);
  assert.match(source, /setNewTopup\(true\)/);
  assert.match(source, /sm:block/);
});
