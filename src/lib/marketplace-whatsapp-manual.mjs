/**
 * Interpretación local y conservadora de mensajes manualmente copiados desde
 * WhatsApp. No es un modelo generativo ni accede a mensajes privados.
 * Nunca decide coordenadas, nombres, teléfonos, precios ni aceptación.
 */
const clean = (value) => value
  .replace(/\s+/g, " ").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
  .trim().slice(0, 240);

export function interpretManualWhatsAppMessage(raw) {
  const text = String(raw ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
  const result = { origin: "", destination: "", service: null, vehicle: null, hints: [] };
  if (!text) return result;
  if (/\b(carga|bulto|mudanza|mercanc[ií]a|equipaje pesado)\b/i.test(text)) result.service = "cargo";
  else if (/\b(mensajer[ií]a|encomienda|paquete|documentos|env[ií]o|enviar|entregar)\b/i.test(text)) result.service = "courier";
  else if (/\b(carrera|pasajero|llevarme|traslado|viaje|transportarme)\b/i.test(text)) result.service = "passenger";

  if (/\b(triciclo|rikico|rikirico|riki rico)\b/i.test(text)) result.vehicle = "tricycle";
  else if (/\b(bicitaxi|bici taxi|bicicleta taxi)\b/i.test(text)) result.vehicle = "bicitaxi";
  else if (/\b(moto|motocicleta|motorina)\b/i.test(text)) result.vehicle = "motorcycle";
  else if (/\b(auto|carro|taxi|autom[oó]vil)\b/i.test(text)) result.vehicle = "light_car";

  const originLabel = text.match(/\borigen\s*[:=-]\s*(.+?)(?=\s+(?:destino\s*[:=-]|hasta\b|hacia\b)|$)/i);
  const destinationLabel = text.match(/\bdestino\s*[:=-]\s*(.+?)(?=\s+origen\s*[:=-]|$)/i);
  const route = text.match(/\b(?:desde|salgo\s+de|recoger\s+en|rec[oó]geme\s+en)\s+(.+?)\s+(?:hasta|hacia|para\s+ir\s+a)\s+(.+?)(?:[.!?;]|$)/i);
  result.origin = clean(originLabel?.[1] ?? route?.[1] ?? "");
  result.destination = clean(destinationLabel?.[1] ?? route?.[2] ?? "");
  if (!result.origin) result.hints.push("Falta identificar el lugar de recogida.");
  if (!result.destination) result.hints.push("Falta identificar el destino.");
  if (!result.vehicle) result.hints.push("Confirma la modalidad del vehículo.");
  if (!result.service) result.hints.push("Confirma si es pasajeros, mensajería o carga.");
  return result;
}
