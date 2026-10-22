import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const files = {
  alert: readFileSync(new URL('../src/features/admin/AdminOperationalAlerts.tsx', import.meta.url),'utf8'),
  push: readFileSync(new URL('../src/lib/admin-push.ts', import.meta.url),'utf8'),
  sw: readFileSync(new URL('../public/sw.js', import.meta.url),'utf8'),
  sql: readFileSync(new URL('../supabase/migrations/20261022203000_admin_operational_push_alerts.sql', import.meta.url),'utf8'),
  worker: readFileSync(new URL('../supabase/functions/send-push-notifications/index.ts', import.meta.url),'utf8'),
};
test('Tono sin bloqueo por visibilidad; vigilancia de carreras pendientes', () => {
  assert.doesNotMatch(files.alert, /document\.visibilityState === "visible"/);
  assert.match(files.alert, /PENDING_THRESHOLD_MS/);
  assert.match(files.alert, /setPending\(currentPending\)/);
  assert.match(files.alert, /recentlyPublished/);
});
test('Firebase web con autorización explícita, RPC existente y ámbito administrativo', () => {
  assert.match(files.push, /Notification\.requestPermission\(\)/);
  assert.match(files.push, /register_my_admin_push_token/);
  assert.match(files.push, /disable_my_admin_push_token/);
  assert.match(files.push, /serviceWorkerRegistration: registration/);
  assert.doesNotMatch(files.push, /(?:"service_role"|private_key\s*:|SUPABASE_SERVICE_ROLE_KEY)/i);
});
test('Worker persistente abre ruta local y evita URLs externas', () => {
  assert.match(files.sw, /messaging\.onBackgroundMessage/);
  assert.match(files.sw, /clients\.openWindow/);
  assert.match(files.sw, /url\.origin === self\.location\.origin/);
  assert.match(files.sw, /requireInteraction/);
});
test('Servidor deduplica alarmas y distingue trabajos de prueba', () => {
  assert.match(files.sql, /on conflict \(project_id,user_id,kind,dedupe_key\) do nothing/);
  assert.match(files.sql, /not j\.is_test/);
  assert.match(files.sql, /if new\.is_test/);
  assert.match(files.sql, /target_audience','admin/);
  assert.match(files.sql, /service_role/);
  assert.doesNotMatch(files.sql, /cron\.schedule/);
});
test('Dispatcher existente contempla las tres categorías y la escalada', () => {
  for(const kind of ['admin_marketplace_new_job','admin_marketplace_new_driver','admin_marketplace_pending_job']) {
    assert.match(files.worker, new RegExp(kind));
  }
  assert.match(files.worker, /enqueue_admin_marketplace_pending_alerts/);
});
