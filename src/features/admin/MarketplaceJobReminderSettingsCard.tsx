import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabase";

type ReminderSettings = {
  enabled: boolean;
  intervalSeconds: number;
  maxReminders: number;
};

export default function MarketplaceJobReminderSettingsCard({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [interval, setInterval] = useState("60");
  const [maxReminders, setMaxReminders] = useState("3");

  const settings = useQuery({
    queryKey: ["marketplace-job-reminder-settings", projectId],
    queryFn: async (): Promise<ReminderSettings> => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_job_reminder_settings",
        { target_project_id: projectId },
      );
      if (error) throw error;
      const row = (data as Record<string, unknown>[] | null)?.[0];
      if (!row) throw new Error("No existe configuración de recordatorios.");
      return {
        enabled: Boolean(row.enabled),
        intervalSeconds: Number(row.interval_seconds),
        maxReminders: Number(row.max_reminders),
      };
    },
  });

  useEffect(() => {
    if (!settings.data) return;
    setEnabled(settings.data.enabled);
    setInterval(String(settings.data.intervalSeconds));
    setMaxReminders(String(settings.data.maxReminders));
  }, [settings.data]);

  const seconds = Number(interval);
  const count = Number(maxReminders);
  const valid = Number.isInteger(seconds) && seconds >= 30 && seconds <= 300 &&
    Number.isInteger(count) && count >= 1 && count <= 5;

  const save = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error("Intervalo entre 30 y 300 segundos; entre 1 y 5 recordatorios.");
      const { error } = await getSupabaseClient().rpc(
        "admin_set_marketplace_job_reminder_settings",
        {
          target_project_id: projectId,
          target_enabled: enabled,
          target_interval_seconds: seconds,
          target_max_reminders: count,
        },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["marketplace-job-reminder-settings", projectId] });
    },
  });

  return (
    <section className="rounded-[24px] border border-cyan-400/25 bg-background/90 p-4 shadow-lg sm:p-5 xl:col-span-2">
      <div className="flex items-center gap-3">
        <BellRing className="h-5 w-5 text-cyan-300" />
        <div>
          <h3 className="text-base font-semibold">Recordatorios de carreras</h3>
          <p className="text-xs text-muted-foreground">
            Carreras reales sin asignar; solo conductores previamente avisados.
          </p>
        </div>
      </div>
      {settings.isPending ? (
        <Loader2 className="mt-4 h-5 w-5 animate-spin" />
      ) : settings.isError ? (
        <p role="alert" className="mt-4 text-sm text-rose-300">No se pudo leer la configuración.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border/50 p-3">
            <div>
              <p className="text-sm font-medium">Recordatorios automáticos</p>
              <p className="text-xs text-muted-foreground">
                Solo afecta carreras notificadas después de activar la función.
              </p>
            </div>
            <Switch
              checked={enabled}
              disabled={!canManage || save.isPending}
              onCheckedChange={setEnabled}
              aria-label="Activar recordatorios de carreras"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tuktuk-reminder-interval">Intervalo (segundos)</Label>
              <Input
                id="tuktuk-reminder-interval" type="number" min={30} max={300} step={1}
                value={interval} disabled={!canManage || save.isPending}
                onChange={(event) => setInterval(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tuktuk-reminder-max">Cantidad máxima</Label>
              <Input
                id="tuktuk-reminder-max" type="number" min={1} max={5} step={1}
                value={maxReminders} disabled={!canManage || save.isPending}
                onChange={(event) => setMaxReminders(event.target.value)}
              />
            </div>
          </div>
          {!valid ? (
            <p role="alert" className="text-sm text-rose-300">
              Intervalo entre 30 y 300 segundos; de 1 a 5 recordatorios.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {save.isSuccess ? "Configuración guardada" : "Valor inicial: 60 segundos, 3 avisos"}
            </span>
            <Button
              type="button" disabled={!canManage || !valid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Guardando…" : "Guardar recordatorios"}
            </Button>
          </div>
          {save.isError ? (
            <p role="alert" className="text-sm text-rose-300">
              {save.error instanceof Error ? save.error.message : "Error al guardar"}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
