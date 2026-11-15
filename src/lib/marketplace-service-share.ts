export type ServiceSharePayload = {
  serviceCode: string; origin: string; destination: string;
  vehicleCategory?: string | null; price?: number | null; currency?: string | null;
  scheduledFor?: string | null; distanceKm?: number | null; paymentMethod?: string | null;
  passengers?: number | null; weightKg?: number | null; volumeM3?: number | null;
  lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null;
  bodyType?: string | null; loadHelp?: boolean | null; unloadHelp?: boolean | null;
  urgent?: boolean | null; stopCount?: number | null; comment?: string | null;
};

const vehicleLabels: Record<string, string> = {
  motorcycle: "Moto", bicitaxi: "Bicitaxi", tricycle: "Triciclo",
  light_car: "Auto", comfort: "Confort", van: "Furgoneta", truck: "Camión",
};
const serviceLabels: Record<string, string> = {
  passenger: "TRANSPORTE DE PASAJEROS", courier: "MENSAJERÍA",
  cargo: "CARGA", tourism: "TURISMO",
};
const number = (value: number) => new Intl.NumberFormat("es-CU", { maximumFractionDigits: 2 }).format(value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

// The administrator reviews the preview before copying; these patterns remove common contacts,
// not all possible personally identifying content in free text.
export const cleanServiceShareComment = (value: string) => value
  .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contacto omitido]")
  .replace(/(?:\+?\d[\s().-]*){7,}\d/g, "[contacto omitido]")
  .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[enlace omitido]")
  .trim();
const cleanLine = (value: string) => cleanServiceShareComment(value).replace(/\s+/g, " ");

export function buildServiceShareMessage(data: ServiceSharePayload, comment = data.comment ?? ""): string {
  const freight = data.serviceCode === "cargo" || data.serviceCode === "courier";
  const title = serviceLabels[data.serviceCode] || "SERVICIO";
  const lines = [
    "🚨 *¡NUEVO SERVICIO DE " + title + "!*",
    "", "🛺 *Agencia TukTuk*", "",
    "📍 Recogida: " + cleanLine(data.origin || "Por confirmar"),
    (data.serviceCode === "courier" ? "🏁 Entrega: " : "🏁 Destino: ") + cleanLine(data.destination || "Por confirmar"),
  ];
  if (data.vehicleCategory) lines.push("🚘 Modalidad: " + (vehicleLabels[data.vehicleCategory] || cleanLine(data.vehicleCategory)));
  if (data.serviceCode === "passenger" && positive(data.passengers)) lines.push("👥 Pasajeros: " + number(data.passengers));
  if (positive(data.distanceKm)) lines.push("📏 Distancia: " + number(data.distanceKm) + " km");
  if (positive(data.price) && data.currency) lines.push("💰 Importe: " + number(data.price) + " " + cleanLine(data.currency));
  if (data.paymentMethod === "cash" || data.paymentMethod === "transfer") lines.push("💵 Pago: " + (data.paymentMethod === "cash" ? "Efectivo" : "Transferencia"));
  if (data.scheduledFor) {
    const scheduled = new Date(data.scheduledFor);
    if (!Number.isNaN(scheduled.getTime())) lines.push("🗓️ Programado: " + new Intl.DateTimeFormat("es-CU", { timeZone: "America/Havana", dateStyle: "medium", timeStyle: "short" }).format(scheduled) + " (hora de Cuba)");
  }
  if (data.urgent === true) lines.push("⏱️ Servicio urgente");
  if (positive(data.stopCount)) lines.push("Paradas adicionales: " + number(data.stopCount));
  if (freight) {
    const details: string[] = [];
    if (positive(data.weightKg)) details.push("• Peso: " + number(data.weightKg) + " kg.");
    if (positive(data.volumeM3)) details.push("• Volumen: " + number(data.volumeM3) + " m³.");
    if (positive(data.lengthCm) && positive(data.widthCm) && positive(data.heightCm)) {
      details.push("• Dimensiones: " + [data.lengthCm, data.widthCm, data.heightCm].map(number).join(" × ") + " cm.");
    } else {
      if (positive(data.lengthCm)) details.push("• Largo: " + number(data.lengthCm) + " cm.");
      if (positive(data.widthCm)) details.push("• Ancho: " + number(data.widthCm) + " cm.");
      if (positive(data.heightCm)) details.push("• Alto: " + number(data.heightCm) + " cm.");
    }
    if (data.bodyType) details.push("• Carrocería requerida: " + cleanLine(data.bodyType) + ".");
    if (data.loadHelp === true) details.push("• Requiere ayuda para cargar.");
    if (data.unloadHelp === true) details.push("• Requiere ayuda para descargar.");
    if (details.length) lines.push("", "📦 *Especificaciones:*", ...details);
    const safeComment = cleanServiceShareComment(comment);
    if (safeComment) lines.push("", "📝 *Comentario del cliente:*", safeComment);
  }
  lines.push("", "📲 Entra en TukTuk Conductor y acepta el servicio.", "", "https://www.vrixora.com/tuktuk/app/");
  return lines.join("\n");
}
