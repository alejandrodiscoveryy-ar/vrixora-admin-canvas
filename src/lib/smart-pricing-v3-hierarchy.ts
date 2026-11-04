/**
 * Fase 2C - comparativa comercial de solo lectura.
 * No es el motor de cobro; excluye recargos, zonas, espera y otras condiciones.
 */
import { structuralPriceUsd, type V3Tariff } from './smart-pricing-v3-diagnostics.ts';
import { roundTemporalDraftCup } from './smart-pricing-v3-temporal.ts';

export const HIERARCHY_KM = [1, 2, 3, 5, 10] as const;
export type PassengerMode = 'bicitaxi' | 'motorcycle' | 'tricycle' | 'light_car';
export const PASSENGER_ORDER: readonly PassengerMode[] = [
  'bicitaxi', 'motorcycle', 'tricycle', 'light_car',
];

export type HierarchyScenario = {
  km: number;
  currentCup: Record<PassengerMode, number | null>;
  proposedTricycleCup: number | null;
  invertedPairs: Array<readonly [PassengerMode, PassengerMode]>;
  proposedInvertedPairs: Array<readonly [PassengerMode, PassengerMode]> | null;
  tricycleDifferenceCup: number | null;
};

const empty = (): Record<PassengerMode, number | null> => ({
  bicitaxi: null, motorcycle: null, tricycle: null, light_car: null,
});

function findInversions(values: Record<PassengerMode, number | null>): Array<readonly [PassengerMode, PassengerMode]> {
  const pairs: Array<readonly [PassengerMode, PassengerMode]> = [];
  for (let i = 1; i < PASSENGER_ORDER.length; i++) {
    const lower = PASSENGER_ORDER[i - 1];
    const higher = PASSENGER_ORDER[i];
    // Equal CUP values require review too: tiers should not be indistinguishable after rounding.
    if (values[lower] !== null && values[higher] !== null && values[higher] <= values[lower]) {
      pairs.push([lower, higher]);
    }
  }
  return pairs;
}

export function simulatePassengerHierarchy(
  tariffs: readonly V3Tariff[],
  exchangeRate: number,
  roundingIncrement: number,
  roundingMode: string,
  hypotheticalTricycleMinimumUsd: number | null,
  distances: readonly number[] = HIERARCHY_KM,
): HierarchyScenario[] {
  const byMode = new Map<PassengerMode, V3Tariff>();
  for (const tariff of tariffs) {
    if (tariff.serviceCode !== 'passenger') continue;
    if (!PASSENGER_ORDER.includes(tariff.vehicleCategoryCode as PassengerMode)) continue;
    byMode.set(tariff.vehicleCategoryCode as PassengerMode, tariff);
  }
  const trialMinimumValid = hypotheticalTricycleMinimumUsd !== null &&
    Number.isFinite(hypotheticalTricycleMinimumUsd) && hypotheticalTricycleMinimumUsd > 0;

  return distances.filter(km => Number.isFinite(km) && km > 0).map(km => {
    const currentCup = empty();
    for (const mode of PASSENGER_ORDER) {
      currentCup[mode] = roundTemporalDraftCup(
        structuralPriceUsd(byMode.get(mode), km), exchangeRate, roundingIncrement, roundingMode,
      );
    }
    const tri = byMode.get('tricycle');
    const proposedTricycleCup = trialMinimumValid && tri
      ? roundTemporalDraftCup(
          structuralPriceUsd({ ...tri, minimumPriceUsd: hypotheticalTricycleMinimumUsd }, km),
          exchangeRate, roundingIncrement, roundingMode,
        )
      : null;
    const proposedValues = { ...currentCup, tricycle: proposedTricycleCup };
    const tricycleDifferenceCup = proposedTricycleCup !== null && currentCup.tricycle !== null
      ? proposedTricycleCup - currentCup.tricycle : null;
    return {
      km,
      currentCup,
      proposedTricycleCup,
      invertedPairs: findInversions(currentCup),
      proposedInvertedPairs: proposedTricycleCup === null ? null : findInversions(proposedValues),
      tricycleDifferenceCup,
    };
  });
}
