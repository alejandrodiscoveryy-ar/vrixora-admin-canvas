/**
 * Vista previa local del ajuste general de tarifas TUKTUK.
 * No escribe en Supabase ni sustituye al cotizador oficial.
 */
import type { MarketplacePricingTariff } from './services/types';

export type GlobalPricingScope = 'all' | 'passenger' | 'cargo' | 'courier';

export type PricingField =
  | 'basePriceUsd'
  | 'minimumPriceUsd'
  | 'perKmPriceUsd'
  | 'perExtraPassengerPriceUsd'
  | 'perStopPriceUsd';

export const GLOBAL_PRICING_FIELDS: readonly PricingField[] = [
  'basePriceUsd',
  'minimumPriceUsd',
  'perKmPriceUsd',
  'perExtraPassengerPriceUsd',
  'perStopPriceUsd',
];

export interface GlobalPricingPreviewRow {
  serviceCode: string;
  vehicleCategoryCode: string;
  before: MarketplacePricingTariff;
  after: MarketplacePricingTariff;
  example5kmUsdBefore: number | null;
  example5kmUsdAfter: number | null;
  example5kmCupBefore: number | null;
  example5kmCupAfter: number | null;
}

const VALID_SERVICES = new Set(['passenger', 'cargo', 'courier']);

const validAmount = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0;

// Preserva hasta 6 decimales para no alterar la tarifa por km al redondear a centavos.
export function adjustedUsd(value: number | null, reductionPercent: number): number | null {
  if (!validAmount(value)) return null;
  return Math.round(value * (1 - reductionPercent / 100) * 1_000_000) / 1_000_000;
}

// Solo traslado simple: sin paradas, pasajeros extra, horarios ni zonas especiales.
export function structuralExampleUsd(tariff: MarketplacePricingTariff, km = 5): number | null {
  const { basePriceUsd, minimumPriceUsd, perKmPriceUsd } = tariff;
  if (!validAmount(basePriceUsd) || !validAmount(minimumPriceUsd) || !validAmount(perKmPriceUsd) ||
      !Number.isFinite(km) || km <= 0) return null;
  const amount = Math.max(minimumPriceUsd, basePriceUsd + perKmPriceUsd * km);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Aproximación ilustrativa del redondeo configurado hoy (hacia arriba en CUP).
export function exampleCup(usd: number | null, rate: number, roundingIncrement = 100): number | null {
  if (usd === null || !Number.isFinite(usd) || usd <= 0 ||
      !Number.isFinite(rate) || rate <= 0 ||
      !Number.isFinite(roundingIncrement) || roundingIncrement <= 0) return null;
  return Math.ceil((usd * rate - 1e-9) / roundingIncrement) * roundingIncrement;
}

export function previewGlobalPricingAdjustment(
  tariffs: readonly MarketplacePricingTariff[],
  scope: GlobalPricingScope,
  reductionPercent: number,
  exchangeRate: number,
  roundingIncrement = 100,
): GlobalPricingPreviewRow[] {
  if (!Number.isFinite(reductionPercent) || !Number.isInteger(reductionPercent) ||
      reductionPercent < 0 || reductionPercent > 40) return [];
  if (scope !== 'all' && !VALID_SERVICES.has(scope)) return [];

  return tariffs
    .filter((tariff) => VALID_SERVICES.has(tariff.serviceCode) &&
      (scope === 'all' || tariff.serviceCode === scope))
    .map((before) => {
      const after = { ...before };
      for (const field of GLOBAL_PRICING_FIELDS) {
        after[field] = adjustedUsd(before[field], reductionPercent);
      }
      const example5kmUsdBefore = structuralExampleUsd(before);
      const example5kmUsdAfter = structuralExampleUsd(after);
      return {
        serviceCode: before.serviceCode,
        vehicleCategoryCode: before.vehicleCategoryCode,
        before,
        after,
        example5kmUsdBefore,
        example5kmUsdAfter,
        example5kmCupBefore: exampleCup(example5kmUsdBefore, exchangeRate, roundingIncrement),
        example5kmCupAfter: exampleCup(example5kmUsdAfter, exchangeRate, roundingIncrement),
      };
    });
}
