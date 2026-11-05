import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('src/features/admin/MarketplaceTestCenterV2.tsx','utf8');
const sql = readFileSync('supabase/migrations/20261105224500_tuktuk_broadcast_working_test_jobs.sql','utf8');

test('Centro de Pruebas: todas las modalidades o modalidad puntual', () => {
  assert.match(ui, /value="broadcast_all"/);
  assert.match(ui, /value="broadcast_category"/);
  assert.match(ui, /admin_create_marketplace_test_broadcast_v1/);
  assert.match(ui, /broadcastMode/);
  assert.match(ui, /setForceRealCommission\(false\)/);
});

test('Difusión exclusivamente administrativa y solo de pruebas', () => {
  assert.match(sql, /require_project_permission\(target_project_id, 'marketplace\.manage'\)/);
  assert.match(sql, /require_project_permission\(target_project_id, 'settings\.manage'\)/);
  assert.match(sql, /public\.marketplace_test_mode/);
  assert.match(sql, /a\.accepting_jobs/);
  assert.doesNotMatch(sql, /a\.is_available/);
  assert.match(sql, /is_test,test_force_wallet_commission,pricing_breakdown/);
  assert.match(sql, /target_expected_price,target_expected_price,'CUP',v_commission_rate,true,false/);
  assert.match(sql, /target_vehicle_category_code IS NULL OR v\.category_code=target_vehicle_category_code/);
  assert.match(sql, /recipient_count BETWEEN 1 AND 10000/);
  assert.match(sql, /TEST_BROADCAST_COOLDOWN/);
});

test('Envío al outbox actual, auditable y sin modificar el radar', () => {
  assert.match(sql, /INSERT INTO public\.marketplace_admin_test_jobs/);
  assert.match(sql, /INSERT INTO public\.marketplace_test_job_recipients/);
  assert.match(sql, /INSERT INTO public\.notification_outbox/);
  assert.match(sql, /ON CONFLICT\(project_id,user_id,kind,dedupe_key\)/);
  assert.match(sql, /PRUEBA TUKTUK/);
  assert.match(sql, /send-push-notifications/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.accept_job/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION app_private\.marketplace_dispatch_candidate_state/);
});
