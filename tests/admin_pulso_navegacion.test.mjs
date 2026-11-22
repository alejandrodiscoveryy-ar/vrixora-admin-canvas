import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pulso = readFileSync(new URL("../src/features/admin/MarketplacePulseDecisions.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");

const destinations = [
  ["Conductores trabajando", "conductores"],
  ["GPS reciente", "mapa"],
  ["GPS sin actualizar", "mapa"],
  ["Perfiles habilitados", "conductores"],
  ["Solicitudes · 7 fechas", "trabajos"],
  ["Completadas · 7 fechas", "trabajos"],
  ["Canceladas · 7 fechas", "trabajos"],
  ["Clientes nuevos · 7 fechas", "clientes"],
  ["Esperando conductor", "trabajos"],
  ["Incidencias abiertas", "incidencias"],
  ["Recargas por verificar", "recargas"],
  ["Recargas vigentes", "recargas"],
  ["Valor de carreras liquidadas", "trabajos"],
];

test("Las 13 tarjetas de Pulso son enlaces nativos a la sección correspondiente", () => {
  const wrappers = [...pulso.matchAll(/<PulseMetricLink projectId=\{projectId\} vista="([^"]+)" label="([^"]+)"/g)];
  assert.equal(wrappers.length, destinations.length);
  for (const [label, view] of destinations) {
    assert.ok(wrappers.some((m) => m[1] === view && m[2] === label), "Falta enlace para " + label);
  }
  assert.match(pulso, /to="\/admin\/proyectos\/\$id\/\$section"/);
  assert.match(pulso, /params=\{\{ id: projectId, section: "trabajos" \}\}/);
  assert.match(pulso, /search=\{estadoRecarga \? \{ vista, estadoRecarga \} : \{ vista \}\}/);
});

test("Los enlaces mantienen la identidad premium y son accesibles con teclado", () => {
  assert.match(pulso, /aria-label=\{\x60Abrir \$\{label\} en \$\{vista\}\x60\}/);
  assert.match(pulso, /focus-visible:ring-2 focus-visible:ring-ring/);
  assert.match(pulso, /group block h-full min-w-0 cursor-pointer/);
  assert.match(pulso, /if \(!enabled\) return <>{children}<\/>;/);
  assert.match(pulso, /density: "compact" as const/);
  assert.match(pulso, /appearance: "premium" as const/);
  assert.equal((pulso.match(/<MetricCard /g) ?? []).length, 13);
  assert.doesNotMatch(pulso, /<section aria-label="Pulso para decisiones operativas"/);
});

test("Las tarjetas financieras enlazan a la pestaña correcta sin alterar la navegación habitual", () => {
  assert.match(pulso, /vista="recargas" label="Recargas por verificar" estadoRecarga="requested"/);
  assert.match(pulso, /vista="recargas" label="Recargas vigentes" estadoRecarga="confirmed"/);
  assert.match(section, /const pulsoTopupState = useRouterState/);
  assert.match(section, /setTopupStatus\(pulsoTopupState === "confirmed" \? "confirmed" : "requested"\)/);
  assert.match(section, /\[tab, pulsoTopupState\]/);
});

test("El acceso a clientes se limita a quienes tienen permiso; no navega a pantallas prohibidas", () => {
  assert.match(pulso, /vista="clientes" label="Clientes nuevos · 7 fechas" enabled=\{canCustomers\}/);
  assert.match(section, /canCustomers=\{canCustomers\}/);
});
