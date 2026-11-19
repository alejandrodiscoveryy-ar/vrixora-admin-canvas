import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = name => readFileSync(`src/features/admin/${name}.tsx`, "utf8");
const controls = read("CommercialPolicyControls");
const welcome = read("MarketplaceWelcomePolicyPanel");
const impulsa = read("MarketplaceImpulsaPolicyPanel");
const wallet = read("MarketplaceImpulsaTransitionPanel");

test("Tres políticas usan controles premium oficiales, sin casillas nativas ni botones negros improvisados", () => {
  assert.match(controls, /<Switch/);
  assert.match(controls, /<Input/);
  assert.match(controls, /<Label/);
  assert.match(controls, /border-border-default bg-surface-2\/60/);
  assert.match(controls, /Sin guardar/);
  for (const source of [welcome, impulsa, wallet]) {
    assert.match(source, /CommercialPolicyControls/);
    assert.match(source, /<PolicyNumberField/);
    assert.match(source, /role="status"/);
    assert.doesNotMatch(source, /<input className="size-4" type="checkbox"/);
  }
});

test("Bienvenida conserva guardados independientes y exige confirmación al cambiar cobro", () => {
  assert.match(welcome, /admin_set_marketplace_welcome_policy/);
  assert.match(welcome, /admin_set_marketplace_commission_only/);
  assert.match(welcome, /admin_set_marketplace_commission_enabled/);
  assert.match(welcome, /window\.confirm\(msg\)/);
  assert.match(welcome, /chargeChanged && chargePolicy\.isSuccess/);
  assert.match(welcome, /commissionChanged/);
  assert.match(welcome, /disabled=\{!canEdit \|\| save\.isPending\}/);
  assert.match(welcome, /Valor conservado para cuando se reactive la bienvenida/);
});

test("Impulsa mantiene tres tasas, validación, simulador y protección de activación", () => {
  assert.match(impulsa, /admin_save_marketplace_impulsa_policy_v1/);
  assert.match(impulsa, /target_expected_version/);
  assert.match(impulsa, /g>0 && g<=100 && o>0 && o<=g && c>=0 && c<=g/);
  assert.match(impulsa, /<details className/);
  assert.match(impulsa, /Atribución comercial/);
  assert.match(impulsa, /100-g, c, g-c/);
  assert.match(impulsa, /window\.confirm/);
});

test("Billeteras conservan saldo real, pagos externos y activación por separado", () => {
  assert.match(wallet, /admin_save_marketplace_wallet_transition_v1/);
  assert.match(wallet, /admin_resolve_marketplace_impulsa_withdrawal_v1/);
  assert.match(wallet, /admin_activate_marketplace_wallet_transition_v1/);
  assert.match(wallet, /target_expected_version/);
  assert.match(wallet, /window\.confirm/);
  assert.match(wallet, /<PolicyToggle/);
  assert.match(wallet, /disabled=\{disabled \|\| Boolean\(query\.data\?\.activated_at\)\}/);
  assert.match(wallet, /<details className/);
  assert.match(wallet, /summary\.data\?\.debt_cup/);
  assert.match(wallet, /summary\.data\?\.pending_withdrawal_cup/);
  assert.match(wallet, /Registrar pago realizado/);
});
