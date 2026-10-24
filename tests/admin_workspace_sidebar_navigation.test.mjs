import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const nav = readFileSync(new URL('../src/lib/admin-navigation.ts', import.meta.url), 'utf8');
const chrome = readFileSync(new URL('../src/routes/admin.tsx', import.meta.url), 'utf8');
const section = readFileSync(new URL('../src/features/admin/MarketplaceSection.tsx', import.meta.url), 'utf8');

test('Nueve vistas de Trabajos dentro de la navegación lateral', () => {
  const block = nav.match(/export const MARKETPLACE_WORKSPACE_VIEWS = \[([\s\S]*?)\] satisfies Array<AdminProjectTab>;/)?.[1];
  assert.ok(block, 'shared workspace configuration');
  const slugs = [...block.matchAll(/slug: \"([^\"]+)\"/g)].map((match) => match[1]);
  assert.deepEqual(slugs, ['resumen','trabajos','mapa','conductores','clientes','billeteras','recargas','incidencias','configuracion']);
  assert.match(block, /permission: \"customers.view\"/);
  assert.match(block, /permission: \"payments.view\"/);
  assert.match(block, /permission: \"settings.view\"/);
});

test('La navegación lateral respeta permisos y selecciona vista por URL en escritorio/móvil', () => {
  assert.match(chrome, /MARKETPLACE_WORKSPACE_VIEWS\.filter\(\(view\) => permissions\.includes\(view\.permission\)\)/);
  assert.match(chrome, /search=\{\{ vista: view\.slug \}\}/);
  assert.match(chrome, /aria-current=\{viewActive/);
  assert.match(chrome, /function MobileDrawer/);
  assert.match(chrome, /function DesktopSidebar/);
});

test('El Marketplace mantiene nueve contenidos, sin barra superior duplicada', () => {
  assert.doesNotMatch(section, /<TabsList/);
  assert.doesNotMatch(section, /<TabsTrigger/);
  assert.match(section, /const tab = activeView\?\.slug \?\? \"resumen\"/);
  assert.match(section, /permissions\.includes\(view\.permission\)/);
  for (const slug of ['resumen','trabajos','conductores','clientes','billeteras','recargas','incidencias','configuracion']) {
    assert.ok(section.includes('<TabsContent value="' + slug + '"'), slug);
  }
  assert.match(section, /value="mapa"/);
  assert.match(section, /setMapVisited\(true\)/);
  assert.match(section, /forceMount/);
});
