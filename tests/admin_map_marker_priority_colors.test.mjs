import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const src = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8');

test('colores y tamano de conductores', () => {
  assert.match(src, /driverState === "available"\s+\? \["#bae6fd", "#0284c7"/);
  assert.match(src, /driverState === "busy"\s+\? \["#bafcd7", "#22c55e"/);
  assert.match(src, /Conductor disponible \(azul\)/);
  assert.match(src, /Conductor en servicio \(verde\)/);
  assert.match(src, /compactDriverPin \? \(legend \? 32 : selected \? 26 : 23\)/);
  assert.match(src, /compactDriverPin \? \(legend \? 36 : selected \? 29 : 26\)/);
  assert.match(src, /pin\.style\.width = "30px"/);
});

test('GPS reciente se muestra encima del antiguo', () => {
  const match = src.match(/element\.style\.zIndex = ([\s\S]*?);/);
  assert.ok(match);
  const priority = new Function('driver', 'driverPinState', 'return ' + match[1] + ';');
  assert.equal(priority({ locationFresh: true, activeJobId: 'job' }, () => 'busy'), '30');
  assert.equal(priority({ locationFresh: true, activeJobId: null, acceptingJobs: true }, () => 'available'), '20');
  assert.equal(priority({ locationFresh: false, activeJobId: null, acceptingJobs: true }, () => 'stale'), '10');
  assert.equal(priority({ locationFresh: false, activeJobId: null, acceptingJobs: true }, () => 'offline'), '2');
  assert.ok(src.indexOf('pointLayer(MAP_LAYERS.driversStale,') < src.indexOf('pointLayer(MAP_LAYERS.driversFresh,'));
});

test('Cobertura no agrupa posiciones recientes', () => {
  assert.match(src, /if \(driver\.locationFresh\) continue;/);
  assert.match(src, /bubble\.style\.zIndex = "12"/);
});
