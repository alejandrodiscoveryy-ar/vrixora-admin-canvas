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
test('publicacion real bloqueada expresamente en primera fase', () => {
  assert.match(care, /Publicar carrera · Próxima fase/);
  assert.match(care, /disabled aria-label="Publicar carrera; disponible en fase 2"/);
  assert.doesNotMatch(care, /test_lab_create_v3|admin_create_marketplace_job|marketplace_create_job/);
});
test('datos de cliente estan presentes y no se guardan en Supabase en fase 1', () => {
  for (const s of ['Nombre del cliente','Teléfono del cliente','Tipo de servicio','Vehículo','Origen de recogida','Destino','Contacto preferido']) assert.ok(care.includes(s), s);
  assert.doesNotMatch(care, /\.from\(["']customers["']\)|\.insert\(|\.upsert\(/);
});
