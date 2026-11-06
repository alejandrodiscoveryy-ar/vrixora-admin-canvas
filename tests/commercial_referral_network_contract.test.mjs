import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261106153000_admin_commercial_referral_network_v1.sql");
const ui = read("src/features/admin/CommercialReferralsPanel.tsx");
const comercial = read("src/features/admin/ComercialSection.tsx");

test("la red de referidos tiene controles de acceso en base de datos", () => {
  assert.match(sql, /require_project_permission\(target_project_id, 'commercial\.view'\)/);
  assert.match(sql, /has_project_permission\(target_project_id, 'payments\.view'\)/);
  assert.match(sql, /revoke all on function .* from public, anon/);
  assert.match(sql, /grant execute on function .* to authenticated/);
  assert.match(sql, /rel\.project_id = target_project_id and rel\.is_test is false/);
});

test("todos los referidos se asocian a su referente y no se recorta la lista", () => {
  assert.match(sql, /jsonb_agg\(jsonb_build_object\(\s*'relationship_id'/);
  assert.match(sql, /'referred_user_id', person\.referred_user_id/);
  assert.match(sql, /'referred_name', person\.referred_name/);
  assert.match(sql, /'referrer_user_id', p\.referrer_user_id/);
  assert.doesNotMatch(sql, /\blimit\s+\d+\b/i);
  assert.match(ui, /people\.slice\(0, 8\)/);
  assert.match(ui, /"Ver las " \+ people\.length \+ " personas referidas"/);
});

test("ingresos reales no mezclan simulacros, comisiones promocionales ni premios", () => {
  assert.match(sql, /j\.is_test is false/);
  assert.match(sql, /j\.test_deleted_at is null/);
  assert.match(sql, /cr\.status = 'consumed'/);
  assert.match(sql, /j\.status = 'settled'/);
  assert.match(sql, /cr\.currency = 'CUP'/);
  assert.match(sql, /real_reserved_amount/);
  assert.match(sql, /promotional_reserved_amount/);
  assert.match(ui, /Las comisiones promocionales no son dinero nuevo recibido/);
  assert.match(ui, /Premios al referente/);
  assert.match(ui, /Comisión real TUKTUK/);
});

test("Comercial incluye la pestaña Referidos sin alterar Ofertas y Captación", () => {
  assert.match(comercial, /setCommercialView\("referidos"\)/);
  assert.match(comercial, /<CommercialReferralsPanel projectId=\{projectId\} \/>/);
  assert.match(comercial, /<MarketplaceOffersPanel projectId=\{projectId\}/);
  assert.match(ui, /admin_get_commercial_referral_network_v1/);
  assert.match(ui, /Buscar referente, referido o código/);
});