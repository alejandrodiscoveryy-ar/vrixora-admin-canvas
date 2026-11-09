import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpretManualWhatsAppMessage as parse } from '../src/lib/marketplace-whatsapp-manual.mjs';

test('mensaje corriente: origen, destino y triciclo', () => {
  assert.deepEqual(
    (({ origin, destination, vehicle }) => ({ origin, destination, vehicle }))(
      parse('Necesito un triciclo desde Alamar hasta el Capitolio.')),
    { origin: 'Alamar', destination: 'el Capitolio', vehicle: 'tricycle' }
  );
});
test('mensajeria no se convierte en pasajeros ni inventa direcciones', () => {
  const parsed = parse('Necesito enviar un paquete mañana');
  assert.equal(parsed.service, 'courier');
  assert.equal(parsed.origin, '');
  assert.equal(parsed.destination, '');
  assert.ok(parsed.hints.length >= 2);
});
test('carga y modalidad explicitas', () => {
  const parsed = parse('Carga de mercancía. Origen: Alamar Destino: Vedado. Necesito un auto');
  assert.equal(parsed.service, 'cargo');
  assert.equal(parsed.vehicle, 'light_car');
  assert.equal(parsed.origin, 'Alamar');
  assert.equal(parsed.destination, 'Vedado');
});
test('cualquier texto ambiguo exige datos faltantes y no inventa precio', () => {
  const parsed = parse('Buenas tardes, cuánto cuesta una carrera?');
  assert.equal(parsed.origin, '');
  assert.equal(parsed.destination, '');
  assert.equal('price' in parsed, false);
  assert.equal('phone' in parsed, false);
});
test('no se cargan datos de WhatsApp ni se envía nada automáticamente', () => {
  const code = readFileSync('src/lib/marketplace-whatsapp-manual.mjs','utf8');
  assert.doesNotMatch(code,/fetch\(|getSupabaseClient|web\.whatsapp|sendMessage|localStorage/);
});
