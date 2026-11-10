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
  assert.match(ui,/Solicitudes en espera/);
  assert.doesNotMatch(sql,/whatsapp_raw_message|full_message|source_message/);
});

test('flujo en cuatro etapas y publicación junto a cotización', () => {
  const a = ui.indexOf('01 · Recibir solicitud');
  const b = ui.indexOf('02 · Identificar cliente');
  const c = ui.indexOf('03 · Ruta y vehículo');
  const d = ui.indexOf('04 · Cotizar, aceptar y publicar');
  const publish = ui.lastIndexOf('Publicar carrera real');
  assert.ok(a >= 0 && b > a && c > b && d > c && publish > d);
  assert.match(ui,/aria-label="Confirmar publicación de la carrera"/);
  assert.match(ui,/!whatsappMode \|\| acceptedWhatsAppQuote/);
  assert.match(ui,/onClick={confirmPublish}/);
});

test('ajustes Lite en pestaña independiente y métricas de flota secundarias', () => {
  assert.match(ui,/role="tablist" aria-label="Secciones de Atención al cliente"/);
  assert.match(ui,/id="care-requests-tab" role="tab" aria-controls="care-requests-panel"/);
  assert.match(ui,/id="care-lite-settings-tab" role="tab" aria-controls="care-lite-settings-panel"/);
  assert.match(ui,/id="care-requests-panel" role="tabpanel" aria-labelledby="care-requests-tab"/);
  assert.match(ui,/id="care-lite-settings-panel" role="tabpanel" aria-labelledby="care-lite-settings-tab"/);
  assert.match(ui,/Configuración del canal WhatsApp Lite/);
  assert.match(ui,/<summary[^>]*>Estado de la flota<\/summary>/);
  assert.match(ui,/Solicitudes en espera \(\{pendingWhatsAppQuotes\.data\.length\}\)/);
  assert.ok(ui.indexOf('id="care-lite-settings-panel"')
    > ui.indexOf('Publicar carrera real'));
  assert.ok(ui.indexOf('Estado de la flota') > ui.indexOf('Mapa interactivo de solicitud para cliente'));
  assert.doesNotMatch(ui,/Configuración del canal WhatsApp Lite · Administración/);
});

test('pestañas no reinician solicitudes ni desmontan los paneles al cambiar', () => {
  assert.match(ui,/useState<"requests" \| "lite-settings">\("requests"\)/);
  assert.match(ui,/onClick=\{\(\) => setCareTab\("requests"\)\}/);
  assert.match(ui,/onClick=\{\(\) => setCareTab\("lite-settings"\)\}/);
  assert.match(ui,/className=\{careTab === "requests" \? "grid/);
  assert.match(ui,/className=\{careTab === "lite-settings" \? "relative overflow-hidden rounded/);
  assert.match(ui,/aria-selected=\{careTab === "requests"\}/);
  assert.match(ui,/aria-selected=\{careTab === "lite-settings"\}/);
  assert.match(ui,/onKeyDown=\{onCareTabKeyDown\}/);
  assert.match(ui,/if \(!canManageContact && careTab !== "requests"\)/);
  assert.match(ui,/\{canManageContact \? \(\s*<button type="button" id="care-lite-settings-tab"/);
  assert.doesNotMatch(ui,/onClick=\{\(\) => \{ reset\(\); setCareTab/);
});


test('profundidad discreta con marcas de agua decorativas y contenido por encima', () => {
  assert.match(ui,/<Headphones aria-hidden="true" className="pointer-events-none absolute/);
  assert.match(ui,/<MessageCircle aria-hidden="true" className="pointer-events-none absolute/);
  assert.match(ui,/<UserRound aria-hidden="true" className="pointer-events-none absolute/);
  assert.match(ui,/<Route aria-hidden="true" className="pointer-events-none absolute/);
  assert.match(ui,/<ShieldCheck aria-hidden="true" className="pointer-events-none absolute/);
  assert.match(ui,/relative z-10/);
  assert.match(ui,/ring-1 ring-inset/);
  assert.match(ui,/shadow-\[0_16px_45px/);
});

test('tipografía y campos principales legibles; mapa y cotización conservan sus controles', () => {
  assert.match(ui,/text-xl font-bold tracking-tight text-foreground/);
  assert.match(ui,/className="h-11 border-violet-300\/20/);
  assert.match(ui,/className="h-11 border-teal-300\/20/);
  assert.match(ui,/text-lg font-semibold tabular-nums text-foreground/);
  assert.match(ui,/onClick=\{confirmPublish\}/);
  assert.match(ui,/onClick=\{\(\) => setCareTab\("lite-settings"\)\}/);
  assert.match(ui,/MarketplaceTestRouteMap/);
  assert.match(ui,/target_expected_price: verifiedPrice/);
});
