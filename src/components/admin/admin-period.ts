export type AdminDateRange = { from: string; to: string };
export type AdminPeriodKey = "all" | "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

export type AdminPeriodOption = { value: AdminPeriodKey; label: string };

export const adminPeriodOptions: AdminPeriodOption[] = [
  { value: "today", label: "Hoy" },
  { value: "yesterday", label: "Ayer" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "month", label: "Mes" },
  { value: "custom", label: "Personalizado" },
];

export function identifyAdminPeriod(range: AdminDateRange): AdminPeriodKey {
  for (const value of ["today", "yesterday", "7d", "30d", "month"] as const) {
    const candidate = periodRange(value);
    if (range.from === candidate.from && range.to === candidate.to) return value;
  }
  return "custom";
}

export function periodRange(value: AdminPeriodKey, now = new Date()): AdminDateRange {
  if (value === "all") return { from: "", to: "" };
  if (value === "yesterday") {
    const yesterday = addDays(now, -1);
    return { from: toIsoDate(yesterday), to: toIsoDate(yesterday) };
  }
  if (value === "7d") return { from: toIsoDate(addDays(now, -6)), to: toIsoDate(now) };
  if (value === "30d") return { from: toIsoDate(addDays(now, -29)), to: toIsoDate(now) };
  if (value === "month") {
    return {
      from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toIsoDate(now),
    };
  }
  return { from: toIsoDate(now), to: toIsoDate(now) };
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
