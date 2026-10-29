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
