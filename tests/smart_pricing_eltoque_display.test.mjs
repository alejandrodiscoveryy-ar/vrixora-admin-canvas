import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/features/admin/MarketplacePricingSection.tsx', import.meta.url), 'utf8');

test('panel de elTOQUE sin errores de codificacion en textos visibles', () => {
  assert.doesNotMatch(source, /Â|Ã|â€¦/);
  assert.match(source, /Tasa USD\/CUP · API/);
  assert.match(source, /Automática/);
  assert.match(source, /sin fecha de actualización/);
  assert.match(source, /Fuente automática/);
  assert.match(source, /Se conservará su tarifa/);
});

test('indicador de automatizacion refleja el estado del servidor', () => {
  assert.match(source, /lastAutoSyncStatus === "ok"/);
  assert.match(source, /lastAutoSyncStatus !== "ok"/);
  assert.match(source, /autoSyncEnabled/);
  assert.match(source, /Revisar sincronización/);
  assert.match(source, /getElToqueIntegration\(projectId\)/);
});