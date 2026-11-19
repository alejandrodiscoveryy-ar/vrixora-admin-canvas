import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = file => readFileSync(new URL("../src/features/admin/" + file + ".tsx", import.meta.url), "utf8");
const settings = read("ConfiguracionSection");
const snapshot = read("PremiumSettingsSnapshot");
const workspace = read("AdministrationWorkspace");
const operations = read("MarketplaceConfigurationWorkspace");
const staff = read("EmpleadosSection");
const announcements = read("ComunicadosSection");
const integrations = read("IntegracionesSection");
const updates = read("AppReleaseSettingsCard");

test("Toda Configuración usa componentes oficiales y conserva jerarquía compacta", () => {
  for (const source of [settings, snapshot, workspace, operations, staff, announcements, integrations, updates]) {
    assert.doesNotMatch(source, /bg-gradient-to-(?:br|r)|\bto-\[#061217\]|from-slate-950/);
  }
  assert.match(workspace, /<ModuleHeader/);
  assert.match(operations, /<ModuleHeader/);
  assert.match(snapshot, /premiumHeaderSurface/);
  assert.match(snapshot, /premiumMetricSurface/);
  assert.match(settings, /premiumSurface/);
  assert.match(settings, /premiumControlSurface/);
  assert.match(settings, /data-admin-module="configuracion"/);
  assert.match(staff, /premiumSurface/);
  assert.match(announcements, /premiumSurface/);
  assert.match(integrations, /premiumSurface/);
  assert.match(updates, /premiumSurface/);
});

test("Las cinco categorías permanecen visibles y Android no se duplica en Comunicación", () => {
  const index = settings.indexOf('{visibleSection === "communication" ? (');
  const app = settings.indexOf('{visibleSection === "application" ? (');
  assert.ok(index >= 0 && app > index);
  assert.doesNotMatch(settings.slice(index, app), /<AppReleaseSettingsCard/);
  assert.match(settings.slice(app), /<AppReleaseSettingsCard/);
  assert.equal((settings.match(/<AppReleaseSettingsCard /g) || []).length, 1);
  assert.match(settings, /aria-label="Cambiar módulo de configuración"/);
  assert.match(settings, /sections\.map\(section => \{/);
  assert.match(settings, /onClick=\{\(\) => setActiveSection\(section\.key\)\}/);
  assert.match(settings, /APK Android/);
  assert.match(updates, /admin_save_app_release_policy/);
  assert.match(updates, /admin_send_driver_app_update/);
});

test("La configuración operativa no inserta un segundo panel vertical", () => {
  assert.match(operations, /grid-cols-2 gap-1\.5 sm:grid-cols-4/);
  assert.match(operations, /aria-pressed=\{isSelected\}/);
  assert.match(operations, /<MarketplaceTestCenterV2/);
  assert.match(operations, /<MarketplaceDispatchSettingsCard/);
  assert.match(operations, /<MarketplaceJobReminderSettingsCard/);
  assert.match(operations, /<MarketplaceCancellationPolicyCard/);
  assert.match(operations, /<MarketplaceTerritoryCatalog/);
  assert.doesNotMatch(operations, /xl:grid-cols-\[252px_minmax/);
});

test("Se preservan guardado, permisos y funciones administrativas reales", () => {
  for (const id of [
    "supabaseServices.projects.update",
    "supabaseServices.foundations.updateExchangeSettings",
    "setMarketplaceReferralRewardSettings",
    "supabaseServices.projects.updateWhatsAppSettings",
    "update(\"maintenanceMode\"",
    "uploadBrandAsset.mutate",
  ]) assert.ok(settings.includes(id), id);
  assert.match(settings, /canSave && isDirty && \(/);
  assert.match(staff, /canManage/);
  assert.match(announcements, /canSend/);
  assert.match(integrations, /settings\.canManage/);
  assert.match(updates, /hasUnsavedProjectChanges/);
});
