import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulatePassengerHierarchy } from '../src/lib/smart-pricing-v3-hierarchy.ts';

const tariffs = [
  { serviceCode: 'passenger', vehicleCategoryCode: 'bicitaxi', basePriceUsd: 0.8, minimumPriceUsd: 0.1, perKmPriceUsd: 0.18 },
  { serviceCode: 'passenger', vehicleCategoryCode: 'motorcycle', basePriceUsd: 1, minimumPriceUsd: 2, perKmPriceUsd: 0.3 },
  { serviceCode: 'passenger', vehicleCategoryCode: 'tricycle', basePriceUsd: 1, minimumPriceUsd: 1.3, perKmPriceUsd: 0.4735 },
  { serviceCode: 'passenger', vehicleCategoryCode: 'light_car', basePriceUsd: 1, minimumPriceUsd: 3, perKmPriceUsd: 0.8 },
  { serviceCode: 'cargo', vehicleCategoryCode: 'tricycle', basePriceUsd: 200, minimumPriceUsd: 200, perKmPriceUsd: 200 },
];

test('a 1 y 2 km el triciclo está por debajo de la moto con tarifa real de 915 CUP/USD', () => {
  const rows = simulatePassengerHierarchy(tariffs, 915, 100, 'up', 2.3);
  assert.deepEqual(rows.map(r => r.km), [1, 2, 3, 5, 10]);
  assert.deepEqual(rows.map(r => r.currentCup.tricycle), [1400, 1800, 2300, 3100, 5300]);
  assert.deepEqual(rows.map(r => r.currentCup.motorcycle), [1900, 1900, 1900, 2300, 3700]);
  assert.equal(rows[0].invertedPairs.length, 1);
  assert.deepEqual(rows[1].invertedPairs, [['motorcycle', 'tricycle']]);
  assert.equal(rows[2].invertedPairs.length, 0);
});

test('el mínimo hipotético resuelve cortos sin cambiar los de 3, 5 y 10 km', () => {
  const rows = simulatePassengerHierarchy(tariffs, 915, 100, 'up', 2.3);
  assert.deepEqual(rows.map(r => r.proposedTricycleCup), [2200, 2200, 2300, 3100, 5300]);
  assert.deepEqual(rows.map(r => r.tricycleDifferenceCup), [800, 400, 0, 0, 0]);
  assert.deepEqual(rows.map(r => r.proposedInvertedPairs?.length), [0, 0, 0, 0, 0]);
});

test('sin tasa, sin configuración o sin modalidad, jamás inventa CUP', () => {
  const noRate = simulatePassengerHierarchy(tariffs, 0, 100, 'up', 2.3);
  assert.equal(noRate[0].currentCup.tricycle, null);
  assert.equal(noRate[0].proposedTricycleCup, null);
  const unknownMode = simulatePassengerHierarchy(tariffs, 915, 100, 'nearest', 2.3);
  assert.equal(unknownMode[0].currentCup.motorcycle, null);
  const missing = simulatePassengerHierarchy(tariffs.filter(t=>t.vehicleCategoryCode!=='tricycle'), 915,100,'up',2.3);
  assert.equal(missing[0].proposedTricycleCup, null);
  assert.equal(missing[0].currentCup.tricycle, null);
});

test('escenario de usuario es ensayo, aislado de los precios persistidos', () => {
  const before = JSON.stringify(tariffs);
  simulatePassengerHierarchy(tariffs, 915, 100, 'up', 2.3);
  assert.equal(JSON.stringify(tariffs), before);
  const view = readFileSync(new URL('../src/features/admin/MarketplacePricingV3Hierarchy.tsx', import.meta.url), 'utf8');
  assert.match(view, /Solo simulación/);
  assert.match(view, /admin_get_marketplace_pricing_dashboard/);
  assert.doesNotMatch(view, /\.insert\(|\.update\(|\.delete\(|publishPricing|savePricing|admin_save_marketplace/);
  const section = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');
  assert.match(section, /<MarketplacePricingV3Hierarchy/);
});
