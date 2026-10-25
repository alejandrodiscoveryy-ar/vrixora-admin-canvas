import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const map = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../src/lib/marketplace-map.ts', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20261025230302_marketplace_job_notification_recipients_admin.sql', import.meta.url), 'utf8');
test('Muestra destinatarios reales en la carrera', () => {
  assert.ok(map.includes('Conductores notificados'));
  assert.ok(map.includes('jobRecipients.data.map'));
  assert.ok(map.includes('selectedJob.driverUserId === recipient.driverUserId'));
  assert.ok(lib.includes('admin_get_marketplace_job_notification_recipients'));
  assert.ok(sql.includes('marketplace-job:'));
});
test('Acceso restringido y lenguaje honesto', () => {
  assert.ok(sql.includes('require_project_permission'));
  assert.ok(sql.includes('revoke all on function'));
  assert.ok(map.includes('refetchInterval: selectedJob?.status === "published" ? 5_000 : false'));
  assert.ok(map.includes('no confirma recepción en el teléfono'));
});
