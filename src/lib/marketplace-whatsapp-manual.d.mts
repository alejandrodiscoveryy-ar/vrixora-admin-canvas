export type WhatsAppManualInterpretation = {
  origin: string;
  destination: string;
  service: "passenger" | "courier" | "cargo" | null;
  vehicle: "motorcycle" | "bicitaxi" | "tricycle" | "light_car" | null;
  clientName: string;
  clientPhone: string;
  notes: string;
  hints: string[];
};
export function interpretManualWhatsAppMessage(raw: string): WhatsAppManualInterpretation;
