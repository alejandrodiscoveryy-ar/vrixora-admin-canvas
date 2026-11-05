import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');
const history = readFileSync(new URL('../src/features/admin/MarketplacePricingGlobalAdjustment.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/routes/admin.tsx', import.meta.url), 'utf8');
const configuration = readFileSync(new URL('../src/lib/admin-navigation.ts', import.meta.url), 'utf8');

test('Centro de precios utiliza la misma estructura visual de Administración', () => {
  assert.match(page, /xl:grid-cols-\[252px_minmax\(0,1fr\)\]/);
  assert.match(page, /aria-label="Secciones del Centro de precios"/);
  assert.match(page, /PRICING_WORKSPACE_VIEWS\.map/);
  assert.match(page, /SelectedPricingIcon/);
  assert.match(sidebar, /group\/admin/);
  assert.match(sidebar, /const PRICING_VIEWS = PRICING_WORKSPACE_VIEWS/);
  assert.match(configuration, /export const PRICING_WORKSPACE_VIEWS/);
  assert.match(sidebar, /tab.slug === "planes" && project.slug === "tuktuk-control"/);
});

test('elTOQUE está integrado en el encabezado y mantiene la información real', () => {
  assert.match(page, /Tasa USD\/CUP · API/);
  assert.match(page, /aria-label="Tasa USD CUP informativa integrada en Centro de precios"/);
  assert.doesNotMatch(page, /tuktuk-v3-rate/);
  assert.match(page, /getElToqueIntegration\(projectId\)/);
  assert.match(page, /lastAutoSyncStatus === "ok"/);
  assert.match(page, /lastAutoSyncStatus !== "ok"/);
});

test('simulación nueva inicia vacía y no se confunde con reducción publicada', () => {
  assert.match(history, /setReduction\] = useState\(0\)/);
  assert.match(history, /Último ajuste publicado/);
  assert.match(history, /latestBatch\.reduction_percent/);
  assert.match(history, /setReduction\(0\)/);
  assert.match(history, /Limpiar simulación/);
  assert.match(history, /acknowledgeAdditional/);
  assert.match(history, /!latestNonRevertedBatch \|\| acknowledgeAdditional/);
  assert.match(history, /admin_preview_marketplace_global_adjustment/);
  assert.match(history, /admin_apply_marketplace_global_adjustment/);
  assert.match(history, /admin_revert_marketplace_global_adjustment/);
});

test('no incluye mutaciones de servidor en los cambios de navegación', () => {
  assert.doesNotMatch(sidebar, /savePricingTariff|admin_apply_marketplace_global_adjustment/);
  assert.match(page, /<MarketplacePricingGlobalAdjustment/);
  assert.match(page, /marketplace\.setModalityVisibility/);
});

test('simulacion vacia oculta publicacion', () => {
  assert.match(history, /Sin ajuste nuevo/);
  assert.match(history, /canManage && reduction > 0/);
  assert.match(history, /Ajuste aplicado/);
  assert.doesNotMatch(history, /Sin seleccionar/);
  assert.doesNotMatch(history, /No revertido/);
});
