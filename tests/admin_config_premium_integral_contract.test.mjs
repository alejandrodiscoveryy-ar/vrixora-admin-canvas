import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("La skill v2.0 se implementa con componentes existentes, sin sistema visual paralelo", () => {
  for (const source of [settings, snapshot, workspace, operations, staff, announcements, integrations, updates]) {
    assert.doesNotMatch(source, /configurationPremium|configuration-premium|visual\.(?:card|navigation|tab|moduleHeader)/);
    assert.doesNotMatch(source, /bg-gradient-to-(?:br|r)|\bto-\[#061217\]|from-slate-950/);
  }
  assert.equal(existsSync(new URL("../src/features/admin/configuration-premium.ts", import.meta.url)), false);
  assert.match(snapshot, /<ModuleHeader/);
  assert.match(snapshot, /density="compact"/);
  assert.match(snapshot, /appearance="premium"/);
  assert.match(workspace, /<ModuleHeader/);
  assert.match(operations, /<ModuleHeader/);
  assert.match(settings, /<SectionCard density="compact" appearance="premium"/);
  assert.match(settings, /premiumColumnHeaderSurface/);
  assert.match(settings, /premiumControlSurface/);
  assert.match(staff, /<SectionCard density="compact" appearance="premium"/);
  assert.match(announcements, /<MetricCard/);
  assert.match(integrations, /<SectionCard density="compact" appearance="premium"/);
  assert.match(updates, /<SectionCard/);
  assert.match(updates, /premiumMetricSurface/);
});

test("Navegación y categorías conservan densidad y estados claros", () => {
  assert.match(settings, /aria-label="Cambiar módulo de configuración"/);
  assert.match(settings, /sections\.map\(section => \{/);
  assert.match(settings, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(settings, /onClick=\{\(\) => setActiveSection\(section\.key\)\}/);
  assert.match(settings, /min-h-11/);
  assert.match(settings, /border-\[var\(--module-border\)\]/);
  assert.match(operations, /grid grid-cols-2 gap-1\.5 sm:grid-cols-4/);
  assert.match(operations, /aria-pressed=\{isSelected\}/);
  assert.doesNotMatch(operations, /xl:grid-cols-\[252px_minmax/);
});

test("Android está en una sola categoría; se conservan sus acciones", () => {
  const index = settings.indexOf('{visibleSection === "communication" ? (');
  const app = settings.indexOf('{visibleSection === "application" ? (');
  assert.ok(index >= 0 && app > index);
  assert.doesNotMatch(settings.slice(index, app), /<AppReleaseSettingsCard/);
  assert.match(settings.slice(app), /<AppReleaseSettingsCard/);
  assert.equal((settings.match(/<AppReleaseSettingsCard /g) || []).length, 1);
  assert.match(settings, /APK Android/);
  assert.match(updates, /admin_save_app_release_policy/);
  assert.match(updates, /admin_send_driver_app_update/);
});

test("Se conservan pantallas, datos, permisos y guardados", () => {
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
  for (const component of [
    "MarketplaceTestCenterV2", "MarketplaceDispatchSettingsCard",
    "MarketplaceJobReminderSettingsCard", "MarketplaceCancellationPolicyCard",
    "MarketplaceTerritoryCatalog",
  ]) assert.ok(operations.includes("<" + component), component);
});
