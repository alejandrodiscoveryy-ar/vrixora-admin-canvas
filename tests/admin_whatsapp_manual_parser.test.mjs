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

test('Lite compacto recupera servicio, cliente, teléfono, origen y destino', () => {
  const parsed = parse([
    'TUKTUK Lite | Solicitud',
    'Servicio: Auto',
    'Cliente: Cliente Prueba | +53 5000 0000',
    'Recogida: Calle 10 entre 15 y 17',
    'Destino: Hospital Central',
    'Sin precio ni reserva confirmados.'
  ].join('\n'));
  assert.equal(parsed.service,'passenger');
  assert.equal(parsed.vehicle,'light_car');
  assert.equal(parsed.clientName,'Cliente Prueba');
  assert.equal(parsed.clientPhone,'+5350000000');
  assert.equal(parsed.origin,'Calle 10 entre 15 y 17');
  assert.equal(parsed.destination,'Hospital Central');
  assert.equal(parsed.notes,'');
  assert.deepEqual(parsed.hints,[]);
});

test('Lite heredado con iconos y enlaces preserva los campos, no confunde direcciones',()=>{
  const parsed = parse([
    '🚕 *TUKTUK | NUEVA SOLICITUD*',
    '🛵 *Servicio:* Triciclo',
    '👤 *Cliente:* Cliente Ejemplo',
    '📞 *Contacto:* +53 5000 0000',
    '📍 *RECOGIDA*',
    'Calle 10 esquina 15',
    '🧭 *GPS:* No proporcionado',
    '🗺️ *Buscar origen (dirección, no pin):* https://www.google.com/maps/search/?api=1&query=Calle%2010',
    '🏁 *DESTINO*',
    'Hospital Central',
    '🗺️ *Buscar destino (dirección, no pin):* https://www.google.com/maps/search/?api=1&query=Hospital',
    '📝 *Indicaciones:* Ninguna',
    '📲 *Canal:* WhatsApp Lite',
    '⏳ *Estado:* Pendiente de respuesta humana.',
    'No hay precio ni reserva confirmados.'
  ].join('\n'));
  assert.equal(parsed.service,'passenger');
  assert.equal(parsed.vehicle,'tricycle');
  assert.equal(parsed.clientName,'Cliente Ejemplo');
  assert.equal(parsed.clientPhone,'+5350000000');
  assert.equal(parsed.origin,'Calle 10 esquina 15');
  assert.equal(parsed.destination,'Hospital Central');
  assert.equal(parsed.notes,'');
});

test('no confunde notas vacías y no extrae un teléfono desde URL o GPS',()=>{
  const parsed=parse([
    'TUKTUK Lite | Solicitud',
    'Servicio: Mensajería',
    'Cliente: Cliente Ejemplo',
    'Recogida: Mi ubicación actual (GPS)',
    'Destino: Vedado',
    'GPS recogida: https://maps.google.com/?q=23.125400,-82.387600',
    'Indicaciones: Entregar en recepción',
    'Sin precio ni reserva confirmados.'
  ].join('\n'));
  assert.equal(parsed.service,'courier');
  assert.equal(parsed.clientPhone,'');
  assert.equal(parsed.notes,'Entregar en recepción');
  assert.equal(parsed.destination,'Vedado');
  assert.ok(parsed.hints.includes('Falta teléfono del cliente.'));
});
