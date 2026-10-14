import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8');
test('dos paneles flotantes con ocultación independiente', () => {
  assert.match(source, /const \[driversPanelOpen, setDriversPanelOpen\]/);
  assert.match(source, /const \[servicesPanelOpen, setServicesPanelOpen\]/);
  assert.match(source, /absolute inset-y-3 right-3 z-30/);
  assert.match(source, /\{driversPanelOpen \? \(/);
  assert.match(source, /\{servicesPanelOpen \? \(/);
  assert.match(source, /setDriversPanelOpen\(false\)/);
  assert.match(source, /setServicesPanelOpen\(false\)/);
});
test('mapa a ancho completo y paneles superpuestos transparentes', () => {
  assert.doesNotMatch(source, /xl:grid-cols-\[minmax\(0,1fr\)_284px\]/);
  assert.match(source, /bg-slate-950\/\[0\.81\]/);
  assert.match(source, /pointer-events-none absolute/);
});
test('rutas claramente distinguibles: cian a cliente, dorado a destino', () => {
  assert.match(source, /"line-color": "#22d3ee"/);
  assert.match(source, /"line-color": "#67e8f9"/);
  assert.match(source, /"line-color": "#facc15"/);
  assert.match(source, /"line-color": "#fde047"/);
  assert.match(source, /border-dashed border-cyan-400/);
  assert.match(source, /border-yellow-400/);
});
test('no modifica integraciones de negocio del mapa', () => {
  for(const value of ['getMarketplaceOperationalMap(projectId)','getMarketplaceOperationalRoutes(projectId)','setSelectedJobId(job.jobId)','onOpenJob?.(selectedJob.jobId)'])
    assert.ok(source.includes(value), value);
});
