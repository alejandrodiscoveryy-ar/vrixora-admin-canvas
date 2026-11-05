import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/smart-pricing-v3-temporal-drafts-preflight.yml', import.meta.url), 'utf8');

const occurrences = (needle) => source.split(needle).length - 1;

test('cada servicio conserva sus cuatro herramientas y la navegación de regreso', () => {
  for (const key of ['tariffs', 'temporal', 'simulation', 'advanced']) {
    assert.match(source, new RegExp('code: "' + key + '"'));
    assert.match(source, new RegExp('workspace === "' + key + '"'));
  }
  assert.match(source, /Volver al servicio/);
  assert.match(source, /aria-label="Menú de precios por modalidad"/);
  assert.doesNotMatch(source, /aria-label="Inicio de gestión de precios"/);
});

test('un solo componente por destino y sin duplicados', () => {
  assert.equal(occurrences('<MarketplacePricingV3Diagnostics'), 1);
  assert.equal(occurrences('<MarketplacePricingV3Hierarchy'), 1);
  assert.equal(occurrences('<MarketplaceTemporalDraftsV3'), 1);
  assert.equal(occurrences('<MarketplacePricingMapV3'), 1);
  assert.equal(occurrences('<MarketplacePricingLaboratoryV2'), 1);
  assert.match(source, /aria-label="Tarifas actuales"/);
  assert.match(source, /aria-label="Horarios y recargos"/);
  assert.match(source, /aria-label="Prueba de precios"/);
});

test('conserva tarifas, publicación y reglas especiales sin tocar servidor', () => {
  assert.equal(occurrences('supabaseServices.marketplace.savePricingTariff'), 1);
  assert.equal(occurrences('supabaseServices.marketplace.setModalityVisibility'), 1);
  assert.equal(occurrences('supabaseServices.marketplace.publishPricingAdjustment'), 1);
  assert.match(source, /Aeropuerto José Martí/);
  assert.match(source, /setSelectedService\(pricingRoute\)/);
  assert.match(source, /setWorkspace\("service-menu"\)/);
});

test('distingue cambios reales y simulaciones sin publicar', () => {
  assert.match(source, /Edición con efecto real/);
  assert.match(source, /Guardarlos no cambia las tarifas que pagan los clientes/);
  assert.match(source, /Esta prueba no crea viajes ni modifica precios/);
});

test('CI incluye las pruebas de navegación', () => {
  assert.match(workflow, /tests\/smart_pricing_v3_navigation\.test\.mjs/);
});
