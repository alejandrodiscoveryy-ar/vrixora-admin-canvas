import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../src/features/admin/MarketplaceAlliesPanel.tsx", import.meta.url), "utf8");
const card = ui.slice(ui.indexOf("return (\n              <article key={ally.id}"), ui.indexOf("</article>", ui.indexOf("return (\n              <article key={ally.id}")) + 10);
const heading = card.slice(card.indexOf('<button type="button" className="flex min-h-11'), card.indexOf('<div className="flex flex-wrap items-center gap-2">'));

test("Cada tarjeta empieza plegada y conserva su estado individual", () => {
  assert.match(ui, /const \[expandedAllies, setExpandedAllies\] = useState<Set<string>>\(\(\) => new Set\(\)\)/);
  assert.match(ui, /const expanded = expandedAllies\.has\(ally\.id\)/);
  assert.match(ui, /const next = new Set\(current\)/);
  assert.match(ui, /if \(next\.has\(id\)\) next\.delete\(id\)/);
  assert.match(ui, /else next\.add\(id\)/);
  assert.match(card, /data-ally-expanded=\{expanded \? "true" : "false"\}/);
});

test("Nombre y botón desplegable permiten abrir o plegar con teclado y lector de pantalla", () => {
  assert.match(heading, /aria-expanded=\{expanded\}/);
  assert.match(heading, /aria-controls=\{\x60ally-details-\$\{ally\.id\}\x60\}/);
  assert.match(heading, /onClick=\{\(\) => toggleAllyDetails\(ally\.id\)\}/);
  assert.match(heading, /focus-visible:ring-2/);
  assert.match(card, /\{expanded \? "Plegar" : "Detalles"\}/);
  assert.match(card, /<ChevronDown aria-hidden="true"/);
  assert.match(card, /min-h-11/);
  assert.doesNotMatch(heading, /<div\b|<button\b[^>]*[\s\S]*<button\b/);
});

test("La tarjeta cerrada muestra información esencial y oculta los detalles completos", () => {
  assert.match(card, /!expanded && \(/);
  assert.match(card, /visitas · \{Number\(ally\.completed\)\.toLocaleString\("es-CU"\)\} viajes completados · \{cup\(due\)\} por pagar/);
  assert.match(card, /<div id=\{\x60ally-details-\$\{ally\.id\}\x60\} className=\{expanded \? "" : "hidden"\}>/);
  const detailsStart = card.indexOf('id={`ally-details-${ally.id}`}');
  const header = card.slice(0, detailsStart);
  const details = card.slice(detailsStart);
  assert.match(header, /Enlace público/);
  assert.match(header, /Renovar acceso/);
  assert.doesNotMatch(header, /Captación de pasajeros|Registrar pago|Quitar carnet/);
  assert.match(details, /Captación de pasajeros/);
  assert.match(details, /Editar/);
  assert.match(details, /Registrar pago/);
  assert.match(details, /Motivos declarados/);
});

test("Al plegar se cierran formularios de edición/pago sin ejecutar transacciones", () => {
  assert.match(ui, /if \(isFolding\) \{/);
  assert.match(ui, /if \(editing === id\) \{ setEditing\(null\); setEditedIdentityCard\(null\); \}/);
  assert.match(ui, /if \(editingPayment === id\)/);
  assert.match(ui, /setPaymentAmount\(""\)/);
  assert.match(ui, /setPaymentRef\(""\)/);
  assert.match(ui, /if \(saving\) return/);
  assert.match(ui, /void copy\(promo\(ally\.slug\)\)/);
  assert.match(ui, /void rotate\(ally\)/);
  assert.match(ui, /void logPayment\(ally\)/);
  assert.match(ui, /admin_list_marketplace_ally_identity_status_v1/);
});
