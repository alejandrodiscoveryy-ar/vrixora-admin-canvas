import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("../src/features/admin/MarketplacePricingLaboratoryV2.tsx", import.meta.url), "utf8");
const screen = readFileSync(new URL("../src/features/admin/MarketplacePricingSection.tsx", import.meta.url), "utf8");

test("lab calls permission-checked read-only admin pricing preview", () => {
  assert.match(code, /\.rpc\("admin_preview_marketplace_quote_lab_v2",/);
  assert.doesNotMatch(code, /admin_publish_marketplace_pricing_tariff|savePricingTariff|insert\(|update\(|delete\(/);
});
test("lab compares real active tariffs for selected service", () => {
  assert.match(code, /tariffs\.filter\(\(tariff\) => tariff\.serviceCode === serviceCode\)/);
  assert.match(code, /Promise\.all\(serviceTariffs\.map/);
  assert.match(code, /setResults\(all\)/);
});
test("lab accepts distance, passengers, stops, Cuba date and explains limits", () => {
  assert.match(code, /target_distance_km: km/);
  assert.match(code, /target_passenger_count:/);
  assert.match(code, /target_stop_count: stopCount/);
  assert.match(code, /timeZone: "America\/Havana"/);
  assert.match(code, /no valida el recorrido en el mapa/);
});
test("lab is inserted into current Marketplace tariffs without publishing", () => {
  assert.match(screen, /<MarketplacePricingLaboratoryV2/);
  assert.match(screen, /tariffs=\{tariffs\.data \?\? \[\]\}/);
});

test("lab invalidates quotations after changing published tariff or exchange", () => {
  assert.match(code, /const tariffFingerprint =/);
  assert.match(code, /tariffFingerprint, exchangeRate/);
  assert.match(screen, /exchangeRate=\{rate\}/);
});
test("lab validates calendar date and Cuba DST round trip", () => {
  assert.match(code, /const normalized =/);
  assert.match(code, /if \(normalized !== value\) return null/);
});
