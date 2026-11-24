import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const sql = read("supabase/migrations/20261124153500_marketplace_radar_point_probe_v1.sql");
const ui = read("src/features/admin/MarketplaceRadarPointProbe.tsx");
const map = read("src/features/admin/MarketplaceTestRouteMap.tsx");
const config = read("src/features/admin/MarketplaceConfigurationWorkspace.tsx");
const testCenter = read("src/features/admin/MarketplaceTestCenterV2.tsx");
const testRadarToggle = read("src/features/admin/MarketplaceTestRadarToggle.tsx");
const dispatchSettings = read("src/features/admin/MarketplaceDispatchSettingsCard.tsx");

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
  assert.match(testCenter,/<MarketplaceRadarPointProbe projectId=\{projectId\}/);
  assert.doesNotMatch(config,/<MarketplaceRadarPointProbe/);
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


test("el radar de prueba ocupa toda la altura y no deja un fondo negro", () => {
  assert.match(ui,/heightClassName="h-\[310px\] w-full sm:h-\[360px\] lg:h-\[380px\]"/);
  assert.match(ui,/pickLabel="punto de prueba"/);
  assert.match(map,/resizeObserver = new ResizeObserver/);
  assert.match(map,/resizeObserver\.observe\(mount\.current\)/);
  assert.match(map,/resizeObserver\?\.disconnect\(\)/);
  assert.match(map,/radarRadiiKm \? "h-full" : ""/);
  assert.match(map,/line-width": 2\.5/);
});

test("los envíos parciales se separan de los avisos fallidos y se explican al administrador", () => {
  const patch = read("supabase/migrations/20261124161000_marketplace_radar_probe_partial_delivery_status.sql");
  assert.match(patch,/last_error like 'Partial delivery:%'/);
  assert.match(patch,/'partial',count\(\*\) filter/);
  assert.match(patch,/require_project_permission\(target_project_id,'marketplace\.manage'\)/);
  assert.match(patch,/require_project_permission\(target_project_id,'settings\.manage'\)/);
  assert.match(ui,/Entrega parcial:/);
  assert.match(ui,/Aviso parcial:/);
  assert.match(ui,/delivery\.partial/);
});


test("ambas pruebas de radar se encuentran exclusivamente en Centro de pruebas", () => {
  assert.match(config, /active === "pruebas"[\s\S]*?<MarketplaceTestCenterV2/);
  assert.match(testCenter, /<MarketplaceTestRadarToggle projectId=\{projectId\} canManage=\{canManage\} \/>/);
  assert.match(testCenter, /<MarketplaceRadarPointProbe projectId=\{projectId\} canManage=\{canManage\} \/>/);
  const settingsPanel = config.slice(config.indexOf('active === "operacion"'));
  assert.doesNotMatch(settingsPanel, /<MarketplaceRadarPointProbe/);
  assert.doesNotMatch(settingsPanel, /<MarketplaceTestRadarToggle/);
  assert.doesNotMatch(dispatchSettings, /Aplicar a carreras de prueba/);
  assert.doesNotMatch(dispatchSettings, /setApplyToTestJobs/);
});

test("activar el radar de carreras de prueba guarda automáticamente sin perder otros ajustes", () => {
  assert.match(testRadarToggle, /aria-label="Aplicar a carreras de prueba"/);
  assert.match(testRadarToggle, /supabaseServices\.marketplace\.dispatchSettings\(projectId\)/);
  assert.match(testRadarToggle, /supabaseServices\.marketplace\.updateDispatchSettings\(projectId,/);
  assert.match(testRadarToggle, /\.\.\.input,\s*applyToTestJobs: nextEnabled/);
  assert.match(testRadarToggle, /onCheckedChange=\{\(checked\) => toggle\.mutate\(checked\)\}/);
  assert.match(testRadarToggle, /saved\.applyToTestJobs !== nextEnabled/);
  assert.match(dispatchSettings, /applyToTestJobs: settings\.data\?\.applyToTestJobs \?\? false/);
  assert.match(testRadarToggle, /disabled=\{disabled\}/);
});


test("Centro de pruebas prioriza crear carreras y coloca el radar en una vista exclusiva", () => {
  assert.match(testCenter, /useState<"rides" \| "radar">\("rides"\)/);
  assert.match(testCenter, /role="tablist" aria-label="Herramientas del centro de pruebas"/);
  assert.match(testCenter, /Crear carrera de prueba<\/strong>/);
  assert.match(testCenter, /Probar radar y avisos<\/strong>/);
  assert.match(testCenter, /id="test-center-radar" role="tabpanel"/);
  assert.match(testCenter, /hidden=\{activeTool !== "radar"\}/);
  assert.match(testCenter, /activeTool === "radar" \? <MarketplaceRadarPointProbe/);
  assert.match(testCenter, /id="test-center-rides" role="tabpanel"/);
  assert.match(testCenter, /hidden=\{activeTool !== "rides"\}/);
  assert.match(testCenter, /<MarketplaceTestRadarToggle projectId=\{projectId\}/);
  assert.match(testCenter, /<section className="tt-lab-v4-create/);
  assert.match(testCenter, /aria-label="Historial de pruebas"/);
  assert.doesNotMatch(testCenter, /Resumen del laboratorio/);
});

test("Radar de prueba sin punto no muestra un CTA de notificación vacío ni deja un mapa sobredimensionado", () => {
  assert.match(ui, /\{!point \? \(/);
  assert.match(ui, /Cómo funciona/);
  assert.match(ui, /\{point && preview\?\.count === 0 \? \(/);
  assert.match(ui, /\{\(preview\?\.count \?\? 0\) > 0 \|\| runId \? \(/);
  assert.match(ui, /Notificar a los encontrados/);
  assert.match(ui, /h-\[310px\]/);
  assert.doesNotMatch(ui, /lg:min-h-\[420px\]/);
});

test("No se alteran cobros, ruta, audiencia, ni protocolo de envío del radar", () => {
  assert.match(testCenter, /admin_set_marketplace_test_audience/);
  assert.match(testCenter, /operation: "test_lab_create_v3"/);
  assert.match(testCenter, /target_force_wallet_commission: forceRealCommission/);
  assert.match(testCenter, /aria-label="Activar modo de prueba"/);
  assert.match(ui, /admin_send_marketplace_radar_point_probe_v1/);
  assert.match(ui, /window\.confirm/);
});
