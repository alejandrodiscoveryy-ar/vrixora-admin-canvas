import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const migrationFiles = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter((name) => name.endsWith('_marketplace_job_reminders_60s_3.sql'));
assert.equal(migrationFiles.length, 1, 'debe haber una sola migracion');
const sql = readFileSync(new URL('../supabase/migrations/' + migrationFiles[0], import.meta.url), 'utf8');
const worker = readFileSync(new URL('../supabase/functions/send-push-notifications/index.ts', import.meta.url), 'utf8');
const core = readFileSync(new URL('../supabase/functions/send-push-notifications/core.ts', import.meta.url), 'utf8');
test('reminders: ajustes seguros desactivados, 60s y tres avisos', () => {
  assert.match(sql, /enabled boolean not null default false/);
  assert.match(sql, /interval_seconds integer not null default 60/);
  assert.match(sql, /max_reminders integer not null default 3/);
  assert.match(sql, /15 seconds/);
  assert.match(sql, /initial.sent_at >= cfg.activated_at/);
});
test('reminders: solo carreras reales abiertas, destinatarios iniciales y sin duplicados', () => {
  assert.match(sql, /initial.delivery_status='sent'/);
  assert.match(sql, /j.status='published'/);
  assert.match(sql, /not j.is_test/);
  assert.match(sql, /j.assigned_driver_user_id is null/);
  assert.match(sql, /marketplace_driver_can_receive_job/);
  assert.match(sql, /on conflict \(project_id,user_id,kind,dedupe_key\) do nothing/);
});
test('reminders: guardia de carrera cerrada antes del FCM y canal actual', () => {
  assert.match(worker, /Marketplace job no longer available/);
  assert.match(worker, /const \{ data: liveJob, error: liveJobError \}/);
  assert.match(core, /tuktuk_nuevas_carreras_v1/);
});