import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabase';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownRight, Info, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { MarketplacePricingTariff } from '@/lib/services';
import { previewGlobalPricingAdjustment, type GlobalPricingScope, type PricingField } from '@/lib/smart-pricing-global-adjustment';

interface Props {
  projectId: string;
  tariffs: MarketplacePricingTariff[];
  exchangeRate: number;
  canManage: boolean;
  tariffsLoading: boolean;
  tariffsError: boolean;
}

interface VerifiedPreview {
  fingerprint: string;
  scope: GlobalPricingScope;
  reduction: number;
  count: number;
  sourceKey: string;
}
interface PriceBatch {
  batch_id: string;
  scope: string;
  reduction_percent: number;
  count: number;
  created_at: string;
  reverted: boolean;
}
type PendingAction = { kind: 'apply' } | { kind: 'revert'; batchId: string };

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
  projectId, tariffs, exchangeRate, canManage, tariffsLoading, tariffsError,
}: Props) {
  const queryClient = useQueryClient();
  const [verified, setVerified] = useState<VerifiedPreview | null>(null);
  const [history, setHistory] = useState<PriceBatch[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<GlobalPricingScope>('all');
  const [reduction, setReduction] = useState(15);
  const previews = useMemo(
    () => previewGlobalPricingAdjustment(tariffs, scope, reduction, exchangeRate, 100),
    [tariffs, scope, reduction, exchangeRate],
  );
  // Protege la aprobación frente a cambios del catálogo, de la tasa o del porcentaje.
  const sourceKey = useMemo(
    () => JSON.stringify([scope, reduction, exchangeRate, previews.map((r) => [
      r.serviceCode, r.vehicleCategoryCode, r.before.updatedAt,
      r.before.basePriceUsd, r.before.minimumPriceUsd, r.before.perKmPriceUsd,
      r.before.perExtraPassengerPriceUsd, r.before.perStopPriceUsd,
    ])]),
    [scope, reduction, exchangeRate, previews],
  );
  const isVerified = verified !== null && verified.sourceKey === sourceKey &&
    verified.scope === scope && verified.reduction === reduction &&
    verified.count === previews.length;

  useEffect(() => {
    let active = true;
    if (!canManage) return;
    void getSupabaseClient().rpc('admin_list_marketplace_global_adjustments', {
      target_project_id: projectId,
    }).then(({ data, error }) => {
      if (!active) return;
      if (error) { setHistoryError(error.message); return; }
      setHistory(Array.isArray(data) ? data as PriceBatch[] : []);
      setHistoryError(null);
    });
    return () => { active = false; };
  }, [canManage, projectId]);

  async function reloadHistory() {
    const { data, error } = await getSupabaseClient().rpc('admin_list_marketplace_global_adjustments', {
      target_project_id: projectId,
    });
    if (error) { setHistoryError(error.message); return; }
    setHistory(Array.isArray(data) ? data as PriceBatch[] : []);
    setHistoryError(null);
  }

  const invalid = previews.filter((row) => row.example5kmUsdBefore === null || row.example5kmUsdAfter === null).length;

  const canValidate = canManage && !busy && !tariffsLoading && !tariffsError &&
    previews.length > 0 && invalid === 0 && Number.isFinite(exchangeRate) && exchangeRate > 0;

  async function validateServer() {
    if (!canValidate || reduction === 0) return;
    setBusy(true);
    setVerified(null);
    setPending(null);
    try {
      const { data, error } = await getSupabaseClient().rpc('admin_preview_marketplace_global_adjustment', {
        target_project_id: projectId,
        target_scope: scope,
        target_reduction_percent: reduction,
      });
      if (error) throw error;
      const plan = data as { fingerprint?: unknown; count?: unknown; entries?: unknown } | null;
      if (typeof plan?.fingerprint !== 'string' || !/^[a-f0-9]{32}$/.test(plan.fingerprint) ||
        typeof plan.count !== 'number' || plan.count !== previews.length) {
        throw new Error('Las tarifas de la pantalla no coinciden con el servidor. Actualiza los datos.');
      }
      // No basta que coincida la cantidad: tambiÃ©n deben coincidir los cinco precios de cada tarifa.
      const entries = plan.entries;
      if (!Array.isArray(entries) || entries.length !== previews.length) {
        throw new Error('La vista previa ha cambiado. Actualiza las tarifas y vuelve a comprobar.');
      }
      const serverRows = new Map<string, unknown[]>();
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 10 ||
            typeof entry[1] !== 'string' || typeof entry[2] !== 'string') {
          throw new Error('Respuesta incompleta del servidor. No se puede publicar.');
        }
        const key = `${entry[1]}:${entry[2]}`;
        if (serverRows.has(key)) throw new Error('Tarifas duplicadas en el servidor. No se puede publicar.');
        serverRows.set(key, entry);
      }
      const samePrices = previews.every((preview) => {
        const item = serverRows.get(`${preview.serviceCode}:${preview.vehicleCategoryCode}`);
        if (!item) return false;
        const fields = [
          preview.before.basePriceUsd, preview.before.minimumPriceUsd,
          preview.before.perKmPriceUsd, preview.before.perExtraPassengerPriceUsd,
          preview.before.perStopPriceUsd,
        ];
        return fields.every((amount, i) => typeof item[4 + i] === 'number' && item[4 + i] === amount);
      });
      if (!samePrices) {
        throw new Error('Los importes mostrados no coinciden con Supabase. Actualiza la pantalla antes de publicar.');
      }
      setVerified({ fingerprint: plan.fingerprint, count: plan.count, scope, reduction, sourceKey });
      toast.success('Tarifas verificadas en el servidor. Puedes confirmar el ajuste.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction() {
    if (!pending || busy || !canManage) return;
    const label = pending.kind === 'apply' ? 'APLICAR' : 'REVERTIR';
    if (confirmation.trim() !== label) return;
    if (pending.kind === 'apply' && (!isVerified || !verified || !canValidate)) return;
    setBusy(true);
    try {
      const { error } = pending.kind === 'apply'
        ? await getSupabaseClient().rpc('admin_apply_marketplace_global_adjustment', {
            target_project_id: projectId,
            target_scope: scope,
            target_reduction_percent: reduction,
            expected_fingerprint: verified!.fingerprint,
          })
        : await getSupabaseClient().rpc('admin_revert_marketplace_global_adjustment', {
            target_project_id: projectId,
            target_batch_id: pending.batchId,
          });
      if (error) throw error;
      toast.success(pending.kind === 'apply' ? 'Reducción aplicada a las tarifas nuevas.' : 'Tarifas restauradas.');
      setVerified(null);
      setPending(null);
      setConfirmation('');
      await queryClient.invalidateQueries({ queryKey: ['marketplace-pricing-tariffs', projectId] });
      await reloadHistory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setVerified(null);
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Ajuste general de tarifas con publicación confirmada" className="space-y-4">
      <div className="relative isolate overflow-hidden rounded-2xl border border-cyan-500/30 bg-card/80 shadow-sm">
        <SlidersHorizontal aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-52 w-52 -rotate-12 text-cyan-300 opacity-[0.045]" />
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
              Ajuste seguro · confirmación obligatoria
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <label className="block space-y-2 text-sm font-medium text-foreground">
              <span>Aplicar ajuste a</span>
              <select
                aria-label="Alcance del ajuste general"
                value={scope}
                onChange={(event) => { setScope(event.target.value as GlobalPricingScope); setVerified(null); setPending(null); }}
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
                onChange={(event) => { setReduction(Number(event.target.value)); setVerified(null); setPending(null); }}
                className="h-4 w-full cursor-pointer accent-cyan-500"
              />
              <div className="flex flex-wrap items-center gap-2">
                {[5, 10, 15, 20, 30].map((value) => (
                  <button key={value} type="button" aria-pressed={value === reduction} onClick={() => { setReduction(value); setVerified(null); setPending(null); }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${reduction === value ? 'border-cyan-500/65 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200' : 'border-border/60 text-muted-foreground hover:border-cyan-500/40'}`}>
                    −{value} %
                  </button>
                ))}
                <button type="button" onClick={() => { setScope('all'); setReduction(15); setVerified(null); setPending(null); }}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <RotateCcw className="h-3.5 w-3.5" /> Restablecer
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
            <p>La simulación no cambia ningún precio. Para publicar debes verificar las tarifas en el servidor y confirmar escribiendo APLICAR. Supabase actualiza todo el lote o no modifica nada. Se conserva historial para revertir sin sobrescribir ediciones posteriores.</p>
          </div>
        </div>
      </div>

            {canManage && (
              <div className="space-y-3 rounded-2xl border border-cyan-500/35 bg-cyan-500/5 p-4" aria-label="Publicación segura del ajuste global">
                <div>
                  <h4 className="font-semibold text-foreground">Publicar la reducción general</h4>
                  <p className="mt-1 text-xs text-muted-foreground">Confirma el lote completo en Supabase antes de modificar tarifas. El precio final puede variar por recargos y redondeos.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" disabled={!canValidate || reduction === 0}
                    onClick={() => void validateServer()}
                    className="min-h-11 rounded-xl border border-cyan-500/40 bg-background px-4 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40">
                    {busy ? 'Comprobando…' : '1. Verificar con Supabase'}
                  </button>
                  <button type="button" disabled={!isVerified || busy || !canValidate}
                    onClick={() => { setPending({ kind: 'apply' }); setConfirmation(''); }}
                    className="min-h-11 rounded-xl bg-cyan-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                    2. Aplicar reducción de {reduction} % a {previews.length} tarifas
                  </button>
                </div>
                {isVerified && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-300">Comprobación correcta: {previews.length} tarifas coinciden con Supabase.</p>}
              </div>
            )}

      {pending && canManage && (
        <Dialog open onOpenChange={(open) => { if (!open && !busy) { setPending(null); setConfirmation(''); } }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto border-amber-500/50 bg-card sm:max-w-lg">
            <DialogTitle>Confirmación obligatoria</DialogTitle>
            <DialogDescription>Revisa el alcance y confirma expresamente antes de modificar tarifas.</DialogDescription>
          <p className="mt-2 text-sm text-foreground">
            {pending.kind === 'apply'
              ? `Se modificarán ${previews.length} tarifas vigentes de ${scope === 'all' ? 'todos los servicios' : serviceLabels[scope]} reduciendo ${reduction} %. Los viajes ya acordados no cambian.`
              : `Se restaurará el lote ${pending.batchId}. Si una tarifa cambió después, Supabase rechazará toda la reversión.`}
          </p>
          <label className="mt-3 block text-sm font-medium text-foreground">
            Escribe {pending.kind === 'apply' ? 'APLICAR' : 'REVERTIR'} para autorizar
            <input type="text" autoComplete="off" autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
              className="mt-2 block h-11 w-full max-w-sm rounded-xl border border-border bg-background px-3" />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={busy || confirmation.trim() !== (pending.kind === 'apply' ? 'APLICAR' : 'REVERTIR') ||
                (pending.kind === 'apply' && (!isVerified || !canValidate))}
              onClick={() => void confirmAction()}
              className="min-h-11 rounded-xl bg-amber-700 px-5 text-sm font-bold text-white disabled:opacity-40">
              {busy ? 'Procesando…' : 'Confirmar operación real'}
            </button>
            <button type="button" disabled={busy} onClick={() => { setPending(null); setConfirmation(''); }}
              className="min-h-11 rounded-xl border border-border px-4 text-sm text-foreground">Cancelar</button>
          </div>
          </DialogContent>
        </Dialog>
      )}

      {canManage && (
        <details className="rounded-2xl border border-border/70 bg-card/75 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">Historial y reversión · {history.length} operaciones</summary>
          <section aria-label="Historial de ajustes globales" className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold text-foreground">Historial y reversión</h4>
            <button type="button" disabled={busy} onClick={() => void reloadHistory()} className="text-xs font-medium text-cyan-600 dark:text-cyan-300">Actualizar historial</button>
          </div>
          {historyError && <p role="alert" className="mt-2 text-xs text-amber-600">Historial no disponible: {historyError}</p>}
          {history.length === 0 && !historyError && <p className="mt-2 text-xs text-muted-foreground">Aún no hay reducciones globales publicadas.</p>}
          <div className="mt-3 space-y-2">
            {history.map((batch) => (
              <div key={batch.batch_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{serviceLabels[batch.scope] ?? (batch.scope === 'all' ? 'Todos los servicios' : batch.scope)} · −{batch.reduction_percent} %</p>
                  <p className="mt-1 text-xs text-muted-foreground">{batch.count} tarifas · {new Date(batch.created_at).toLocaleString('es-CU')}</p>
                </div>
                {batch.reverted ? <span className="text-xs font-semibold text-muted-foreground">Revertido</span> : (
                  <button type="button" disabled={busy} onClick={() => { setPending({ kind: 'revert', batchId: batch.batch_id }); setConfirmation(''); }}
                    className="min-h-10 rounded-xl border border-amber-500/40 px-4 text-xs font-semibold text-foreground disabled:opacity-40">Revertir lote</button>
                )}
              </div>
            ))}
          </div>
          </section>
        </details>
      )}

      {tariffsLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando tarifas vigentes…</p>
        : tariffsError ? <p role="alert" className="rounded-xl border border-rose-500/30 p-4 text-sm text-rose-500">No se pudieron consultar las tarifas. No se calcula una vista previa sin datos.</p>
        : previews.length === 0 ? <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No existen tarifas vigentes para el ámbito seleccionado.</p>
        : (
          <details className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <summary className="cursor-pointer text-base font-semibold text-foreground">Desglose por modalidad · {previews.length} tarifas</summary>
            <div className="space-y-3 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3 px-1">
              <div>
                <h4 className="text-base font-semibold text-foreground">Comparación de tarifas</h4>
                <p className="mt-1 text-xs text-muted-foreground">{previews.length} modalidades · valores reales frente a importes propuestos en USD.</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4" /> {canManage ? 'Verifica antes de publicar' : 'Acceso de solo lectura'}
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
          </details>
        )}
    </section>
  );
}
