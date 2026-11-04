import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHavanaLocalInput, havanaDateTimeToIso } from '../src/lib/havana-official-time.ts';

test('Cuba mantiene UTC-4 en noviembre 2026 y primavera de 2027', () => {
  assert.equal(formatHavanaLocalInput(new Date('2026-11-03T18:00:00.000Z')), '2026-11-03T14:00');
  assert.equal(formatHavanaLocalInput(new Date('2027-04-01T04:00:00.000Z')), '2027-04-01T00:00');
  assert.equal(havanaDateTimeToIso('2026-11-03T14:00'), '2026-11-03T18:00:00.000Z');
  assert.equal(havanaDateTimeToIso('2027-04-01T00:00'), '2027-04-01T04:00:00.000Z');
});

test('A medianoche del 1 de noviembre 2026 no repite hora en Cuba', () => {
  assert.equal(havanaDateTimeToIso('2026-11-01T00:30'), '2026-11-01T04:30:00.000Z');
});

test('Valida fechas imposibles y no selecciona un instante ambiguo en noviembre de 2027', () => {
  assert.equal(havanaDateTimeToIso('2026-02-30T10:30'), null);
  assert.equal(havanaDateTimeToIso('2026-11-03T24:00'), null);
  assert.equal(havanaDateTimeToIso('2027-11-07T00:30'), null);
  assert.equal(formatHavanaLocalInput(new Date('2027-11-07T08:00:00.000Z')), '2027-11-07T03:00');
});
