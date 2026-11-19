import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const commercial = readFileSync("src/features/admin/ComercialSection.tsx","utf8");
const offers = readFileSync("src/features/admin/MarketplaceOffersPanel.tsx","utf8");

test("Configuración concentra la política de bienvenida y comisiones", () => {
  assert.match(commercial,/commercialView === "configuracion"/);
  assert.match(commercial,/Bienvenida y cobro general/);
  assert.match(commercial,/<MarketplaceWelcomePolicyPanel projectId=\{projectId\}/);
  assert.match(commercial,/Reglas y comisiones de Impulsa/);
  assert.match(commercial,/Créditos, deuda y retiradas/);
});

test("Beneficios ofrece catálogo sin repetir política administrativa", () => {
  assert.doesNotMatch(offers,/<MarketplaceWelcomePolicyPanel/);
  assert.match(offers,/Beneficios de conductores/);
  assert.match(offers,/Nueva oferta/);
  assert.match(offers,/count\.drafts/);
  assert.match(offers,/count\.archived/);
  assert.match(offers,/Catálogo|catálogo/);
  assert.match(offers,/saveMarketplaceOfferCampaign/);
  assert.match(offers,/archiveMarketplaceOfferCampaign/);
  assert.doesNotMatch(offers,/comercial-ofertas-hero\.svg/);
});
