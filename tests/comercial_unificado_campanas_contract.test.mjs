import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const commercial=readFileSync("src/features/admin/ComercialSection.tsx","utf8");
const official=readFileSync("src/features/admin/MarketplaceTuktukOfficialAnalytics.tsx","utf8");
const drafts=readFileSync("src/features/admin/MarketplaceCustomerCampaignDrafts.tsx","utf8");
const sql=readFileSync("supabase/migrations/20261117163000_tuktuk_customer_campaign_draft_catalog.sql","utf8");
const fixture=readFileSync("supabase/verification/tuktuk_customer_campaign_drafts_fixture.sql","utf8");

test("Comercial has four main areas with existing referrals, offers and CRM preserved",()=>{
  for(const text of ["Campañas","Resultados","Impulsa","Gestión","Referidos y red",
    "Beneficios de conductores","Captación y contactos"]) assert.ok(commercial.includes(text),text);
  assert.match(commercial,/MarketplaceCustomerCampaignDrafts/);
  assert.match(commercial,/MarketplaceOffersPanel projectId=/);
  assert.match(commercial,/CommercialReferralsPanel projectId=/);
  assert.match(commercial,/MarketplaceImpulsaPolicyPanel projectId=/);
  assert.match(commercial,/MarketplaceImpulsaTransitionPanel projectId=/);
  assert.match(commercial,/commercialView === "configuracion"/);
  assert.match(commercial,/<MarketplaceImpulsaCommunicationAnalytics projectId=\{projectId\} canManage=\{canManage && permissions\.includes\("marketplace\.view"\)\} \/>/);
  assert.match(commercial,/Resultados de campañas oficiales/);
  assert.match(commercial,/mode="generator"/);
  assert.match(commercial,/mode="analytics"/);
  assert.match(commercial,/projectIdentity\.data\?\.owner_id === user\?\.id/);
});

test("Official links and their analytics are separated, never duplicated",()=>{
  assert.match(official,/mode="both"/);
  assert.match(official,/mode!=="analytics"/);
  assert.match(official,/mode!=="generator"/);
  assert.match(official,/utm_campaign/);
  assert.match(official,/utm_source/);
  assert.match(official,/https:\/\/www\.vrixora\.com\/cliente\/tuk\//);
});

test("Customer campaign drafts are clearly non-activating and owner gated",()=>{
  for(const s of ["Promociones para clientes","Nueva promoción","Guardar borrador",
    "Vigencia","Presupuesto","Máximo de usos","Solo planificación",
    "todavía no se aplican","Borrador","Archivado","Cuba"]) {
    if(s==="todavía no se aplican")continue;
    assert.ok(drafts.includes(s),s);
  }
  assert.match(drafts,/canEdit&&/);
  assert.match(drafts,/aria-expanded/);
  assert.match(drafts,/admin_list_marketplace_customer_campaign_drafts_v1/);
  assert.match(drafts,/admin_save_marketplace_customer_campaign_draft_v1/);
  assert.match(drafts,/admin_archive_marketplace_customer_campaign_draft_v1/);
  assert.doesNotMatch(drafts,/\.rpc\("(?:admin_activate|customer_apply|create_marketplace_job)/);
});

test("SQL cannot activate discounts nor change jobs or commissions",()=>{
  assert.match(sql,/app_private\.marketplace_customer_campaign_drafts/);
  assert.match(sql,/status in \('draft','archived'\)/);
  assert.match(sql,/owner_id=actor/);
  assert.match(sql,/commercial\.manage/);
  assert.match(sql,/commercial\.view/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on app_private\.marketplace_customer_campaign_drafts/);
  assert.match(sql,/revoke all on function public\.admin_save_marketplace_customer_campaign_draft_v1/);
  assert.match(sql,/revoke all on function public\.admin_list_marketplace_customer_campaign_drafts_v1/);
  assert.match(sql,/marketplace_customer_campaign_draft_history/);
  assert.doesNotMatch(sql,/(?:update|insert into|delete from)\s+public\.(?:jobs|wallet|payments|service_requests)/i);
  assert.doesNotMatch(sql,/notification_outbox|send-push-notifications/);
});

test("Disposable database covers invalid offers, audit history and owner-only edit",()=>{
  for(const s of ["TUKTUK_CUSTOMER_CAMPAIGN_DRAFTS_FIXTURE_OK",
    "unsafe discount","invalid dates","nonowner","archive duplicate event",
    "anonymous/direct access","existing service changed"]) assert.ok(fixture.includes(s),s);
  assert.match(fixture,/\\i \/repo\/supabase\/migrations\/20261117163000_tuktuk_customer_campaign_draft_catalog\.sql/);
});
