import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Info, ShieldCheck } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import type { MarketplacePricingTariff } from '@/lib/services';
import { simulatePassengerHierarchy } from '@/lib/smart-pricing-v3-hierarchy';

const money = (value: number | null) => value === null
  ? '—' : `${value.toLocaleString('es-CU', { maximumFractionDigits: 0 })} CUP`;

export default function MarketplacePricingV3Hierarchy({ projectId, tariffs, exchangeRate }: {
  projectId: string;
  tariffs: MarketplacePricingTariff[];
  exchangeRate: number;
}) {
  const [hypotheticalMinimum, setHypotheticalMinimum] = useState(2.30);
  const settings = useQuery({
    queryKey: ['marketplace-pricing-hierarchy-config-v3', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc('admin_get_marketplace_pricing_dashboard', {
        target_project_id: projectId,
      });
      if (error) throw error;
      const cfg = ((data ?? {}) as Record<string, unknown>).settings as Record<string, unknown> | undefined;
      return {
        base: String(cfg?.base_currency ?? ''),
        charge: String(cfg?.charge_currency ?? ''),
        mode: String(cfg?.rounding_mode ?? ''),
        increment: Number(cfg?.rounding_increment),
      };
    },
  });
  const configValid = settings.data?.base === 'USD' && settings.data?.charge === 'CUP';
  const rows = useMemo(() => simulatePassengerHierarchy(
    tariffs,
    configValid ? exchangeRate : Number.NaN,
    configValid ? (settings.data?.increment ?? Number.NaN) : Number.NaN,
    settings.data?.mode ?? '',
    Number.isFinite(hypotheticalMinimum) && hypotheticalMinimum > 0 ? hypotheticalMinimum : null,
  ), [tariffs, exchangeRate, configValid, settings.data, hypotheticalMinimum]);
  const withInversions = rows.filter(row => row.invertedPairs.length > 0).length;
  const proposedInversions = rows.filter(row => (row.proposedInvertedPairs?.length ?? 0) > 0).length;
  const ready = rows.some(row => row.currentCup.motorcycle !== null);
  const currentMinimum = tariffs.find(t => t.serviceCode === 'passenger' && t.vehicleCategoryCode === 'tricycle')?.minimumPriceUsd;

  return <section aria-label="Jerarquía tarifaria pasajeros fase 2C" className="overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950/70 text-text-primary shadow-lg admin-graphite-inset">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700/70 p-4 sm:p-5">
      <div className="flex gap-3">
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-2"><ArrowRightLeft className="h-5 w-5 text-cyan-300" /></div>
        <div>
          <h3 className="font-semibold">Jerarquía de tarifas · simulador 2C</h3>
          <p className="mt-1 text-xs text-text-secondary">Compara modalidades de pasajeros a la misma distancia, en moneda nacional.</p>
        </div>
      </div>
      <span className="flex items-center gap-1 rounded-full border border-slate-600 px-3 py-1 text-xs text-text-secondary"><ShieldCheck className="h-3.5 w-3.5" /> Solo simulación</span>
    </div>

    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 admin-graphite-inset">
          <p className="text-xs text-text-secondary">Mínimo actual de triciclo</p>
          <p className="mt-1 font-semibold">{typeof currentMinimum === 'number' ? `${currentMinimum.toFixed(2)} USD` : 'Sin tarifa'}</p>
          <p className="mt-1 text-[11px] text-text-secondary">Parámetro interno: no es el precio final.</p>
        </div>
        <label className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 text-xs text-text-secondary">
          Mínimo hipotético de triciclo (USD)
          <input type="number" min="0.01" max="20" step="0.05" value={Number.isFinite(hypotheticalMinimum) ? hypotheticalMinimum : ''}
            onChange={e => setHypotheticalMinimum(e.target.value === '' ? NaN : Number(e.target.value))}
            className="mt-2 block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-text-primary admin-graphite-inset" />
          <span className="mt-1 block text-[11px] text-cyan-200">Ensayo inicial de 2,30 USD; no aprobado ni guardado.</span>
        </label>
      </div>

      {settings.isError || (!settings.isLoading && !configValid) || !Number.isFinite(exchangeRate) || exchangeRate <= 0
        ? <p role="status" className="flex gap-2 text-xs text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" /> No se puede calcular CUP con una tasa o configuración válida. No se muestra ningún precio supuesto.</p>
        : settings.isLoading ? <p className="text-xs text-text-secondary">Consultando conversión y redondeo oficiales…</p>
          : <p className="text-[11px] text-text-secondary">Tasa registrada: 1 USD = {exchangeRate.toLocaleString('es-CU')} CUP. Redondeo configurado: {settings.data?.mode === 'up' ? 'hacia arriba' : 'no compatible'} en tramos de {settings.data?.increment.toLocaleString('es-CU')} CUP.</p>
      }
      {ready && <div className={`flex items-center gap-2 text-xs ${withInversions ? 'text-amber-200' : 'text-emerald-300'}`}>
        {withInversions ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
        Orden actual: {withInversions} de {rows.length} distancias requieren revisión. Con este ensayo: {proposedInversions}.
      </div>}

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-[860px] w-full text-left text-xs">
          <thead className="bg-slate-800 text-text-secondary">
            <tr>
              {['Trayecto', 'Bicitaxi', 'Motocicleta', 'Triciclo actual', 'Triciclo hipotético', 'Auto ligero', 'Orden actual'].map(h =>
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-3 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => <tr key={row.km} className="border-t border-slate-700/70 bg-slate-900/45">
              <th scope="row" className="px-3 py-3 font-semibold">{row.km} km</th>
              <td className="whitespace-nowrap px-3 py-3">{money(row.currentCup.bicitaxi)}</td>
              <td className="whitespace-nowrap px-3 py-3">{money(row.currentCup.motorcycle)}</td>
              <td className="whitespace-nowrap px-3 py-3">{money(row.currentCup.tricycle)}</td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold text-cyan-200">
                {money(row.proposedTricycleCup)}
                {row.tricycleDifferenceCup !== null && row.tricycleDifferenceCup !== 0 &&
                  <span className="ml-1 text-[10px] text-text-secondary">({row.tricycleDifferenceCup > 0 ? '+' : ''}{row.tricycleDifferenceCup.toLocaleString('es-CU')})</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-3">{money(row.currentCup.light_car)}</td>
              <td className={row.invertedPairs.length || Object.values(row.currentCup).some(value => value === null) ? 'px-3 py-3 text-amber-200' : 'px-3 py-3 text-emerald-300'}>
                {Object.values(row.currentCup).some(value => value === null) ? 'Incompleto' : row.invertedPairs.length ? 'Revisar' : 'En orden'}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="flex gap-2 text-[11px] leading-relaxed text-text-secondary"><Info className="h-4 w-4 shrink-0" /> La comparación es estructural (mínimo, base y kilómetros), convertida a CUP con la tasa y redondeo del proyecto. Excluye recargos temporales, aeropuerto, espera, paradas, peajes y otras reglas del motor. No equivale a una cotización final ni modifica tarifas vigentes. Igualdades tras redondear también se señalan para revisión.</p>
    </div>
  </section>;
}
