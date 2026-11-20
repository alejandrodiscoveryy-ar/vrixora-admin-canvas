import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../"+p, import.meta.url),"utf8");
const sql = read("supabase/migrations/20261120191500_marketplace_ally_funnel_reasons_v2.sql");
const edge = read("supabase/functions/marketplace-impulsa-analytics/index.ts");
const admin = read("src/features/admin/MarketplaceAlliesPanel.tsx");
const summary = read("src/features/admin/ComercialSourceOverview.tsx");

test("Aliados guarda solo motivo anónimo y tramo de precio, y conserva v1",()=>{
  assert.match(sql,/add column if not exists reason text/);
  assert.match(sql,/add column if not exists price_band text/);
  assert.match(sql,/event_type='survey_answer' and reason in/);
  assert.match(sql,/event_type='quote_ready' and price_band in/);
  assert.match(sql,/record_public_marketplace_ally_event_v2/);
  assert.match(sql,/target_reason text default null/);
  assert.match(sql,/target_price_cup numeric default null/);
  assert.match(sql,/grant execute on function public\.record_public_marketplace_ally_event_v2[\s\S]*to service_role/);
  assert.match(sql,/from public,anon,authenticated,service_role/);
  assert.doesNotMatch(sql,/insert into public\.jobs|insert into public\.service_requests|update public\.jobs/);
  assert.doesNotMatch(sql,/update public\.wallet|update app_private\.marketplace_ally_payments/i);
});
test("El gateway preserva privacidad y distribuye motivos a Aliados sin afectar Impulsa",()=>{
  assert.match(edge,/record_public_marketplace_ally_event_v2/);
  assert.match(edge,/target_reason:reason,target_price_cup:price/);
  assert.match(edge,/marketplace_customer_gateway_rate_limit/);
  assert.match(edge,/record_public_marketplace_impulsa_event_v1/);
  assert.match(edge,/allowedOrigins/);
  assert.match(edge,/serviceKey/);
  assert.doesNotMatch(edge,/target_customer_phone|target_destination_text/);
});
test("Admin expone embudo agregado por aliado sin confundirlo con viajes",()=>{
  for(const field of ["app_opens","origins","destinations","quotes","requests","reasons"])
    assert.ok(sql.includes("as "+field),field);
  assert.match(sql,/require_project_permission\(target_project_id,'commercial.view'\)/);
  assert.match(sql,/j\.status='settled'/);
  assert.match(sql,/coalesce\(j\.is_test,false\)/);
  assert.match(admin,/Captación de pasajeros/);
  assert.match(admin,/Motivos declarados/);
  assert.match(admin,/Los eventos no representan necesariamente clientes únicos/);
  assert.match(summary,/allySummary\.appOpens/);
  assert.match(summary,/allySummary\.quotes/);
  assert.match(summary,/allySummary\.requests/);
});
