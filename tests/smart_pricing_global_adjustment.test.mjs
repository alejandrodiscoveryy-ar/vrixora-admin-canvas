import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adjustedUsd, exampleCup, previewGlobalPricingAdjustment, structuralExampleUsd } from '../src/lib/smart-pricing-global-adjustment.ts';

const tariffs = [
  { serviceCode: 'passenger', serviceName: 'Pasajeros', vehicleCategoryCode: 'motorcycle', basePriceUsd: 1, minimumPriceUsd: 2, perKmPriceUsd: 0.3, perExtraPassengerPriceUsd: 0, perStopPriceUsd: 0.2, updatedAt: '2026-11-05' },
  { serviceCode: 'passenger', serviceName: 'Pasajeros', vehicleCategoryCode: 'tricycle', basePriceUsd: 1, minimumPriceUsd: 2.3, perKmPriceUsd: 0.4735, perExtraPassengerPriceUsd: 0.5, perStopPriceUsd: 0.4, updatedAt: '2026-11-05' },
  { serviceCode: 'cargo', serviceName: 'Carga', vehicleCategoryCode: 'van', basePriceUsd: 4.75, minimumPriceUsd: 7.5, perKmPriceUsd: 1.45, perExtraPassengerPriceUsd: null, perStopPriceUsd: 1, updatedAt: '2026-11-05' },
];

test('descuenta en bloque todos los componentes existentes sin mutar originales', () => {
  const original = JSON.stringify(tariffs);
  const preview = previewGlobalPricingAdjustment(tariffs, 'all', 20, 920);
  assert.equal(preview.length, 3);
  assert.equal(preview[0].after.basePriceUsd, 0.8);
  assert.equal(preview[0].after.minimumPriceUsd, 1.6);
  assert.equal(preview[0].after.perKmPriceUsd, 0.24);
  assert.equal(preview[0].after.perStopPriceUsd, 0.16);
  assert.equal(preview[1].after.perExtraPassengerPriceUsd, 0.4);
  assert.equal(preview[1].after.perKmPriceUsd, 0.3788);
  assert.equal(preview[2].after.perExtraPassengerPriceUsd, null);
  assert.equal(JSON.stringify(tariffs), original);
});

test('separa alcance global y cada servicio sin afectar las demás categorías', () => {
  assert.equal(previewGlobalPricingAdjustment(tariffs, 'passenger', 15, 920).length, 2);
  assert.equal(previewGlobalPricingAdjustment(tariffs, 'cargo', 15, 920).length, 1);
  assert.equal(previewGlobalPricingAdjustment(tariffs, 'courier', 15, 920).length, 0);
});

test('usa mínimo, estructura y redondeo CUP sin prometer precio oficial', () => {
  const preview = previewGlobalPricingAdjustment(tariffs, 'passenger', 20, 920);
  assert.equal(preview[0].example5kmUsdBefore, 2.5);
  assert.equal(preview[0].example5kmUsdAfter, 2);
  assert.equal(preview[0].example5kmCupBefore, 2300);
  assert.equal(preview[0].example5kmCupAfter, 1900);
  assert.equal(exampleCup(2.4, 0, 100), null);
  assert.equal(structuralExampleUsd({ ...tariffs[0], minimumPriceUsd: null }), null);
});

test('rechaza porcentajes inadecuados y nunca inventa precios inválidos', () => {
  for (const pct of [-1, 41, 12.5, Infinity, Number.NaN]) {
    assert.deepEqual(previewGlobalPricingAdjustment(tariffs, 'all', pct, 920), []);
  }
  assert.equal(adjustedUsd(null, 15), null);
  assert.equal(adjustedUsd(-1, 15), null);
  assert.equal(exampleCup(2.5, Number.NaN), null);
});

test('la vista previa está aislada del motor, no publica ni guarda ni hace RPC', () => {
  const view = readFileSync(new URL('../src/features/admin/MarketplacePricingGlobalAdjustment.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /\.rpc\(|\.insert\(|\.update\(|\.delete\(|savePricing|publishPricing|fetch\(/);
  assert.match(view, /Solo simulación/);
  const screen = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');
  assert.match(screen, /<MarketplacePricingGlobalAdjustment/);
  assert.match(screen, /code: "global"/);
});
