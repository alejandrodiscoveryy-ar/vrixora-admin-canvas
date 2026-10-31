import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gateway = readFileSync('supabase/functions/marketplace-map-gateway/index.ts','utf8');
const migrations = readFileSync('supabase/verification/havana_poi_search_catalog.sql','utf8');

test('el gateway combina POI de La Habana y Mapbox sin reemplazar rutas', () => {
  assert.match(gateway, /search_marketplace_havana_places/);
  assert.match(gateway, /search\/geocode\/v6\/forward/);
  assert.match(gateway, /Promise\.allSettled/);
  assert.match(gateway, /"route_quote"/);
  assert.match(gateway, /"create_request"/);
});

test('el catalogo es solo lectura para el servicio y bloquea acceso anonimo', () => {
  assert.match(migrations, /enable row level security/i);
  assert.match(migrations, /revoke all on table .* from public, anon, authenticated/i);
  assert.match(migrations, /grant select on table .* to service_role/i);
  assert.match(migrations, /revoke all on function .*\r?\n\s*from public,anon,authenticated/i);
});

test('la busqueda limita la provincia operativa y su consumo', () => {
  assert.match(gateway, /bbox: "-82\.75,22\.7,-81\.95,23\.35"/);
  assert.match(gateway, /target_limit: 12/);
  assert.match(gateway, /unique\.slice\(0, 14\)/);
  assert.match(gateway, /marketplace_customer_gateway_rate_limit/);
});
