import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL("../src/features/admin/" + file, import.meta.url), "utf8");
const chooser = source("ImpulsaWhatsAppOpenChooser.tsx");
const shared = source("AdminWhatsAppOpenChooser.tsx");
const urls = readFileSync(new URL("../src/lib/driver-whatsapp.ts", import.meta.url), "utf8");
const surfaces = [
  "Cliente360Section.tsx",
  "MarketplaceSection.tsx",
  "MarketplaceDriver360Record.tsx",
  "MarketplaceOperationalMap.tsx",
  "MarketplaceAlliesPanel.tsx",
  "MarketplaceCustomerCareWorkspace.tsx",
  "MarketplaceImpulsaCommunicationAnalytics.tsx",
  "MarketplaceDriverPromotionPreview.tsx",
  "PreinvoiceBillingDialog.tsx",
  "ChargePlanDialog.tsx",
];
test("Selector compartido presenta explícitamente Aplicación y WhatsApp Web", () => {
  assert.match(chooser, /¿Cómo quieres abrir WhatsApp\?/);
  assert.match(chooser, /Abrir aplicación/);
  assert.match(chooser, /Abrir WhatsApp Web/);
  assert.match(chooser, /href=\{links\.desktop\}/);
  assert.match(chooser, /href=\{links\.web\} target="_blank" rel="noopener noreferrer"/);
  assert.match(chooser, /<DialogTrigger asChild>/);
  assert.match(chooser, /<DialogContent/);
  assert.match(chooser, /El mensaje no se enviará hasta que tú lo confirmes/);
  assert.match(shared, /export \{ default \} from "\.\/ImpulsaWhatsAppOpenChooser"/);
  assert.match(urls, /whatsapp:\/\/send\?phone=/);
  assert.match(urls, /https:\/\/web\.whatsapp\.com\/send\?phone=/);
  assert.match(urls, /export function whatsappMessageLinks/);
  assert.match(urls, /whatsapp:\/\/send\?text=/);
  assert.match(urls, /https:\/\/web\.whatsapp\.com\/send\?text=/);
});

test("Ninguna pantalla de contacto abre WhatsApp directamente, conservando flujos existentes", () => {
  for (const file of surfaces) {
    const code = source(file);
    assert.match(code, /WhatsAppOpenChooser/, file + " no usa selector");
    assert.doesNotMatch(code, /https:\/\/wa\.me\/|https:\/\/web\.whatsapp\.com\/|whatsapp:\/\/send/, file + " abre WhatsApp directamente");
    assert.doesNotMatch(code, /href=\{(?:whatsapp|whatsApp|notificationLink|instructionLink|quoteWhatsAppLink|whatsappQuestionLink)\.(?:web|desktop)\}/, file);
  }
  assert.doesNotMatch(source("MarketplaceOperationalMap.tsx"), /window\.open\(whatsappUrl/);
  assert.match(source("MarketplaceSection.tsx"), /topupPaymentInstructionsMessage/);
  assert.match(source("MarketplaceSection.tsx"), /topupWhatsAppMessage/);
  assert.match(source("MarketplaceSection.tsx"), /driverWelcomeMessage\(item\.displayName\)/);
  assert.match(source("MarketplaceSection.tsx"), /onChooseApplication=\{welcomeDrivers/);
  assert.match(source("MarketplaceCustomerCareWorkspace.tsx"), /onChoose=\{\(\) => setWhatsappOpened\(true\)\}/);
  assert.match(source("MarketplaceCustomerCareWorkspace.tsx"), /markWhatsAppQuoteSent\.mutate\(\)/);
  assert.match(source("PreinvoiceBillingDialog.tsx"), /onChoose=\{\(\) => \{ void share\(\); \}\}/);
  assert.match(source("ChargePlanDialog.tsx"), /navigator\.share/);
});

test("Hay una elección explícita en cada ruta de contacto de Cliente, Conductor y Aliados", () => {
  assert.match(source("Cliente360Section.tsx"), /driverName=\{data\.client\.displayName/);
  assert.match(source("MarketplaceSection.tsx"), /links=\{whatsapp\}/);
  assert.match(source("MarketplaceSection.tsx"), /links=\{instructionLink\}/);
  assert.match(source("MarketplaceSection.tsx"), /links=\{notificationLink\}/);
  assert.match(source("MarketplaceDriver360Record.tsx"), /links=\{whatsApp\}/);
  assert.match(source("MarketplaceOperationalMap.tsx"), /links=\{customerWhatsApp\}/);
  assert.match(source("MarketplaceAlliesPanel.tsx"), /links=\{driverWhatsAppLinks\(allyPhone\)!\}/);
  assert.match(source("MarketplaceCustomerCareWorkspace.tsx"), /links=\{quoteWhatsAppLink\}/);
  assert.match(source("MarketplaceCustomerCareWorkspace.tsx"), /links=\{whatsappQuestionLink\}/);
  assert.match(source("MarketplaceImpulsaCommunicationAnalytics.tsx"), /<ImpulsaWhatsAppOpenChooser/);
  assert.match(source("MarketplaceDriverPromotionPreview.tsx"), /<ImpulsaWhatsAppOpenChooser/);
});

test("Ni el selector ni el mensaje presuponen que abrir equivale a enviar", () => {
  assert.doesNotMatch(chooser, /fetch\(|navigator\.share\(|sendMessage\(|autoSend/);
  assert.match(chooser, /onChooseApplication\?\.\(\)/);
  assert.match(chooser, /onChoose\?\.\(\)/);
  assert.match(source("MarketplaceCustomerCareWorkspace.tsx"), /¿Enviaste realmente esta cotización al cliente por WhatsApp\?/);
});
