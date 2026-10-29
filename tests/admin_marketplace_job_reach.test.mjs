import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20261029110000_marketplace_job_reach_snapshots.sql');
const section = read('src/features/admin/MarketplaceSection.tsx');
const map = read('src/features/admin/MarketplaceOperationalMap.tsx');
const lib = read('src/lib/marketplace-map.ts');

test('distancia instantanea al aviso, nunca GPS actual usado retrospectivamente', () => {
  assert.match(sql, /before insert on public\.notification_outbox/);
  assert.match(sql, /new\.data := coalesce\(new\.data/);
  assert.match(sql, /captured_at >= clock_timestamp\(\) - interval '300 seconds'/);
  assert.match(sql, /marketplace_haversine_km\(/);
  assert.match(sql, /distance_method', 'straight_line'/);
  assert.match(sql, /exception when others then/);
  assert.doesNotMatch(sql, /delete from public\.jobs|update public\.jobs|truncate/i);
});

test('RPC protegida para marketplace.view, recordatorios deduplicados y pruebas separadas', () => {
  assert.match(sql, /require_project_permission\(target_project_id, 'marketplace\.view'\)/);
  assert.match(sql, /group by n\.user_id/);
  assert.match(sql, /:reminder:%/);
  assert.match(sql, /marketplace_test_job_recipients/);
  assert.match(sql, /'simulated'::text/);
  assert.match(sql, /'is_test_recipient'/);
  assert.match(sql, /revoke all on function public\.admin_get_marketplace_job_notification_recipients/);
});

test('ficha de operaciones y detalle completo reutilizan la misma consulta', () => {
  assert.match(section, /<JobNotificationReach projectId=\{projectId\} jobId=\{job\.jobId\} compact/);
  assert.match(section, /<JobNotificationReach projectId=\{projectId\} jobId=\{jobId\}/);
  assert.match(section, /queryKey: \["marketplace-job-notification-recipients", projectId, jobId\]/);
  assert.match(section, /Sin distancia histórica/);
  assert.match(section, /Enviado» no confirma/);
  assert.match(map, /recipient\.distanceKm/);
  assert.match(map, /recipient\.isTestRecipient/);
  assert.match(lib, /distanceKm: number \| null/);
  assert.match(lib, /isTestRecipient: boolean/);
});
