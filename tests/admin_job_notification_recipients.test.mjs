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
  assert.ok(map.includes('refetchInterval: (query) => selectedJob?.status !== "published" ? false : query.state.status === "error" ? 60_000 : 5_000'));
  assert.match(map, /queryKey: \["marketplace-job-notification-recipients", projectId, selectedJobId\],[\s\S]*?enabled: isVisible && Boolean\(panelOpen && agendaTab === "services"/);
  assert.ok(map.includes('no confirma recepción en el teléfono'));
});

test('registro de apertura diferencia envío de pulsación real sin ampliar privilegios', () => {
  const section = readFileSync(new URL('../src/features/admin/MarketplaceSection.tsx', import.meta.url), 'utf8');
  const receipt = readFileSync(new URL('../supabase/migrations/20261124113424_marketplace_job_opened_push_audit.sql', import.meta.url), 'utf8');
  assert.ok(receipt.includes('require_project_permission'));
  assert.ok(receipt.includes('min(n.read_at) as first_opened_at'));
  assert.ok(receipt.includes("'first_opened_at', a.first_opened_at"));
  assert.ok(lib.includes('firstOpenedAt'));
  assert.ok(section.includes('Alertas abiertas:'));
  assert.ok(section.includes('Abrió la alerta:'));
  assert.ok(section.includes('Avisos enviados:'));
});
