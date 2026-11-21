import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relative) {
  return readFileSync(new URL("../src/features/admin/" + relative, import.meta.url), "utf8");
}

const panel = source("MarketplaceSection.tsx");
const listPrimitives = source("MarketplaceListPrimitives.tsx");
const fleet = source("MarketplaceFleetPulse.tsx");
const radar = source("MarketplaceRadarReadinessCard.tsx");
const care = source("MarketplaceCustomerCareWorkspace.tsx");
const settings = source("MarketplaceConfigurationWorkspace.tsx");

test("Pulso móvil muestra métricas críticas en dos columnas y permite abrir el resto", () => {
  assert.match(panel, /relative grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4/);
  assert.match(panel, /const \[showAllPulseMetrics, setShowAllPulseMetrics\] = useState\(false\)/);
  assert.match(panel, /aria-expanded=\{showAllPulseMetrics\}/);
  assert.match(panel, /Ver todos los indicadores/);
  assert.match(panel, /Mostrar indicadores principales/);
  // Pulse intentionally no longer imposes 174px cards; it uses the compact shared KPI contract.
  const pulse = panel.slice(panel.indexOf('aria-label="Indicadores operativos de Pulso"'), panel.indexOf("<MarketplaceFleetPulse"));
  assert.match(pulse, /<MetricCard[\s\S]*?density="compact"[\s\S]*?appearance="premium"/);
  assert.doesNotMatch(pulse, /sm:min-h-\[174px\]/);
  assert.match(pulse, /value=\{overview\.isError \? "—" : Number\(value \?\? 0\)\}/);
  assert.match(pulse, /isLoading=\{overview\.isLoading\}/);
  assert.match(panel, /label: "Incidencias abiertas"/);
  assert.match(panel, /!\(Number\(overview\.data\?\.pendingTopups \?\? 0\) > 0\)/);
  assert.match(panel, /hidden sm:block/);
});

test("Las operaciones conservan todos sus accesos y controles", () => {
  for (const tab of ["resumen", "trabajos", "atencion", "mapa", "conductores", "clientes", "billeteras", "recargas", "incidencias", "configuracion"]) {
    assert.ok(panel.includes('value="' + tab + '"'), "Pestaña faltante: " + tab);
  }
  for (const method of ["setDriver360Id", "setCustomerId", "setJobId", "setIncidentState", "setTopupStatus", "setExpandedOperationId"]) {
    assert.ok(panel.includes(method), "Acción faltante: " + method);
  }
  assert.match(panel, /grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap/);
  // El filtro móvil reside ahora en su componente visual reutilizable.
  assert.match(listPrimitives, /sm:min-w-52/);
  assert.match(panel, /<FilterSelect/);
  // Shared compact directory: status filters wrap and keep their existing action.
  const topups = panel.slice(panel.indexOf('<TabsContent value="recargas"'), panel.indexOf('<TabsContent value="incidencias"'));
  assert.match(topups, /flex min-w-0 flex-wrap items-center gap-1\.5/);
  assert.match(topups, /className="marketplace-record-filter min-h-11 sm:min-h-8"/);
  assert.match(topups, /variant=\{topupStatus === value \? "default" : "ghost"\}/);
  assert.match(topups, /aria-pressed=\{topupStatus === value\}/);
  assert.match(topups, /onClick=\{\(\) => setTopupStatus\(value\)\}/);
  for (const value of ["Pendientes", "Confirmadas", "Conciliadas", "Rechazadas"]) assert.ok(topups.includes(value));
  assert.doesNotMatch(topups, /overflow-x-auto overscroll-x-contain/);
  const customers = panel.slice(panel.indexOf('<TabsContent value="clientes"'), panel.indexOf('<TabsContent value="billeteras"'));
  assert.match(customers, /data-marketplace-record="customer"/);
  assert.match(customers, /labelText="Trabajos" value=\{customer\.jobsTotal\}/);
  assert.match(customers, /customer\.jobsActive.*customer\.jobsSettled/);
  assert.match(panel, /break-words text-sm font-semibold tabular-nums/);
  assert.match(panel, /rounded-2xl border p-3 sm:p-4/);
});

test("Flota, radar, atención y configuración usan estructuras móviles compactas", () => {
  assert.match(fleet, /relative grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4/);
  assert.match(fleet, /aria-expanded=\{active\}/);
  assert.match(fleet, /onOpenDriver\(person\.userId\)/);
  assert.match(radar, /rounded-\[18px\].*sm:p-3\.5/);
  assert.match(radar, /grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5/);
  assert.match(care, /min-w-0 space-y-3 sm:space-y-4/);
  assert.match(care, /data-testid="customer-care-workspace"/);
  assert.match(care, /Publicar carrera real/);
  assert.match(settings, /grid grid-cols-2 gap-1\.5 sm:grid-cols-4/);
  assert.match(settings, /premiumColumnHeaderSurface/);
  assert.doesNotMatch(settings, /xl:grid-cols-\[252px_minmax/);
  assert.match(settings, /min-h-11/);
  assert.match(settings, /canManageSettings && canManageMarketplace/);
  assert.doesNotMatch(settings, /sm:p-2\.5-\[/);
});

test("Las recargas resueltas ofrecen WhatsApp con datos reales y envío manual", () => {
  const topups = panel.slice(panel.indexOf('<TabsContent value="recargas"'), panel.indexOf('<TabsContent value="incidencias"'));
  assert.match(topups, /\["confirmed", "reconciled", "rejected"\]\.includes\(item\.status\)/);
  assert.match(topups, /driverWhatsAppLinks\(\s*item\.driverPhone,\s*topupWhatsAppMessage\(item, paymentMethodLabel\(item\.method\), receipt\?\.documentNumber\)/);
  assert.match(topups, /href=\{notificationLink\.desktop\}/);
  assert.match(topups, /Notificar por WhatsApp/);
  assert.doesNotMatch(topups, /href=\{notificationLink\.web\}/);
  assert.doesNotMatch(topups, /target="_blank"/);
  assert.match(panel, /item\.rejectionReason \? \[`⚠️ \*Motivo:\* \$\{item\.rejectionReason\}`\]/);
  assert.match(panel, /receiptNumber \? \[`🧾 \*Comprobante:\* \$\{receiptNumber\}`\]/);
  assert.match(panel, /"🛺 \*Agencia TukTuk\*"/);
  assert.match(panel, /"✅ \*Recarga confirmada\*"/);
  assert.match(panel, /"❌ \*Recarga rechazada\*"/);
  assert.match(panel, /`💰 \*Importe:\* \$\{formatAmount\(item\.amount, item\.currency\)\}`/);
  assert.match(panel, /formatCustomerDateTime\(handledAt\)/);
  assert.doesNotMatch(topups, /navigator\.share\(/);
});

test("Recargas permite configurar cuenta receptora independiente de WhatsApp", () => {
  const payments = readFileSync(new URL("../src/features/admin/MarketplaceTopupPaymentDestination.tsx", import.meta.url), "utf8");
  const topupsView = panel.slice(panel.indexOf('<TabsContent value="recargas"'), panel.indexOf('<TabsContent value="incidencias"'));
  const walletsView = panel.slice(panel.indexOf('<TabsContent value="billeteras"'), panel.indexOf('<TabsContent value="recargas"'));
  assert.match(topupsView, /<MarketplaceTopupPaymentDestination/);
  assert.doesNotMatch(walletsView, /<MarketplaceTopupPaymentDestination/);
  assert.match(panel, /canManagePayments\s*\?\s*\(/);
  assert.match(payments, /admin_get_marketplace_topup_payment_destination/);
  assert.match(payments, /admin_set_marketplace_topup_payment_destination/);
  for (const field of ["topup-destination-card", "topup-destination-phone", "topup-destination-whatsapp"]) {
    assert.ok(payments.includes(field), "Falta el campo: " + field);
  }
  assert.match(payments, /target_payment_phone: normalizedPaymentPhone/);
  assert.match(payments, /target_whatsapp_phone: normalizedWhatsappPhone/);
  assert.match(payments, /cardValid && paymentPhoneValid && whatsappPhoneValid && pairComplete/);
  assert.match(payments, /tu billetera se acreditará únicamente cuando confirmemos la recepción del dinero/i);
});

test("Recargas pendientes de transferencia envían datos guardados a WhatsApp Desktop", () => {
  const topups = panel.slice(panel.indexOf('<TabsContent value="recargas"'), panel.indexOf('<TabsContent value="incidencias"'));
  assert.match(topups, /item\.status === "requested" && item\.method === "transfer"/);
  assert.match(topups, /topupPaymentInstructionsMessage\(item\.driverDisplayName/);
  assert.match(topups, /href=\{instructionLink\.desktop\}/);
  assert.match(topups, /Enviar datos de pago/);
  assert.match(topups, /Configura la tarjeta y el teléfono arriba, en Datos para recibir recargas/);
});

test("Mensaje de recarga evita duplicar WhatsApp cuando coincide con teléfono de tarjeta", () => {
  const payments = readFileSync(new URL("../src/features/admin/MarketplaceTopupPaymentDestination.tsx", import.meta.url), "utf8");
  const message = payments.slice(payments.indexOf("export function topupPaymentInstructionsMessage("), payments.indexOf("export function MarketplaceTopupPaymentDestination("));
  assert.match(message, /const sameWhatsAppNumber =/);
  assert.match(message, /destination\.whatsappPhone\.replace\(\s*\/\\D\/g,\s*""\)/);
  assert.match(message, /destination\.paymentPhone\.replace\(\s*\/\\D\/g,\s*""\)/);
  assert.match(message, /const separateWhatsAppNumber = Boolean\(destination\.whatsappPhone\) && !sameWhatsAppNumber/);
  assert.match(message, /\.\.\.\(separateWhatsAppNumber/);
  assert.match(message, /respondiendo a este chat/);
});
