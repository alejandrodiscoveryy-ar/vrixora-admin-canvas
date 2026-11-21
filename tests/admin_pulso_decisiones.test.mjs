import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/features/admin/MarketplacePulseDecisions.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");

test("Se conserva un solo Pulso premium con diseño original, sin panel duplicado", () => {
  const start = layout.indexOf('<TabsContent value="resumen">');
  const header = layout.indexOf('aria-label="Indicadores operativos de Pulso"', start);
  const decision = layout.indexOf('<MarketplacePulseDecisions', start);
  const legacy = layout.indexOf('Indicadores generales del registro y promociones', start);
  const fleet = layout.indexOf('<MarketplaceFleetPulse', start);
  assert.ok(start >= 0 && header > start && decision > header && legacy > decision && fleet > legacy);
  const snapshot = layout.slice(start, fleet);
  assert.equal(snapshot.match(/<MarketplacePulseDecisions/g)?.length, 1);
  assert.equal(snapshot.match(/<h2[^>]*>Pulso operativo<\/h2>/g)?.length, 1);
  assert.match(snapshot, /<details className="group mt-3 border-t border-border-default pt-3">/);
  assert.match(panel, /import \{ MetricCard \} from "@\/components\/admin\/MetricCard"/);
  assert.match(panel, /appearance: "premium" as const/);
  assert.match(panel, /density: "compact" as const/);
  assert.match(panel, /xl:grid-cols-4/);
  assert.doesNotMatch(panel, /<section aria-label="Pulso para decisiones operativas"/);
  assert.doesNotMatch(panel, /<h2[^>]*>Qué requiere atención<\/h2>/);
});

test("Distingue perfiles habilitados, trabajando, GPS reciente y GPS sin actualizar", () => {
  for (const field of ["driversActive", "working", "gps_recent", "gps_missing"]) {
    assert.ok(panel.includes(field), "Falta " + field);
  }
  assert.match(panel, /No equivale a trabajando/);
  assert.match(panel, /no significa conductor inactivo/);
  assert.match(panel, /admin_get_marketplace_radar_readiness/);
});

test("Carencias de carreras, cancelaciones y clientes son fuente de decisiones", () => {
  assert.match(panel, /admin_get_agency_vitality_v1/);
  assert.match(panel, /parseAgencyVitality/);
  assert.match(panel, /rides\.cancelled \/ rides\.requested/);
  assert.match(panel, /Carreras solicitadas/);
  assert.match(panel, /Completadas/);
  assert.match(panel, /Canceladas/);
  assert.match(panel, /Clientes nuevos/);
  assert.match(panel, /Revisar carreras/);
  assert.match(panel, /Abrir operaciones/);
});

test("Montos pendientes no son ingresos y las notas de corrección se descuentan", () => {
  assert.match(panel, /status === "requested"/);
  assert.match(panel, /listTopups\(projectId, \{ limit: 200, cursor \}\)/);
  assert.match(panel, /listFinancialDocuments\(projectId, \{ limit: 200 \}\)/);
  assert.match(panel, /documents\.length >= 200/);
  assert.match(panel, /documentType === "credit_note"/);
  assert.match(panel, /!reversed\.has\(r\.topupId\)/);
  assert.match(panel, /pendingAmount/);
  assert.match(panel, /no equivalen a ingresos bancarios conciliados/i);
  assert.match(panel, /no ingresado/);
  assert.doesNotMatch(panel, /\.from\("topups"\)/);
});

test("Ausencia de datos o permisos no se presenta como cero o decisión comprobada", () => {
  assert.match(panel, /enabled: canAnalytics/);
  assert.match(panel, /enabled: canPayments/);
  assert.match(panel, /Datos parciales/);
  assert.match(panel, /las cifras que faltan se muestran como «—», no como cero/);
  assert.match(panel, /if \(!complete\) throw new Error/);
  assert.match(panel, /TOPUPS_PAGINATION_INCOMPLETE/);
});
