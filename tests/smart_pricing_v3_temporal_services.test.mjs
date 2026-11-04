import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const view=readFileSync(new URL('../src/features/admin/MarketplaceTemporalDraftsV3.tsx',import.meta.url),'utf8');
const section=readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/proposals/tuktuk_smart_pricing_temporal_cargo_courier_v3.sql',import.meta.url),'utf8');

test('borradores aislados por servicio, incluso bicicleta',()=>{
  assert.match(view,/target_service_code:serviceCode/);
  assert.match(view,/serviceCode===serviceCode/);
  assert.match(view,/admin_save_marketplace_temporal_draft_v3_service/);
  assert.match(view,/admin_list_marketplace_temporal_drafts_v3_service/);
  assert.match(section,/serviceCode=\{selectedService\}/);
  assert.match(section,/courierCategories = \["bicycle",\.\.\.cargoCategories\]/);
  assert.match(section,/selectedService === "cargo" \? cargoCategories : courierCategories/);
});
test('SQL de propuesta exige permisos y nunca activa cargos',()=>{
  assert.match(sql,/require_project_permission\(target_project_id,'marketplace\.view'\)/);
  assert.match(sql,/require_project_permission\(target_project_id,'marketplace\.manage'\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION/);
  assert.match(sql,/service_code IN \('passenger','cargo','courier'\)/);
  assert.match(sql,/INSERT INTO public\.marketplace_pricing_temporal_drafts_v3/);
  assert.doesNotMatch(sql,/INSERT INTO public\.marketplace_pricing_tariffs|UPDATE public\.marketplace_pricing_adjustments/);
  assert.match(sql,/ON CONFLICT \(project_id, service_code, vehicle_category_code\) DO NOTHING/);
});

test('no permite guardar un borrador hasta terminar la carga',()=>{
  assert.match(view,/!drafts\.isSuccess\|\|!current/);
  assert.match(view,/\[category,current,serviceCode\]/);
});