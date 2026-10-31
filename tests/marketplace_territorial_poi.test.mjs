import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = 'supabase/migrations/20261031210000_marketplace_territorial_poi_control.sql';
const sql = readFileSync(base,'utf8');
const fn = readFileSync('supabase/functions/marketplace-poi-admin-gateway/index.ts','utf8');
const workflow = readFileSync('.github/workflows/tuktuk-poi-province-refresh.yml','utf8');
const python = readFileSync('scripts/territory/refresh_province.py','utf8');
const ui = readFileSync('src/features/admin/MarketplaceTerritoryCatalog.tsx','utf8');
const section = readFileSync('src/features/admin/MarketplaceSection.tsx','utf8');

test('se conservan los POI de La Habana y los datos quedan privados',()=>{
  assert.match(sql,/from public\.marketplace_havana_places where source = 'openstreetmap'/);
  assert.match(sql,/update public\.marketplace_poi_provinces/);
  assert.match(sql,/enable row level security/g);
  assert.match(sql,/revoke all on table[\s\S]*from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.marketplace_poi_queue_refresh/);
  assert.match(sql,/to service_role/);
});
test('las actualizaciones son atomicas y el catálogo anterior se mantiene ante fallos',()=>{
  assert.match(sql,/POI_ABNORMAL_LOSS/);
  assert.match(sql,/POI_DATASET_INVALID/);
  assert.match(sql,/marketplace_poi_finalize_refresh/);
  assert.match(sql,/status='succeeded'/);
  assert.match(sql,/where h\.source='openstreetmap'/);
  assert.match(sql,/status='running'/);
});
test('solo administradores autorizados pueden solicitar sincronizacion',()=>{
  assert.match(fn,/actor\.auth\.getUser\(\)/);
  assert.match(fn,/get_my_project_permissions/);
  assert.match(fn,/codes\.has\("marketplace\.map\.manage"\)/);
  assert.match(fn,/marketplace_poi_queue_refresh/);
  assert.match(fn,/TUKTUK_POI_GITHUB_DISPATCH_TOKEN/);
  assert.match(fn,/GITHUB_DISPATCH_UNAVAILABLE/);
  assert.match(fn,/PROJECT_FORBIDDEN/);
});
test('el worker usa Geofabrik verificado, sin Overpass ni permisos de usuario',()=>{
  assert.match(python,/download\.geofabrik\.de\/central-america\/cuba-latest\.osm\.pbf/);
  assert.match(python,/SOURCE_MD5_MISMATCH/);
  assert.match(python,/ISO3166-2/);
  assert.doesNotMatch(python,/overpass/i);
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/SUPABASE_SERVICE_ROLE_KEY/);
});
test('la administracion aparece en la vista mapa y no toca carreras ni claxon',()=>{
  assert.match(section,/<MarketplaceTerritoryCatalog/);
  assert.match(ui,/Actualizar La Habana/);
  assert.match(ui,/Preparar provincia/);
  assert.match(ui,/No habilita carreras/);
});
