import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Radar } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabaseServices } from "@/lib/services";

/** Control del laboratorio: nunca altera la politica de carreras reales. */
export default function MarketplaceTestRadarToggle({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["marketplace-dispatch-settings", projectId],
    queryFn: () => supabaseServices.marketplace.dispatchSettings(projectId),
  });
  const toggle = useMutation({
    mutationFn: async (nextEnabled: boolean) => {
      // Leer al guardar evita reescribir radios, prioridades o tiempos antiguos.
      const current = await supabaseServices.marketplace.dispatchSettings(projectId);
      const { updatedAt: _updatedAt, updatedBy: _updatedBy, ...input } = current;
      const saved = await supabaseServices.marketplace.updateDispatchSettings(projectId, {
        ...input,
        applyToTestJobs: nextEnabled,
      });
      if (saved.applyToTestJobs !== nextEnabled) {
        throw new Error("No se pudo comprobar el estado del radar para pruebas.");
      }
      return saved;
    },
    onSuccess: (saved) => {
      qc.setQueryData(["marketplace-dispatch-settings", projectId], saved);
      void qc.invalidateQueries({ queryKey: ["marketplace-dispatch-settings", projectId] });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ["marketplace-dispatch-settings", projectId] });
    },
  });
  const enabled = settings.data?.applyToTestJobs ?? false;
  const disabled = !canManage || settings.isPending || settings.isError || toggle.isPending;

  return (
    <section
      aria-label="Habilitar radar para carreras de prueba"
      className="relative overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-500/[0.09] via-background/90 to-cyan-400/[0.07] p-3.5 sm:p-4 admin-graphite-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-violet-400/25 bg-violet-400/10 text-violet-200">
            <FlaskConical className="size-4" aria-hidden="true"/>
          </span>
          <div className="min-w-0">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Radar className="size-4 text-cyan-300" aria-hidden="true"/>
              Aplicar radar a carreras de prueba
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              Activa la búsqueda por radios también para las carreras simuladas.
              No cambia las carreras reales ni el simulacro por punto.
            </p>
            <p role="status" className={"mt-1 text-xs font-medium " + (enabled ? "text-emerald-300" : "text-amber-200")}>
              {settings.isPending || toggle.isPending ? "Consultando o guardando…" :
                settings.isError ? "No se pudo consultar el ajuste." :
                enabled ? "Habilitado para carreras de prueba" : "Deshabilitado para carreras de prueba"}
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => toggle.mutate(checked)}
          aria-label="Aplicar a carreras de prueba"
        />
      </div>
      {toggle.isError ? (
        <p role="alert" className="mt-2 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
          No se guardó el ajuste. Vuelve a intentarlo.
        </p>
      ) : null}
    </section>
  );
}
