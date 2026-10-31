import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const section = readFileSync('src/features/admin/MarketplaceSection.tsx', 'utf8');
const settings = readFileSync('src/features/admin/MarketplaceConfigurationWorkspace.tsx', 'utf8');
const territory = readFileSync('src/features/admin/MarketplaceTerritoryCatalog.tsx', 'utf8');

const mapTab = section.match(/<TabsContent value="mapa"[\s\S]*?<\/TabsContent>/)?.[0];
const settingsTab = section.match(/<TabsContent value="configuracion"[\s\S]*?<\/TabsContent>/)?.[0];

test('el mapa operativo queda libre de controles de importacion de provincias', () => {
  assert.ok(mapTab, 'Debe existir la vista Mapa');
  assert.match(mapTab, /<MarketplaceOperationalMap/);
  assert.doesNotMatch(mapTab, /MarketplaceTerritoryCatalog|MarketplaceConfigurationWorkspace/);
});

test('Mapas y provincias vive dentro de Configuracion de TukTuk, no en el mapa', () => {
  assert.ok(settingsTab, 'Debe existir la vista Configuracion');
  assert.match(settingsTab, /<MarketplaceConfigurationWorkspace/);
  assert.match(settings, /<MarketplaceTerritoryCatalog/);
  assert.match(settings, /canManage=\{canManageTerritory\}/);
});

test('configuracion organiza territorios, operacion y pruebas en una navegacion accesible', () => {
  assert.match(settings, /aria-label="Secciones de configuración de TukTuk"/);
  assert.match(settings, /aria-pressed=\{isSelected\}/);
  assert.match(settings, /Mapas y provincias/);
  assert.match(settings, /Operación y avisos/);
  assert.match(settings, /Centro de pruebas/);
  assert.match(settings, /<MarketplaceDispatchSettingsCard/);
  assert.match(settings, /<MarketplaceJobReminderSettingsCard/);
  assert.match(settings, /<MarketplaceTestCenterV2/);
});

test('se conservan las funciones reales de actualización y expansión y los permisos', () => {
  assert.match(territory, /marketplace-poi-admin-gateway/);
  assert.match(territory, /queryFn: \(\) => api\(projectId, "list"\)/);
  assert.match(territory, /mutationFn: \(code: string\) => api\(projectId, "queue", code\)/);
  assert.match(territory, /Actualizar La Habana/);
  assert.match(territory, /Preparar provincia/);
  assert.match(territory, /disabled=\{!canManage/);
  assert.match(territory, /No habilita carreras/);
});
