import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/features/admin/MarketplacePricingSection.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const global = readFileSync(new URL("../src/features/admin/MarketplacePricingGlobalAdjustment.tsx", import.meta.url), "utf8");

test("el Centro de precios usa las cuatro categorías existentes en una navegación móvil compacta", () => {
  assert.match(page, /aria-label="Secciones del Centro de precios"/);
  assert.match(page, /tuktuk-pricing-nav-compact/);
  assert.match(page, /grid grid-cols-2 gap-1\.5 xl:grid-cols-1/);
  assert.match(page, /PRICING_WORKSPACE_VIEWS\.map/);
  assert.match(page, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(page, /search=\{\{ precio: view\.code \}\}/);
  assert.match(page, /view\.code === "global" \? "General" : view\.label/);
  assert.match(page, /hidden sm:inline/);
  assert.match(page, /xl:sticky xl:top-4/);
  assert.match(css, /Pricing center mobile selector:/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /\.tuktuk-pricing-nav-compact \.tuktuk-pricing-nav-option \{\s*min-height: 56px;/);
  assert.match(css, /\.tuktuk-pricing-nav-number \{\s*display: none;/);
});

test("prioriza estado real de tarifas y modalidades visibles antes de las simulaciones", () => {
  const state = page.indexOf('aria-label="Estado de precios vigentes"');
  const adjustment = page.indexOf("<MarketplacePricingGlobalAdjustment");
  assert.ok(state >= 0 && adjustment > state);
  assert.match(page, /Tarifas configuradas/);
  assert.match(page, /Modalidades visibles/);
  assert.match(page, /publication\.data\?\.filter\(\(item\) => item\.isPublished\)\.length/);
  assert.match(page, /tariffs\.data\?\.length/);
  assert.match(page, /tariffs\.isError \|\| publication\.isError/);
  assert.match(page, /no se muestran cifras estimadas/);
  assert.match(page, /Tasa USD\/CUP · API/);
  assert.match(page, /getElToqueIntegration\(projectId\)/);
  assert.match(global, /Último ajuste publicado/);
  assert.match(global, /Registro histórico\. Las modificaciones individuales posteriores pueden cambiar los precios vigentes/);
});

test("preserva reglas y fuentes existentes sin escribir en Supabase", () => {
  assert.match(page, /savePricingTariff\(projectId/);
  assert.match(page, /publishPricingAdjustment\(projectId/);
  assert.match(page, /marketplace\.setModalityVisibility\(projectId/);
  assert.match(global, /admin_preview_marketplace_global_adjustment/);
  assert.match(global, /admin_apply_marketplace_global_adjustment/);
  assert.match(global, /admin_revert_marketplace_global_adjustment/);
  assert.match(page, /workspace === "service-menu"/);
  assert.match(page, /workspace === "global"/);
});
