import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = name => readFileSync(`src/features/admin/${name}.tsx`, "utf8");
const palette = readFileSync("src/features/admin/commercial-premium.ts", "utf8");
const root = src("ComercialSection");

test("Comercial uses existing Admin graphite palette without editing global theme", () => {
  assert.match(palette, /premiumColumnHeaderSurface/);
  assert.match(palette, /premiumControlSurface/);
  assert.match(palette, /premiumHeaderSurface/);
  assert.match(palette, /dark:bg-\[color:color-mix\(in_oklab,var\(--surface-3\)_95%,var\(--text-secondary\)_5%\)\]/);
  assert.doesNotMatch(palette, /#[0-9a-f]{3,8}\b/i);
  assert.match(root, /data-admin-module="comercial" className=\{cp\.workspace\}/);
});

test("All key Comercial panels reuse graphite controls and inset surfaces", () => {
  const expected = [
    ["MarketplaceOffersPanel", /cp\.inset/],
    ["MarketplaceAlliesPanel", /cp\.inset/],
    ["CommercialReferralsPanel", /cp\.inset/],
    ["MarketplaceCustomerCampaignDrafts", /cp\.control/],
    ["MarketplaceTuktukOfficialAnalytics", /cp\.inset/],
    ["MarketplaceImpulsaCommunicationAnalytics", /cp\.inset/],
    ["MarketplaceWelcomePolicyPanel", /cp\.control/],
    ["MarketplaceImpulsaPolicyPanel", /cp\.control/],
    ["MarketplaceImpulsaTransitionPanel", /cp\.control/],
  ];
  for(const [name,matcher] of expected) assert.match(src(name),matcher,name);
});

test("Graphite refinement does not change business actions, permissions or analytics", () => {
  const welcome=src("MarketplaceWelcomePolicyPanel");
  const impulsa=src("MarketplaceImpulsaPolicyPanel");
  const wallet=src("MarketplaceImpulsaTransitionPanel");
  const allies=src("MarketplaceAlliesPanel");
  assert.match(welcome,/admin_set_marketplace_commission_only/);
  assert.match(welcome,/admin_set_marketplace_commission_enabled/);
  assert.match(impulsa,/admin_save_marketplace_impulsa_policy_v1/);
  assert.match(wallet,/admin_resolve_marketplace_impulsa_withdrawal_v1/);
  assert.match(allies,/Nuevo aliado/);
  assert.match(root,/canEditImpulsa/);
});
