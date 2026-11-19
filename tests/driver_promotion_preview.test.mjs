import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const card = read("src/features/admin/MarketplaceDriverPromotionPreview.tsx");
const record = read("src/features/admin/MarketplaceDriver360Record.tsx");
test("Mi TukTuk usa el generador compartido y el conductor correcto", () => {
  assert.match(record, /label: "Impulsa"/);
  assert.match(record, /projectId=\{projectId\} driverUserId=\{driverUserId\}/);
  assert.match(card, /admin_activate_marketplace_promo_card_v1/);
  assert.match(card, /target_authorization_confirmed: false/);
  assert.match(card, /target_authorization_confirmed: true/);
  assert.match(card, /reference.trim\(\).length < 5/);
  assert.match(card, /IDENTITY_NOT_VERIFIED/);
  assert.match(card, /promo_card=/);
  assert.match(card, /https:\/\/www\.vrixora\.com\/tuk\//);
  assert.match(card, /admin_marketplace_promo_alias_v1/);
  assert.match(card, /target_alias: chosen/);
  assert.match(card, /Tarjetas reales de Mi TukTuk/);
  assert.doesNotMatch(card, /QR PENDIENTE|service_role/);
});

test("Impulsa centraliza la promoción y no modifica la identidad", () => {
  const management = read("src/features/admin/MarketplaceDriverManagementPanel.tsx");
  const directory = read("src/features/admin/MarketplaceSection.tsx");
  const hook = read("src/hooks/useDriverVerifications.ts");
  const badge = read("src/features/admin/DriverVerifiedBadge.tsx");
  assert.match(card, /Nombre de usuario comercial/);
  assert.match(card, /admin_deactivate_marketplace_promo_card_v1/);
  assert.match(card, /Confirmar desactivación/);
  assert.match(card, /Copiar enlace/);
  assert.match(card, /verified !== true/);
  assert.match(card, /!canManage/);
  assert.match(record, /identity\?\.verified === true && <DriverVerifiedBadge/);
  assert.match(directory, /driverVerifications\.data\?\.\[item\.userId\]\?\.verified === true && <DriverVerifiedBadge compact/);
  assert.match(hook, /admin_get_marketplace_driver_verifications_v1/);
  assert.match(hook, /slice\(i, i \+ 200\)/);
  assert.match(badge, /Conductor verificado/);
  assert.match(management, /marketplace-driver-verifications/);
  assert.match(management, /onOpenImpulsa/);
  assert.doesNotMatch(management, /admin_activate_marketplace_promo_card_v1/);
});

test("Activación Impulsa explica por qué el botón está deshabilitado", () => {
  const sql = read("supabase/migrations/20261113220656_mi_tuktuk_administrative_activation_identity_review.sql");
  assert.match(sql, /char_length\(reference\) not between 5 and 300/);
  assert.match(card, /minLength=\{5\} maxLength=\{300\}/);
  assert.match(card, /Referencia de autorización documentada/);
  assert.match(card, /id="impulsa-authorization-help"/);
  assert.match(card, /El nombre del conductor no sustituye esa referencia/);
  assert.match(card, /Referencia incompleta:/);
  assert.match(card, /Faltan \{5 - reference\.trim\(\)\.length\}/);
  assert.match(card, /disabled=\{!confirmed \|\| reference\.trim\(\)\.length < 5 \|\| !validDriverPromoAlias\(aliasInput\.trim\(\)\.toLowerCase\(\)\) \|\| busy\}/);
  assert.match(card, /confirmar la autorización documentada/);
});

test("Si el servidor rechaza la activación, conserva los campos y explica la causa", () => {
  assert.match(card, /const \[activationError, setActivationError\] = useState\(""\)/);
  assert.match(card, /setActivationError\(message\.includes\("DOCUMENTED_AUTHORIZATION_REQUIRED"\)/);
  assert.match(card, /PROMO_SERVICE_NOT_ACTIVE/);
  assert.match(card, /IDENTITY_NOT_VERIFIED/);
  assert.match(card, /PUBLIC_NAME_INVALID/);
  assert.match(card, /\{activationError && <p role="alert"/);
  assert.doesNotMatch(card, /catch \{ setStatus\("No se pudo activar/);
});

test("La ficha 360 propone antes de activar un enlace editable y diferencia homónimos", () => {
  assert.match(record, /driverDisplayName=\{displayName\}/);
  assert.match(card, /suggestDriverPromoAlias\(driverDisplayName, driverUserId\)/);
  assert.match(card, /Nombre comercial propuesto/);
  assert.match(card, /aria-label="Nombre comercial propuesto"/);
  assert.match(card, /Puedes editarla/);
  assert.match(card, /Al activar, el servidor comprobará que el enlace no esté repetido/);
  assert.match(card, /target_alias: proposedAlias/);
  assert.match(card, /PROMO_ALIAS_TAKEN/);
  assert.match(card, /setAlias\(fallback\.data\)/);
  assert.match(card, /El nombre del conductor no sustituye esa referencia/);
});
