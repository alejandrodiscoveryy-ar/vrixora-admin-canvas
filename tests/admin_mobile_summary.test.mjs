import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../src/routes/admin.proyectos.$id.index.tsx", import.meta.url), "utf8");

test("panel general usa una sola jerarquía adaptable a móvil y escritorio", () => {
  assert.match(dashboard, /aria-label="Panel estratégico de TukTuk"/);
  assert.match(dashboard, /aria-label="Indicadores principales"/);
  assert.doesNotMatch(dashboard, /Panel general móvil|hidden sm:block|sm:hidden/);
  assert.match(dashboard, /min-\[430px\]:grid-cols-2 xl:grid-cols-3/);
  assert.match(dashboard, /<MetricCard density="compact" appearance="premium"/);
});

test("prioriza pendientes y tres indicadores no redundantes", () => {
  const attention = dashboard.indexOf('title="Por atender ahora"');
  const metrics = dashboard.indexOf('aria-label="Indicadores principales"');
  const insight = dashboard.indexOf('title="Lectura del negocio"');
  assert.ok(attention !== -1 && metrics > attention && insight > metrics);
  for (const metric of ['label="Trabajos publicados"', 'label="Conductores activos"', 'label="Usuarios de la app"']) {
    assert.match(dashboard, new RegExp(metric));
  }
  assert.match(dashboard, /Revisar recargas pendientes/);
  assert.match(dashboard, /Resolver incidencias abiertas/);
  assert.match(dashboard, /Conductores suspendidos · seguimiento/);
  assert.match(dashboard, /marketplace\.isLoading/);
  assert.match(dashboard, /marketplace\.isError/);
});

test("no confunde el filtro comercial, la disponibilidad, ni el origen de los datos", () => {
  assert.match(dashboard, /Las fechas filtran altas y captación comercial/);
  assert.match(dashboard, /no indica conexión/);
  assert.match(dashboard, /Las altas de la app y los leads del seguimiento comercial son fuentes diferentes/);
  assert.match(dashboard, /Sin tasa calculable/);
});

test("los detalles y la auditoría permanecen desplegables y los accesos respetan permisos", () => {
  assert.equal((dashboard.match(/<details className=/g) ?? []).length, 2);
  assert.match(dashboard, /Más indicadores · detalle por área/);
  assert.match(dashboard, /Actividad administrativa reciente/);
  assert.match(dashboard, /recentActivity\.slice\(0, 3\)/);
  assert.match(dashboard, /search=\{\{ vista: "mapa" \}\}/);
  assert.match(dashboard, /search=\{\{ vista: "trabajos" \}\}/);
  assert.match(dashboard, /search=\{\{ vista: "recargas" \}\}/);
  assert.match(dashboard, /canViewUsers/);
  assert.match(dashboard, /canViewMarketplace/);
  assert.match(dashboard, /canViewCommercial/);
  assert.match(dashboard, /canViewAudit/);
  assert.match(dashboard, /<AdminPeriodSelector/);
});
