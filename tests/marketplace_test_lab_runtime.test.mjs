import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const sql = readFileSync(new URL("../supabase/migrations/20261013233000_marketplace_test_lab_runtime.sql", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/features/admin/MarketplaceTestCenterV2.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../src/features/admin/MarketplaceSection.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/features/admin/MarketplaceTestCenterPremium.css", import.meta.url), "utf8");

test("modo real jamás se etiqueta automáticamente como prueba", () => {
  assert.match(sql, /if old\.is_test or new\.is_test then/);
  assert.match(sql, /new\.is_test := false;/);
  assert.match(sql, /new\.test_driver_user_id := null;/);
  assert.match(sql, /new\.test_force_wallet_commission := false;/);
});
test("múltiples conductores: notificaciones, visibilidad y aceptación", () => {
  for (const marker of [
    "marketplace_test_job_targets_driver(j.project_id,j.id,target_driver_user_id)",
    "marketplace_test_job_targets_driver(j.project_id,j.id,actor)",
    "marketplace_test_job_targets_driver(pid,j.id,actor)",
    "TEST_LAB_CONTRACT_DRIVERS_CHANGED",
    "TEST_LAB_CONTRACT_LIST_CHANGED",
    "TEST_LAB_CONTRACT_ACCEPT_CHANGED",
  ]) assert.ok(sql.toLowerCase().includes(marker.toLowerCase()), marker);
  assert.match(sql, /marketplace_test_job_recipients\(project_id,job_id,driver_user_id\)/);
  assert.match(sql, /get diagnostics inserted_count = row_count;/);
});
test("sin cargos por defecto, cargo real únicamente autorizado", () => {
  assert.match(sql, /target_force_wallet_commission boolean default false/);
  assert.match(sql, /require_project_permission\(target_project_id,'payments\.manage'\)/);
  assert.match(sql, /when j\.is_test and not j\.test_force_wallet_commission then ''platform_free''/);
  assert.match(sql, /if j\.is_test and not j\.test_force_wallet_commission then/);
  assert.match(ui, /CONFIRMACIÓN FINANCIERA/);
  assert.match(ui, /target_force_wallet_commission: forceRealCommission/);
});
test("cliente sintético y carrera administrativa con identidad, auditoría e idempotencia", () => {
  assert.match(sql, /create table if not exists public\.marketplace_admin_test_customers/);
  assert.match(sql, /TEST_LAB_IDEMPOTENCY_MISMATCH/);
  assert.match(sql, /admin_create_marketplace_test_job\(/);
  assert.match(sql, /admin_list_marketplace_test_jobs\(/);
  assert.match(sql, /create or replace function app_private\.mark_marketplace_test_job_on_publish/);
  assert.match(sql, /project_id=target_project_id/);
  assert.match(sql, /revoke all on public\.marketplace_admin_test_customers from public,anon,authenticated/);
  assert.match(sql, /not exists \(\s*select 1 from public\.marketplace_admin_test_customers tc/);
});
test("UX: selector múltiple, individual/grupo, historial responsive y limpieza protegida", () => {
  for(const marker of ["type=\"checkbox\"", "onClick={() => save.mutate()}", "Un conductor", "Todo el grupo",
    "Enviar carrera de prueba", "Historial de pruebas", "Limpiar pruebas", "sm:grid-cols-2", "tt-lab-v4-workspace", "Crear UNA carrera"])
    assert.ok(ui.includes(marker),marker);
  assert.match(ui, /admin_set_marketplace_test_audience/);
  assert.match(ui, /supabaseServices\.marketplace\.setTestMode/);
  assert.match(ui, /onClick=\{\(\) => save\.mutate\(\)\}/);
  assert.match(css, /@media\s*\(min-width:\s*1050px\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*0\.82fr\)\s+minmax\(0,\s*1\.18fr\)/);
  assert.match(section, /<MarketplaceTestCenterV2/);
  assert.match(section, /canManagePayments=\{canManagePayments\}/);
});
test("sin migración destructiva o publicación automática", () => {
  assert.doesNotMatch(sql,/\b(drop\s+table|truncate\s+table|delete\s+from\s+public\.jobs|alter\s+table\s+public\.jobs)\b/i);
  assert.doesNotMatch(sql,/\b(pg_sleep|http_post|net\.http_post)\b/i);
});
