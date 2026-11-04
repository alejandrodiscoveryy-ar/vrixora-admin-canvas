/** Diagnostico comercial de solo lectura; NO es un motor tarifario ni publica reglas. */
export type V3Tariff = {
  serviceCode: string;
  vehicleCategoryCode: string;
  basePriceUsd: number | null;
  minimumPriceUsd: number | null;
  perKmPriceUsd: number | null;
};

export type V3Adjustment = {
  name: string;
  ruleKind: string;
  serviceCode: string;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type GapResult = {
  from: string;
  to: string;
  lowPriceUsd: number;
  highPriceUsd: number;
  actualGapPct: number;
  requiredPriceUsd: number;
  requiresReview: boolean;
};

const PASSENGER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['motorcycle', 'tricycle'],
  ['tricycle', 'light_car'],
];

const TEMPORAL_KINDS = new Set(['peak_hour', 'night', 'late_night', 'weekend', 'holiday']);

export function structuralPriceUsd(tariff: V3Tariff | undefined, km: number): number | null {
  if (!tariff || !Number.isFinite(km) || km <= 0) return null;
  const { basePriceUsd: base, minimumPriceUsd: min, perKmPriceUsd: unit } = tariff;
  if (base === null || min === null || unit === null ||
      !Number.isFinite(base) || !Number.isFinite(min) || !Number.isFinite(unit) ||
      base < 0 || min < 0 || unit < 0) return null;
  const price = Math.max(min, base + km * unit);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function passengerGapDiagnostics(
  tariffs: V3Tariff[],
  km: number,
  proposedGapPct: number,
): GapResult[] {
  if (!Number.isFinite(proposedGapPct) || proposedGapPct < 0 || proposedGapPct > 100) return [];
  const byVehicle = new Map(
    tariffs.filter((t) => t.serviceCode === 'passenger').map((t) => [t.vehicleCategoryCode, t]),
  );
  return PASSENGER_PAIRS.flatMap(([from, to]) => {
    const low = structuralPriceUsd(byVehicle.get(from), km);
    const high = structuralPriceUsd(byVehicle.get(to), km);
    if (low === null || high === null) return [];
    const actualGapPct = ((high / low) - 1) * 100;
    const requiredPriceUsd = low * (1 + proposedGapPct / 100);
    return [{
      from, to,
      lowPriceUsd: low,
      highPriceUsd: high,
      actualGapPct,
      requiredPriceUsd,
      requiresReview: high + 1e-8 < requiredPriceUsd,
    }];
  });
}

export function activeTemporalRules(adjustments: V3Adjustment[], serviceCode: string, now: Date): V3Adjustment[] {
  const ms = now.getTime();
  if (!Number.isFinite(ms)) return [];
  return adjustments.filter((a) =>
    a.serviceCode === serviceCode && a.status === 'active' &&
    TEMPORAL_KINDS.has(a.ruleKind) &&
    Number.isFinite(Date.parse(a.effectiveFrom)) &&
    Date.parse(a.effectiveFrom) <= ms &&
    (a.effectiveTo === null || (Number.isFinite(Date.parse(a.effectiveTo)) && Date.parse(a.effectiveTo) > ms)),
  );
}
