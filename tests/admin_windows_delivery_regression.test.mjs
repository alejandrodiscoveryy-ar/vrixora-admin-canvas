import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const core = readFileSync('supabase/functions/send-push-notifications/core.ts', 'utf8');
const sw = readFileSync('public/sw.js','utf8');
const push = readFileSync('src/lib/admin-push.ts','utf8');
const panel = readFileSync('src/features/admin/AdminOperationalAlerts.tsx','utf8');

test('Only admin web messages have an OS-displayed notification and safe link', () => {
  assert.match(core, /const adminAlert = ADMIN_WEB_PUSH_KINDS\.has\(notificationKind\)/);
  assert.match(core, /notification:\s*\{\s*title,\s*body,/);
  assert.match(core, /fcm_options:\s*\{\s*link:\s*"https:\/\/admin\.vrixora\.com\/admin\/proyectos\//);
  assert.match(core, /\}\s*:\s*\{\s*headers:\s*\{\s*Urgency:\s*"high"\s*\}\s*\}/);
  assert.match(core, /"tuktuk_nuevas_carreras_v1"/);
});
test('FCM background notification is not displayed twice, fallback remains available', () => {
  assert.match(sw, /if \(payload\.notification\) return;/);
  assert.match(sw, /if \(firebaseMessagingReady\) return;/);
  assert.match(sw, /firebaseMessagingReady = true;/);
  assert.match(sw, /ADMIN_PUSH_KINDS\.has\(data\.kind\)/);
  assert.match(sw, /self\.registration\.showNotification/);
});
test('An operator can distinguish permission from active worker and run a local test', () => {
  assert.match(sw, /VRIXORA_FCM_DIAGNOSTIC/);
  assert.match(push, /export async function checkAdminPushWorker/);
  assert.match(push, /vrixora:push-presentation-error/);
  assert.match(panel, /Probar aviso local/);
  assert.match(panel, /checkAdminPushWorker/);
  assert.match(panel, /showNotification\("PRUEBA LOCAL/);
});
