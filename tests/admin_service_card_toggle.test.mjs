import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const src = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const begin = src.indexOf('{agendaTab === "services" ? (');
const end = src.indexOf('{agendaTab === "clients" ? (', begin);
const panel = src.slice(begin, end);

test('clic sobre mismo servicio abre y pliega solo detalles', () => {
  assert.ok(begin >= 0 && end > begin, 'Seccion Servicios detectada');
  assert.match(panel, /const opening = customerDetailsJobId !== job\.jobId/);
  assert.match(panel, /setCustomerDetailsJobId\(opening \? job\.jobId : null\)/);
  assert.match(panel, /aria-expanded=\{selected && customerDetailsJobId === job\.jobId\}/);
  assert.doesNotMatch(panel, /setCustomerDetailsJobId\(job\.jobId\);\s*focusJob\(job\)/);
});

test('boton Plegar ficha cierra detalles sin cancelar servicio', () => {
  assert.match(panel, /aria-label="Plegar ficha del servicio"/);
  assert.match(panel, /onClick=\{\(\) => setCustomerDetailsJobId\(null\)\}/);
  assert.match(panel, /Plegar ficha/);
  assert.match(panel, /selectedJob && customerDetailsJobId === selectedJob\.jobId/);
});

test('preserva mapa, ficha, seleccion, rutas y agenda', () => {
  for (const token of [
    'setSelectedJobId(job.jobId)',
    'if (opening) focusJob(job)',
    'onOpenJob?.(selectedJob.jobId)',
    'getMarketplaceOperationalRoutes(projectId)',
    'setAgendaTab("services")',
    'job.originText',
    'job.destinationText',
    'setAgendaCollapsed(false)',
    'kind: isPickup ? "customer" : "destination"',
  ]) assert.ok(src.includes(token), token);
});
