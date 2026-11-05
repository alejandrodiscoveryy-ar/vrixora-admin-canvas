import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/features/admin/MarketplacePricingGlobalAdjustment.tsx', import.meta.url), 'utf8');

test('centro premium abre directamente el contenido elegido desde el menú lateral', () => {
  const sidebar = readFileSync(new URL('../src/routes/admin.tsx', import.meta.url), 'utf8');
  assert.match(sidebar, /Centro de precios/);
  assert.match(sidebar, /PRICING_VIEWS/);
  assert.match(page, /pricingRoute === "cargo"/);
  assert.match(page, /setWorkspace\("global"\)/);
  assert.match(page, /setWorkspace\("service-menu"\)/);
  assert.match(page, /aria-label="Menú de precios por modalidad"/);
  assert.doesNotMatch(page, /aria-label="Inicio de gestión de precios"/);
  assert.doesNotMatch(page, /tuktuk-v3-tabs/);
});

test('confirmacion centrada y publicacion antes del desglose', () => {
  assert.match(modal, /<Dialog open onOpenChange=/);
  assert.match(modal, /<DialogContent/);
  assert.match(modal, /<DialogTitle>Confirmación obligatoria<\/DialogTitle>/);
  assert.match(modal, /autoFocus/);
  assert.match(modal, /Desglose por modalidad/);
  assert.match(modal, /Historial y reversión/);
  assert.ok(modal.indexOf('Publicación segura del ajuste global') < modal.indexOf('Desglose por modalidad'));
  assert.match(modal, /admin_apply_marketplace_global_adjustment/);
  assert.match(modal, /admin_revert_marketplace_global_adjustment/);
  assert.match(modal, /samePrices/);
});
