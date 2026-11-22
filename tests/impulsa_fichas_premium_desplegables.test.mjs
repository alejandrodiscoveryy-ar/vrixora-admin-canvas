import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const impulsa = readFileSync(new URL("../src/features/admin/MarketplaceImpulsaCommunicationAnalytics.tsx", import.meta.url), "utf8");
const allies = readFileSync(new URL("../src/features/admin/MarketplaceAlliesPanel.tsx", import.meta.url), "utf8");

test("Impulsa replica las fichas premium de Aliados sin un segundo panel", () => {
  assert.match(impulsa, /Aportación de cada conductor/);
  assert.match(impulsa, /className=\{cp\.inset \+ " group relative min-w-0 overflow-hidden p-0 shadow-sm/);
  assert.match(allies, /className=\{cp\.inset \+ " group relative overflow-hidden p-0 shadow-sm/);
  assert.match(impulsa, /absolute inset-y-0 left-0 w-\[3px\]/);
  assert.match(impulsa, /bg-surface-2\/80/);
  assert.match(impulsa, /rounded-xl border border-border-subtle/);
  assert.match(impulsa, /ImpulsaDriverPortrait name=\{x\.name\} media=\{photo\}/);
  assert.match(impulsa, /flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full/);
  assert.match(impulsa, /aria-label="Impulsa Analytics — Comunicación y conversión"/);
});

test("Fichas plegadas por defecto y con estado independiente", () => {
  assert.match(impulsa, /useState<Set<string>>\(\(\) => new Set\(\)\)/);
  assert.match(impulsa, /const open=expanded\.has\(x\.driver_user_id\)/);
  assert.match(impulsa, /const next=new Set\(current\)/);
  assert.match(impulsa, /if\(next\.has\(x\.driver_user_id\)\)next\.delete\(x\.driver_user_id\)/);
  assert.match(impulsa, /else next\.add\(x\.driver_user_id\)/);
  assert.match(impulsa, /data-impulsa-expanded=\{open\?"true":"false"\}/);
  assert.match(impulsa, /hidden=\{!open\}/);
  assert.match(impulsa, /setExpanded\(new Set\(\)\)/);
});

test("Datos esenciales visibles al plegar; captación y conversión al desplegar", () => {
  const a = impulsa.indexOf('return <article key={x.driver_user_id}');
  const b = impulsa.indexOf('id={`impulsa-marketing-driver-${x.driver_user_id}`}',a);
  assert.ok(a > 0 && b > a);
  const summary = impulsa.slice(a,b);
  const details = impulsa.slice(b,impulsa.indexOf('</article>',b));
  assert.match(summary, /\{x\.name\}/);
  assert.match(summary, /Activo":"Inactivo/);
  assert.match(summary, /\{fmt\(number\(x\.clicks\)\)\} clics/);
  assert.match(summary, /\{fmt\(number\(x\.attributed_real\)\)\} viajes atribuidos/);
  assert.match(summary, /\{fmt\(number\(x\.completed_real\)\)\} completados/);
  assert.match(details, /Captación y actividad del enlace/);
  for(const label of ["Intentos de compartir","Enlace copiado","Descargas","Sesiones","Cotizaciones","Solicitudes en Cliente","Viajes atribuidos","Completados"]) assert.ok(details.includes(label),label);
  assert.match(details, /Solicitudes \/ clics registrados/);
  assert.match(details, /no identifica personas únicas ni confirma ganancias/);
});

test("Despliegue con teclado y móvil sin acciones financieras añadidas", () => {
  assert.match(impulsa, /aria-expanded=\{open\}/);
  assert.match(impulsa, /aria-controls=\{`impulsa-marketing-driver-\$\{x\.driver_user_id\}`\}/);
  assert.match(impulsa, /onClick=\{\(\) => setExpanded\(current => \{/);
  assert.match(impulsa, /focus-visible:ring-2/);
  assert.match(impulsa, /min-h-11/);
  assert.match(impulsa, /\{open\?"Plegar":"Detalles"\}/);
  assert.match(impulsa, /sm:flex-nowrap/);
  assert.doesNotMatch(impulsa, /\.rpc\("admin_.*(?:update|save|activate|deactivate|payment)/);
  assert.match(impulsa, /admin_get_marketplace_impulsa_communications_v1/);
});
