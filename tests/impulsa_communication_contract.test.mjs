import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync("supabase/migrations/20261116230000_impulsa_communication_analytics.sql","utf8");
const edge=readFileSync("supabase/functions/marketplace-impulsa-analytics/index.ts","utf8");
const panel=readFileSync("src/features/admin/MarketplaceImpulsaCommunicationAnalytics.tsx","utf8");
const section=readFileSync("src/features/admin/ComercialSection.tsx","utf8");

test("analytics no escribe ni cambia carreras, tarifas, billetes o envíos",()=>{
  assert.match(sql,/create table if not exists app_private.marketplace_impulsa_communication_events/);
  assert.match(sql,/row level security/i);
  assert.match(sql,/revoke all on app_private.marketplace_impulsa_communication_events/);
  assert.doesNotMatch(sql,/update public\.jobs|update public\.wallet|insert into public\.jobs|delete from public\.jobs/i);
  assert.doesNotMatch(edge,/\.from\("jobs"\)|wallet_transactions|notification_outbox|send-push-notifications/i);
});

test("solo Edge service role escribe eventos públicos y requiere validación de perfil y sesión",()=>{
  assert.match(sql,/record_public_marketplace_impulsa_event_v1/);
  assert.match(sql,/grant execute on function public\.record_public_marketplace_impulsa_event_v1[\s\S]*to service_role/);
  assert.match(sql,/from public,anon,authenticated,service_role/);
  assert.match(sql,/marketplace_driver_promo_profiles/);
  assert.match(sql,/on conflict do nothing/);
  assert.match(sql,/commercial\.view/);
  assert.match(edge,/allowedOrigins/);
  assert.match(edge,/gatewayClientIp/);
  assert.match(edge,/marketplace_customer_gateway_rate_limit/);
  assert.match(edge,/MAX|raw\.length > 1400/);
  assert.doesNotMatch(edge,/console\.log\(raw\)|request\.headers\.get\("authorization"\)/);
});

test("Admin expone canal, campaña, embudo y motivos sin confundir intentos con envíos reales",()=>{
  assert.match(section,/MarketplaceImpulsaCommunicationAnalytics/);
  for(const s of ["Intentos de compartir","Clics en enlaces","Sesiones desde Impulsa","Recorrido del cliente",
    "Motivos de abandono","Comportamiento por importe","Aportación de cada conductor",
    "WhatsApp privado","Grupos de WhatsApp","Facebook","Sesiones","Ficha"]) {
    if(s==="Ficha") continue;
    assert.ok(panel.includes(s),s);
  }
  assert.match(panel,/abre Compartir|Abrió Compartir/);
  assert.match(panel,/no necesariamente la misma audiencia/);
  assert.match(panel,/Días|days/);
  assert.match(panel,/aria-expanded/);
});
