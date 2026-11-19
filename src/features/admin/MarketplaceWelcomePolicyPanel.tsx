import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PolicyTile, PolicyToggle, PolicyNumberField } from "@/features/admin/CommercialPolicyControls";
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
    <section aria-label="Bienvenida y cobro general" className={embedded ? "min-w-0 space-y-3" : cp.section}>
      {!embedded && (
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-text-primary">Bienvenida y cobro general</h2>
          <p className="mt-1 text-sm text-text-secondary">Políticas independientes para nuevas altas y comisiones.</p>
        </div>
      )}
      {policy.isLoading ? (
        <p role="status" className="py-4 text-sm text-text-secondary">Consultando las condiciones vigentes…</p>
      ) : policy.isError ? (
        <p role="alert" className="rounded-xl border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] p-3 text-sm text-text-primary">
          No fue posible consultar la bienvenida. No se modificó ninguna política.
        </p>
      ) : (
        <div className="grid min-w-0 items-stretch gap-3 lg:grid-cols-2">
          <PolicyTile
            title="Bienvenida a nuevos conductores"
            description="Días sin comisión para nuevos registros. No cambia beneficios ya otorgados."
            controls={<PolicyToggle
              id="welcome-enabled" checked={enabled} onChange={setEnabled}
              disabled={!canEdit || save.isPending}
              pending={changed}
              label="Activar días gratuitos de bienvenida"
            />}
            footer={
              <>
                <p className="text-xs text-text-secondary">
                  {changed ? "Tienes cambios pendientes" : enabled ? "Bienvenida configurada" : "Bienvenida desactivada"}
                </p>
                {canEdit && changed && (
                  <Button size="sm" className="min-h-11 sm:min-h-9"
                    disabled={!validDays || save.isPending}
                    onClick={() => { setStatus(""); save.mutate(); }}>
                    {save.isPending ? "Guardando…" : "Guardar bienvenida"}
                  </Button>
                )}
              </>
            }
          >
            <PolicyNumberField
              id="welcome-days" label="Duración" unit="días" value={days}
              onChange={setDays} min="1" max="365" step="1"
              disabled={!canEdit || save.isPending}
              hint={enabled ? "Se aplica únicamente al dar de alta a nuevos conductores." : "Valor conservado para cuando se reactive la bienvenida."}
            />
            {!validDays && <p role="alert" className="mt-2 text-xs text-destructive">Indica entre 1 y 365 días.</p>}
          </PolicyTile>

          <PolicyTile
            title="Cobro de comisión"
            description="Porcentaje de la agencia para nuevas carreras; el cobro se controla por separado."
            controls={
              chargePolicy.isLoading ? (
                <span role="status" className="text-xs text-text-secondary">Consultando cobro…</span>
              ) : chargePolicy.isError ? (
                <span role="alert" className="text-xs text-[var(--semantic-warning-foreground)]">Cobro no disponible</span>
              ) : (
                <PolicyToggle
                  id="commission-charge-switch" checked={chargeEnabled}
                  onChange={setChargeEnabled}
                  pending={chargeChanged}
                  disabled={!canEdit || saveChargePolicy.isPending}
                  label="Activar cobro de comisiones Marketplace"
                />
              )
            }
            footer={
              <>
                <p className="max-w-xs text-xs text-text-secondary">
                  {commissionChanged || chargeChanged
                    ? "Cambios pendientes de guardar"
                    : chargePolicy.data?.enabled ? "Cobro habilitado" : "Cobro suspendido"}
                </p>
                {canEdit && (commissionChanged || chargeChanged) && (
                  <div className="flex flex-wrap gap-2">
                    {commissionChanged && (
                      <Button size="sm" className="min-h-11 sm:min-h-9" variant="subtle"
                        disabled={!validCommission || saveCommission.isPending}
                        onClick={() => { setStatus(""); saveCommission.mutate(); }}>
                        {saveCommission.isPending ? "Guardando…" : "Guardar porcentaje"}
                      </Button>
                    )}
                    {chargeChanged && chargePolicy.isSuccess && (
                      <Button size="sm" className="min-h-11 sm:min-h-9"
                        disabled={saveChargePolicy.isPending}
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
              </>
            }
          >
            <PolicyNumberField
              id="welcome-commission" label="Comisión general" unit="%" value={commission}
              onChange={setCommission} min="0.01" max="100" step="0.01"
              disabled={!canEdit || saveCommission.isPending}
              hint="El porcentaje y la activación del cobro son dos operaciones independientes."
            />
            {!validCommission && <p role="alert" className="mt-2 text-xs text-destructive">Indica un porcentaje válido entre 0 y 100.</p>}
          </PolicyTile>
        </div>
      )}

      {status && <p role="status" className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary">{status}</p>}
    </section>
  );
}
