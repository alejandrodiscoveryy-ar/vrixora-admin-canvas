import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('src/features/admin/MarketplaceTestCenterV2.tsx','utf8');
const sql = readFileSync('supabase/migrations/20261106001200_tuktuk_parallel_driver_simulacros.sql','utf8');

test('Difusion individual para todos o por modalidad, sin afectar el grupo antiguo', () => {
  assert.match(ui,/value="cycle_all"/);
  assert.match(ui,/value="cycle_category"/);
  assert.match(ui,/admin_create_marketplace_parallel_test_v1/);
  assert.match(ui,/successCampaignCount/);
  assert.match(ui,/!broadcastMode && \(driversOpen \|\| dirty \|\| !configured\)/);
});

test('Simulacro individual con control administrativo, sin comision real', () => {
  assert.match(sql,/require_project_permission\(target_project_id, 'marketplace\.manage'\)/);
  assert.match(sql,/require_project_permission\(target_project_id, 'settings\.manage'\)/);
  assert.match(sql,/v_actor IS NULL/);
  assert.match(sql,/v_driver\.driver_user_id/);
  assert.match(sql,/FOR v_driver IN/);
  assert.match(sql,/v_driver\.compatible_service/);
  assert.match(sql,/test_force_wallet_commission/);
  assert.match(sql,/target_expected_price,target_expected_price,'CUP',v_commission_rate,true,false/);
  assert.match(sql,/test_driver_user_id/);
  assert.match(sql,/marketplace_test_job_recipients/);
  assert.match(sql,/recipient_count,?1|,1,v_payload_hash/);
  assert.match(sql,/a\.accepting_jobs/);
  assert.doesNotMatch(sql,/AND a\.is_available/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON FUNCTION/);
  assert.match(sql,/TEST_PARALLEL_COOLDOWN/);
});

test('Cada conductor recibe su job independiente y puede cerrar mediante el flujo existente', () => {
  assert.match(sql,/INSERT INTO public\.service_requests/);
  assert.match(sql,/INSERT INTO public\.jobs/);
  assert.match(sql,/INSERT INTO public\.notification_outbox/);
  assert.match(sql,/test_parallel_campaign_id/);
  assert.match(sql,/expires_at=now\(\)\+interval '3 hours'/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.accept_job/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.advance_my_marketplace_job/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION app_private\.finish_marketplace_job_core/);
});

test('El selector inicial muestra solo tres opciones principales', () => {
  assert.match(ui, /\[recipientMode, setRecipientMode\] = useState<[^;]+>\("cycle_all"\)/);
  const primary = ui.match(/Destinatarios\s*<select[\s\S]*?<\/select>/)?.[0];
  assert.ok(primary, 'No se encuentra el selector principal');
  for (const mode of ['individual', 'cycle_all', 'cycle_category']) {
    assert.match(primary, new RegExp(`<option value="${mode}">`));
  }
  for (const legacy of ['group', 'broadcast_all', 'broadcast_category']) {
    assert.doesNotMatch(primary, new RegExp(`<option value="${legacy}">`));
  }
  const advanced = ui.match(/Opciones avanzadas de destinatarios[\s\S]*?<\/details>/)?.[0];
  assert.ok(advanced, 'No se conservan los modos tradicionales');
  for (const legacy of ['group', 'broadcast_all', 'broadcast_category']) {
    assert.match(advanced, new RegExp(`<option value="${legacy}">`));
  }
  assert.match(ui, /legacyRecipientMode \? "advanced" : recipientMode/);
  assert.match(ui, /broadcastMode \? "Destinatarios" : "Conductores del grupo"/);
});
