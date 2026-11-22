import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ui = readFileSync(new URL("../src/features/admin/MarketplaceAlliesPanel.tsx", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/migrations/20261122121000_marketplace_allies_identity_card_private_v1.sql", import.meta.url), "utf8");

test("Alta y edición incorporan el carnet de identidad sin cambiar el porcentaje ni los enlaces", () => {
  assert.match(ui, /htmlFor="ally-identity-card"/);
  assert.match(ui, /inputMode="numeric" maxLength=\{11\}/);
  assert.match(ui, /const carnetValid = \(value: string\) => \/\^\\d\{11\}\$\//);
  assert.match(ui, /admin_create_marketplace_ally_with_identity_v1/);
  assert.match(ui, /admin_update_marketplace_ally_with_identity_v1/);
  assert.match(ui, /target_identity_card_number: identityCard\.trim\(\) \|\| null/);
  assert.match(ui, /target_identity_card_number: newIdentityCard\.trim\(\)/);
  assert.match(ui, /onClick=\{\(\) => void update\(ally, ally\.status, editedName, Number\(editedRate\), editedIdentityCard\)\}/);
  assert.match(ui, /rate: pct \/ 100/);
  assert.match(ui, /const privateLink = \(secret: string\)/);
});

test("El listado solo recibe carnet enmascarado bajo permiso de gestión", () => {
  assert.match(ui, /admin_list_marketplace_ally_identity_status_v1/);
  assert.match(ui, /enabled: canManage && Boolean\(projectId\)/);
  assert.match(ui, /identityByAlly\.get\(ally\.id\)/);
  assert.match(ui, /Sin carnet/);
  assert.match(ui, /En blanco conserva el carnet actual/);
  assert.match(ui, /Quitar carnet/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage/);
});

test("El carnet solo se almacena en el esquema privado, se valida y se audita sin dígitos", () => {
  assert.match(sql, /alter table app_private\.marketplace_allies/);
  assert.match(sql, /identity_card_number text/);
  assert.match(sql, /identity_card_number ~ '\^\[0-9\]\{11\}\$'/);
  assert.match(sql, /create unique index if not exists marketplace_allies_project_identity_card_unique/);
  assert.match(sql, /require_project_permission\(target_project_id, 'commercial\.manage'\)/);
  assert.match(sql, /'••••' \|\| right\(a\.identity_card_number, 4\)/);
  assert.match(sql, /grant execute on function public\.admin_list_marketplace_ally_identity_status_v1\(uuid\) to authenticated/);
  assert.match(sql, /revoke all on function public\.admin_list_marketplace_ally_identity_status_v1\(uuid\) from public, anon/);
  assert.doesNotMatch(sql, /jsonb_build_object\('identity_card_number',/i);
  assert.match(sql, /'ally_identity_updated'/);
  assert.match(sql, /'ally_identity_recorded'/);
});

test("La creación conserva la atomicidad del alta original y el reporte privado no incluye carnet", () => {
  assert.match(sql, /result := public\.admin_create_marketplace_ally_v1\(/);
  assert.match(sql, /perform public\.admin_update_marketplace_ally_v1\(/);
  assert.match(sql, /if target_identity_card_number is not null then/);
  assert.match(sql, /'identity_card_present'/);
  assert.doesNotMatch(sql, /get_marketplace_ally_report_v1/);
  assert.doesNotMatch(sql, /get_public_marketplace_ally_shortlink/);
});
