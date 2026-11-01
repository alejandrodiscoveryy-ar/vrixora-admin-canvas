import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ui = read('src/features/admin/AdminOperationalAlerts.tsx');
const section = read('src/features/admin/MarketplaceSection.tsx');
const push = read('src/lib/admin-push.ts');
const worker = read('public/sw.js');

test('La lista de conductores muestra la fecha real en horario de Cuba', () => {
  assert.match(section, /Inscripción: \{dateOfRegistration\(item\.createdAt\)\}/);
  assert.match(section, /timeZone: "America\/Havana"/);
});
test('La ficha 360 se abre por URL de conductor o carrera', () => {
  assert.match(section, /\.conductor/);
  assert.match(section, /\.carrera/);
  assert.match(section, /setDriver360Id\(alertDriverId\)/);
  assert.match(section, /setJobId\(alertJobId\)/);
  assert.match(ui, /Ver ficha 360/);
  assert.match(ui, /Ver carrera 360/);
  assert.match(ui, /alertDestination\(projectId, alert\)/);
});
test('Las alertas muestran nombres en el panel privado sin incorporar PII en el push de bloqueo', () => {
  assert.match(ui, /job\.customerDisplayName/);
  assert.match(ui, /driver\.displayName/);
  assert.match(ui, /targetId: message\.job_id \|\| message\.driver_id/);
  assert.match(push, /alertEntityUrl/);
  assert.match(worker, /adminAlertTarget/);
});
