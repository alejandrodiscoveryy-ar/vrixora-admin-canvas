import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql = read("docs/security/impulsa-driver-self-service-candidate.sql");
const admin = read("src/features/admin/MarketplaceDriverManagementPanel.tsx");

test("la solicitud propia no concede verificación ni abre el perfil promocional", () => {
  assert.match(sql, /create or replace function public.request_my_marketplace_impulsa_verification_v1/);
  assert.match(sql, /target_accept_terms is distinct from true/);
  assert.match(sql, /target_authorize_public_profile is distinct from true/);
  assert.match(sql, /target_authorize_photo is distinct from true/);
  assert.match(sql, /f.asset_kind='identity_front'/);
  assert.match(sql, /b.asset_kind='identity_back'/);
  assert.match(sql, /status='pending'/);
  assert.match(sql, /security definer set search_path=''/);
  assert.match(sql, /revoke all on app_private.marketplace_impulsa_applications from public, anon, authenticated/);
  const driverRequest = sql.split("create or replace function public.request_my_marketplace_impulsa_verification_v1")[1]
    .split("create or replace function public.admin_get_marketplace_impulsa_application_v1")[0];
  assert.doesNotMatch(driverRequest, /admin_set_marketplace_driver_identity_review_v2|admin_activate_marketplace_promo_card_v1/);
});

test("la autorización de Impulsa solo se activa con una decisión administrativa atómica", () => {
  const approval = sql.split("create or replace function public.admin_decide_marketplace_impulsa_application_v1")[1];
  assert.match(approval, /require_project_permission\(target_project_id,'marketplace.manage'\)/);
  assert.match(approval, /if not found or a.status<>'pending'/);
  assert.match(approval, /d.photo_asset_id is distinct from a.submitted_photo_asset_id/);
  assert.match(approval, /current_name is distinct from a.submitted_display_name/);
  assert.match(approval, /admin_set_marketplace_driver_identity_review_v2/);
  assert.match(approval, /admin_activate_marketplace_promo_card_v1/);
  assert.match(approval, /insert into public.audit_events/);
  assert.match(admin, /admin_get_marketplace_impulsa_application_v1/);
  assert.match(admin, /admin_decide_marketplace_impulsa_application_v1/);
  assert.match(admin, /Aprobar identidad y activar Impulsa/);
  assert.match(admin, /Solicitud pendiente/);
  assert.match(admin, /Rechazar solicitud/);
});
