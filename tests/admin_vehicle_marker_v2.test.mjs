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


test("El bicitaxi compacto conserva bicicleta y cabina de pasajeros", () => {
  const start = src.indexOf('if (vehicleCategoryCode === "bicitaxi")');
  const end = src.indexOf('\n  return filled(', start);
  const pedicab = src.slice(start, end);
  assert.match(pedicab, /Compact Cuban pedicab/);
  assert.match(pedicab, /M11 7V4H19L21 7Z/);
  assert.match(pedicab, /M5 18L8 10L12 18H5/);
  assert.match(pedicab, /circle cx="5" cy="18" r="3\.2"/);
  assert.match(pedicab, /circle cx="18\.5" cy="18" r="3\.2"/);
});
test("Modalidades usan badges de color aprobados sin modificar el estado del mapa", () => {
  for (const [code, color] of Object.entries({ motorcycle: "#7c3aed", tricycle: "#c2410c", bicitaxi: "#4d7c0f", light_car: "#0369a1", van: "#4338ca", truck: "#475569" })) {
    assert.ok(src.includes('case "' + code + '": return "' + color + '"'));
  }
  assert.match(src, /backgroundColor: `\$\{vehicleModeColor\(code\)\}38`/);
  assert.match(src, /boxShadow: `inset 0 0 0 1px \$\{vehicleModeColor\(code\)\}66`/);
  assert.match(src, /<VehicleModeIcon code=\{driver\.vehicleCategoryCode\} className="h-6 w-6"/);
  assert.match(src, /className="h-3\/4 w-3\/4"/);
  assert.match(src, /color="#ffffff">\$\{vehicleModeGlyph\(vehicleCategoryCode\)\}/);
  assert.match(src, /pinState === "busy" \? "bg-emerald-400" : pinState === "available" \? "bg-sky-400" : pinState === "stale" \? "bg-amber-400"/);
});


test("Marcadores flotantes y leyenda muestran color de modalidad dentro del pin de estado", () => {
  const pin = src.slice(src.indexOf("function operationalPinSvg("), src.indexOf("function OperationalPinLegend("));
  assert.match(pin, /kind === "driver" \? vehicleModeColor\(vehicleCategoryCode\) :/);
  assert.match(pin, /fill="url\(#\$\{bodyId\}\)"/);
  assert.match(pin, /driverState === "available"/);
  assert.match(pin, /driverState === "busy"/);
  assert.match(pin, /driverState === "stale"/);
  assert.match(pin, /operationalPinIconSvg\(kind, vehicleCategoryCode\)/);
  assert.match(src, /translate\(14\.64 11\.64\) scale\(\.78\)/);
  assert.match(src, /vehicleCategoryCode: driver\.vehicleCategoryCode/);
});


test("La transparencia se limita a badges de interfaz; el mapa conserva colores opacos", () => {
  const icon = src.slice(src.indexOf("function VehicleModeIcon("), src.indexOf("function VehicleModeBadge("));
  const pin = src.slice(src.indexOf("function operationalPinSvg("), src.indexOf("function OperationalPinLegend("));
  assert.match(icon, /className = "h-6 w-6"/);
  assert.match(icon, /rounded-md text-white/);
  assert.match(icon, /backgroundColor: `\$\{vehicleModeColor\(code\)\}38`/);
  assert.match(pin, /kind === "driver" \? vehicleModeColor\(vehicleCategoryCode\) :/);
  assert.doesNotMatch(pin, /vehicleModeColor\(vehicleCategoryCode\)\}38/);
});
