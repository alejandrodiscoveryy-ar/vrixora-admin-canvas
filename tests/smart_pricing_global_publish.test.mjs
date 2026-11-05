import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261105154000_marketplace_global_pricing_atomic.sql',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/features/admin/MarketplacePricingGlobalAdjustment.tsx',import.meta.url),'utf8');
const section=readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx',import.meta.url),'utf8');
test('actualizacion atómica, preflight, permiso exacto, bloqueo y reversión segura',()=>{
  assert.match(sql,/admin_apply_marketplace_global_adjustment/);
  assert.match(sql,/admin_preview_marketplace_global_adjustment/);
  assert.match(sql,/admin_revert_marketplace_global_adjustment/);
  assert.match(sql,/admin_list_marketplace_global_adjustments/);
  assert.match(sql,/require_project_permission\(target_project_id,'marketplace\.pricing\.manage'\)/);
  assert.match(sql,/lock table public\.marketplace_pricing_tariffs in share row exclusive mode/);
  assert.match(sql,/GLOBAL_PRICING_STALE_PREVIEW/);
  assert.match(sql,/GLOBAL_PRICING_REVERT_CONFLICT/);
  assert.match(sql,/'entries',rows/);
  assert.match(sql,/t\.version='global-'\|\|target_batch_id::text/);
  assert.match(panel,/samePrices/);
  assert.match(sql,/marketplace_global_apply/);
  assert.match(sql,/marketplace_global_revert/);
  assert.match(sql,/from public,anon/);
  assert.match(sql,/to authenticated/);
});
test('desplegar la migración es inerte: no contiene datos actualizados fuera de funciones',()=>{
  assert.doesNotMatch(sql.split('create or replace function')[0],/^\s*update\s+public\.marketplace_pricing_tariffs/gmi);
  assert.match(sql,/create or replace function public\.admin_apply/);
});
test('publicacion exige preflight + palabra de confirmacion + saldo y rol correcto',()=>{
  assert.match(panel,/admin_preview_marketplace_global_adjustment/);
  assert.match(panel,/admin_apply_marketplace_global_adjustment/);
  assert.match(panel,/admin_revert_marketplace_global_adjustment/);
  assert.match(panel,/confirmation\.trim\(\)/);
  assert.match(panel,/APLICAR/);
  assert.match(panel,/REVERTIR/);
  assert.match(panel,/isVerified/);
  assert.match(section,/canManage=\{permissions\.includes\("marketplace\.pricing\.manage"\)\}/);
  assert.match(section,/projectId=\{projectId\}/);
});
