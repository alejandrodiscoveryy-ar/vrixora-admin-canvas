import { useMemo, useState } from 'react';
import { ArrowDownRight, Info, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { MarketplacePricingTariff } from '@/lib/services';
import { previewGlobalPricingAdjustment, type GlobalPricingScope, type PricingField } from '@/lib/smart-pricing-global-adjustment';

interface Props {
  tariffs: MarketplacePricingTariff[];
  exchangeRate: number;
  canManage: boolean;
  tariffsLoading: boolean;
  tariffsError: boolean;
}

const serviceLabels: Record<string, string> = {
  passenger: 'Pasajeros', cargo: 'Carga', courier: 'Mensajería',
};
const vehicleLabels: Record<string, string> = {
  light_car: 'Auto ligero', motorcycle: 'Motocicleta', tricycle: 'Triciclo',
  bicitaxi: 'Bicitaxi', bicycle: 'Bicicleta', van: 'Furgoneta',
  truck: 'Camión', other: 'Otro',
};
const optionalFields: readonly [PricingField, string][] = [
  ['perExtraPassengerPriceUsd', 'Pasajero adicional'],
  ['perStopPriceUsd', 'Parada adicional'],
];

const usd = (value: number | null) => value === null
  ? '—'
  : `${value.toLocaleString('en-US', { maximumFractionDigits: 6 })} USD`;
const cup = (value: number | null) => value === null
  ? '—'
  : `${value.toLocaleString('es-CU', { maximumFractionDigits: 0 })} CUP`;

function Comparison({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-500/25 bg-background/50 px-3 py-2">
      <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground line-through decoration-slate-500/50">{before}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{after}</p>
    </div>
  );
}

export default function MarketplacePricingGlobalAdjustment({
  tariffs, exchangeRate, canManage, tariffsLoading, tariffsError,
}: Props) {
  const [scope, setScope] = useState<GlobalPricingScope>('all');
  const [reduction, setReduction] = useState(15);
  const previews = useMemo(
    () => previewGlobalPricingAdjustment(tariffs, scope, reduction, exchangeRate, 100),
    [tariffs, scope, reduction, exchangeRate],
  );
  const invalid = previews.filter((row) => row.example5kmUsdBefore === null || row.example5kmUsdAfter === null).length;

  return (
    <section aria-label="Ajuste general de tarifas, simulación no publicada" className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-card/80 shadow-sm">
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500/70 to-transparent" />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-500">
                <SlidersHorizontal className="h-6 w-6" />
              </span>
              <div>
                <h4 className="text-lg font-semibold text-foreground">Ajuste general de tarifas</h4>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Reduce proporcionalmente las tarifas de las modalidades seleccionadas, sin editarlas una por una.</p>
              </div>
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-300">
              Solo simulación · no publicado
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <label className="block space-y-2 text-sm font-medium text-foreground">
              <span>Aplicar ajuste a</span>
              <select
                aria-label="Alcance del ajuste general"
                value={scope}
                onChange={(event) => setScope(event.target.value as GlobalPricingScope)}
                className="h-11 w-full rounded-xl border border-slate-500/40 bg-background px-3 text-sm text-foreground"
              >
                <option value="all">Todos los servicios</option>
                <option value="passenger">Solo pasajeros</option>
                <option value="cargo">Solo carga</option>
                <option value="courier">Solo mensajería</option>
              </select>
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="tuktuk-global-reduction" className="text-sm font-medium text-foreground">Reducir precios</label>
                <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-300">{reduction} %</span>
              </div>
              <input
                id="tuktuk-global-reduction"
                type="range"
                min={0}
                max={40}
                step={5}
                value={reduction}
                onChange={(event) => setReduction(Number(event.target.value))}
                className="h-4 w-full cursor-pointer accent-cyan-500"
              />
              <div className="flex flex-wrap items-center gap-2">
                {[5, 10, 15, 20, 30].map((value) => (
                  <button key={value} type="button" aria-pressed={value === reduction} onClick={() => setReduction(value)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${reduction === value ? 'border-cyan-500/65 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200' : 'border-border/60 text-muted-foreground hover:border-cyan-500/40'}`}>
                    −{value} %
                  </button>
                ))}
                <button type="button" onClick={() => { setScope('all'); setReduction(15); }}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <RotateCcw className="h-3.5 w-3.5" /> Restablecer
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
            <p>Esta pantalla no guarda, no publica y no modifica tarifas. Una publicación masiva deberá pasar por autorización y una operación transaccional segura, con historial y reversión.</p>
          </div>
        </div>
      </div>

      {tariffsLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando tarifas vigentes…</p>
        : tariffsError ? <p role="alert" className="rounded-xl border border-rose-500/30 p-4 text-sm text-rose-500">No se pudieron consultar las tarifas. No se calcula una vista previa sin datos.</p>
        : previews.length === 0 ? <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No existen tarifas vigentes para el ámbito seleccionado.</p>
        : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3 px-1">
              <div>
                <h4 className="text-base font-semibold text-foreground">Comparación de tarifas</h4>
                <p className="mt-1 text-xs text-muted-foreground">{previews.length} modalidades · valores reales frente a importes propuestos en USD.</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4" /> {canManage ? 'Vista previa sin publicación' : 'Acceso de solo lectura'}
              </div>
            </div>
            {invalid > 0 && (
              <p role="alert" className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-foreground">
                {invalid} modalidades tienen datos insuficientes para estimar el precio estructural. No se inventan importes.
              </p>
            )}
            <div className="grid gap-3 xl:grid-cols-2">
              {previews.map((row) => (
                <article key={`${row.serviceCode}:${row.vehicleCategoryCode}`} className="rounded-2xl border border-border/70 bg-card/75 p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h5 className="font-semibold text-foreground">{vehicleLabels[row.vehicleCategoryCode] ?? row.vehicleCategoryCode}</h5>
                      <p className="mt-0.5 text-xs text-muted-foreground">{serviceLabels[row.serviceCode] ?? row.serviceCode}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <ArrowDownRight className="h-3.5 w-3.5" /> −{reduction} % en USD
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Comparison label="Base" before={usd(row.before.basePriceUsd)} after={usd(row.after.basePriceUsd)} />
                    <Comparison label="Mínimo" before={usd(row.before.minimumPriceUsd)} after={usd(row.after.minimumPriceUsd)} />
                    <Comparison label="Por km" before={usd(row.before.perKmPriceUsd)} after={usd(row.after.perKmPriceUsd)} />
                    <Comparison label="Ejemplo 5 km · CUP" before={cup(row.example5kmCupBefore)} after={cup(row.example5kmCupAfter)} />
                  </div>
                  <details className="mt-3 rounded-lg border border-border/40 px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">Otros componentes de la tarifa</summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {optionalFields.filter(([field]) => row.serviceCode === 'passenger' || field !== 'perExtraPassengerPriceUsd').map(([field, label]) => (
                        <Comparison key={field} label={label} before={usd(row.before[field])} after={usd(row.after[field])} />
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
            <div className="rounded-xl border border-slate-500/30 bg-background/50 p-3 text-xs leading-relaxed text-muted-foreground">
              El ejemplo de 5 km es estructural (máximo entre mínimo y base + kilómetros), con la tasa consultada y redondeo ilustrativo al alza de 100 CUP. No es una cotización oficial: excluye recargos de aeropuerto, horarios, esperas, paradas, pasajeros adicionales y otras condiciones. El descuento real en CUP puede ser diferente por el redondeo. No modifica la tasa de elTOQUE ni precios ya acordados.
            </div>
          </div>
        )}
    </section>
  );
}
