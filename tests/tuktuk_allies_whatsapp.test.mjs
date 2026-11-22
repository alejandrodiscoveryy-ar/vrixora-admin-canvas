import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../src/features/admin/MarketplaceAlliesPanel.tsx", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/migrations/20261122124500_marketplace_allies_whatsapp_private_v1.sql", import.meta.url), "utf8");

test("El gestor puede registrar WhatsApp al crear o editar y mantener el número previo", () => {
  assert.match(ui, /Label htmlFor="ally-whatsapp">WhatsApp de contacto/);
  assert.match(ui, /id="ally-whatsapp" type="tel" inputMode="tel"/);
  assert.match(ui, /value=\{whatsapp\}/);
  assert.match(ui, /admin_create_marketplace_ally_with_contact_v1/);
  assert.match(ui, /admin_update_marketplace_ally_with_contact_v1/);
  assert.match(ui, /target_whatsapp: whatsapp\.trim\(\) \? normalizeAllyWhatsApp\(whatsapp\) : null/);
  assert.match(ui, /target_whatsapp: newWhatsapp\.trim\(\) \? normalizeAllyWhatsApp\(newWhatsapp\) : ""/);
  assert.match(ui, /newWhatsapp: string \| null = null/);
  assert.match(ui, /htmlFor=\{\x60ally-edit-whatsapp-\$\{ally\.id\}\x60\}/);
  assert.match(ui, /editedWhatsapp === null \? "En blanco conserva el contacto actual."/);
  assert.match(ui, /Quitar WhatsApp/);
  assert.match(ui, /onClick=\{\(\) => void update\(ally, ally\.status, editedName, Number\(editedRate\), editedIdentityCard, editedWhatsapp\)\}/);
});

test("El WhatsApp es un botón de contacto disponible sin expandir la ficha", () => {
  const rowStart = ui.indexOf('return (\n              <article key={ally.id}');
  assert.ok(rowStart > -1);
  const row = ui.slice(rowStart, ui.indexOf('</article>', rowStart));
  const detailsStart = row.indexOf('id={`ally-details-${ally.id}`}');
  assert.ok(detailsStart > 0);
  const header = row.slice(0, detailsStart);
  assert.match(header, /canManage && allyPhone/);
  assert.match(header, /https:\/\/wa\.me\/\$\{allyPhone\.slice\(1\)\}/);
  assert.match(header, /target="_blank" rel="noopener noreferrer"/);
  assert.match(header, /Abrir WhatsApp de/);
  assert.match(header, /MessageCircle/);
  assert.match(header, /Enlace público/);
  assert.match(header, /Renovar acceso/);
  assert.match(header, /aria-expanded=\{expanded\}/);
});

test("La lectura del contacto es solo para gerentes y nunca se comparte en enlaces de captación", () => {
  assert.match(ui, /admin_list_marketplace_ally_contacts_v1/);
  assert.match(ui, /enabled: canManage && Boolean\(projectId\)/);
  assert.match(ui, /const allyPhone = canManage \? contactByAlly\.get\(ally\.id\) : undefined/);
  assert.match(ui, /const privateLink = \(secret: string\) => reportBase/);
  assert.match(ui, /El carnet y el WhatsApp son datos de contacto internos/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage/);
  assert.match(sql, /alter table app_private\.marketplace_allies/);
  assert.match(sql, /whatsapp_contact text/);
  assert.match(sql, /perform app_private\.require_project_permission\(target_project_id, 'commercial\.manage'\)/);
  assert.match(sql, /revoke all on function public\.admin_list_marketplace_ally_contacts_v1\(uuid\) from public,anon/);
  assert.match(sql, /grant execute on function public\.admin_list_marketplace_ally_contacts_v1\(uuid\) to authenticated/);
  assert.doesNotMatch(sql, /create or replace function public\.get_marketplace_ally_report/);
});

test("La base de datos valida E.164, preserva transacciones y no audita números de teléfono", () => {
  assert.match(sql, /add constraint marketplace_allies_whatsapp_e164/);
  assert.match(sql, /normalize_marketplace_ally_whatsapp_v1/);
  assert.match(sql, /admin_create_marketplace_ally_with_identity_v1/);
  assert.match(sql, /admin_update_marketplace_ally_with_identity_v1/);
  assert.match(sql, /target_whatsapp is not null/);
  assert.match(sql, /'ally_whatsapp_recorded'/);
  assert.match(sql, /'ally_whatsapp_updated'/);
  assert.match(sql, /'ally_whatsapp_cleared'/);
  assert.match(sql, /jsonb_build_object\('whatsapp_present',/);
  assert.doesNotMatch(sql, /jsonb_build_object\('whatsapp',/);
  assert.match(sql, /begin;[\s\S]+commit;/);
});
