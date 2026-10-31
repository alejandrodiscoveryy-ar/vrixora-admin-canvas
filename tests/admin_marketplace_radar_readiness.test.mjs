import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const section = readFileSync('src/features/admin/MarketplaceSection.tsx','utf8');
const card = readFileSync('src/features/admin/MarketplaceRadarReadinessCard.tsx','utf8');
test('Operaciones incorpora diagnostico sin alterar despacho', () => {
  assert.match(section, /<MarketplaceRadarReadinessCard projectId=\{projectId\}/);
  assert.match(card, /admin_get_marketplace_radar_readiness/);
  assert.match(card, /radar_reachable/);
  assert.match(card, /GPS reciente/);
  assert.match(card, /El diagnóstico no cambia el estado de los conductores/);
});
