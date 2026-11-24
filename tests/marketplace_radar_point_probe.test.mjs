import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const sql = read("supabase/migrations/20261124153500_marketplace_radar_point_probe_v1.sql");
const ui = read("src/features/admin/MarketplaceRadarPointProbe.tsx");
const map = read("src/features/admin/MarketplaceTestRouteMap.tsx");
const config = read("src/features/admin/MarketplaceConfigurationWorkspace.tsx");

test("solo Admin autorizado puede consultar y notificar, sin permiso anonimo", () => {
  assert.match(sql,/require_project_permission\(target_project_id,'marketplace\.manage'\)/);
  assert.match(sql,/require_project_permission\(target_project_id,'settings\.manage'\)/);
  assert.match(sql,/revoke all on function public\.admin_send_marketplace_radar_point_probe_v1/);
  assert.match(sql,/to authenticated/);
  assert.match(sql,/RADAR_PROBE_TEST_MODE_DISABLED/);
});

test("el radar puntual usa las ubicaciones del despacho y evita trabajar/desconectados", () => {
  for (const token of [
    "a.is_active and a.accepting_jobs and a.is_available",
    "d.status='active'",
    "v.marketplace_status='active'",
    "marketplace_driver_locations",
    "marketplace_driver_last_confirmed_gps_v1",
    "marketplace_driver_presence_v2",
    "marketplace_haversine_km",
    "v_settings.radius_1_enabled",
    "v_settings.radius_2_enabled",
    "v_settings.radius_3_enabled",
  ]) assert.ok(sql.includes(token), "Missing: " + token);
  assert.match(sql,/where stage is not null/);
  assert.doesNotMatch(sql,/allow_outside_max_radius/);
});

test("notificacion generica marcada PRUEBA, deduplicada, con cooldown y sin carrera/cobro", () => {
  assert.match(sql,/'app_announcement'/);
  assert.match(sql,/'radar_test',true/);
  assert.match(sql,/No es una carrera real ni requiere aceptación/);
  assert.match(sql,/on conflict\(project_id,user_id,kind,dedupe_key\) do nothing/);
  assert.match(sql,/RADAR_PROBE_COOLDOWN_60_SECONDS/);
  assert.match(sql,/recipient_count integer not null check \(recipient_count between 1 and 500\)/);
  assert.doesNotMatch(sql,/insert into public\.(jobs|job_assignments|service_requests)/i);
  assert.doesNotMatch(sql,/update public\.(jobs|wallet|marketplace_driver_locations)/i);
});

test("un punto del mapa previsualiza radios y requiere confirmacion antes del push", () => {
  assert.match(config,/<MarketplaceRadarPointProbe projectId=\{projectId\}/);
  assert.match(ui,/picking="origin"/);
  assert.match(ui,/admin_preview_marketplace_radar_point_probe_v1/);
  assert.match(ui,/admin_send_marketplace_radar_point_probe_v1/);
  assert.match(ui,/window\.confirm/);
  assert.match(ui,/admin_get_marketplace_radar_point_probe_status_v1/);
  assert.match(ui,/radarRadiiKm=\{preview\?\.radiiKm/);
  assert.match(ui,/radarDrivers=\{preview\?\.drivers/);
  assert.match(map,/test-lab-point-radar-line/);
  assert.match(map,/test-lab-point-radar-fill/);
  assert.match(map,/driver\.gpsRecent \? "#22d3ee" : "#f59e0b"/);
});
