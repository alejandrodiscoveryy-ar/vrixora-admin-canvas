import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sidebar = readFileSync(new URL('../src/routes/admin.tsx', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../src/lib/admin-navigation.ts', import.meta.url), 'utf8');
test('solo TukTuk convierte Tarifas en Centro de precios con cuatro destinos', () => {
  assert.match(sidebar, /tab.slug === "planes" && project.slug === "tuktuk-control"/);
  assert.match(sidebar, /Centro de precios/);
  for (const code of ['global', 'passenger', 'cargo', 'courier']) {
    assert.match(sidebar, new RegExp('code: "' + code + '"'));
  }
  assert.match(sidebar, /search=\{\{ precio: view.code \}\}/);
  assert.match(sidebar, /section: "planes"/);
  assert.match(nav, /permission: "plans.view"/);
});
test('la URL abre el ajuste general o el servicio sin portada intermedia', () => {
  assert.match(screen, /pricingRoute === "passenger"/);
  assert.match(screen, /pricingRoute === "cargo"/);
  assert.match(screen, /pricingRoute === "courier"/);
  assert.match(screen, /setWorkspace\("global"\)/);
  assert.match(screen, /setWorkspace\("service-menu"\)/);
  assert.doesNotMatch(screen, /aria-label="Inicio de gestión de precios"/);
  assert.doesNotMatch(screen, /tuktuk-v3-tabs/);
  assert.match(screen, /getElToqueIntegration\(projectId\)/);
  assert.match(screen, /<MarketplacePricingGlobalAdjustment/);
});
