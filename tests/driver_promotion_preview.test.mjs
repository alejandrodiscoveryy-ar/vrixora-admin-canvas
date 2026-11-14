import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const card = read("src/features/admin/MarketplaceDriverPromotionPreview.tsx");
const record = read("src/features/admin/MarketplaceDriver360Record.tsx");
test("Mi TukTuk usa el generador compartido y el conductor correcto", () => {
  assert.match(record, /label: "Mi TukTuk"/);
  assert.match(record, /projectId=\{projectId\} driverUserId=\{driverUserId\}/);
  assert.match(card, /admin_activate_marketplace_promo_card_v1/);
  assert.match(card, /target_authorization_confirmed: false/);
  assert.match(card, /target_authorization_confirmed: true/);
  assert.match(card, /reference.trim\(\).length < 5/);
  assert.match(card, /IDENTITY_NOT_VERIFIED/);
  assert.match(card, /promo_card=/);
  assert.match(card, /cliente\/tuk\/\?conductor=/);
  assert.match(card, /Tarjetas reales de Mi TukTuk/);
  assert.doesNotMatch(card, /QR PENDIENTE|service_role/);
});
