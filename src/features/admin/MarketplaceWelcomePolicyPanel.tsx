import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, CalendarDays, Gift, History, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabase";

type WelcomePolicy = {
  enabled: boolean;
  duration_days: number;
  rule_version: number;
  commission_rate: number;
  updated_at: string;
};
type WelcomeChange = {
  changed_at: string;
  prior_enabled: boolean;
  prior_days: number;
  new_enabled: boolean;
  new_days: number;
};

export default function MarketplaceWelcomePolicyPanel({
  projectId,
  canView,
  canEdit,
}: {
  projectId: string;
  canView: boolean;
  canEdit: boolean;
}) {
  const client = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [days, setDays] = useState("10");
  const [commission, setCommission] = useState("10");
  const [chargeEnabled, setChargeEnabled] = useState(true);
  const [status, setStatus] = useState("");

  const policy = useQuery({
    queryKey: ["marketplace-welcome-policy", projectId],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_welcome_policy",
        { target_project_id: projectId },
      );
      if (error) throw error;
      const row = (data as WelcomePolicy[] | null)?.[0];
      if (!row) throw new Error("La política de bienvenida no está disponible.");
      return row;
    },
  });

  const chargePolicy = useQuery({
    queryKey: ["marketplace-commission-policy", projectId],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_commission_policy", { target_project_id: projectId },
      );
      if (error) throw error;
      const row = (data as { enabled: boolean; rate: number; updated_at: string }[] | null)?.[0];
      if (!row) throw new Error("No se pudo consultar el cobro de comisiones.");
      return row;
    },
  });

  const chargeHistory = useQuery({
    queryKey: ["marketplace-commission-policy-events", projectId],
    enabled: canView && chargePolicy.isSuccess,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_list_marketplace_commission_policy_events", { target_project_id: projectId },
      );
      if (error) throw error;
      return (data ?? []) as {
        changed_at: string;
        previous_enabled: boolean;
        new_enabled: boolean;
        rate_snapshot: number;
      }[];
    },
  });

  const history = useQuery({
    queryKey: ["marketplace-welcome-history", projectId],
    enabled: canView && policy.isSuccess,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_list_marketplace_welcome_policy_events",
        { target_project_id: projectId },
      );
      if (error) throw error;
      return (data ?? []) as WelcomeChange[];
    },
  });

  useEffect(() => {
    if (!policy.data) return;
    setEnabled(policy.data.enabled);
    setDays(String(policy.data.duration_days));
    setCommission(String(Number((policy.data.commission_rate * 100).toFixed(4))));
  }, [policy.data]);

  useEffect(() => {
    if (chargePolicy.data) setChargeEnabled(chargePolicy.data.enabled);
  }, [chargePolicy.data]);

  const chargeChanged = chargePolicy.data != null && chargeEnabled !== chargePolicy.data.enabled;

  const saveChargePolicy = useMutation({
    mutationFn: async () => {
      if (!canEdit || !chargeChanged) throw new Error("Sin permisos o sin cambios.");
      const { error } = await getSupabaseClient().rpc(
        "admin_set_marketplace_commission_enabled", {
          target_project_id: projectId,
          target_enabled: chargeEnabled,
        },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      setStatus(chargeEnabled
        ? "Cobro de comisiones activado para las nuevas aceptaciones."
        : "Cobro desactivado: los conductores pueden aceptar sin saldo para comisiones.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["marketplace-commission-policy", projectId] }),
        client.invalidateQueries({ queryKey: ["marketplace-commission-policy-events", projectId] }),
        client.invalidateQueries({ queryKey: ["marketplace-overview", projectId] }),
      ]);
    },
    onError: (error: Error) => setStatus(`No se pudo cambiar el cobro: ${error.message}`),
  });

  const validDays = Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 365;
  const changed = policy.data != null &&
    (enabled !== policy.data.enabled || Number(days) !== policy.data.duration_days);

  const validCommission = commission.trim() !== "" && Number.isFinite(Number(commission)) && Number(commission) > 0 && Number(commission) <= 100;
  const commissionChanged = policy.data != null && Math.abs(Number(commission) / 100 - policy.data.commission_rate) > 0.000001;

  const saveCommission = useMutation({
    mutationFn: async () => {
      if (!canEdit || !validCommission) throw new Error("No tienes permiso o la comisión no es válida.");
      const { error } = await getSupabaseClient().rpc("admin_set_marketplace_commission_only", {
        target_project_id: projectId,
        target_commission_rate: Number(commission) / 100,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setStatus("Comisión Marketplace guardada correctamente.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["marketplace-welcome-policy", projectId] }),
        client.invalidateQueries({ queryKey: ["marketplace-commercial-settings", projectId] }),
        client.invalidateQueries({ queryKey: ["marketplace-overview", projectId] }),
      ]);
    },
    onError: (error: Error) => setStatus(`No se pudo guardar la comisión: ${error.message}`),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!canEdit || !validDays) throw new Error("No tienes permiso o los días no son válidos.");
      const { error } = await getSupabaseClient().rpc(
        "admin_set_marketplace_welcome_policy",
        {
          target_project_id: projectId,
          target_enabled: enabled,
          target_duration_days: Number(days),
        },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      setStatus("Política general guardada. Solo afecta a nuevas incorporaciones.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["marketplace-welcome-policy", projectId] }),
        client.invalidateQueries({ queryKey: ["marketplace-welcome-history", projectId] }),
        client.invalidateQueries({ queryKey: ["marketplace-commercial-settings", projectId] }),
      ]);
    },
    onError: (error: Error) => setStatus(`No se pudo guardar: ${error.message}`),
  });

  if (!canView) return null;

  return (
    <section className="relative isolate overflow-hidden rounded-[26px] border border-emerald-300/25 bg-gradient-to-br from-[#0d2729] via-[#101d2c] to-[#17182c] p-4 shadow-[0_26px_65px_-42px_rgba(16,185,129,0.37)] sm:p-5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400/75 via-cyan-300/35 to-transparent" />
      <div className="relative z-10 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/35 bg-emerald-300/10 text-emerald-200">
              <BadgePercent aria-hidden="true" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">TukTuk · Comercial</p>
              <h2 className="mt-0.5 text-xl font-extrabold tracking-tight text-white sm:text-2xl">Política comercial general</h2>
              <p className="mt-0.5 text-xs text-slate-300 sm:text-sm">Dos controles independientes para beneficios y comisiones.</p>
            </div>
          </div>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1 text-xs font-semibold text-cyan-100">Independiente de las ofertas</span>
        </header>

        {policy.isLoading ? (
          <p className="rounded-xl border border-white/10 bg-[#0a1723]/80 px-4 py-3 text-sm text-slate-200">Cargando política comercial…</p>
        ) : policy.isError ? (
          <p role="alert" className="rounded-xl border border-amber-300/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            No se pudo leer la política vigente. No se ha modificado ningún beneficio.
          </p>
        ) : (
          <div className="grid items-stretch gap-3 lg:grid-cols-2">
            <article className="relative isolate flex min-w-0 flex-col overflow-hidden rounded-[21px] border border-emerald-300/25 bg-[#09241f] p-4 shadow-[0_18px_36px_-32px_rgba(52,211,153,0.6)] sm:p-5">
              <img src="/admin-premium/comercial-ofertas-hero.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -right-14 bottom-0 h-56 w-[70%] object-contain object-right-bottom opacity-[0.19]" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#09241f]/95 via-[#09241f]/85 to-[#09241f]/75" />
              <div className="relative z-10 flex h-full flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-200">
                      <Gift aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">01 · Bienvenida</p>
                      <h3 className="text-lg font-bold text-white">Días gratuitos</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#081c1b]/80 px-3 py-2">
                    <span className={`text-xs font-bold ${enabled ? "text-emerald-200" : "text-slate-300"}`}>{enabled ? "Activo" : "Desactivado"}</span>
                    <Switch id="welcome-enabled" aria-label="Activar días gratuitos de bienvenida" checked={enabled} disabled={!canEdit || save.isPending} onCheckedChange={setEnabled} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="welcome-days" className="text-sm font-semibold text-emerald-100">Duración del beneficio</Label>
                  <div className="mt-2 flex items-center gap-3">
                    <Input id="welcome-days" type="number" min="1" max="365" step="1" value={days} disabled={!canEdit || save.isPending} onChange={(event) => setDays(event.target.value)} className="h-[66px] w-28 rounded-xl border-emerald-300/35 bg-[#06191b]/95 text-center text-[38px] font-extrabold leading-none tabular-nums tracking-tight text-white shadow-inner shadow-black/20 focus-visible:ring-emerald-300/60" />
                    <div>
                      <span className="block text-xl font-bold text-emerald-100">días</span>
                      <span className="block text-xs text-slate-300">para nuevas altas</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-emerald-300/15 pt-3">
                  <p className="max-w-[21rem] text-xs leading-5 text-slate-300">Los conductores que ya recibieron el beneficio conservan sus días.</p>
                  {canEdit && (
                    <Button size="sm" disabled={!validDays || !changed || save.isPending} onClick={() => { setStatus(""); save.mutate(); }} className="min-h-10 shrink-0 rounded-xl bg-emerald-400 px-4 font-bold text-[#05251e] hover:bg-emerald-300 disabled:opacity-50">
                      {save.isPending ? "Guardando…" : "Guardar bienvenida"}
                    </Button>
                  )}
                </div>
              </div>
            </article>

            <article className="relative isolate flex min-w-0 flex-col overflow-hidden rounded-[21px] border border-cyan-300/25 bg-[#0a1d2a] p-4 shadow-[0_18px_36px_-32px_rgba(34,211,238,0.5)] sm:p-5">
              <img src="/admin-premium/economy.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -right-10 top-0 h-60 w-[83%] object-contain object-right-top opacity-[0.55]" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a1d2a]/95 via-[#0a1d2a]/90 to-[#0a1d2a]/65" />
              <div className="relative z-10 flex h-full flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
                      <BadgePercent aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">02 · Facturación</p>
                      <h3 className="text-lg font-bold text-white">Comisiones Marketplace</h3>
                    </div>
                  </div>
                  {chargePolicy.isLoading ? (
                    <span className="rounded-lg border border-white/10 bg-[#071827]/80 px-3 py-2 text-xs text-slate-300">Consultando…</span>
                  ) : chargePolicy.isError ? (
                    <span role="alert" className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100">Cobro no disponible</span>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#071827]/85 px-3 py-2">
                      <span className={`text-xs font-bold ${chargeEnabled ? "text-cyan-100" : "text-amber-200"}`}>{chargeEnabled ? "Cobro activo" : "Sin cobro"}</span>
                      <Switch id="commission-charge-switch" aria-label="Activar cobro de comisiones Marketplace" checked={chargeEnabled} disabled={!canEdit || saveChargePolicy.isPending} onCheckedChange={setChargeEnabled} />
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="welcome-commission" className="text-sm font-semibold text-cyan-100">Porcentaje por carrera</Label>
                  <div className="mt-2 flex items-center gap-3">
                    <Input id="welcome-commission" type="number" min="0.01" max="100" step="0.01" value={commission} disabled={!canEdit || saveCommission.isPending} onChange={(event) => setCommission(event.target.value)} className="h-[66px] w-28 rounded-xl border-cyan-300/35 bg-[#061622]/95 text-center text-[38px] font-extrabold leading-none tabular-nums tracking-tight text-white shadow-inner shadow-black/20 focus-visible:ring-cyan-300/60" />
                    <div>
                      <span className="block text-2xl font-extrabold text-cyan-100">%</span>
                      <span className="block text-xs text-slate-300">comisión configurada</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto border-t border-cyan-300/15 pt-3">
                  <p className="text-xs leading-5 text-slate-300">Con el cobro apagado, las nuevas carreras no generan comisión. Las anteriores conservan su liquidación.</p>
                  {canEdit && (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <Button size="sm" disabled={!validCommission || !commissionChanged || saveCommission.isPending} onClick={() => { setStatus(""); saveCommission.mutate(); }} className="min-h-10 rounded-xl border border-cyan-300/35 bg-[#0b3041] px-3 font-semibold text-cyan-100 hover:bg-[#104359] disabled:opacity-50">
                        {saveCommission.isPending ? "Guardando…" : "Guardar porcentaje"}
                      </Button>
                      {chargePolicy.isSuccess && (
                        <Button size="sm" disabled={!chargeChanged || saveChargePolicy.isPending} onClick={() => {
                          const msg = chargeEnabled
                            ? "Se empezará a cobrar la comisión configurada en las próximas aceptaciones. ¿Continuar?"
                            : "Las nuevas aceptaciones serán libres de comisión y no requerirán saldo para ella. ¿Continuar?";
                          if (!window.confirm(msg)) return;
                          setStatus("");
                          saveChargePolicy.mutate();
                        }} className="min-h-10 rounded-xl bg-cyan-400 px-3 font-bold text-[#051f2c] hover:bg-cyan-300 disabled:opacity-50">
                          {saveChargePolicy.isPending ? "Guardando…" : "Guardar cobro"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </article>
          </div>
        )}

        <div className="flex flex-wrap items-start gap-2 rounded-xl border border-white/10 bg-[#071725]/55 px-3 py-2.5 text-xs leading-5 text-slate-300">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <p>Los beneficios y cobros ya registrados se respetan. Las campañas de Ofertas siguen en borrador y no se aplican automáticamente.</p>
        </div>
        {status && <p role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">{status}</p>}

        {((chargeHistory.data?.length ?? 0) > 0 || (history.data?.length ?? 0) > 0) && (
          <div className="grid gap-3 md:grid-cols-2">
            {(history.data?.length ?? 0) > 0 && (
              <details className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-emerald-100"><CalendarDays aria-hidden="true" className="h-4 w-4" /> Historial de bienvenida</summary>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  {history.data?.map((event, index) => (
                    <p key={`${event.changed_at}-${index}`} className="border-t border-white/10 pt-2">
                      {new Date(event.changed_at).toLocaleString("es")}: {event.prior_enabled ? `${event.prior_days} días activos` : "Desactivado"} → {event.new_enabled ? `${event.new_days} días activos` : "Desactivado"}
                    </p>
                  ))}
                </div>
              </details>
            )}
            {(chargeHistory.data?.length ?? 0) > 0 && (
              <details className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-cyan-100"><History aria-hidden="true" className="h-4 w-4" /> Historial de cobro</summary>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  {chargeHistory.data?.map((entry, index) => (
                    <p key={`${entry.changed_at}-${index}`} className="border-t border-white/10 pt-2">
                      {new Date(entry.changed_at).toLocaleString("es")}: {entry.previous_enabled ? "Cobro activo" : "Cobro apagado"} → {entry.new_enabled ? "Cobro activo" : "Cobro apagado"} · {Number(entry.rate_snapshot) * 100} % configurado
                    </p>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  );

}
