import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
export default function MarketplaceWelcomePolicyPanel({
  projectId,
  canView,
  canEdit,
  embedded = false,
}: {
  projectId: string;
  canView: boolean;
  canEdit: boolean;
  embedded?: boolean;
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
    <section aria-label="Bienvenida y cobro general" className={embedded ? "min-w-0 space-y-4" : cp.section}>
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Bienvenida y cobro general</h2>
          <p className="mt-1 text-sm text-text-secondary">Condiciones para nuevos conductores y comisión general de los viajes.</p>
        </div>
      )}
      {policy.isLoading ? (
        <p className="py-4 text-sm text-text-secondary">Consultando la política vigente…</p>
      ) : policy.isError ? (
        <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-text-secondary">
          No se pudo consultar la bienvenida. No se modificó ningún beneficio.
        </p>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="min-w-0 space-y-3 lg:border-r lg:border-border-subtle lg:pr-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-text-primary">Bienvenida</h3>
                <p className="text-xs text-text-secondary">Solo para conductores nuevos</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-secondary">{enabled ? "Activa" : "Inactiva"}</span>
                <Switch id="welcome-enabled" aria-label="Activar días gratuitos de bienvenida" checked={enabled} disabled={!canEdit || save.isPending} onCheckedChange={setEnabled} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="welcome-days">Días gratuitos</Label>
              <div className="flex items-center gap-2">
                <Input id="welcome-days" type="number" min="1" max="365" step="1" value={days}
                  disabled={!canEdit || save.isPending} onChange={event => setDays(event.target.value)}
                  aria-label="Días gratuitos" className={cp.control + " h-11 w-28 max-w-full text-lg font-semibold tabular-nums"} />
                <span className="text-sm text-text-secondary">días</span>
              </div>
              {!validDays && <p role="alert" className="text-xs text-destructive">Indica entre 1 y 365 días.</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
              <p className="max-w-xs text-xs text-text-secondary">Las promociones ya concedidas no se modifican.</p>
              {canEdit && (
                <Button size="sm" className="max-sm:min-h-11" disabled={!validDays || !changed || save.isPending}
                  onClick={() => { setStatus(""); save.mutate(); }}>
                  {save.isPending ? "Guardando…" : "Guardar bienvenida"}
                </Button>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-text-primary">Comisión general</h3>
                <p className="text-xs text-text-secondary">Cobro de la agencia por carrera</p>
              </div>
              {chargePolicy.isLoading ? (
                <span className="text-xs text-text-secondary">Consultando cobro…</span>
              ) : chargePolicy.isError ? (
                <span role="alert" className="text-xs text-amber-500">Cobro no disponible</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-secondary">{chargeEnabled ? "Cobro activo" : "Cobro suspendido"}</span>
                  <Switch id="commission-charge-switch" aria-label="Activar cobro de comisiones Marketplace"
                    checked={chargeEnabled} disabled={!canEdit || saveChargePolicy.isPending}
                    onCheckedChange={setChargeEnabled} />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="welcome-commission">Porcentaje de comisión</Label>
              <div className="flex items-center gap-2">
                <Input id="welcome-commission" type="number" min="0.01" max="100" step="0.01"
                  value={commission} disabled={!canEdit || saveCommission.isPending}
                  onChange={event => setCommission(event.target.value)} aria-label="Porcentaje de comisión"
                  className={cp.control + " h-11 w-28 max-w-full text-lg font-semibold tabular-nums"} />
                <span className="text-sm text-text-secondary">%</span>
              </div>
              {!validCommission && <p role="alert" className="text-xs text-destructive">Indica un porcentaje válido entre 0 y 100.</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
              <p className="max-w-xs text-xs text-text-secondary">El cobro y el porcentaje se guardan por separado.</p>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="max-sm:min-h-11" variant="outline"
                    disabled={!validCommission || !commissionChanged || saveCommission.isPending}
                    onClick={() => { setStatus(""); saveCommission.mutate(); }}>
                    {saveCommission.isPending ? "Guardando…" : "Guardar porcentaje"}
                  </Button>
                  {chargePolicy.isSuccess && (
                    <Button size="sm" className="max-sm:min-h-11"
                      disabled={!chargeChanged || saveChargePolicy.isPending}
                      onClick={() => {
                        const msg = chargeEnabled
                          ? "Se empezará a cobrar la comisión configurada en las próximas aceptaciones. ¿Continuar?"
                          : "Las nuevas aceptaciones serán libres de comisión y no requerirán saldo para ella. ¿Continuar?";
                        if (!window.confirm(msg)) return;
                        setStatus(""); saveChargePolicy.mutate();
                      }}>
                      {saveChargePolicy.isPending ? "Guardando…" : "Guardar cobro"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs text-text-secondary">
        <p>
          {policy.data ? (policy.data.enabled ? `Bienvenida: ${policy.data.duration_days} días` : "Bienvenida desactivada") : "Bienvenida no disponible"}
          {" · "}
          {chargePolicy.isLoading ? "Cobro consultándose" : chargePolicy.isError ? "Cobro no disponible" : chargePolicy.data?.enabled ? "Comisiones activas" : "Comisiones suspendidas"}
        </p>
        {(changed || commissionChanged || chargeChanged) && (
          <span className="font-medium text-amber-600">Hay cambios sin guardar</span>
        )}
        {status && <p role="status" className="w-full text-sm text-text-primary">{status}</p>}
      </div>
    </section>
  );
}
