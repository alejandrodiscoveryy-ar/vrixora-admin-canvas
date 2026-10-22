import fs from 'node:fs';
import assert from 'node:assert/strict';

// Fail-closed and cross-platform (Windows CRLF and Linux LF).
const path = 'supabase/functions/send-push-notifications/index.ts';
const original = fs.readFileSync(path, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
const allowed = ['  "marketplace_job_available",', '];'].join(eol);
const expanded = [
  '  "marketplace_job_available",',
  '  "admin_marketplace_new_job",',
  '  "admin_marketplace_new_driver",',
  '  "admin_marketplace_pending_job",',
  '];',
].join(eol);
const anchor = '    const summary = {';
const pendingCode = [
  '    // Enqueue escalations using the existing push dispatcher; no parallel cron.',
  '    const { error: pendingAlarmError } = await admin.rpc("enqueue_admin_marketplace_pending_alerts", {',
  '      target_project_id: PROJECT_ID,',
  '    });',
  '    if (pendingAlarmError) console.warn("Admin pending-job alarm enqueue failed:", pendingAlarmError.code);',
  '',
  '    const summary = {',
].join(eol);
const count = (haystack, needle) => haystack.split(needle).length - 1;

if (original.includes('"admin_marketplace_pending_job"') || original.includes('enqueue_admin_marketplace_pending_alerts')) {
  assert.equal(count(original, '"admin_marketplace_pending_job"'), 1, 'Dispatcher categories already modified unexpectedly');
  assert.equal(count(original, 'enqueue_admin_marketplace_pending_alerts'), 1, 'Dispatcher enqueue call already modified unexpectedly');
  console.log('DISPATCHER_PATCH=ALREADY_PRESENT; VERIFIED; NO_WRITE');
  process.exit(0);
}
assert.equal(count(original, allowed), 1, 'Dispatcher categories anchor is absent/ambiguous');
assert.equal(count(original, anchor), 1, 'Dispatcher summary anchor is absent/ambiguous');
const next = original.replace(allowed, expanded).replace(anchor, pendingCode);
assert.equal(count(next, '"admin_marketplace_pending_job"'), 1);
assert.equal(count(next, 'enqueue_admin_marketplace_pending_alerts'), 1);
assert.equal(count(next, anchor), 1);
fs.writeFileSync(path, next);
console.log(`DISPATCHER_PATCH=OK; EOL=${eol === '\r\n' ? 'CRLF' : 'LF'}; EXISTING_DISPATCHER_REUSED`);
