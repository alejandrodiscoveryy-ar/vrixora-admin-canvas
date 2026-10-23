import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const src = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8');
const vehicles = ['tricycle','motorcycle','bicitaxi','light_car','van','truck'];
test('Todos los vehiculos poseen pictogramas vectoriales en el mapa', () => {
  const a = src.slice(src.indexOf('function operationalPinIconSvg('), src.indexOf('function operationalPinSvg('));
  for (const v of vehicles) assert.match(a, new RegExp('vehicleCategoryCode === "'+v+'"'));
  assert.doesNotMatch(a, /<text[^>]*>🛺<\/text>/);
  assert.match(a, /if \(vehicleCategoryCode === "van"\)/);
});
test('Diferencia disponible, ocupado, ubicacion antigua y sin disponibilidad', () => {
  assert.match(src, /type DriverPinState = "available" \| "busy" \| "stale" \| "unavailable"/);
  assert.match(src, /if \(!driver\.locationFresh\) return "stale"/);
  assert.match(src, /if \(driver\.activeJobId\) return "busy"/);
  assert.match(src, /driverState: driverPinState\(driver\)/);
  assert.match(src, /driverPinStateLabel\[driverPinState\(driver\)\]/);
  assert.match(src, /Conductor disponible \(verde\)/);
  assert.match(src, /Conductor en servicio \(azul\)/);
  assert.match(src, /Última ubicación conocida \(ámbar, no disponible\)/);
});
test('Conserva todas las capas y rutas del mapa operativo', () => {
  assert.match(src, /getMarketplaceOperationalRoutes\(projectId\)/);
  assert.match(src, /kind="customer"/);
  assert.match(src, /kind="destination"/);
  assert.match(src, /MAP_LAYERS\.incidents/);
  assert.match(src, /refetchInterval:/);
});
