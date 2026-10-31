import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/features/admin/MarketplaceConfigurationWorkspace.tsx','utf8');
const testCenter = readFileSync('src/features/admin/MarketplaceTestCenterV2.tsx','utf8');
const territory = readFileSync('src/features/admin/MarketplaceTerritoryCatalog.tsx','utf8');
const section = readFileSync('src/features/admin/MarketplaceSection.tsx','utf8');

const definitions = workspace.match(/const SECTIONS = \[[\s\S]*?\] as const;/)?.[0] ?? '';
const order = [...definitions.matchAll(/id: "(pruebas|operacion|territorio)",\s*number: "(\d\d)",\s*title: "([^"]+)"/g)]
  .map(m => [m[1], m[2], m[3]]);

test('orden correcto 01 Centro de pruebas, 02 Radar, 03 Provincia', () => {
  assert.deepEqual(order, [
    ['pruebas', '01', 'Centro de pruebas'],
    ['operacion', '02', 'Radar'],
    ['territorio', '03', 'Provincia'],
  ]);
  assert.match(workspace, /useState<SectionId>\("pruebas"\)/);
  assert.doesNotMatch(definitions, /title: "Mapas y provincias"|title: "Operación y avisos"/);
});

test('centro de pruebas conserva la simulacion y el historial', () => {
  assert.match(workspace, /active === "pruebas"[\s\S]*?<MarketplaceTestCenterV2/);
  assert.match(testCenter, /aria-label="Centro de pruebas"/);
  assert.match(testCenter, />\s*Centro de pruebas\s*<\/h3>/);
  assert.match(testCenter, /Historial de pruebas/);
  assert.match(workspace, /active !== "pruebas" \?/);
});

test('Radar corresponde a ajustes de despacho, busqueda y avisos', () => {
  assert.match(workspace, /active === "operacion"[\s\S]*?<MarketplaceDispatchSettingsCard/);
  assert.match(workspace, /active === "operacion"[\s\S]*?<MarketplaceJobReminderSettingsCard/);
  assert.match(workspace, /aria-label="Radar: despacho y avisos"/);
});

test('Provincia conserva permisos y actualizacion de lugares', () => {
  assert.match(workspace, /active === "territorio"[\s\S]*?<MarketplaceTerritoryCatalog projectId=\{projectId\} canManage=\{canManageTerritory\}/);
  assert.match(territory, /marketplace-poi-admin-gateway/);
  assert.match(territory, /Actualizar La Habana/);
  assert.match(territory, /Preparar provincia/);
  assert.match(territory, /No habilita carreras/);
  assert.match(section, /<MarketplaceConfigurationWorkspace/);
});

test('interfaz compacta premium, marca de agua tenue y accesibilidad', () => {
  assert.doesNotMatch(workspace, />Configuración del servicio</);
  assert.match(workspace, /xl:grid-cols-\[252px_minmax\(0,1fr\)\]/);
  assert.match(workspace, /opacity-\[0\.075\]/);
  assert.match(workspace, /opacity-\[0\.07\]/);
  assert.match(workspace, /pointer-events-none absolute -right-4 -top-5/);
  assert.match(workspace, /aria-hidden="true"/);
  assert.match(workspace, /aria-pressed=\{isSelected\}/);
  assert.match(workspace, /aria-controls="tuktuk-config-detail"/);
  assert.match(workspace, /text-white/);
  assert.match(workspace, /sm:grid-cols-3 xl:grid-cols-1/);
});
