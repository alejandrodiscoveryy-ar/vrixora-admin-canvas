import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const map = readFileSync(new URL("../src/features/admin/MarketplacePricingMapV3.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../src/features/admin/MarketplacePricingSection.tsx", import.meta.url), "utf8");
test("V3 reutiliza mapa operativo con origen y destino", () => {
  assert.match(map, /MarketplaceTestRouteMap/);
  assert.match(map, /origin=\{origin\} destination=\{destination\}/);
  assert.match(map, /operation: "route_quote"/);
  assert.match(map, /setPicking\("destination"\)/);
});
test("V3 solo muestra cotizaciones del servidor y no crea carreras", () => {
  assert.match(map, /passenger_by_category/);
  assert.match(map, /admin_preview_marketplace_quote_lab_v2/);
  assert.doesNotMatch(map, /create_request|create_marketplace_customer_request|savePricingTariff|\.insert\(|\.update\(/);
});
test("cada modalidad abre el editor existente, no un formulario duplicado", () => {
  assert.match(map, /onEditTariff\(tariff\.vehicleCategoryCode\)/);
  assert.match(section, /<MarketplacePricingMapV3/);
  assert.match(section, /openTariff\(selectedService, vehicleCategoryCode, tariff\)/);
  assert.equal((section.match(/<Dialog\s/g) ?? []).length, 2);
});
test("la tasa es visual y la previsualizacion usa snapshot oficial", () => {
  assert.doesNotMatch(map, /setExchangeRate|setRate\(|rate_mode|rate_config/);
  assert.match(section, /exchange_rate_snapshot/);
  assert.match(section, /rounding_increment/);
  assert.match(section, /savePricingTariff\(projectId/);
  assert.match(section, /onClick=\{\(\) => save\.mutate\(\)\}/);
  assert.match(section, /setModalityVisibility\(projectId, input\)/);
  assert.match(section, /disabled=\{!tariff \|\| !publication\.isSuccess \|\| visibility\.isPending\}/);
});
test("escenario se invalida al mover pines o cambiar tarifas", () => {
  assert.match(map, /requestRef\.current/);
  assert.match(map, /setScenario\(null\)/);
  assert.match(map, /tariffFingerprint/);
});

test("V3 marmoleado: tasa API informativa compacta, mapa protagonista y fichas plegadas", () => {
  const css = readFileSync(new URL("../src/features/admin/MarketplacePricingMapV3.css", import.meta.url), "utf8");
  assert.match(section, /tuktuk-v3-rate/);
  assert.match(section, /Tasa USD\/CUP Â· API/);
  assert.doesNotMatch(section, /Gestionar tasa|Configurar tasa/);
  assert.match(map, /MarketplacePricingMapV3.css/);
  assert.match(map, /tuktuk-price-map-v3/);
  assert.match(css, /height: 450px/);
  assert.match(section, /Ver fichas completas de tarifas y reglas especiales/);
  assert.match(section, /tuktuk-v3-full-tariff/);
  assert.match(section, /tuktuk-v3-metric/);
  assert.match(section, /tuktuk-v3-editor/);
  assert.match(section, /tuktuk-v3-field/);
  assert.match(section, /tuktuk-v3-impact/);
  assert.match(map, /onEditTariff\(tariff\.vehicleCategoryCode\)/);
});