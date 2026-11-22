import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');
const curve = readFileSync(new URL('../src/features/admin/MarketplacePassengerPriceCurve.tsx', import.meta.url), 'utf8');

test('price curve appears only in passenger pricing workspace', () => {
  assert.match(screen, /code: "curve", title: "Curva de precios por km"/);
  assert.match(screen, /selectedService === "passenger" \|\| item.code !== "curve"/);
  assert.match(screen, /workspace === "curve" && selectedService === "passenger"/);
  assert.match(screen, /<MarketplacePassengerPriceCurve projectId=\{projectId\}/);
});

test('production smart quotes are read only and include all four passenger modes', () => {
  assert.match(curve, /admin_get_marketplace_passenger_price_curve/);
  for (const vehicle of ['motorcycle', 'tricycle', 'light_car', 'bicitaxi']) {
    assert.match(curve, new RegExp('code: "' + vehicle + '"'));
  }
  assert.match(curve, /getSupabaseClient\(\)\.rpc/);
  assert.doesNotMatch(curve, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.match(curve, /target_step_km: 0\.5/);
  assert.match(curve, /const referenceKilometers = \[2, 3, 5, 8, 9, 10, 12, 15, 20, 25\]/);
  assert.match(curve, /overflow-x-auto/);
  assert.match(curve, /min-w-\[700px\]/);
  assert.match(curve, /aria-label="Gráfico de precios, desplazable horizontalmente en móvil"/);
  assert.match(curve, /min-w-\[58px\]/);
  assert.match(curve, /useState\(25\)/);
  assert.match(curve, /ticks=\{referenceKilometers\.filter/);
  assert.match(curve, /onClick=\{\(\) => setSelectedKm\(km\)\}/);
  assert.match(curve, /America\/Havana/);
});
