import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/features/admin/MarketplacePricingGlobalAdjustment.tsx', import.meta.url), 'utf8');

test('centro premium separa gestion global de las modalidades', () => {
  assert.match(page, /Centro de precios/);
  assert.match(page, /01 \/ Gestión transversal/);
  assert.match(page, /02 \/ Precios por servicio/);
  assert.match(page, /setWorkspace\("global"\)/);
  assert.match(page, /setWorkspace\("service-menu"\)/);
  assert.match(page, /workspace !== null && workspace !== "global"/);
  assert.match(page, /aria-label="Inicio de gestión de precios"/);
  assert.match(page, /aria-label="Menú de precios por modalidad"/);
  assert.doesNotMatch(page, /code: "global"/);
  assert.match(page, /pointer-events-none absolute -right-8/);
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
