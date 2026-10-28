import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const root = new URL("../", import.meta.url);
const file = (path) => readFileSync(new URL(path, root), "utf8");

test("WhatsApp Desktop y alternativa web sin pre-envío", () => {
  const code = file("src/lib/driver-whatsapp.ts");
  assert.match(code, /whatsapp:\/\/send\?phone=/);
  assert.match(code, /https:\/\/web\.whatsapp\.com\/send\?phone=/);
  assert.doesNotMatch(code, /text=|window\.open/);
  const list = file("src/features/admin/MarketplaceSection.tsx");
  const record = file("src/features/admin/MarketplaceDriver360Record.tsx");
  assert.match(list, /driverWhatsAppLinks\(item\.phone\)/);
  assert.match(record, /driverWhatsAppLinks\(contactPhone\)/);
});

test("Ficha 360 muestra requisitos, documentos seguros e historial", () => {
  const component = file("src/features/admin/MarketplaceDriverManagementPanel.tsx");
  assert.match(component, /admin_get_marketplace_driver_management_v1/);
  assert.match(component, /admin_update_marketplace_driver_contact_v1/);
  assert.match(component, /admin_update_marketplace_driver_vehicle_info_v1/);
  assert.match(component, /driver_document_signed_url/);
  assert.match(component, /onboarding_complete/);
  assert.match(component, /not_accepted/);
  assert.match(component, /Enviado no significa leído/);
});

test("Backend valida permisos y segrega carreras de prueba", () => {
  const migration = file("docs/drafts/driver_management_v1.sql");
  assert.match(migration, /require_project_permission\(target_project_id, 'marketplace\.manage'\)/);
  assert.match(migration, /not j\.is_test and j\.test_deleted_at is null/);
  assert.match(migration, /delivery_status='sent'/);
  assert.match(migration, /admin_edit_driver_contact/);
  assert.match(migration, /revoke all on function/);
  const edge = file("supabase/functions/marketplace-map-admin-gateway/index.ts");
  assert.match(edge, /driver_document_signed_url/);
  assert.match(edge, /admin_get_marketplace_driver_management_v1/);
  assert.match(edge, /createSignedUrl\(asset\.storage_path, 90\)/);
  assert.match(edge, /admin_log_marketplace_driver_document_access_v1/);
});

test("Ficha 360: variables SQL no ambiguas y requisitos no aplicables", () => {
  const sql = file("docs/drafts/driver_management_v1.sql");
  const panel = file("src/features/admin/MarketplaceDriverManagementPanel.tsx");
  assert.match(sql, /selected_vehicle_id/);
  assert.doesNotMatch(sql, /vs\.vehicle_id=vehicle_id\b/);
  assert.match(sql, /'applicable',d\.identity_docs_required/);
  assert.match(panel, /applicable !== false/);
  assert.match(panel, /No aplica/);
});
test("La migracion de la ficha 360 reproduce el SQL corregido", () => {
  const source = file("docs/drafts/driver_management_v1.sql");
  const migration = file("supabase/migrations/20261028173537_admin_driver_360_premium_v1_20261028.sql");
  assert.equal(migration, source);
  assert.match(source, /select vv\.\* into v/);
  assert.match(source, /select coalesce\(a\.is_active,false\) into active_assignment/);
  assert.match(source, /active_assignment := coalesce\(active_assignment,false\)/);
  assert.doesNotMatch(source, /select vv, a\.is_active into v, active_assignment/);
});
