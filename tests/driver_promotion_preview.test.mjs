import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const card = read("src/features/admin/MarketplaceDriverPromotionPreview.tsx");
const record = read("src/features/admin/MarketplaceDriver360Record.tsx");
const migration = read("supabase/migrations/20261124174500_impulsa_reuse_existing_driver_consent.sql");

test("Mi TukTuk conserva enlace, tarjetas, alias único e identidad verificada", () => {
  assert.match(record, /label: "Impulsa"/);
  assert.match(record, /projectId=\{projectId\} driverUserId=\{driverUserId\}/);
  assert.match(card, /verified !== true/);
  assert.match(card, /promo_card=/);
  assert.match(card, /https:\/\/www\.vrixora\.com\/tuk\//);
  assert.match(card, /admin_marketplace_promo_alias_v1/);
  assert.match(card, /target_alias: chosen/);
  assert.match(card, /Tarjetas reales de Mi TukTuk/);
  assert.doesNotMatch(card, /QR PENDIENTE|service_role/);
});

test("La ficha 360 solo consulta el estado al abrir y activa después de pulsar", () => {
  assert.match(card, /admin_get_marketplace_promo_card_state_v2/);
  assert.match(card, /admin_activate_marketplace_promo_card_v2/);
  assert.match(card, /data\?\.enabled === true/);
  assert.match(card, /data\?\.consent_ready === true/);
  assert.match(card, /onClick=\{\(\) => void activate\(\)\}/);
  assert.doesNotMatch(card, /admin_activate_marketplace_promo_card_v1/);
});

test("No exige acta, folio ni segunda confirmación tras el consentimiento propio", () => {
  assert.match(card, /consentimiento para publicar nombre y fotografía ya registrado/);
  assert.match(card, /Nombre comercial propuesto/);
  assert.match(card, /disabled=\{!validDriverPromoAlias\(aliasInput\.trim\(\)\.toLowerCase\(\)\) \|\| busy\}/);
  assert.doesNotMatch(card, /impulsa-authorization-reference|Referencia de autorización documentada|Número de acta, folio o registro/);
  assert.doesNotMatch(card, /setReference|setConfirmed|reference\.trim\(\)|!confirmed/);
  assert.doesNotMatch(card, /Confirmo que cuento con autorización documentada/);
  assert.match(card, /El conductor debe autorizar desde su aplicación/);
});

test("La función de activación solo acepta el consentimiento original vigente y los datos actuales", () => {
  for (const token of [
    "marketplace_impulsa_applications",
    "a.status in ('pending','approved')",
    "a.consent_version='impulsa-self-service-v1'",
    "a.consent_public_profile is true",
    "a.consent_photo is true",
    "a.consent_accepted_at is not null",
    "a.submitted_display_name = btrim(u.display_name)",
    "a.submitted_photo_asset_id = d.photo_asset_id",
    "a.identity_front_asset_id = d.identity_front_asset_id",
    "a.identity_back_asset_id = d.identity_back_asset_id",
    "a.identity_document_type is not distinct from d.identity_document_type",
    "a.consent_accepted_at > promo.revoked_at",
    "marketplace_driver_identity_verified_v1",
    "IMPULSA_CONSENT_REQUIRED",
    "PROMO_PHOTO_NOT_AVAILABLE",
    "values(d.project_id,d.user_id,legal_name,photo,'mi-tuktuk-v1',a.consent_accepted_at)",
  ]) assert.ok(migration.includes(token), "Falta protección: " + token);
  assert.match(migration, /require_project_permission\(target_project_id,'marketplace.manage'\)/);
  assert.match(migration, /revoke all on function app_private\.marketplace_impulsa_current_consent_v1/);
  assert.match(migration, /revoke all on function public\.admin_activate_marketplace_promo_card_v2/);
  assert.match(migration, /consent_accepted_at',a.consent_accepted_at/);
  assert.doesNotMatch(migration, /char_length\(reference\) not between 5 and 300/);
});

test("Compatibilidad segura: los clientes antiguos no activan al abrir la ficha", () => {
  assert.match(migration, /create or replace function public\.admin_activate_marketplace_promo_card_v1/);
  assert.match(migration, /if target_authorization_confirmed is distinct from true then/);
  assert.match(migration, /raise exception 'IMPULSA_CONSENT_REQUIRED'/);
  assert.match(migration, /return public\.admin_activate_marketplace_promo_card_v2/);
  assert.match(migration, /create or replace function public\.admin_get_marketplace_promo_card_state_v2/);
  assert.match(migration, /language plpgsql stable security definer/);
  assert.match(migration, /'consent_ready',app_private\.marketplace_impulsa_current_consent_v1/);
});

test("Si hay rechazo se conserva el formulario y se explica la causa", () => {
  assert.match(card, /const \[activationError, setActivationError\] = useState\(""\)/);
  assert.match(card, /setActivationError\(message\.includes\("IMPULSA_CONSENT_REQUIRED"\)/);
  assert.match(card, /PROMO_PHOTO_NOT_AVAILABLE/);
  assert.match(card, /PROMO_SERVICE_NOT_ACTIVE/);
  assert.match(card, /IDENTITY_NOT_VERIFIED/);
  assert.match(card, /PUBLIC_NAME_INVALID/);
  assert.match(card, /\{activationError && <p role="alert"/);
});

test("Impulsa centraliza promoción y la suspensión retira verificación", () => {
  const management = read("src/features/admin/MarketplaceDriverManagementPanel.tsx");
  const directory = read("src/features/admin/MarketplaceSection.tsx");
  const hook = read("src/hooks/useDriverVerifications.ts");
  const badge = read("src/features/admin/DriverVerifiedBadge.tsx");
  assert.match(card, /Nombre de usuario comercial/);
  assert.match(card, /admin_deactivate_marketplace_promo_card_v1/);
  assert.match(card, /Confirmar suspensión y retirada de verificación/);
  assert.match(card, /Suspender Impulsa retira también la verificación de identidad/);
  const suspension = read("supabase/migrations/20261124194500_impulsa_suspension_revokes_identity_and_resets_application.sql");
  assert.match(suspension, /admin_set_marketplace_driver_identity_review_v1/);
  assert.match(suspension, /status='withdrawn'/);
  assert.match(card, /Copiar enlace/);
  assert.match(record, /identity\?\.verified === true && <DriverVerifiedBadge/);
  assert.match(directory, /driverVerifications\.data\?\.\[item\.userId\]\?\.verified === true && <DriverVerifiedBadge compact/);
  assert.match(hook, /admin_get_marketplace_driver_verifications_v1/);
  assert.match(hook, /slice\(i, i \+ 200\)/);
  assert.match(badge, /Conductor verificado/);
  assert.match(management, /marketplace-driver-verifications/);
  assert.match(management, /onOpenImpulsa/);
  assert.doesNotMatch(management, /admin_activate_marketplace_promo_card_v1/);
});

test("Enlace editable, nombre propuesto y sin colisiones", () => {
  assert.match(record, /driverDisplayName=\{displayName\}/);
  assert.match(card, /suggestDriverPromoAlias\(driverDisplayName, driverUserId\)/);
  assert.match(card, /aria-label="Nombre comercial propuesto"/);
  assert.match(card, /Puedes editarla/);
  assert.match(card, /Al activar, el servidor comprobará que el enlace no esté repetido/);
  assert.match(card, /target_alias: proposedAlias/);
  assert.match(card, /PROMO_ALIAS_TAKEN/);
  assert.match(card, /setAlias\(fallback\.data\)/);
});


test("La activación Impulsa no reutiliza el alias SQL de la solicitud como variable PL/pgSQL", () => {
  const patch = read("supabase/migrations/20261124181000_impulsa_fix_ambiguous_driver_alias_v2.sql");
  assert.match(patch, /v_consent app_private\.marketplace_impulsa_applications%rowtype/);
  assert.match(patch, /select \* into v_consent from app_private\.marketplace_impulsa_applications/);
  assert.match(patch, /public\.driver_vehicle_assignments a/);
  assert.match(patch, /a\.project_id=d\.project_id and a\.driver_user_id=d\.user_id/);
  assert.match(patch, /v_consent\.consent_accepted_at/);
  assert.match(patch, /v_consent\.consent_version/);
  assert.doesNotMatch(patch, /\ba app_private\.marketplace_impulsa_applications%rowtype/);
  assert.match(patch, /app_private\.marketplace_impulsa_current_consent_v1/);
  assert.match(patch, /app_private\.marketplace_driver_identity_verified_v1/);
  assert.match(patch, /app_private\.require_project_permission/);
});
