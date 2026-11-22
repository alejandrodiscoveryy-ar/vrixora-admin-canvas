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
  assert.match(curve, /2026-11-01T04:00:00Z/);
  assert.match(curve, /2027-11-07T05:00:00Z/);
  assert.match(curve, /scenario_shifted_to_next_week/);
  assert.match(curve, /const averageCostPerKm =/);
  assert.match(curve, /fare \/ km/);
  assert.match(curve, /Costo promedio por km/);
  assert.match(curve, /averageCostPerKm\(selected\?\.\[code\], selected\?\.km\)/);
  assert.match(curve, /no un precio histórico/);
});

test('Vrixora Premium Consistency is applied without touching the fare engine', () => {
  assert.match(curve, /from "@\/components\/admin\/density"/);
  for (const designToken of ['premiumSurface', 'premiumHeaderSurface', 'premiumMetricSurface', 'premiumControlSurface']) {
    assert.match(curve, new RegExp('\\b' + designToken + '\\b'));
  }
  assert.match(curve, /data-appearance="premium"/);
  assert.match(curve, /data-density="compact"/);
  assert.match(curve, /aria-label="Distancia de consulta"/);
  assert.match(curve, /aria-label="Precio por modalidad"/);
  assert.match(curve, /aria-label="Gráfica comparativa de precios"/);
  assert.match(curve, /Costo promedio por km/);
  assert.match(curve, /<details className="group/);
  assert.match(curve, /<Skeleton /);
  assert.match(curve, /No se muestra ningún precio supuesto/);
  assert.match(curve, /aria-pressed=\{focused === code\}/);
  assert.match(curve, /min-h-11 min-w-\[58px\]/);
  assert.doesNotMatch(curve, /<h3 className="text-lg font-semibold text-foreground">Curva de precios por km<\/h3>/);
  assert.doesNotMatch(curve, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
