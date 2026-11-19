import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = name => readFileSync(`src/features/admin/${name}.tsx`, "utf8");
const main = read("ComercialSection");
const header = read("CommercialPageHeader");
const settings = read("CommercialSettingsPanel");
const welcome = read("MarketplaceWelcomePolicyPanel");
const impulsa = read("MarketplaceImpulsaPolicyPanel");
const wallet = read("MarketplaceImpulsaTransitionPanel");
const offers = read("MarketplaceOffersPanel");
const allies = read("MarketplaceAlliesPanel");
const referrals = read("CommercialReferralsPanel");
const official = read("MarketplaceTuktukOfficialAnalytics");
const driverAnalytics = read("MarketplaceImpulsaCommunicationAnalytics");

test("Comercial compone una sola familia oficial de cabeceras y superficies", () => {
  assert.match(header, /<ModuleHeader/);
  assert.match(header, /density="compact"/);
  assert.match(header, /appearance="premium"/);
  for (const source of [main, offers, allies, referrals]) {
    assert.match(source, /<CommercialPageHeader/);
  }
  for (const name of ["campanas","resultados","impulsa","aliados","configuracion","captacion"]) {
    assert.ok(main.includes(name), name);
  }
});

test("Gestión agrupa tres políticas y deja una sola sección abierta", () => {
  assert.match(settings, /<details name="commercial-policy"/);
  assert.match(main, /Bienvenida y cobro general/);
  assert.match(main, /Reglas y comisiones de Impulsa/);
  assert.match(main, /Créditos, deuda y retiradas/);
  assert.equal((main.match(/<CommercialSettingsPanel /g) ?? []).length, 3);
  for (const panel of [welcome, impulsa, wallet]) assert.match(panel, /embedded/);
});

test("Configuración preserva las tres rutas financieras y sus permisos", () => {
  assert.match(welcome, /admin_set_marketplace_welcome_policy/);
  assert.match(welcome, /admin_set_marketplace_commission_only/);
  assert.match(welcome, /admin_set_marketplace_commission_enabled/);
  assert.match(welcome, /window\.confirm/);
  assert.match(impulsa, /admin_save_marketplace_impulsa_policy_v1/);
  assert.match(impulsa, /window\.confirm/);
  assert.match(wallet, /admin_save_marketplace_wallet_transition_v1/);
  assert.match(wallet, /admin_resolve_marketplace_impulsa_withdrawal_v1/);
  assert.match(wallet, /admin_activate_marketplace_wallet_transition_v1/);
  assert.match(wallet, /window\.confirm/);
  assert.match(main, /canEditImpulsa/);
});

test("Campañas, conductores y aliados muestran primero la acción o resultado", () => {
  assert.match(offers, /Catálogo de beneficios/);
  assert.doesNotMatch(offers, /comercial-ofertas-hero\.svg/);
  assert.match(offers, /showHistory/);
  assert.match(offers, /count\.expired/);
  assert.match(offers, /archiveMarketplaceOfferCampaign/);
  assert.match(allies, /<MetricCard/);
  assert.match(allies, /Nuevo aliado/);
  assert.match(referrals, /<MetricCard/);
  assert.match(official, /Análisis detallado de las campañas/);
  assert.match(driverAnalytics, /Aportación de cada conductor/);
  assert.match(driverAnalytics, /Análisis detallado de campañas/);
  assert.match(official, /taggedLink\("qr",campaign\)/);
});
