import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('src/features/admin/MarketplaceCustomerCareWorkspace.tsx','utf8');
const sql = readFileSync('supabase/migrations/20261109233324_marketplace_care_whatsapp_manual_quote.sql','utf8');
const parser = readFileSync('src/lib/marketplace-whatsapp-manual.mjs','utf8');

test('nueva entrada WhatsApp es manual y no altera el flujo habitual', () => {
  assert.match(ui,/Recepción asistida desde WhatsApp/);
  assert.match(ui,/WhatsApp asistido/);
  assert.match(ui,/interpretManualWhatsAppMessage/);
  assert.match(ui,/!whatsappMode \|\| acceptedWhatsAppQuote/);
  assert.match(ui,/admin_publish_marketplace_care_job/);
  assert.match(ui,/admin_publish_marketplace_whatsapp_accepted_job/);
  assert.doesNotMatch(parser,/getSupabaseClient|sendMessage/);
});
test('solicita datos y puntos exactos sin inventar precio', () => {
  assert.match(ui,/missingWhatsAppFields/);
  assert.match(ui,/customerQuestions/);
  assert.match(ui,/quoteWhatsAppText/);
  assert.match(ui,/getMarketplaceOperationalMap/);
  assert.match(ui,/operation: "route_quote"/);
  assert.match(ui,/operation: "care_route_verify_v1"/);
  assert.match(ui,/CARE_PRICE_CHANGED/);
});
test('cotización exige paso manual de envío y evidencia para aceptación', () => {
  assert.match(ui,/admin_prepare_marketplace_whatsapp_quote/);
  assert.match(ui,/admin_mark_marketplace_whatsapp_quote_sent/);
  assert.match(ui,/admin_confirm_marketplace_whatsapp_quote/);
  assert.match(ui,/He enviado la cotización/);
  assert.match(ui,/acceptanceReviewed/);
  assert.match(ui,/acceptanceExcerpt\.trim\(\)\.length < 2/);
  assert.match(ui,/Abrir WhatsApp no envía el mensaje automáticamente/);
  assert.match(ui,/!whatsappMode \|\| acceptedWhatsAppQuote/);
});
test('una modificación en ruta, cliente, notas o precio revoca aceptación local', () => {
  assert.match(ui,/const invalidateRequest = \(\) => \{[\s\S]*setWhatsappQuote\(null\)/);
  assert.match(ui,/quoteMatchesCurrent/);
  assert.match(ui,/whatsappQuote\.request_key === requestKey/);
  assert.match(ui,/whatsappQuote\.customer_id === customer\.id/);
  assert.match(ui,/whatsappQuote\.notes/);
  assert.match(ui,/whatsappQuote\.expected_price/);
  assert.match(ui,/quoteRefresh/);
});
test('el servidor guarda cotizaciones con RLS, permisos y auditoría', () => {
  assert.match(sql,/create table if not exists public\.marketplace_admin_whatsapp_quotes/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.marketplace_admin_whatsapp_quotes from public,anon,authenticated/);
  assert.match(sql,/require_project_permission\(target_project_id,'marketplace\.manage'\)/);
  assert.match(sql,/require_project_permission\(target_project_id,'customers\.view'\)/);
  assert.match(sql,/prepared_by uuid not null/);
  assert.match(sql,/accepted_by uuid/);
  assert.match(sql,/sent_by uuid/);
  assert.match(sql,/set status='sent',sent_at=now\(\),sent_by=v_actor/);
  assert.match(sql,/acceptance_excerpt text/);
  assert.match(sql,/status in \('quoted','sent','accepted','published'\)/);
  assert.match(sql,/unique\(project_id,request_key\)/);
  assert.match(sql,/marketplace_admin_test_customers/);
});
test('servidor impide publicar si no se envió, aceptó o la tarifa cambió', () => {
  assert.match(sql,/admin_mark_marketplace_whatsapp_quote_sent/);
  assert.match(sql,/admin_confirm_marketplace_whatsapp_quote/);
  assert.match(sql,/admin_publish_marketplace_whatsapp_accepted_job/);
  assert.match(sql,/v_quote\.status<>'accepted'/);
  assert.match(sql,/v_quote\.accepted_at is null/);
  assert.match(sql,/v_quote\.sent_at is null/);
  assert.match(sql,/v_quote\.quote_expires_at<=now\(\)/);
  assert.match(sql,/round\(v_proof\.recommended_price,2\)<>round\(v_quote\.expected_price,2\)/);
  assert.match(sql,/v_proof\.origin_point<>v_quote\.origin_point/);
  assert.match(sql,/v_proof\.destination_point<>v_quote\.destination_point/);
  assert.match(sql,/public\.admin_publish_marketplace_care_job\(/);
  assert.match(sql,/target_verified_route_id/);
});
test('recupera borradores privados y no guarda mensajes completos', () => {
  assert.match(sql,/admin_list_marketplace_whatsapp_quotes/);
  assert.match(sql,/q\.quote_expires_at>now\(\)/);
  assert.match(ui,/recoverWhatsAppQuote/);
  assert.match(ui,/Cotizaciones pendientes guardadas/);
  assert.doesNotMatch(sql,/whatsapp_raw_message|full_message|source_message/);
});
