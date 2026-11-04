import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { temporalDraftPct, simulateTemporalDraftUsd, roundTemporalDraftCup, isValidHolidayDate } from '../src/lib/smart-pricing-v3-temporal.ts';

const p = {
  vehicle_category_code: 'motorcycle', evening_pct: 5, night_pct: 10,
  dawn_pct: 15, weekend_pct: 5, holiday_pct: 10, max_combined_pct: 40,
  holiday_dates: ['2027-01-01'],
};

test('hora diurna, tarde, noche y madrugada respetan franjas exclusivas', () => {
  assert.equal(temporalDraftPct(p,{hour:10,weekend:false,holiday:false}),0);
  assert.equal(temporalDraftPct(p,{hour:19,weekend:false,holiday:false}),5);
  assert.equal(temporalDraftPct(p,{hour:23,weekend:false,holiday:false}),10);
  assert.equal(temporalDraftPct(p,{hour:2,weekend:false,holiday:false}),15);
  assert.equal(temporalDraftPct(p,{hour:22,weekend:false,holiday:false}),10);
  assert.equal(temporalDraftPct(p,{hour:6,weekend:false,holiday:false}),0);
});

test('fin de semana y festivo se combinan con tope', () => {
  assert.equal(temporalDraftPct(p,{hour:2,weekend:true,holiday:true}),30);
  const limited = {...p,max_combined_pct:20};
  assert.equal(temporalDraftPct(limited,{hour:2,weekend:true,holiday:true}),20);
  assert.equal(simulateTemporalDraftUsd(2,p,{hour:2,weekend:true,holiday:false}),2.4);
});

test('se rechazan horas y fechas inválidas',()=>{
  assert.equal(temporalDraftPct(p,{hour:24,weekend:false,holiday:false}),null);
  assert.equal(temporalDraftPct({...p,dawn_pct:-2},{hour:2,weekend:false,holiday:false}),null);
  assert.equal(isValidHolidayDate('2026-02-30'),false);
  assert.equal(isValidHolidayDate('2027-01-01'),true);
});

test('el simulador convierte USD a CUP y redondea hacia arriba como el motor',()=>{
  assert.equal(roundTemporalDraftCup(2.5,910,100,'up'),2300);
  assert.equal(roundTemporalDraftCup(2.775,910,100,'up'),2600);
  assert.equal(roundTemporalDraftCup(2.775,0,100,'up'),null);
  assert.equal(roundTemporalDraftCup(2.775,910,0,'up'),null);
  assert.equal(roundTemporalDraftCup(2.775,910,100,'nearest'),null);
  assert.equal(roundTemporalDraftCup(null,910,100,'up'),null);
  assert.equal(roundTemporalDraftCup(2.775,Number.NaN,100,'up'),null);
  const ui = readFileSync(new URL('../src/features/admin/MarketplaceTemporalDraftsV3.tsx',import.meta.url),'utf8');
  assert.match(ui,/Estimación con borrador · moneda nacional \(MN\)/);
  assert.match(ui,/roundTemporalDraftCup/);
  assert.match(ui,/admin_get_marketplace_pricing_dashboard/);
});

test('pantalla no publica precios; borradores aislados y permisos server-side',()=>{
  const ui=readFileSync(new URL('../src/features/admin/MarketplaceTemporalDraftsV3.tsx',import.meta.url),'utf8');
  assert.match(ui,/admin_save_marketplace_temporal_draft_v3/);
  assert.match(ui,/admin_list_marketplace_temporal_drafts_v3/);
  assert.doesNotMatch(ui,/admin_publish_marketplace_pricing_adjustment|admin_publish_marketplace_pricing_tariff/);
  const sql=readFileSync(new URL('../supabase/proposals/tuktuk_smart_pricing_temporal_drafts_v3.sql',import.meta.url),'utf8');
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/require_project_permission\(target_project_id,'marketplace.manage'\)/);
  assert.match(sql,/REVOKE ALL ON TABLE .* FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql,/INSERT INTO public\.marketplace_pricing_adjustments|UPDATE public\.marketplace_pricing_adjustments/);
});
