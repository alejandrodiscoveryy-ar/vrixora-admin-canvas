/** Simulación comercial para BORRADORES. No modifica ni representa una cotización final. */
export type TemporalProfile = {
  vehicle_category_code: string;
  evening_pct: number;
  night_pct: number;
  dawn_pct: number;
  weekend_pct: number;
  holiday_pct: number;
  max_combined_pct: number;
  holiday_dates: string[];
};

export type TemporalScenario = { hour: number; weekend: boolean; holiday: boolean };

export function temporalDraftPct(profile: TemporalProfile, scenario: TemporalScenario): number | null {
  if (!Number.isInteger(scenario.hour) || scenario.hour < 0 || scenario.hour > 23) return null;
  const values = [profile.evening_pct, profile.night_pct, profile.dawn_pct, profile.weekend_pct, profile.holiday_pct, profile.max_combined_pct];
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 40)) return null;
  const hour = scenario.hour;
  const period = hour >= 18 && hour < 22 ? profile.evening_pct :
    hour >= 22 ? profile.night_pct : hour < 6 ? profile.dawn_pct : 0;
  return Math.min(profile.max_combined_pct,
    period + (scenario.weekend ? profile.weekend_pct : 0) + (scenario.holiday ? profile.holiday_pct : 0));
}

export function simulateTemporalDraftUsd(structuralUsd: number, profile: TemporalProfile, scenario: TemporalScenario): number | null {
  if (!Number.isFinite(structuralUsd) || structuralUsd <= 0) return null;
  const pct = temporalDraftPct(profile, scenario);
  return pct === null ? null : structuralUsd * (1 + pct / 100);
}

/** Visual-only projection: server alone owns the actual final CUP customer quote. */
export function roundTemporalDraftCup(usd: number | null, rate: number, increment: number, mode: string): number | null {
  if (usd === null || !Number.isFinite(usd) || usd <= 0 ||
      !Number.isFinite(rate) || rate <= 0 ||
      !Number.isFinite(increment) || increment <= 0 || mode !== 'up') return null;
  const beforeRounding = usd * rate;
  if (!Number.isFinite(beforeRounding)) return null;
  const rounded = Math.ceil(beforeRounding / increment) * increment;
  return Number.isFinite(rounded) ? rounded : null;
}

export function isValidHolidayDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}
