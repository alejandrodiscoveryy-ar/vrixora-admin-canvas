import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const alerts = readFileSync(new URL('../src/features/admin/AdminOperationalAlerts.tsx', import.meta.url),'utf8');
const push = readFileSync(new URL('../src/lib/admin-push.ts', import.meta.url),'utf8');
const worker = readFileSync(new URL('../supabase/functions/send-push-notifications/index.ts', import.meta.url),'utf8');
test('La llegada se registra una vez y con ID diferente de nueva carrera',()=>{
 assert.ok(alerts.includes('job.status === "pickup"'));
 assert.ok(alerts.includes("const arrivalKey = `arrival:${job.jobId}`;"));
 assert.ok(alerts.includes('message.kind === "admin_marketplace_pickup" ? "arrival"'));
});
const migration = readFileSync(
  new URL('../supabase/migrations/20261104224000_tuktuk_gps_pickup_admin_notice.sql',
  import.meta.url),'utf8');

test('GPS conserva la primera lectura valida',()=>{
  assert.match(migration,/create table app_private\.marketplace_arrival_proximity/);
  assert.match(migration,/first_captured_at/);
  assert.match(migration,/new\.captured_at < first_seen_at \+ interval '12 seconds'/);
  assert.doesNotMatch(migration,/new\.captured_at - old\.captured_at < interval '12 seconds'/);
});

test('FCM Admin admite recogida',()=>{
 assert.ok(push.includes("admin_marketplace_pickup"));
 assert.ok(worker.includes("admin_marketplace_pickup"));
});
