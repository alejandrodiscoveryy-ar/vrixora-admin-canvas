export type WhatsAppManualInterpretation = {
  origin: string;
  destination: string;
  service: "passenger" | "courier" | "cargo" | null;
  vehicle: "motorcycle" | "bicitaxi" | "tricycle" | "light_car" | null;
  hints: string[];
};
export function interpretManualWhatsAppMessage(raw: string): WhatsAppManualInterpretation;
