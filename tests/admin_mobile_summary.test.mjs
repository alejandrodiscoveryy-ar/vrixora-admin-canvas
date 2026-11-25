import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const dashboard = readFileSync(new URL("../src/routes/admin.proyectos.$id.index.tsx", import.meta.url), "utf8");
test("panel estratégico compacto y adaptable", () => {
  assert.match(dashboard, /aria-label="Panel estratégico de TukTuk"/);
  assert.match(dashboard, /grid-cols-2 gap-2 lg:grid-cols-4/);
  assert.match(dashboard, /grid-cols-2 gap-2 lg:grid-cols-3/);
  assert.doesNotMatch(dashboard, /Panel general móvil|hidden sm:block|sm:hidden|title="Ir a gestionar"/);
  assert.match(dashboard, /<MetricCard density="compact" appearance="premium"/);
});
test("pendientes compactos y resultados del período antes del inventario", () => {
  assert.ok(dashboard.indexOf('aria-label="Por atender ahora"') < dashboard.indexOf('canViewAnalytics ? (Math.round'));
  assert.ok(dashboard.indexOf('canViewAnalytics ? (Math.round') < dashboard.indexOf('aria-label="Indicadores principales"'));
  for (const label of ["Clientes nuevos","Solicitudes reales","Viajes completados","Volumen liquidado","Conductores habilitados","Usuarios de la app"]) assert.ok(dashboard.includes('label="'+label+'"'));
  assert.match(dashboard, /Revisar recargas pendientes/);
  assert.match(dashboard, /Resolver incidencias abiertas/);
  assert.match(dashboard, /marketplace\.isError/);
  assert.match(dashboard, /driversActive \?\? "—"/);
});
test("fuentes verificadas, comparación y conversión sin inventar cifras", () => {
  assert.match(dashboard, /permissions\.includes\("analytics\.view"\)/);
  assert.match(dashboard, /canViewAnalytics \? \(Math.round/);
  assert.match(dashboard, /admin_get_agency_vitality_v1/);
  assert.match(dashboard, /target_from: from, target_to: to/);
  assert.match(dashboard, /return parseAgencyVitality\(data\)/);
  assert.match(dashboard, /previous_completed/);
  assert.match(dashboard, /previous_new/);
  assert.match(dashboard, /No se sustituyen por ceros/);
  assert.match(dashboard, /Volumen de viajes, no ingresos de la agencia/);
  assert.match(dashboard, /rides\.requested > 0/);
  assert.match(dashboard, /agencyVitalitySignals\(d\)/);
  assert.match(dashboard, /<ResponsiveContainer/);
  assert.match(dashboard, /pathLength="100"/);
  assert.match(dashboard, /identifyAdminPeriod\(dateRange\)/);
  assert.match(dashboard, /no indica conexión/);
  assert.match(dashboard, /Sin tasa calculable/);
});
test("permisos y detalles conservados", () => {
  assert.equal((dashboard.match(/<details className=/g) ?? []).length, 2);
  assert.match(dashboard, /Más indicadores · detalle por área/);
  assert.match(dashboard, /Actividad administrativa reciente/);
  assert.match(dashboard, /recentActivity\.slice\(0, 3\)/);
  assert.match(dashboard, /vista="mapa"/);
  assert.match(dashboard, /search=\{\{ vista: "recargas" \}\}/);
  for (const permission of ["canViewUsers","canViewMarketplace","canViewPayments","canViewCommercial","canViewAudit"]) assert.ok(dashboard.includes(permission));
  assert.match(dashboard, /<AdminPeriodSelector/);
});
