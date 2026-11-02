import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const config = read('src/features/admin/ConfiguracionSection.tsx');
const summary = read('src/features/admin/PremiumSettingsSnapshot.tsx');
const app = read('src/features/admin/AppReleaseSettingsCard.tsx');

test('Five configuration categories share live premium context and compact navigation', () => {
  for (const key of ['general','billing','referrals','communication','application']) {
    assert.match(config, new RegExp('visibleSection === "' + key + '"'));
  }
  assert.match(config, /PremiumSettingsSnapshot/);
  assert.match(config, /metrics=\{premiumMetrics\}/);
  assert.match(config, /aria-label="Cambiar módulo de configuración"/);
  assert.match(summary, /metrics\.map/);
  assert.match(summary, /aria-label=/);
});
test('Identity branding, rate, referral, communication and application forms retain working contracts', () => {
  for (const marker of [
    'supabaseServices.projects.update', 'supabaseServices.foundations.updateExchangeSettings',
    'setMarketplaceReferralRewardSettings', 'supabaseServices.projects.updateWhatsAppSettings',
    'uploadBrandAsset.mutate', 'update("maintenanceMode"', 'update("welcomeMessage"',
    'hasUnsavedProjectChanges={projectDirty}'
  ]) assert.ok(config.includes(marker), marker);
  assert.ok(app.includes('admin_save_app_release_policy'));
  assert.ok(app.includes('window.confirm'));
  assert.ok(app.includes('mode === "mandatory"'));
});
test('Live operational snapshot avoids invented values and uses persisted permission boundaries', () => {
  assert.ok(config.includes('foundationForm.currentRate'));
  assert.ok(config.includes('marketplaceReferralSettingsQuery.isLoading'));
  assert.ok(config.includes('canManageWhatsApp && whatsappForm'));
  assert.ok(config.includes('form.maintenanceMode'));
  assert.ok(config.includes('Cambios sin guardar'));
  assert.ok(summary.includes('metric.tone === "warning"'));
});
