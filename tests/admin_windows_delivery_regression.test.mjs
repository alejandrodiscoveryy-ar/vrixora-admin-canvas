import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const core = readFileSync('supabase/functions/send-push-notifications/core.ts', 'utf8');
const sw = readFileSync('public/sw.js','utf8');
const push = readFileSync('src/lib/admin-push.ts','utf8');
const panel = readFileSync('src/features/admin/AdminOperationalAlerts.tsx','utf8');
const header = readFileSync('src/routes/admin.tsx','utf8');
const projectLayout = readFileSync('src/routes/admin.proyectos.$id.tsx','utf8');

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
test('An operator can distinguish permission and active worker without redundant local button', () => {
  assert.match(sw, /VRIXORA_FCM_DIAGNOSTIC/);
  assert.match(push, /export async function checkAdminPushWorker/);
  assert.match(push, /vrixora:push-presentation-error/);
  assert.match(panel, /checkAdminPushWorker/);
  assert.doesNotMatch(panel, /Probar aviso local|testLocalWindowsNotification/);
});
test('Alarm center lives in header bell without losing authenticated project protection', () => {
  assert.match(header, /id="vrixora-admin-operational-alarm-slot"/);
  assert.match(projectLayout, /permissions\.includes\("marketplace\.view"\)/);
  assert.match(panel, /createPortal\(/);
  assert.match(panel, /<PopoverTrigger asChild>/);
  assert.match(panel, /<PopoverContent/);
  assert.match(panel, /setInterval\(\(\) => void check\(\), POLL_INTERVAL_MS\)/);
});

test('A refreshed worker activates for existing Admin tabs without stale cache', () => {
  assert.match(sw, /const CACHE_VERSION = "v4"/);
  assert.match(sw, /\.then\(\(\) => self\.skipWaiting\(\)\)/);
  assert.doesNotMatch(sw, /if \(!self\.registration\.active\) self\.skipWaiting/);
});

test('operational alert tone is stronger while melody and durations remain unchanged', () => {
  const start = panel.indexOf('function tone(');
  const end = panel.indexOf('function dateLabel(');
  assert.ok(start >= 0 && end > start, 'The expected tone function must exist');
  const tone = panel.slice(start, end);
  assert.match(tone, /exponentialRampToValueAtTime\(0\.28, at \+ 0\.025\)/);
  assert.doesNotMatch(tone, /exponentialRampToValueAtTime\(0\.085, at \+ 0\.025\)/);
  assert.match(tone, /\[523, 659\]/);
  assert.match(tone, /\[659, 659, 784, 659\]/);
  assert.match(tone, /\[784, 988, 784\]/);
  assert.match(tone, /oscillator\.stop\(at \+ 0\.15\)/);
});
