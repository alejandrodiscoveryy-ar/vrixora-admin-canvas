import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const card = read("src/features/admin/MarketplaceDriverPromotionPreview.tsx");
const record = read("src/features/admin/MarketplaceDriver360Record.tsx");
test("Mi TukTuk uses existing driver identity and private preview", () => {
  assert.match(record, /label: "Mi TukTuk"/);
  assert.match(record, /avatarUrl=\{media\?\.avatarUrl\}/);
  assert.match(record, /categoryCode=\{mainVehicle\?\.vehicle\.categoryCode\}/);
  assert.match(card, /Vista previa privada/);
  assert.match(card, /aspect-square/);
  assert.match(card, /aspect-\[9\/16\]/);
  assert.match(card, /Borrador · No publicar/);
  assert.match(card, /pendientes de activación/);
  assert.doesNotMatch(card, /navigator\.share|window\.open|\.rpc\(|service_role/);
  assert.doesNotMatch(card, /Conductor verificado/);
});

test("El QR personal tiene un espacio dentro de la tarjeta en ambos formatos", () => {
  assert.match(card, /data-promotion-qr-area="embedded"/);
  assert.match(card, /format === "story" \? "w-32" : "w-24"/);
  assert.match(card, /Escanea y viaja conmigo/);
  assert.match(card, /QR PENDIENTE/);
  assert.match(card, /aún no activo/);
});
