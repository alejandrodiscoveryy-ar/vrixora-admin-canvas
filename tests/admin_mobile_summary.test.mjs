import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../src/routes/admin.proyectos.$id.index.tsx", import.meta.url), "utf8");

test("panel general prioriza cuatro indicadores operativos y no confunde perfiles con jornada", () => {
  assert.match(dashboard, /aria-label="Panel general móvil"/);
  assert.match(dashboard, /className="grid grid-cols-2 gap-2" aria-label="Indicadores principales"/);
  assert.match(dashboard, /label="Sin conductor"/);
  assert.match(dashboard, /label="En servicio"/);
  assert.match(dashboard, /label="Trabajando"/);
  assert.match(dashboard, /label="Incidencias"/);
  assert.match(dashboard, /label="Usuarios app"/);
  assert.match(dashboard, /No equivale a trabajando/);
});

test("móvil dispone de acceso directo al mapa y los detalles no saturan la pantalla", () => {
  assert.match(dashboard, /search=\{\{ vista: "mapa" \}\}/);
  assert.match(dashboard, /search=\{\{ vista: "trabajos" \}\}/);
  // Preserve both native, collapsible details regions; the premium class is now composed with cn.
  assert.equal((dashboard.match(/<details\s+className=\{cn\("group overflow-hidden/g) ?? []).length, 2);
  assert.equal((dashboard.match(/<summary\s+className="flex min-h-12 cursor-pointer/g) ?? []).length, 2);
  assert.match(dashboard, /<MetricCard density="compact" appearance="premium"/);
  assert.match(dashboard, /Más indicadores/);
  assert.match(dashboard, /Actividad reciente/);
  assert.match(dashboard, /recentActivity.slice\(0, 3\)/);
});

test("panel original de escritorio y controles de permisos permanecen", () => {
  assert.match(dashboard, /className="hidden sm:block"/);
  assert.match(dashboard, /label="Sin conductor"/);
  assert.match(dashboard, /label="Conductores trabajando"/);
  assert.match(dashboard, /canViewUsers/);
  assert.match(dashboard, /canViewMarketplace/);
  assert.match(dashboard, /canViewCommercial/);
  assert.match(dashboard, /canViewAudit/);
  assert.match(dashboard, /<AdminPeriodSelector/);
});

const priorities = readFileSync(new URL("../src/features/admin/OperationalSummaryPriorities.tsx", import.meta.url), "utf8");

test("resumen usa fuentes reales para jornada, GPS y resultados de carreras", () => {
  assert.match(dashboard, /admin_get_marketplace_radar_readiness/);
  assert.match(dashboard, /admin_get_agency_vitality_v1/);
  assert.match(dashboard, /parseAgencyVitality\(data\)/);
  assert.match(dashboard, /timeZone: "America\/Havana"/);
  assert.match(dashboard, /queryKey: \["marketplace-radar-readiness", id\]/);
  assert.match(dashboard, /queryKey: \["agency-vitality-v1", id, cubaWeekStart, cubaToday\]/);
  assert.match(dashboard, /enabled: !permissionsLoading && canViewMarketplace && canViewAnalytics/);
  assert.match(dashboard, /const countOrDash = .*"—"/);
  assert.doesNotMatch(dashboard, /note="Histórico"/);
  assert.doesNotMatch(dashboard, /"En vivo"/);
});

test("solo el desplegable conserva resultados históricos y dinero bien descrito", () => {
  const mobile = dashboard.slice(dashboard.indexOf('aria-label="Panel general móvil"'), dashboard.indexOf('className="hidden sm:block"'));
  const indicators = mobile.slice(mobile.indexOf('aria-label="Indicadores principales"'), mobile.indexOf('aria-label="Accesos directos"'));
  assert.match(indicators, /label="Sin conductor"/);
  assert.match(indicators, /label="Trabajando"/);
  assert.doesNotMatch(indicators, /label="Canceladas"/);
  assert.match(mobile, /Más indicadores/);
  assert.match(mobile, /Resultados · 7 fechas en Cuba/);
  assert.match(mobile, /label="Solicitadas"/);
  assert.match(mobile, /label="Completadas"/);
  assert.match(mobile, /label="Canceladas"/);
  assert.match(mobile, /label="Clientes nuevos"/);
  assert.match(mobile, /Valor de carreras liquidadas/);
  assert.match(mobile, /no ingreso de la agencia/);
  assert.match(dashboard, /canViewPayments/);
});

test("atenciones enlazan a operaciones, incidencias, mapa y recargas sin ampliar permisos", () => {
  for (const label of ["Requiere atención", "Asignación y cobertura pendientes", "Solicitudes, no dinero recibido", "no significa que estén desconectados"]) {
    assert.ok(priorities.includes(label), "Falta prioridad " + label);
  }
  assert.match(priorities, /cancellations\.requested >= 5/);
  assert.match(priorities, /cancellations\.cancelled \/ cancellations\.requested >= 0\.3/);
  assert.match(priorities, /"trabajos" \| "incidencias" \| "mapa" \| "recargas"/);
  assert.match(priorities, /params=\{\{ id: projectId, section: "trabajos" \}\} search=\{\{ vista: item\.vista \}\}/);
  assert.match(priorities, /incomplete \? "No se han podido verificar todas las prioridades\."/);
  assert.doesNotMatch(priorities, /Conductores suspendidos/);
});

test("escritorio no duplica las alertas y distingue ingresos de valores de carreras", () => {
  const desktop = dashboard.slice(dashboard.indexOf('className="hidden sm:block"'));
  assert.match(desktop, /<OperationalSummaryPriorities/);
  assert.match(desktop, /label="Perfiles habilitados"/);
  assert.match(desktop, /label="GPS sin actualizar"/);
  assert.match(desktop, /Importe en CUP, no ingreso ni comisión de la agencia/);
  assert.equal((desktop.match(/title="Requiere atención"/g) ?? []).length, 0);
});
