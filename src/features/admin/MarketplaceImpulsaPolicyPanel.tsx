import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { PolicyNumberField, PolicyStatus } from "@/features/admin/CommercialPolicyControls";
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
    <section aria-label="Comisiones comerciales Impulsa" className={embedded ? "min-w-0 space-y-3" : cp.section}>
      {!embedded && (
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-text-primary">Reglas y comisiones de Impulsa</h2>
          <p className="mt-1 text-sm text-text-secondary">Porcentajes para viajes propios y atribuidos a un promotor.</p>
        </div>
      )}
      {query.isError ? (
        <p role="alert" className="rounded-xl border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] p-3 text-sm text-text-primary">
          No se pudo cargar la política Impulsa. No se modificó ningún saldo.
        </p>
      ) : query.isLoading ? (
        <p role="status" className="py-4 text-sm text-text-secondary">Consultando los porcentajes vigentes…</p>
      ) : (
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <PolicyStatus
              active={Boolean(query.data?.enabled && query.data?.billing_enabled)}
              label={query.data?.enabled && query.data?.billing_enabled
                ? "Impulsa activo" : query.data?.enabled ? "Impulsa sin cobro" : "Impulsa desactivado"}
            />
            <PolicyStatus active={Boolean(query.data?.billing_enabled)}
              label={query.data?.billing_enabled ? "Cobro general activo" : "Cobro general suspendido"} />
            {changed && <PolicyStatus active={false} pending />}
          </div>

          <div className="grid min-w-0 gap-3 md:grid-cols-3">
            {([
              { id: "general", label: "Comisión normal", value: general, set: setGeneral, detail: "Porcentaje general que paga el conductor." },
              { id: "own", label: "Viaje propio Impulsa", value: own, set: setOwn, detail: "El conductor promotor realiza el servicio." },
              { id: "commercial", label: "Atribución comercial", value: commercial, set: setCommercial, detail: "Porcentaje para el promotor si otro conductor hace el viaje." },
            ]).map(field => (
              <div key={field.id} className="min-w-0 rounded-[var(--radius-card)] border border-border-default bg-surface-2/60 p-3 sm:p-4">
                <PolicyNumberField
                  id={"impulsa-" + field.id} label={field.label}
                  value={field.value} onChange={field.set} unit="%"
                  min="0" max="100" step="0.01"
                  disabled={!canEdit || save.isPending}
                  hint={field.detail}
                />
              </div>
            ))}
          </div>
          {!valid && (
            <p role="alert" className="text-sm text-destructive">
              La comisión general debe ser mayor que 0; la propia y la comercial no pueden superarla.
            </p>
          )}

          <details className="group rounded-[var(--radius-card)] border border-border-default bg-surface-2/45">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm text-text-primary [&::-webkit-details-marker]:hidden sm:px-4">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-[var(--module-accent)]" aria-hidden="true">%</span>
                Simulador de reparto
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
                Ejemplo <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </span>
            </summary>
            <div className="space-y-3 border-t border-border-subtle p-3 sm:p-4">
              <PolicyNumberField
                id="impulsa-fare" label="Importe de ejemplo" unit="CUP"
                value={fare} onChange={setFare}
                min="0" max="100000000" step="0.01" disabled={false}
              />
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[460px] text-left text-sm">
                  <thead><tr className="border-b border-border-subtle text-xs text-text-secondary">
                    <th scope="col" className="py-2">Servicio</th>
                    <th scope="col" className="py-2 text-right">Conductor</th>
                    <th scope="col" className="py-2 text-right">Promotor</th>
                    <th scope="col" className="py-2 text-right">Agencia</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ["Normal", 100-g, 0, g],
                      ["Propio", 100-o, 0, o],
                      ["Flota", 100-g, c, g-c],
                    ].map(row => (
                      <tr key={String(row[0])} className="border-b border-border-subtle last:border-0">
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
              Solo futuras carreras reales liquidadas. Los saldos, premios y condiciones anteriores se conservan.
            </p>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                {changed && (
                  <Button size="sm" className="min-h-11 sm:min-h-9"
                    disabled={!valid || save.isPending}
                    onClick={() => {
                      if (query.data?.enabled && !window.confirm("¿Guardar los porcentajes para nuevas carreras?")) return;
                      setMessage(""); save.mutate(Boolean(query.data?.enabled));
                    }}>
                    {save.isPending ? "Guardando…" : "Guardar porcentajes"}
                  </Button>
                )}
                <Button size="sm" className={
                    "min-h-11 sm:min-h-9 " +
                    (query.data?.enabled ? "border-[var(--semantic-danger-border)] text-[var(--semantic-danger-foreground)]" : "")
                  }
                  variant="subtle"
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
          </div>
          {message && <p role="status" className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary">{message}</p>}
        </div>
      )}
    </section>
  );
}
