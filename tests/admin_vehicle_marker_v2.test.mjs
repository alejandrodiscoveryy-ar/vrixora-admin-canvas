import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const src = readFileSync(new URL('../src/features/admin/MarketplaceOperationalMap.tsx', import.meta.url), 'utf8');
const vehicles = ['tricycle','motorcycle','bicitaxi','light_car','van','truck'];
test('Todos los vehiculos poseen pictogramas vectoriales en el mapa', () => {
  const a = src.slice(src.indexOf('function vehicleModeGlyph('), src.indexOf('function operationalPinSvg('));
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
  assert.match(src, /Conductor disponible \(azul\)/);
  assert.match(src, /Conductor en servicio \(verde\)/);
  assert.match(src, /Última ubicación conocida \(ámbar, no disponible\)/);
});
test('Conserva todas las capas y rutas del mapa operativo', () => {
  assert.match(src, /getMarketplaceOperationalRoutes\(projectId\)/);
  assert.match(src, /kind="customer"/);
  assert.match(src, /kind="destination"/);
  assert.match(src, /MAP_LAYERS\.incidents/);
  assert.match(src, /refetchInterval:/);
});

test('La misma familia SVG representa cada modalidad en agenda, leyenda y mapa', () => {
  const pin = src.slice(src.indexOf('function operationalPinIconSvg('), src.indexOf('function vehicleModeGlyph('));
  const icon = src.slice(src.indexOf('function VehicleModeIcon('), src.indexOf('function VehicleModeBadge('));
  assert.match(pin, /vehicleModeGlyph\(vehicleCategoryCode\)/);
  assert.match(icon, /viewBox="0 0 24 24"/);
  assert.match(icon, /vehicleModeGlyph\(code\)/);
  assert.doesNotMatch(icon, /🛺|<Bike|<CarFront|<Truck/);
  assert.match(src, /fill="currentColor" fill-rule="evenodd"/);
  assert.match(src, /<VehicleModeIcon code=\{driver\.vehicleCategoryCode\}/);
  assert.match(src, /<VehicleModeBadge code=\{job\.vehicleCategoryCode\}/);
});
