import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const ui = readFileSync(
  new URL("../src/features/admin/MarketplaceTestCenterV2.tsx", import.meta.url),
  "utf8",
);
const map = readFileSync(
  new URL("../src/features/admin/MarketplaceTestRouteMap.tsx", import.meta.url),
  "utf8",
);
test("Primer toque origen, segundo toque destino y cálculo sin botón", () => {
  assert.match(ui, /useState<"origin" \| "destination" \| null>\("origin"\)/);
  assert.match(ui, /setPicking\(destinationPoint \? null : "destination"\)/);
  assert.match(ui, /setPicking\(null\)/);
  assert.doesNotMatch(ui, />Calcular ruta y tarifa</);
  assert.match(ui, /setRouteLoading\(true\)/);
  assert.match(ui, /setRouteQuote\(\{/);
  assert.match(ui, /routeRetry/);
});
test("Sin cotizaciones viejas ni solicitudes sin control al ajustar", () => {
  assert.match(ui, /let cancelled = false/);
  assert.match(ui, /window\.clearTimeout\(timer\)/);
  assert.match(ui, /routeQuote\?\.key === routeKey/);
  assert.match(ui, /reverseGeocodeVersion\.current\[kind\] !== version/);
  assert.match(map, /draggable: true/);
});
test("Protección financiera y servidor intactos", () => {
  assert.match(ui, /target_force_wallet_commission: forceRealCommission/);
  assert.match(ui, /forceRealCommission && !canManagePayments/);
  assert.match(ui, /CONFIRMACIÓN FINANCIERA/);
  assert.match(ui, /operation: "test_lab_create_v3"/);
  assert.match(ui, /target_expected_price: selectedPrice/);
});
test("Operación simple conserva búsqueda, grupo e historial", () => {
  assert.match(ui, /admin_set_marketplace_test_audience/);
  assert.match(ui, /recipientMode === "group"/);
  assert.match(ui, /historyOpen/);
  assert.match(ui, /Nueva prueba/);
});
