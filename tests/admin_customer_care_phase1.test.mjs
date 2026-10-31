import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const nav = readFileSync('src/lib/admin-navigation.ts', 'utf8');
const section = readFileSync('src/features/admin/MarketplaceSection.tsx', 'utf8');
const care = readFileSync('src/features/admin/MarketplaceCustomerCareWorkspace.tsx', 'utf8');
const map = readFileSync('src/features/admin/MarketplaceTestRouteMap.tsx', 'utf8');

test('Atencion al cliente es una pantalla bajo Trabajos, independiente de Operaciones', () => {
  assert.match(nav, /slug: "atencion", label: "Atención al cliente"/);
  assert.match(section, /<TabsContent value="atencion"/);
  assert.match(section, /<MarketplaceCustomerCareWorkspace/);
  assert.match(section, /<TabsContent value="trabajos"/);
});
test('se reutiliza la gestion real del telefono y horarios sin duplicar RPC', () => {
  assert.match(care, /<MarketplaceLiteContactCard projectId=\{projectId\}/);
  assert.doesNotMatch(section.slice(section.indexOf('<TabsContent value="trabajos"'), section.indexOf('<TabsContent value="atencion"')), /<MarketplaceLiteContactCard/);
  assert.match(care, /canManageContact/);
});
test('mapa de solicitudes admite origen destino y tamaño grande sin alterar el laboratorio', () => {
  assert.match(care, /<MarketplaceTestRouteMap/);
  assert.match(care, /reverse_geocode/);
  assert.match(care, /operation: "geocode"/);
  assert.match(care, /operation: "route_quote"/);
  assert.match(map, /heightClassName \?\?/);
  assert.match(map, /ariaLabel \?\?/);
});

test('fase 2 mantiene identificacion y solicitud conectadas a las operaciones reales', () => {
  assert.match(care, /admin_lookup_marketplace_care_customer/);
  assert.match(care, /admin_register_marketplace_care_customer/);
  assert.match(care, /customer\.display_name/);
  assert.match(care, /onOpenCustomer\(customer\.id\)/);
  assert.match(care, /"passenger" \| "courier" \| "cargo"/);
  assert.match(care, /target_cargo_weight_kg/);
  assert.match(care, /operation: "route_quote"/);
});