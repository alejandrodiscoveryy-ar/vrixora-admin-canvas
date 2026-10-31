
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const s = readFileSync(
  'src/features/admin/MarketplaceSection.tsx', 'utf8'
);

test('radar con estado independiente de los avisos', () => {
  assert.match(s, /admin_get_marketplace_job_radar_analysis/);
  assert.match(s, /Sin registro histórico/);
  assert.match(s, /radar\.data\?\.status === "yes"/);
  assert.match(s, /radar\.data\?\.status === "no"/);
});

test('distancias y etapas de cada conductor', () => {
  assert.match(s, /radarByDriver\.get\(item\.driverUserId\)/);
  assert.match(s, /impact\.radius_stage/);
  assert.match(s, /kilometers\(impact\.radius_limit_km\)/);
  assert.match(s, /Avisos nuevos encolados/);
});

test('se conserva el detalle de alcance previo', () => {
  assert.match(s, /getMarketplaceJobNotificationRecipients/);
  assert.match(s, /Destinatarios reales/);
  assert.match(s, /Avisos enviados/);
});
