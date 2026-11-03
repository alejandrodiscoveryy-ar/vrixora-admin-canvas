/**
 * Estadísticas puras de flota para el Pulso. Un conductor cuenta una sola vez
 * dentro de cada modalidad y cada categoría, aunque el backend devuelva
 * asignaciones duplicadas. Entre modalidades puede estar presente en varias.
 */
export interface FleetDriver {
  userId: string;
  displayName: string;
  status: string;
  vehicleId: string | null;
  vehicleName: string | null;
  vehicleCategoryCode: string | null;
  isActiveAssignment: boolean | null;
  isAvailable: boolean | null;
  services: string[];
}

export interface FleetCategorySummary {
  code: string;
  total: number;
  active: number;
}
export interface FleetServiceSummary {
  code: string;
  total: number;
  active: number;
  categories: FleetCategorySummary[];
}

export const FLEET_SERVICE_CODES = ["passenger", "cargo", "courier", "tourism"] as const;
export const UNCLASSIFIED_CATEGORY = "__unclassified__";

/** Deduplicación defensiva entre asignaciones activas válidas. */
function rowPriority(row: FleetDriver): number {
  return (row.isActiveAssignment ? 4 : 0) + (row.vehicleCategoryCode ? 2 : 0) + (row.vehicleId ? 1 : 0);
}

function categoryCode(row: FleetDriver): string {
  return row.vehicleCategoryCode || UNCLASSIFIED_CATEGORY;
}

export function matchingFleetDrivers<T extends FleetDriver>(
  rows: readonly T[],
  serviceCode: string,
  category: string | null = null,
): T[] {
  const byDriver = new Map<string, T>();
  for (const row of rows) {
    if (!row.userId || row.isActiveAssignment !== true || !row.services.includes(serviceCode)) continue;
    const existing = byDriver.get(row.userId);
    if (!existing || rowPriority(row) > rowPriority(existing)) byDriver.set(row.userId, row);
  }
  const people = [...byDriver.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" }),
  );
  return category === null ? people : people.filter((person) => categoryCode(person) === category);
}

export function summarizeFleet(rows: readonly FleetDriver[]): FleetServiceSummary[] {
  return FLEET_SERVICE_CODES.map((code) => {
    const people = matchingFleetDrivers(rows, code);
    const categories = new Map<string, FleetCategorySummary>();
    for (const person of people) {
      const category = categoryCode(person);
      const existing = categories.get(category) ?? { code: category, total: 0, active: 0 };
      existing.total += 1;
      if (person.status === "active") existing.active += 1;
      categories.set(category, existing);
    }
    return {
      code,
      total: people.length,
      active: people.filter((member) => member.status === "active").length,
      categories: [...categories.values()].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code)),
    };
  });
}
