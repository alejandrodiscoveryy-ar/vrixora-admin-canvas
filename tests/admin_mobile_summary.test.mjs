import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../src/routes/admin.proyectos.$id.index.tsx", import.meta.url), "utf8");

test("panel general prioriza cuatro indicadores en dos columnas móviles", () => {
  assert.match(dashboard, /aria-label="Panel general móvil"/);
  assert.match(dashboard, /className="grid grid-cols-2 gap-2" aria-label="Indicadores principales"/);
  assert.match(dashboard, /label="Usuarios app"/);
  assert.match(dashboard, /label="Conductores"/);
  assert.match(dashboard, /label="Servicios activos"/);
  assert.match(dashboard, /label="Incidencias abiertas"/);
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
  assert.match(dashboard, /label="Trabajos publicados"/);
  assert.match(dashboard, /canViewUsers/);
  assert.match(dashboard, /canViewMarketplace/);
  assert.match(dashboard, /canViewCommercial/);
  assert.match(dashboard, /canViewAudit/);
  assert.match(dashboard, /<AdminPeriodSelector/);
});
