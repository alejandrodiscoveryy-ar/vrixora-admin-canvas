import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const analytics = readFileSync(new URL("../src/features/admin/MarketplaceImpulsaCommunicationAnalytics.tsx", import.meta.url), "utf8");
const comercial = readFileSync(new URL("../src/features/admin/ComercialSection.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/lib/services/supabase.ts", import.meta.url), "utf8");
const first = analytics.indexOf("return <article key={x.driver_user_id}");
const last = analytics.indexOf("</article>", first);
const card = analytics.slice(first, last);
const main = card.slice(0, card.indexOf("hidden={!open}"));

test("Usa teléfonos del directorio existente, sin duplicar datos", () => {
  assert.match(analytics, /supabaseServices\.marketplace\.listDrivers\(projectId, \{ limit: 200, cursor \}\)/);
  assert.match(service, /rpc\("admin_list_marketplace_drivers"/);
  assert.match(service, /phone: r\.phone \? String\(r\.phone\) : null/);
  assert.match(analytics, /const pending = new Set\(promoterIds\)/);
  assert.match(analytics, /if \(!pending\.has\(driver\.userId\)\) continue/);
  assert.match(analytics, /contacts\[driver\.userId\] = normalized/);
  assert.match(analytics, /IMPULSA_CONTACT_PAGINATION_INVALID/);
  assert.doesNotMatch(analytics, /\.from\("profiles"\)|\.from\("driver_profiles"\)/);
});

test("Valida el teléfono, acepta móvil cubano y E164, sin inventar contactos", () => {
  assert.match(analytics, /normalizeImpulsaDriverWhatsApp\(phone: string \| null\): string \| null/);
  assert.match(analytics, /return "53" \+ digits/);
  assert.match(analytics, /if \(\/\^535/);
  assert.match(analytics, /raw\.startsWith\("\+"\)/);
  assert.match(analytics, /return null;/);
  assert.match(analytics, /const phone=canManage \? contacts\.data\?\.\[x\.driver_user_id\] : undefined/);
});

test("WhatsApp está en la ficha cerrada, fuera del control para desplegar", () => {
  assert.ok(first > 0 && last > first);
  assert.match(main, /canManage && phone &&/);
  assert.ok(main.includes("https://wa.me/"));
  assert.match(main, /target="_blank" rel="noopener noreferrer"/);
  assert.ok(main.includes("Abrir WhatsApp de"));
  assert.match(main, /MessageCircle/);
  assert.ok(main.indexOf("</button>") < main.indexOf("<a href="), "El enlace no debe anidarse en el botón");
  assert.match(main, /aria-expanded=\{open\}/);
  assert.ok(main.includes('"Plegar":"Detalles"'));
  assert.match(main, /min-h-11/);
  assert.match(main, /border-emerald-400\/25/);
});

test("La consulta de contactos exige gestión comercial y permiso operativo", () => {
  assert.match(comercial, /canManage=\{canManage && permissions\.includes\("marketplace\.view"\)\}/);
  assert.match(analytics, /enabled:canManage && query\.isSuccess && promoterIds\.length>0/);
  assert.ok(analytics.includes('queryKey:["impulsa-driver-contacts",projectId,promoterIds.join("|")]'));
  assert.match(analytics, /admin_get_marketplace_impulsa_communications_v1/);
  assert.doesNotMatch(analytics, /admin_update_marketplace_driver|admin_save_marketplace/);
});
