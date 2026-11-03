import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchingFleetDrivers,
  summarizeFleet,
  UNCLASSIFIED_CATEGORY,
} from '../src/lib/marketplace-fleet.ts';

const driver = (id, services, category, status = 'active', extra = {}) => ({
  userId: id,
  displayName: `Conductor ${id}`,
  status,
  vehicleId: `${id}-v`,
  vehicleName: `${category ?? 'Sin categoría'}`,
  vehicleCategoryCode: category,
  isActiveAssignment: true,
  isAvailable: true,
  services,
  ...extra,
});

test('no duplica al conductor dentro de una modalidad/categoría', () => {
  const rows = [driver('a', ['passenger'], 'tricycle'), driver('a', ['passenger'], 'tricycle')];
  const result = summarizeFleet(rows)[0];
  assert.equal(result.total, 1);
  assert.deepEqual(result.categories.map(c => [c.code, c.total]), [['tricycle', 1]]);
});

test('un mismo conductor puede participar en varias modalidades', () => {
  const [passenger, cargo] = summarizeFleet([driver('a', ['passenger', 'cargo'], 'tricycle')]);
  assert.equal(passenger.total, 1);
  assert.equal(cargo.total, 1);
});

test('filtrar modalidad y vehículo devuelve solo conductores coincidentes', () => {
  const rows = [driver('a', ['passenger'], 'tricycle'), driver('b', ['passenger'], 'motorcycle'), driver('c', ['cargo'], 'tricycle')];
  assert.deepEqual(matchingFleetDrivers(rows, 'passenger', 'tricycle').map(r => r.userId), ['a']);
  assert.equal(matchingFleetDrivers(rows, 'courier', 'tricycle').length, 0);
});

test('muestra correctamente activos e incompletos', () => {
  const result = summarizeFleet([driver('a', ['tourism'], 'light_car'), driver('b', ['tourism'], 'light_car', 'incomplete')])[3];
  assert.equal(result.total, 2);
  assert.equal(result.active, 1);
  assert.equal(result.categories[0].active, 1);
});

test('conserva servicios sin categoría bajo Sin clasificar', () => {
  const result = summarizeFleet([driver('a', ['cargo'], null)])[1];
  assert.equal(result.categories[0].code, UNCLASSIFIED_CATEGORY);
  assert.equal(matchingFleetDrivers([driver('a', ['cargo'], null)], 'cargo', UNCLASSIFIED_CATEGORY).length, 1);
});

test('prioriza la asignación activa cuando recibe duplicados', () => {
  const rows = [driver('a', ['passenger'], 'light_car', 'active', {isActiveAssignment:false}), driver('a', ['passenger'], 'tricycle', 'active', {isActiveAssignment:true})];
  assert.equal(matchingFleetDrivers(rows, 'passenger')[0].vehicleCategoryCode, 'tricycle');
});

test('asignación anterior no infla los totales en otra categoría', () => {
  const rows = [driver('a', ['passenger'], 'light_car', 'active', {isActiveAssignment:false}), driver('a', ['passenger'], 'tricycle', 'active', {isActiveAssignment:true})];
  const [passenger] = summarizeFleet(rows);
  assert.equal(passenger.total, 1);
  assert.deepEqual(passenger.categories.map(c=>[c.code,c.total]), [['tricycle',1]]);
  assert.equal(matchingFleetDrivers(rows, 'passenger', 'light_car').length, 0);
});

test('no cuenta servicios de asignaciones anteriores inactivas', () => {
  const rows = [
    driver('a', ['passenger'], 'light_car', 'active', { isActiveAssignment: false }),
    driver('a', ['cargo'], 'tricycle', 'active', { isActiveAssignment: true }),
  ];
  assert.equal(summarizeFleet(rows)[0].total, 0);
  assert.equal(summarizeFleet(rows)[1].total, 1);
});

test('incluye conductores suspendidos pero no vehículos sin asignación activa', () => {
  const rows = [
    driver('a', ['passenger'], 'light_car', 'suspended'),
    driver('b', ['passenger'], 'motorcycle', 'active', { isActiveAssignment: null }),
  ];
  const result = summarizeFleet(rows)[0];
  assert.equal(result.total, 1);
  assert.equal(result.active, 0);
});
