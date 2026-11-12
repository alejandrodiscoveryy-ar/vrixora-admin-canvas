import { useState } from 'react';
import { AlertTriangle, CalendarClock, Gauge, ShieldCheck } from 'lucide-react';
import type { MarketplacePricingTariff, MarketplacePricingAdjustment } from '@/lib/services';
import { activeTemporalRules, passengerGapDiagnostics } from '@/lib/smart-pricing-v3-diagnostics';

const names: Record<string, string> = {
  motorcycle: 'Motocicleta', tricycle: 'Triciclo', light_car: 'Auto ligero',
};
const money = (value: number) => `${value.toFixed(2)} USD`;

export default function MarketplacePricingV3Diagnostics({
  serviceCode,
  tariffs,
  adjustments,
}: {
  serviceCode: 'passenger' | 'cargo' | 'courier';
  tariffs: MarketplacePricingTariff[];
  adjustments: MarketplacePricingAdjustment[];
}) {
  const [km, setKm] = useState(2);
  const [gap, setGap] = useState(25);
  const results = passengerGapDiagnostics(tariffs, km, gap);
  const temporal = activeTemporalRules(adjustments, serviceCode, new Date());
  const temporalCategories = [
    { key: 'night', name: 'Noche' },
    { key: 'late_night', name: 'Madrugada' },
    { key: 'weekend', name: 'Fin de semana' },
    { key: 'holiday', name: 'Festivos' },
  ];

  return (
    <section aria-label="Diagnostico Smart Pricing V3" className="overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950/65 text-text-primary shadow-lg admin-graphite-inset">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700/70 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-2"><Gauge className="h-5 w-5 text-cyan-300" /></span>
          <div>
            <h3 className="text-base font-semibold">Diagnóstico comercial · Smart Pricing V3</h3>
            <p className="text-xs text-text-secondary">Supervisión real de tarifas. Las diferencias se calculan con precios estructurales.</p>
          </div>
        </div>
        <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-[11px] font-semibold text-text-primary">Solo lectura · no publica</span>
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2 sm:px-5">
        <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/65 p-4 admin-graphite-inset">
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Jerarquía de modalidades</div>
          {serviceCode === 'passenger' ? (
            <>
              <div className="flex flex-wrap items-end gap-4">
                <label className="space-y-1 text-xs text-text-secondary">
                  Distancia comparada
                  <select className="mt-1 block rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-text-primary admin-graphite-control" value={km} onChange={(e) => setKm(Number(e.target.value))}>
                    <option value={2}>2 km</option><option value={5}>5 km</option><option value={10}>10 km</option>
                  </select>
                </label>
                <label className="min-w-[160px] flex-1 space-y-1 text-xs text-text-secondary">
                  Separación mínima de prueba: {gap} %
                  <input aria-label="Porcentaje ilustrativo de separación" type="range" min="0" max="50" step="5" value={gap} onChange={(e) => setGap(Number(e.target.value))} className="mt-2 block w-full accent-cyan-400" />
                </label>
              </div>
              <div className="space-y-2">
                {results.length === 0 ? <p className="text-xs text-amber-200">Faltan tarifas comparables para el diagnóstico.</p> : results.map((result) => (
                  <div key={`${result.from}:${result.to}`} className="rounded-lg border border-slate-700 bg-slate-950/65 px-3 py-3 admin-graphite-inset">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{names[result.from]} → {names[result.to]}</span>
                      <span className={result.requiresReview ? 'font-bold text-amber-300' : 'font-bold text-emerald-300'}>
                        {result.actualGapPct >= 0 ? '+' : ''}{result.actualGapPct.toFixed(1)} %
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">{money(result.lowPriceUsd)} frente a {money(result.highPriceUsd)}</p>
                    {result.requiresReview ? <p className="mt-1 flex gap-1 text-xs text-amber-200"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Brecha inferior al mínimo de simulación; revisar costos antes de corregir.</p> : <p className="mt-1 text-xs text-emerald-300">Cumple el mínimo simulado.</p>}
                  </div>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-text-secondary">El 25 % inicial es solo una referencia de ensayo. No es un porcentaje aprobado. Excluye duración, paradas, recargos, cambio CUP y redondeo.</p>
            </>
          ) : <p className="text-sm text-text-secondary">La jerarquía de {serviceCode === 'cargo' ? 'carga' : 'mensajería'} requiere reglas propias de capacidad y servicio; no se compara automáticamente con pasajeros.</p>}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-700/80 bg-slate-900/65 p-4 admin-graphite-inset">
          <div className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-cyan-300" /> Condiciones temporales</div>
          <div className="grid grid-cols-2 gap-2">
            {temporalCategories.map((item) => {
              const active = temporal.some((rule) => rule.ruleKind === item.key);
              return <div key={item.key} className="rounded-lg border border-slate-700 bg-slate-950/65 px-3 py-3 admin-graphite-inset">
                <p className="text-xs font-medium">{item.name}</p>
                <p className={`mt-2 text-xs font-semibold ${active ? 'text-emerald-300' : 'text-amber-300'}`}>{active ? 'Regla activa' : 'Sin regla activa'}</p>
              </div>;
            })}
          </div>
          <p className="text-xs text-text-secondary">Reglas temporales vigentes para este servicio: <strong>{temporal.length}</strong>.</p>
          <p className="text-[11px] leading-relaxed text-text-secondary">El motor dispone de criterios horarios, pero este panel solo observa reglas publicadas. No genera ni activa recargos automáticamente. El servidor debe respetar la hora oficial cubana.</p>
        </div>
      </div>
    </section>
  );
}
