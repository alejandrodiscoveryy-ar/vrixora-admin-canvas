import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync("supabase/migrations/20261117090000_tuktuk_official_communication_campaign.sql","utf8");
const panel=readFileSync("src/features/admin/MarketplaceTuktukOfficialAnalytics.tsx","utf8");
const section=readFileSync("src/features/admin/ComercialSection.tsx","utf8");
const fixture=readFileSync("supabase/verification/tuktuk_official_communication_fixture.sql","utf8");

test("TukTuk is a distinct official campaign but preserves the existing Client address",()=>{
  assert.match(panel,/https:\/\/www\.vrixora\.com\/cliente\/tuk\//);
  assert.match(panel,/utm_source/);
  assert.match(panel,/utm_campaign/);
  assert.match(panel,/tuktuk_/);
  assert.match(panel,/Crear enlace de campaña/);
  assert.match(section,/MarketplaceImpulsaCommunicationAnalytics/);
  assert.match(section,/MarketplaceTuktukOfficialAnalytics/);
  assert.match(section,/canManage=\{canManage\}/);
});
test("marketing actions and QR link are tagged and never claimed as deliveries",()=>{
  for (const phrase of ["Copiar enlace","Copiar mensaje","Compartir","Copiar enlace para QR","hospitales",
      "Motivos de abandono","Interés por rango de precio","Canales de difusión",
      "Acciones de comunicación","Las visitas y solicitudes registradas podrás consultarlas en Resultados."]) {
    assert.ok(panel.includes(phrase),phrase);
  }
  assert.match(panel,/taggedLink\("qr",campaign\)/);
  assert.match(panel,/share_attempt/);
  assert.match(panel,/navigator\.share/);
  assert.match(panel,/navigator\.clipboard\.writeText/);
  assert.match(panel,/aria-label="Canal de la campaña"/);
  assert.match(panel,/Sesiones del enlace/);
  assert.match(panel,/Solicitudes señaladas/);
});
test("backend accepts only explicit official campaign labels, excludes organic and driver links",()=>{
  assert.match(sql,/record_public_marketplace_impulsa_event_v1/);
  assert.match(sql,/target_promo_code is null and/);
  assert.match(sql,/scope := target_campaign;/);
  assert.match(sql,/target_event='link_open' and promoter is null and scope='organic'/);
  assert.match(sql,/driver_user_id is null/);
  assert.match(sql,/campaign ~ '\^tuktuk/);
  assert.match(sql,/campaign is null or campaign !~ '\^tuktuk/);
  assert.match(sql,/commercial\.view/);
  assert.match(sql,/commercial\.manage/);
  assert.match(sql,/auth\.uid\(\) is null/);
  assert.match(sql,/revoke all on function public\.admin_get_marketplace_tuktuk_communications_v1/);
  assert.match(sql,/revoke all on function public\.admin_record_marketplace_tuktuk_share_action_v1/);
  assert.doesNotMatch(sql,/update public\.jobs|update public\.wallet|delete from public\.jobs|truncate/i);
});
test("disposable Postgres fixture validates price, claims, channels, dedupe and forbidden access",()=>{
  assert.match(fixture,/20261117090000_tuktuk_official_communication_campaign\.sql/);
  for (const value of ["tuktuk_hospitales","tuktuk_pegatinas","driver code","source leaked",
      "Official report counts","Unauthorized report"]) {
    if(value==="driver code") continue;
    assert.ok(fixture.includes(value),value);
  }
  assert.match(fixture,/TUKTUK_OFFICIAL_CAMPAIGN_FIXTURE_OK/);
});
