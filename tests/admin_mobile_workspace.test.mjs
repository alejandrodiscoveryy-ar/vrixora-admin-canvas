import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relative) {
  return readFileSync(new URL("../src/features/admin/" + relative, import.meta.url), "utf8");
}

const panel = source("MarketplaceSection.tsx");
const fleet = source("MarketplaceFleetPulse.tsx");
const radar = source("MarketplaceRadarReadinessCard.tsx");
const care = source("MarketplaceCustomerCareWorkspace.tsx");
const settings = source("MarketplaceConfigurationWorkspace.tsx");

test("Pulso móvil muestra métricas críticas en dos columnas y permite abrir el resto", () => {
  assert.match(panel, /relative grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4/);
  assert.match(panel, /const \[showAllPulseMetrics, setShowAllPulseMetrics\] = useState\(false\)/);
  assert.match(panel, /aria-expanded=\{showAllPulseMetrics\}/);
  assert.match(panel, /Ver todos los indicadores/);
  assert.match(panel, /Mostrar indicadores principales/);
  assert.match(panel, /sm:min-h-\[174px\]/);
  assert.match(panel, /label: "Incidencias abiertas"/);
  assert.match(panel, /!\(Number\(overview\.data\?\.pendingTopups \?\? 0\) > 0\)/);
  assert.match(panel, /hidden sm:block/);
});

test("Las operaciones conservan todos sus accesos y controles", () => {
  for (const tab of ["resumen", "trabajos", "atencion", "mapa", "conductores", "clientes", "billeteras", "recargas", "incidencias", "configuracion"]) {
    assert.ok(panel.includes('value="' + tab + '"'), "Pestaña faltante: " + tab);
  }
  for (const method of ["setDriver360Id", "setCustomerId", "setJobId", "setIncidentState", "setTopupStatus", "setExpandedOperationId"]) {
    assert.ok(panel.includes(method), "Acción faltante: " + method);
  }
  assert.match(panel, /grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap/);
  assert.match(panel, /sm:min-w-52/);
  assert.match(panel, /overflow-x-auto overscroll-x-contain/);
  assert.match(panel, /customer\.jobsTotal\} trabajos · \{customer\.jobsActive\} activos/);
  assert.match(panel, /break-words text-sm font-semibold tabular-nums/);
  assert.match(panel, /rounded-2xl border p-3 sm:p-4/);
});

test("Flota, radar, atención y configuración usan estructuras móviles compactas", () => {
  assert.match(fleet, /relative grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4/);
  assert.match(fleet, /aria-expanded=\{active\}/);
  assert.match(fleet, /onOpenDriver\(person\.userId\)/);
  assert.match(radar, /sm:rounded-\[18px\] sm:p-3\.5/);
  assert.match(care, /min-w-0 space-y-3 sm:space-y-4/);
  assert.match(care, /data-testid="customer-care-workspace"/);
  assert.match(care, /Publicar carrera real/);
  assert.match(settings, /grid grid-cols-3 gap-1 sm:gap-1.5 xl:grid-cols-1/);
  assert.match(settings, /min-h-11/);
  assert.match(settings, /canManageSettings && canManageMarketplace/);
  assert.doesNotMatch(settings, /sm:p-2\.5-\[/);
});
