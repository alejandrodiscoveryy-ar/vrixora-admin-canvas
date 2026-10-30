import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync('supabase/migrations/20261030223000_marketplace_lite_contact_hours.sql','utf8');
const card=readFileSync('src/features/admin/MarketplaceLiteContactCard.tsx','utf8');
const marketplace=readFileSync('src/features/admin/MarketplaceSection.tsx','utf8');
test('conserva soporte existente y horario desactivado por defecto',()=>{
  assert.match(sql,/alter table public\.project_whatsapp_settings/);
  assert.match(sql,/lite_hours_enabled boolean not null default false/);
  assert.match(sql,/support_number=clean_number/);
  assert.match(sql,/lite_enabled=coalesce\(target_lite_enabled,false\)/);
  assert.doesNotMatch(sql,/\s+support_enabled=coalesce\(target_lite_enabled/);
  assert.match(sql,/set lite_enabled=s\.support_enabled/);
  assert.match(sql,/p\.slug='tuktuk-control'/);
  assert.doesNotMatch(sql,/update public\.projects set whatsapp/);
});
test('consulta publica habilita solo dentro de horario de La Habana',()=>{
  assert.match(sql,/create or replace function public\.get_public_whatsapp_settings/);
  assert.match(sql,/extract\(isodow from \(now\(\) at time zone 'America\/Havana'\)\)/);
  assert.match(sql,/lite_hours_open/);
  assert.match(sql,/lite_hours_close/);
  assert.match(sql,/not s\.lite_hours_enabled/);
  assert.match(sql,/'payment',jsonb_build_object/);
});
test('RPC de escritura exige permiso existente y conserva auditoria',()=>{
  assert.match(sql,/app_private\.require_project_permission\(target_project_id,'whatsapp_settings\.manage'\)/);
  assert.match(sql,/revoke all on function public\.admin_update_marketplace_lite_contact/);
  assert.match(sql,/to authenticated/);
  assert.match(sql,/updated_by=actor/);
  assert.match(sql,/version=version\+1/);
});
test('tarjeta se muestra en Trabajos, con control real y dias',()=>{
  assert.match(marketplace,/MarketplaceLiteContactCard/);
  assert.match(marketplace,/value="trabajos"/);
  assert.match(card,/admin_get_marketplace_lite_contact/);
  assert.match(card,/admin_update_marketplace_lite_contact/);
  assert.match(card,/Habilitar Lite/);
  assert.match(card,/Horario automático de atención/);
  assert.match(card,/target_days/);
  assert.match(card,/timeZone: "America\/Havana"/);
});
