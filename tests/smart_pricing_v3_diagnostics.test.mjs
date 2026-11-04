import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { structuralPriceUsd, passengerGapDiagnostics, activeTemporalRules } from '../src/lib/smart-pricing-v3-diagnostics.ts';

const tariffs = [
  { serviceCode: 'passenger', vehicleCategoryCode: 'motorcycle', basePriceUsd: 1, minimumPriceUsd: 2, perKmPriceUsd: 0.3 },
  { serviceCode: 'passenger', vehicleCategoryCode: 'tricycle', basePriceUsd: 1, minimumPriceUsd: 1.3, perKmPriceUsd: 0.4735 },
  { serviceCode: 'passenger', vehicleCategoryCode: 'light_car', basePriceUsd: 1, minimumPriceUsd: 3, perKmPriceUsd: 0.8 },
  { serviceCode: 'cargo', vehicleCategoryCode: 'motorcycle', basePriceUsd: 500, minimumPriceUsd: 500, perKmPriceUsd: 500 },
];

test('detecta la inversion del triciclo y la moto en 2 km sin usar el servicio de carga', () => {
  const two = passengerGapDiagnostics(tariffs, 2, 25);
  assert.equal(two.length, 2);
  assert.equal(two[0].from, 'motorcycle');
  assert.equal(two[0].to, 'tricycle');
  assert.equal(two[0].requiresReview, true);
  assert.ok(two[0].actualGapPct < 0);
  assert.equal(two[0].requiredPriceUsd, 2.5);
  assert.equal(two[1].requiresReview, false);
});

test('a los 5 km el triciclo supera el margen ilustrativo; no implica publicacion', () => {
  const five = passengerGapDiagnostics(tariffs, 5, 25);
  assert.equal(five[0].requiresReview, false);
  assert.ok(five[0].actualGapPct > 25);
});

test('rechaza importes invalidos y no inventa tarifas', () => {
  assert.equal(structuralPriceUsd(undefined, 2), null);
  assert.equal(structuralPriceUsd(tariffs[0], 0), null);
  assert.equal(structuralPriceUsd({ ...tariffs[0], perKmPriceUsd: -2 }, 5), null);
  assert.deepEqual(passengerGapDiagnostics(tariffs, 2, -1), []);
});

test('solo identifica reglas temporales activas y dentro de vigencia', () => {
  const now = new Date('2026-11-04T02:00:00Z');
  const rule = { name: 'Madrugada', ruleKind: 'late_night', serviceCode: 'passenger', status: 'active', effectiveFrom: '2026-11-01T00:00:00Z', effectiveTo: null };
  const list = [rule, { ...rule, ruleKind: 'special_zone' }, { ...rule, status: 'draft' }, { ...rule, serviceCode: 'cargo' }, { ...rule, effectiveFrom: '2027-01-01T00:00:00Z' }];
  assert.equal(activeTemporalRules(list, 'passenger', now).length, 1);
});

test('interfaz de diagnostico es solo lectura, no publica ni escribe en Supabase', () => {
  const view = readFileSync(new URL('../src/features/admin/MarketplacePricingV3Diagnostics.tsx', import.meta.url), 'utf8');
  assert.match(view, /Solo lectura/);
  assert.match(view, /MarketplacePricingV3Diagnostics/);
  assert.doesNotMatch(view, /\.rpc\(|\.insert\(|\.update\(|\.delete\(|publishPricing|savePricing/);
  const section = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');
  assert.match(section, /<MarketplacePricingV3Diagnostics/);
  assert.match(section, /adjustments=\{adjustments\.data \?\? \[\]\}/);
});
