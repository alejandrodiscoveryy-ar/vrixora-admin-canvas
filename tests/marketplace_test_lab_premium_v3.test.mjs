import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const sql = readFileSync(
  new URL(
    "../supabase/migrations/20261013235500_marketplace_test_lab_premium_v3.sql",
    import.meta.url,
  ),
  "utf8",
);
const ui = readFileSync(
  new URL("../src/features/admin/MarketplaceTestCenterV2.tsx", import.meta.url),
  "utf8",
);
const map = readFileSync(
  new URL("../src/features/admin/MarketplaceTestRouteMap.tsx", import.meta.url),
  "utf8",
);
const edge = readFileSync(
  new URL("../supabase/functions/marketplace-map-admin-gateway/index.ts", import.meta.url),
  "utf8",
);

test("V3 reusa V2 sin alterar el flujo ni las notificaciones", () => {
  assert.match(sql, /public\.admin_create_marketplace_test_job\(/);
  assert.doesNotMatch(sql, /create or replace function public\.accept_job/i);
  assert.doesNotMatch(
    sql,
    /create or replace function app_private\.marketplace_driver_can_receive_job/i,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function public\.admin_create_marketplace_test_job\(/i,
  );
});
test("Cotización automática servidor y sin tarifas frontend", () => {
  assert.match(sql, /preview_marketplace_customer_quote_v3/);
  assert.match(sql, /TEST_LAB_V3_PRICE_CHANGED/);
  assert.match(ui, /target_price_mode:\s*priceMode/);
  assert.match(ui, /routeKey/);
  assert.match(ui, /priceMode === "auto"/);
});
test("Mapa y geocodificación, backend vuelve a calcular ruta", () => {
  assert.match(map, /mapboxgl\.Map/);
  assert.match(map, /draggable:\s*true/);
  assert.match(ui, /"geocode"/);
  assert.match(ui, /"reverse_geocode"/);
  assert.match(ui, /"route_quote"/);
  assert.match(edge, /test_lab_create_v3/);
  assert.match(edge, /api\.mapbox\.com\/directions\/v5\/mapbox\/driving/);
});
test("Georreferenciación y trazabilidad compatibles con Admin", () => {
  for (const field of [
    "route_origin",
    "route_destination",
    "estimated_distance_km",
    "route_duration_seconds",
    "distance_source",
    "mapbox",
    "test_lab_v3",
  ]) {
    assert.ok(sql.includes(field), `Falta ${field}`);
  }
});
test("Historial paginado por cursor, por demanda y por filas", () => {
  assert.match(sql, /admin_list_marketplace_test_jobs_v3/);
  assert.match(sql, /\(j\.created_at,j\.id\) < \(target_cursor_created_at,target_cursor_job_id\)/);
  assert.match(ui, /enabled: historyOpen/);
  assert.match(ui, /history\.data\?\.has_more/);
  assert.match(ui, /aria-expanded=\{expanded\}/);
});
test("Permisos y comisión real explícita", () => {
  assert.match(sql, /require_project_permission\(target_project_id,'marketplace\.manage'\)/);
  assert.match(sql, /require_project_permission\(target_project_id,'payments\.manage'\)/);
  assert.match(ui, /const \[forceRealCommission, setForceRealCommission\] = useState\(false\)/);
  assert.match(
    edge,
    /target_force_wallet_commission:\s*body\?\.target_force_wallet_commission\s*===\s*true/,
  );
});
