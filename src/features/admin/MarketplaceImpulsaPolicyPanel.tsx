import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

type Policy = { enabled: boolean; billing_enabled: boolean; general_rate: number; own_rate: number; commercial_rate: number; live_general_rate: number; version: number };
const pct = (n: number) => String(Number((n * 100).toFixed(4)));
const cup = (n: number) => new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(n) + " CUP";

export default function MarketplaceImpulsaPolicyPanel({ projectId, canView, canEdit, embedded = false }: { projectId: string; canView: boolean; canEdit: boolean; embedded?: boolean }) {
  const qc = useQueryClient();
  const [general, setGeneral] = useState("15");
  const [own, setOwn] = useState("10");
  const [commercial, setCommercial] = useState("5");
  const [fare, setFare] = useState("1000");
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["marketplace-impulsa-policy", projectId], enabled: canView,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_impulsa_policy_v1", { target_project_id: projectId });
      if (error || !data) throw new Error(error?.message || "Configuración no disponible");
      return data as Policy;
    },
  });
  useEffect(() => {
    if (!query.data) return;
    setGeneral(pct(query.data.general_rate)); setOwn(pct(query.data.own_rate)); setCommercial(pct(query.data.commercial_rate));
  }, [query.data]);
  const [g, o, c] = [general, own, commercial].map(Number);
  const valid = [general, own, commercial].every(v => v.trim() !== "") && [g,o,c].every(Number.isFinite) && g>0 && g<=100 && o>0 && o<=g && c>=0 && c<=g;
  const total = Math.max(0, Number(fare) || 0);
  const changed = !!query.data && (g/100 !== Number(query.data.general_rate) || o/100 !== Number(query.data.own_rate) || c/100 !== Number(query.data.commercial_rate));
  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!query.data || !canEdit || !valid) throw new Error("Revisa los porcentajes y permisos.");
      const { error } = await getSupabaseClient().rpc("admin_save_marketplace_impulsa_policy_v1", {
        target_project_id: projectId, target_expected_version: query.data.version,
        target_general_rate: g/100, target_own_rate: o/100, target_commercial_rate: c/100, target_enabled: enabled,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_, enabled) => {
      setMessage(enabled ? "Política activa. Solo nuevas publicaciones; las carreras anteriores conservan su porcentaje." : "Configuración guardada sin activar Impulsa.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["marketplace-impulsa-policy", projectId] }),
        qc.invalidateQueries({ queryKey: ["marketplace-commission-policy", projectId] }),
        qc.invalidateQueries({ queryKey: ["marketplace-welcome-policy", projectId] }),
        qc.invalidateQueries({ queryKey: ["marketplace-overview", projectId] }),
      ]);
    },
    onError: (error: Error) => {
      setMessage(error.message.includes("IMPULSA_POLICY_CHANGED") ? "La configuración cambió. Actualiza y vuelve a guardar." : error.message.includes("IMPULSA_BILLING_DISABLED") ? "Activa primero el cobro general. No se modificó ningún saldo." : "No se pudo guardar. Revisa permisos y configuración.");
      void qc.invalidateQueries({ queryKey: ["marketplace-impulsa-policy", projectId] });
    },
  });
  if (!canView) return null;

  return (
    <section aria-label="Comisiones comerciales Impulsa" className={embedded ? "min-w-0 space-y-4" : cp.section}>
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Comisiones comerciales</h2>
          <p className="mt-1 text-sm text-text-secondary">Porcentajes por tipo de servicio y distribución de ingresos.</p>
        </div>
      )}
      {query.isError ? (
        <p role="alert" className="rounded-lg border border-amber-400/30 p-3 text-sm text-text-secondary">
          No se pudo cargar la configuración de Impulsa. No se modificó ningún saldo.
        </p>
      ) : query.isLoading ? (
        <p className="py-4 text-sm text-text-secondary">Consultando los porcentajes…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-secondary">
              {query.data?.enabled && query.data?.billing_enabled ? "Impulsa activo" :
                query.data?.enabled ? "Impulsa: cobro suspendido" : "Impulsa desactivado"}
            </p>
            <p className="text-xs text-text-secondary">
              Comisión general vigente: <strong className="text-text-primary">{pct(query.data?.live_general_rate ?? 0)} %</strong>
              {" · "}{query.data?.billing_enabled ? "Cobro activo" : "Cobro desactivado"}
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            {([
              { id: "general", label: "Comisión general", value: general, set: setGeneral, detail: "Carrera normal" },
              { id: "own", label: "Impulsa · Propia", value: own, set: setOwn, detail: "El promotor realiza el viaje" },
              { id: "commercial", label: "Impulsa · Comercial", value: commercial, set: setCommercial, detail: "Otro conductor realiza el viaje" },
            ]).map(field => (
              <div key={field.id} className="min-w-0 space-y-1.5">
                <Label htmlFor={"impulsa-" + field.id}>{field.label}</Label>
                <div className="flex items-center gap-2">
                  <Input id={"impulsa-" + field.id} type="number" min="0" max="100" step="0.01"
                    value={field.value} disabled={!canEdit || save.isPending}
                    onChange={e => field.set(e.target.value)}
                    className={cp.control + " h-11 min-w-0 flex-1 text-lg font-semibold tabular-nums"} />
                  <span className="text-sm text-text-secondary">%</span>
                </div>
                <p className="text-xs leading-relaxed text-text-secondary">{field.detail}</p>
              </div>
            ))}
          </div>

          {!valid && (
            <p role="alert" className="text-sm text-destructive">
              Revisa los porcentajes: la comisión propia y la comercial no pueden superar la general.
            </p>
          )}

          <details className={cp.inset + " group p-0 sm:p-0"}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-text-primary [&::-webkit-details-marker]:hidden">
              Simulador de distribución
              <span className="text-xs font-normal text-text-secondary">Ver ejemplo de reparto</span>
            </summary>
            <div className="space-y-3 border-t border-border-subtle px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="impulsa-fare">Importe de ejemplo (CUP)</Label>
                <Input id="impulsa-fare" type="number" min="0" value={fare} onChange={e => setFare(e.target.value)}
                  className={cp.control + " h-11 w-32 max-w-full tabular-nums"} />
              </div>
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[450px] text-left text-sm">
                  <thead><tr className="border-b border-border-subtle text-xs text-text-secondary">
                    <th scope="col" className="py-2">Servicio</th>
                    <th scope="col" className="py-2 text-right">Conductor</th>
                    <th scope="col" className="py-2 text-right">Comercial</th>
                    <th scope="col" className="py-2 text-right">TukTuk</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ["Normal", 100-g, 0, g],
                      ["Propio", 100-o, 0, o],
                      ["Flota", 100-g, c, g-c],
                    ].map(row => (
                      <tr key={String(row[0])} className="border-b border-border-subtle last:border-b-0">
                        <th scope="row" className="py-2 font-medium">{row[0]}</th>
                        {row.slice(1).map((value, index) => (
                          <td key={index} className="py-2 text-right tabular-nums">{cup(total * Number(value) / 100)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
            <p className="max-w-2xl text-xs leading-relaxed text-text-secondary">
              Solo afecta nuevas carreras reales y liquidadas. Los viajes propios no generan un segundo crédito;
              los saldos y beneficios anteriores se conservan.
            </p>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="max-sm:min-h-11"
                  disabled={!valid || !changed || save.isPending}
                  onClick={() => {
                    if (query.data?.enabled && !window.confirm("¿Guardar los porcentajes para nuevas carreras?")) return;
                    setMessage(""); save.mutate(Boolean(query.data?.enabled));
                  }}>Guardar porcentajes</Button>
                <Button size="sm" className="max-sm:min-h-11" variant="outline"
                  disabled={!valid || save.isPending || (!query.data?.enabled && !query.data?.billing_enabled)}
                  onClick={() => {
                    const next = !query.data?.enabled;
                    if (!window.confirm(next
                      ? "¿Activar Impulsa para futuras carreras? No cambia el interruptor general de cobro."
                      : "¿Desactivar Impulsa para futuras carreras? Los ingresos previos se conservan.")) return;
                    setMessage(""); save.mutate(next);
                  }}>
                  {query.data?.enabled ? "Desactivar Impulsa" : "Activar Impulsa"}
                </Button>
              </div>
            )}
            {message && <p role="status" className="w-full text-sm text-text-primary">{message}</p>}
          </div>
        </>
      )}
    </section>
  );
}
