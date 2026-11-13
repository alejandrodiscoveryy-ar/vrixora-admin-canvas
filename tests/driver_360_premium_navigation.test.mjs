import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const record = read("src/features/admin/MarketplaceDriver360Record.tsx");
const editor = read("src/features/admin/MarketplaceDriverVehicleEditor.tsx");
const parent = read("src/features/admin/MarketplaceSection.tsx");

test("ficha premium con 5 pestañas y resumen compacto", () => {
  assert.match(record, /Secciones de la ficha 360/);
  for (const name of ["Resumen", "Vehículo", "Expediente", "Actividad", "Finanzas"]) {
    assert.ok(record.includes('label: "' + name + '"'));
  }
  assert.match(record, /role="tablist"/);
  assert.match(record, /aria-selected=\{activeTab === id\}/);
  assert.match(record, /aria-labelledby=\{"driver-tab-" \+ activeTab\}/);
  assert.match(record, /aria-hidden="true"/);
  assert.match(record, /360°/);
  assert.match(record, /activeTab === "overview"/);
  assert.match(record, /activeTab === "management"/);
  assert.match(record, /activeTab === "activity"/);
  assert.match(record, /activeTab === "financial"/);
});

test("conservar funciones, permisos y trazabilidad", () => {
  for(const marker of [
    "<MarketplaceDriverVehicleEditor", "<MarketplaceDriverManagementPanel",
    "onChangeSuspension", "driverWhatsAppLinks", "onOpenJob(job.jobId)",
    "financial.wallet", "driver_document_signed_url",
  ]) {
    assert.ok((record + editor + read("src/features/admin/MarketplaceDriverManagementPanel.tsx")).includes(marker), marker);
  }
});

test("editor en ventana independiente sin cambios de RPC", () => {
  assert.match(editor, /<Dialog open=\{open\}/);
  assert.match(editor, /<DialogTitle/);
  assert.match(editor, /admin_update_marketplace_driver_vehicle_full_v1/);
  assert.match(editor, /active_job/);
  assert.match(editor, /!form\.photoId/);
  assert.match(parent, /Ficha 360 del conductor/);
});

test("conductor comparte el sistema visual 360 sin perder datos ni acciones", () => {
  for (const token of ["marketplace-360-driver","marketplace-360-hero","marketplace-360-watermark","marketplace-360-avatar","marketplace-360-nav","marketplace-360-tab","marketplace-360-content"]) assert.ok(record.includes(token), token);
  assert.match(record, /data-state=\{activeTab === id \? "active" : "inactive"\}/);
  assert.match(record, /media\?\.avatarUrl/);
  assert.match(record, /detail.driver.activatedAt \?\? detail.driver.createdAt/);
  assert.match(record, /canManageDriver && activeTab === "management"/);
  assert.match(record, /!canSeeFinancial/);
  assert.match(record, /financial.wallet.realAvailableBalance/);
  const css = read("src/styles.css");
  assert.match(css, /\.marketplace-360-driver \{ --record-360-accent: var\(--module-empleados\); \}/);
});
