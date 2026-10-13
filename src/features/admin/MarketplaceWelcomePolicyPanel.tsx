import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, History, ShieldCheck, Sparkles } from "lucide-react";
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
    <section className="relative overflow-hidden rounded-[26px] border border-emerald-300/30 bg-gradient-to-br from-[#102e2b] via-[#10202b] to-[#12182c] p-5 shadow-[0_25px_75px_-45px_rgba(16,185,129,0.46)] sm:p-6">
      <div className="pointer-events-none absolute -right-20 -top-32 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative z-10 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-400/15 text-emerald-200"><Sparkles className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Política general de bienvenida</p>
              <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">Días gratuitos y comisión Marketplace</h2>
            </div>
          </div>
          <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">Independiente de las ofertas</span>
        </div>

        {policy.isLoading ? (
          <p className="text-sm text-slate-300">Cargando política vigente…</p>
        ) : policy.isError ? (
          <p role="alert" className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            No se pudo leer la política. No se ha cambiado ningún beneficio. Verifica que la migración de Comercial V2 esté aplicada.
          </p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-300/20 bg-[#071a1d]/65 px-4 py-4">
                <div>
                  <Label htmlFor="welcome-enabled" className="text-base font-semibold text-white">Beneficio general activo</Label>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-slate-300">Al desactivarlo, los nuevos conductores comienzan sin días gratuitos generales. Los anteriores conservan los suyos.</p>
                </div>
                <Switch id="welcome-enabled" checked={enabled} disabled={!canEdit || save.isPending} onCheckedChange={setEnabled} />
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-[#071826]/70 px-4 py-3">
                <Label htmlFor="welcome-days" className="text-sm font-semibold text-slate-200">Duración general</Label>
                <div className="mt-2 flex items-center gap-3">
                  <Input id="welcome-days" type="number" min="1" max="365" step="1" value={days} disabled={!canEdit || save.isPending} onChange={(event) => setDays(event.target.value)} className="w-28 border-cyan-300/25 bg-[#0a202b] text-xl font-bold text-white" />
                  <span className="font-semibold text-cyan-200">días</span>
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-[#071826]/70 px-4 py-3">
                <Label htmlFor="welcome-commission" className="text-sm font-semibold text-slate-200">Comisión Marketplace</Label>
                <div className="mt-2 flex items-center gap-3">
                  <Input id="welcome-commission" type="number" min="0.01" max="100" step="0.01" value={commission} disabled={!canEdit || saveCommission.isPending} onChange={(event) => setCommission(event.target.value)} className="w-28 border-cyan-300/25 bg-[#0a202b] text-xl font-bold text-white" />
                  <span className="font-semibold text-cyan-200">%</span>
                </div>
                <p className="mt-2 text-xs text-slate-300">Comisión habitual. Durante los días gratuitos no se cobra.</p>
                {canEdit && (
                  <Button className="mt-3 w-full bg-cyan-400 font-bold text-[#04212d] hover:bg-cyan-300" disabled={!validCommission || !commissionChanged || saveCommission.isPending} onClick={() => { setStatus(""); saveCommission.mutate(); }}>
                    {saveCommission.isPending ? "Guardando comisión…" : "Guardar comisión"}
                  </Button>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-300/25 bg-[#1b211e]/80 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commission-charge-switch" className="text-base font-bold text-white">Cobrar comisiones Marketplace</Label>
                  <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
                    Control general independiente de los días gratuitos. Apagado: las nuevas carreras no reservan ni descuentan comisión y pueden aceptarse sin saldo. Las carreras ya aceptadas conservan su liquidación.
                  </p>
                </div>
                {chargePolicy.isLoading ? (
                  <p className="text-xs text-slate-300">Consultando el cobro…</p>
                ) : chargePolicy.isError ? (
                  <p role="alert" className="text-sm text-amber-200">No se pudo leer la política de cobro. No se ha cambiado.</p>
                ) : (
                  <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${chargeEnabled ? "text-emerald-200" : "text-amber-200"}`}>
                        {chargeEnabled ? "Cobro activo" : "Sin comisiones"}
                      </span>
                      <Switch id="commission-charge-switch" checked={chargeEnabled}
                        disabled={!canEdit || saveChargePolicy.isPending}
                        onCheckedChange={setChargeEnabled} />
                    </div>
                    {canEdit && (
                      <Button size="sm" disabled={!chargeChanged || saveChargePolicy.isPending}
                        onClick={() => {
                          const msg = chargeEnabled
                            ? "Se empezará a cobrar la comisión configurada en las próximas aceptaciones. ¿Continuar?"
                            : "Las nuevas aceptaciones serán libres de comisión y no requerirán saldo para ella. ¿Continuar?";
                          if (!window.confirm(msg)) return;
                          setStatus("");
                          saveChargePolicy.mutate();
                        }}>
                        {saveChargePolicy.isPending ? "Guardando…" : "Guardar política de cobro"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <p className="max-w-2xl text-xs leading-relaxed text-slate-300">
                <CalendarDays className="mr-1 inline-block h-4 w-4 text-emerald-300" />
                {enabled ? `${days} días para cada nueva incorporación válida.` : "Sin días gratuitos generales para las nuevas altas."}
                {" "}Las campañas de Ofertas siguen en borrador y no se aplican automáticamente.
              </p>
              {canEdit && <Button disabled={!validDays || !changed || save.isPending} onClick={() => { setStatus(""); save.mutate(); }} className="gap-2 bg-emerald-400 font-bold text-[#05251e] hover:bg-emerald-300"><ShieldCheck className="h-4 w-4" />{save.isPending ? "Guardando…" : "Guardar política general"}</Button>}
            </div>
            {status && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-slate-100">{status}</p>}
          </>
        )}
        {(chargeHistory.data?.length ?? 0) > 0 && (
          <details className="rounded-xl border border-amber-300/20 bg-black/15 p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-amber-100"><History className="h-4 w-4" />Historial de cobro de comisiones</summary>
            <div className="mt-3 space-y-2 text-xs text-slate-300">
              {chargeHistory.data?.map((entry, index) => (
                <p key={`${entry.changed_at}-${index}`} className="border-b border-white/10 pb-2">
                  {new Date(entry.changed_at).toLocaleString("es")}: {entry.previous_enabled ? "Cobro activo" : "Cobro apagado"} → {entry.new_enabled ? "Cobro activo" : "Cobro apagado"} · {Number(entry.rate_snapshot) * 100} % configurado
                </p>
              ))}
            </div>
          </details>
        )}
        {(history.data?.length ?? 0) > 0 && (
          <details className="rounded-xl border border-white/10 bg-black/15 p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-200"><History className="h-4 w-4 text-emerald-300" />Historial de modificaciones</summary>
            <div className="mt-3 space-y-2 text-xs text-slate-300">
              {history.data?.map((event, index) => (
                <p key={`${event.changed_at}-${index}`} className="border-b border-white/10 pb-2">
                  {new Date(event.changed_at).toLocaleString("es")}: {event.prior_enabled ? `${event.prior_days} días activos` : "Desactivado"} → {event.new_enabled ? `${event.new_days} días activos` : "Desactivado"}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
