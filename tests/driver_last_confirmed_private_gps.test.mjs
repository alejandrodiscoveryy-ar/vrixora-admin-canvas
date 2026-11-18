import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261118232500_retain_last_confirmed_driver_gps_admin_only.sql");
const api = read("src/lib/marketplace-map.ts");
const map = read("src/features/admin/MarketplaceOperationalMap.tsx");

test("Only one confirmed GPS fix per conductor/vehicle is retained, newest wins", () => {
  assert.match(sql, /create table if not exists app_private\.marketplace_driver_last_confirmed_gps_v1/);
  assert.match(sql, /primary key \(project_id,driver_user_id,vehicle_id\)/);
  assert.match(sql, /after insert or update of latitude,longitude,captured_at,received_at/);
  assert.match(sql, /where excluded\.captured_at >= app_private\.marketplace_driver_last_confirmed_gps_v1\.captured_at/g);
  assert.match(sql, /from public\.marketplace_driver_locations/);
  assert.match(sql, /references public\.driver_profiles\(project_id,user_id\)/);
});

test("Off-duty precise GPS remains private; customers and ordinary viewers cannot retrieve it", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table app_private\.marketplace_driver_last_confirmed_gps_v1/);
  assert.match(sql, /from PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /can_precise_history := app_private\.has_project_permission\(/);
  assert.match(sql, /'marketplace\.manage'/);
  assert.match(sql, /left join app_private\.marketplace_driver_last_confirmed_gps_v1 h\s+on can_precise_history/);
  assert.match(sql, /perform app_private\.require_project_permission\(/);
  assert.match(sql, /'marketplace\.view'/);
  assert.doesNotMatch(sql, /create policy .*using \(true\)/i);
});

test("Admin selects the latest actual GPS timestamp, not an old coverage cell or route destination", () => {
  assert.match(sql, /greatest\(l\.captured_at,h\.captured_at,s\.coverage_captured_at\) as captured_at/);
  assert.match(sql, /when h\.captured_at >= coalesce\(s\.coverage_captured_at,'-infinity'::timestamptz\)/);
  assert.match(sql, /then h\.latitude/);
  assert.match(sql, /then h\.longitude/);
  assert.match(sql, /'last_location_source', d\.last_location_source/);
  assert.match(api, /lastLocationSource\?: "gps" \| "retained_gps" \| "coverage"/);
  assert.match(map, /Último GPS confirmado, conservado al descansar; no es ubicación en vivo/);
  assert.match(map, /Zona aproximada de cobertura, no confirma dónde estuvo el conductor/);
  assert.match(sql, /Only current real GPS records can be seeded/);
  assert.doesNotMatch(sql, /insert into .*values \(.*destination_lat/i);
});
