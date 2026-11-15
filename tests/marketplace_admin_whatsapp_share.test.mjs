import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildServiceShareMessage } from "../src/lib/marketplace-service-share.ts";

const base = { serviceCode: "passenger", origin: "Vedado", destination: "Playa", vehicleCategory: "tricycle", price: 1200, currency: "CUP", distanceKm: 4.2, paymentMethod: "cash" };
test("passenger message contains actual route, amount and invitation without a competition phrase", () => {
  const message = buildServiceShareMessage({ ...base, passengers: 2, comment: "private note" });
  assert.match(message, /Vedado/);
  assert.match(message, /Triciclo/);
  assert.match(message, /Pasajeros: 2/);
  assert.match(message, /1[\s.,]*200 CUP/);
  assert.match(message, /Efectivo/);
  assert.match(message, /https:\/\/www\.vrixora\.com\/tuktuk\/app\//);
  assert.doesNotMatch(message, /otro compañero|private note|Especificaciones/);
});
test("courier includes package specs, safe comment and transfer", () => {
  const message = buildServiceShareMessage({ ...base, serviceCode: "courier", paymentMethod: "transfer", weightKg: 2, comment: "Documentos; llamar al +53 5555 5555 o a persona@example.com" });
  assert.match(message, /MENSAJERÍA/);
  assert.match(message, /Entrega: Playa/);
  assert.match(message, /Peso: 2 kg/);
  assert.match(message, /Transferencia/);
  assert.match(message, /Documentos/);
  assert.doesNotMatch(message, /5555|example\.com/);
});
test("cargo includes recorded dimensions, volume, loading and Cuban schedule", () => {
  const message = buildServiceShareMessage({ ...base, serviceCode: "cargo", weightKg: 150, volumeM3: 1.5, lengthCm: 120, widthCm: 80, heightCm: 90, loadHelp: true, unloadHelp: true, scheduledFor: "2026-11-15T15:00:00Z", comment: "Muebles" });
  assert.match(message, /120 × 80 × 90 cm/);
  assert.match(message, /ayuda para cargar/);
  assert.match(message, /ayuda para descargar/);
  assert.match(message, /hora de Cuba/);
  assert.match(message, /Muebles/);
});
test("unknown values are omitted and edited comment is honored", () => {
  const message = buildServiceShareMessage({ serviceCode: "cargo", origin: "A", destination: "B", comment: "original" }, "Solo cajas");
  assert.match(message, /Solo cajas/);
  assert.doesNotMatch(message, /original|Importe|Pago:|Distancia|Peso:|undefined|null/);
});
test("server enforces eligibility and permission; both admin surfaces use the same action", () => {
  const sql = readFileSync(new URL("../supabase/proposals/marketplace_admin_whatsapp_payload.sql", import.meta.url), "utf8");
  for (const pattern of [/auth\.uid\(\)/, /marketplace\.manage/, /customers\.view/, /j\.status='published'/, /j\.expires_at>now\(\)/, /not j\.is_test/, /j\.assigned_driver_user_id is null/, /a\.phase='preferred' and a\.priority_until>now\(\)/, /revoke all/, /grant execute/]) assert.match(sql, pattern);
  const component = readFileSync(new URL("../src/features/admin/MarketplaceServiceShareButton.tsx", import.meta.url), "utf8");
  assert.match(component, /await loadPayload\(projectId, jobId\)/);
  assert.match(component, /navigator\.clipboard\.writeText/);
  assert.match(component, /!reviewed/);
  for (const file of ["MarketplaceSection.tsx", "MarketplaceOperationalMap.tsx"]) {
    assert.match(readFileSync(new URL("../src/features/admin/" + file, import.meta.url), "utf8"), /<MarketplaceServiceShareButton projectId=\{projectId\} jobId=\{job\.jobId\}/);
  }
});
