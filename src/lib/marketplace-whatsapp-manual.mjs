/**
 * Extrae exclusivamente datos explícitos de un mensaje pegado manualmente.
 * Compatible con TUKTUK Lite antiguo, Lite compacto y lenguaje natural.
 * No lee WhatsApp ni geocodifica. El operador confirma ubicaciones y precio.
 */
const clean = (value) => String(value ?? "")
  .replace(/\s+/g, " ")
  .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
  .trim().slice(0, 240);

function normalizedLine(line) {
  return line.replace(/[*_]/g, "").trim()
    .replace(/^[^\p{L}\d+]+/gu, "").trim();
}

function labelValue(lines, names) {
  const matchLabel = new RegExp("^(?:" + names + ")\\s*:\\s*(.+)$", "i");
  for (const line of lines) {
    const match = line.match(matchLabel);
    if (match) return clean(match[1]);
  }
  return "";
}

function sectionValue(lines, names) {
  const simpleLabel = new RegExp("^(?:" + names + ")$", "i");
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!simpleLabel.test(lines[i])) continue;
    const candidate = lines[i + 1];
    if (!/^(?:gps|origen|destino|recogida|buscar|mapa|cliente|contacto|servicio|indicaciones|canal|estado)\s*:/i.test(candidate)
      && !/^https?:\/\//i.test(candidate)) return clean(candidate);
  }
  return "";
}

function cubanPhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (/^535\d{7}$/.test(digits)) return "+" + digits;
  if (/^5\d{7}$/.test(digits)) return "+53" + digits;
  return "";
}

export function interpretManualWhatsAppMessage(raw) {
  const original = String(raw ?? "").slice(0, 2000);
  const lines = original.replace(/\r\n?/g, "\n").split("\n")
    .map(normalizedLine).filter(Boolean);
  const text = lines.join(" ");
  const result = { origin: "", destination: "", service: null, vehicle: null,
    clientName: "", clientPhone: "", notes: "", hints: [] };
  if (!text) return result;

  const serviceLabel = labelValue(lines, "servicio");
  const serviceName = serviceLabel.toLocaleLowerCase("es");
  if (/^(?:mensajer[ií]a|encomienda)$/.test(serviceName)) result.service = "courier";
  else if (/^carga$/.test(serviceName)) result.service = "cargo";
  else if (/^(?:auto|carro|moto|motocicleta|bicitaxi|triciclo|pasajeros?)$/.test(serviceName))
    result.service = "passenger";
  else if (/\b(carga|bulto|mudanza|mercanc[ií]a|equipaje pesado)\b/i.test(text))
    result.service = "cargo";
  else if (/\b(mensajer[ií]a|encomienda|paquete|documentos|env[ií]o|enviar|entregar)\b/i.test(text))
    result.service = "courier";
  else if (/\b(carrera|pasajero|llevarme|traslado|viaje|transportarme)\b/i.test(text))
    result.service = "passenger";

  const vehicleSource = serviceLabel && /^(?:moto|motocicleta|bicitaxi|triciclo|auto|carro)$/i.test(serviceLabel)
    ? serviceLabel : text;
  if (/\b(triciclo|rikico|rikirico|riki rico)\b/i.test(vehicleSource)) result.vehicle = "tricycle";
  else if (/\b(bicitaxi|bici taxi|bicicleta taxi)\b/i.test(vehicleSource)) result.vehicle = "bicitaxi";
  else if (/\b(moto|motocicleta|motorina)\b/i.test(vehicleSource)) result.vehicle = "motorcycle";
  else if (/\b(auto|carro|taxi|autom[oó]vil)\b/i.test(vehicleSource)) result.vehicle = "light_car";

  const customerLine = labelValue(lines, "cliente|nombre");
  const explicitContact = labelValue(lines, "contacto|tel[eé]fono|tel");
  const combined = customerLine.match(/^(.*?)(?:\s*[|·]\s*)(\+?53[\d\s()-]+)$/);
  result.clientName = clean(combined?.[1] ?? customerLine).slice(0, 100);
  result.clientPhone = cubanPhone(explicitContact || combined?.[2] || "");

  result.origin = labelValue(lines, "origen|recogida")
    || sectionValue(lines, "origen|recogida");
  result.destination = labelValue(lines, "destino")
    || sectionValue(lines, "destino");

  // El texto libre conserva la compatibilidad con el flujo WhatsApp asistido.
  if (!result.origin || !result.destination) {
    const route = text.match(/\b(?:desde|salgo\s+de|recoger\s+en|rec[oó]geme\s+en)\s+(.+?)\s+(?:hasta|hacia|para\s+ir\s+a)\s+(.+?)(?:[.!?;]|$)/i);
    if (!result.origin) result.origin = clean(route?.[1] ?? "");
    if (!result.destination) result.destination = clean(route?.[2] ?? "");
  }

  const note = labelValue(lines, "indicaciones|nota|notas");
  result.notes = /^(?:ninguna|ninguno|sin indicaciones)$/i.test(note) ? "" : note.slice(0, 500);

  if (!result.origin) result.hints.push("Falta identificar el lugar de recogida.");
  if (!result.destination) result.hints.push("Falta identificar el destino.");
  if (!result.vehicle) result.hints.push("Confirma la modalidad del vehículo.");
  if (!result.service) result.hints.push("Confirma si es pasajeros, mensajería o carga.");
  if (!result.clientPhone) result.hints.push("Falta teléfono del cliente.");
  return result;
}
