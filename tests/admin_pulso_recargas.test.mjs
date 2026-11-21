import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");
const pulse = readFileSync(new URL("../src/features/admin/MarketplaceTopupFinancialPulse.tsx", import.meta.url), "utf8");
const render = panel.slice(panel.indexOf('aria-label="Indicadores operativos de Pulso"'), panel.indexOf('<MarketplaceFleetPulse'));

test("Pulso financiero muestra importes a quienes tienen permiso de pagos, sin modificar indicadores existentes", () => {
  assert.match(render, /<MarketplaceTopupFinancialPulse/);
  assert.match(render, /enabled=\{tab === "resumen" && canPayments\}/);
  assert.match(render, /vista: "recargas"/);
  assert.match(render, /label="Recargas pendientes"/);
  assert.match(render, /label="Trabajos activos"/);
});

test("La fuente de recargas reutiliza la RPC autorizada y pagina hasta completar el histórico", () => {
  assert.match(pulse, /supabaseServices\.marketplace\.listTopups\(projectId,/);
  assert.match(pulse, /cursor,/);
  assert.match(pulse, /if \(!batch\.nextCursor\) return summarizeTopups\(all\)/);
  assert.match(pulse, /throw new Error\("El histórico supera el límite/);
  assert.match(pulse, /refetchInterval: 30_000/);
  assert.match(pulse, /queryKey: \["marketplace-topups", projectId, "financial-pulse"\]/);
});

test("Distingue solicitudes de ingresos y calcula el mes por fecha de confirmación en Cuba", () => {
  for (const status of ["requested", "confirmed", "rejected"]) assert.ok(pulse.includes('row.status === "' + status + '"'));
  assert.match(pulse, /timeZone: "America\/Havana"/);
  assert.match(pulse, /monthInHavana\(row\.confirmedAt\) === month/);
  assert.match(pulse, /currency.*length > 1/);
  assert.match(pulse, /No fue posible calcular el resumen completo/);
  assert.match(pulse, /no equivalen a conciliación bancaria ni a saldo disponible/);
});

test("Importes y método de pago separados, con las superficies premium aprobadas", () => {
  for (const item of ["pendingAmount","confirmedAmount","monthAmount","rejectedAmount","pendingCash","pendingTransfer","confirmedCash","confirmedTransfer"]) assert.ok(pulse.includes(item), item);
  assert.match(pulse, /premiumSurface/);
  assert.match(pulse, /premiumControlSurface/);
  assert.match(pulse, /appearance="premium"/);
  assert.match(pulse, /grid-cols-2.*xl:grid-cols-4/);
});
