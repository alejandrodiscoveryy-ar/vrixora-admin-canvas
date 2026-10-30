import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Loader2, MessageCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabase";

type LiteContact = {
  supportNumber: string;
  liteEnabled: boolean;
  hoursEnabled: boolean;
  days: number[];
  openTime: string;
  closeTime: string;
  updatedAt: string;
  version: number;
};

const DAYS = [
  { day: 1, label: "Lun" }, { day: 2, label: "Mar" },
  { day: 3, label: "Mié" }, { day: 4, label: "Jue" },
  { day: 5, label: "Vie" }, { day: 6, label: "Sáb" },
  { day: 7, label: "Dom" },
];
const PHONE = /^\+[1-9][0-9]{7,14}$/;
const HOUR = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function fromRpc(data: Record<string, unknown>): LiteContact {
  return {
    supportNumber: String(data.support_number ?? ""),
    liteEnabled: data.lite_enabled === true,
    hoursEnabled: data.hours_enabled === true,
    days: Array.isArray(data.days) ? data.days.map(Number) : [1, 2, 3, 4, 5, 6, 7],
    openTime: String(data.open_time ?? "08:00"),
    closeTime: String(data.close_time ?? "20:00"),
    updatedAt: String(data.updated_at ?? ""),
    version: Number(data.version ?? 1),
  };
}

function openNow(form: LiteContact): boolean {
  if (!form.liteEnabled || !PHONE.test(form.supportNumber)) return false;
  if (!form.hoursEnabled) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Havana", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const current = `${get("hour")}:${get("minute")}`;
  return form.days.includes(weekday) && current >= form.openTime && current < form.closeTime;
}

export default function MarketplaceLiteContactCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LiteContact | null>(null);
  const [dirty, setDirty] = useState(false);
  const settings = useQuery({
    queryKey: ["marketplace-lite-contact", projectId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_lite_contact", {
        target_project_id: projectId,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("No se encontró la configuración de atención.");
      }
      return fromRpc(data as Record<string, unknown>);
    },
    retry: 1,
  });

  useEffect(() => {
    if (settings.data && !dirty) setForm(settings.data);
  }, [settings.data, dirty]);

  const patch = (values: Partial<LiteContact>) => {
    setDirty(true);
    setForm((prev) => prev ? { ...prev, ...values } : prev);
  };

  const validation = !form ? "Cargando…" :
    form.supportNumber && !PHONE.test(form.supportNumber.trim()) ? "Introduce un número internacional válido, por ejemplo +535XXXXXXX." :
    form.liteEnabled && !PHONE.test(form.supportNumber.trim()) ? "Para habilitar Lite debes indicar un número de atención." :
    !HOUR.test(form.openTime) || !HOUR.test(form.closeTime) || form.openTime >= form.closeTime
      ? "La hora de cierre debe ser posterior a la de apertura." :
    form.days.length === 0 ? "Selecciona al menos un día de atención." : null;

  const save = useMutation({
    mutationFn: async () => {
      if (!form || validation) throw new Error(validation ?? "Formulario incompleto.");
      const { data, error } = await getSupabaseClient().rpc("admin_update_marketplace_lite_contact", {
        target_project_id: projectId,
        target_support_number: form.supportNumber.trim(),
        target_lite_enabled: form.liteEnabled,
        target_hours_enabled: form.hoursEnabled,
        target_days: [...form.days].sort((a, b) => a - b),
        target_open_time: form.openTime,
        target_close_time: form.closeTime,
      });
      if (error) throw error;
      return fromRpc(data as Record<string, unknown>);
    },
    onSuccess: async (data) => {
      setForm(data);
      setDirty(false);
      queryClient.setQueryData(["marketplace-lite-contact", projectId], data);
      await queryClient.invalidateQueries({ queryKey: ["project-whatsapp-settings", projectId] });
      toast.success("Atención de TukTuk Lite actualizada.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar la atención."),
  });

  return (
    <section className="rounded-[24px] border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.065] via-background/90 to-background p-4 shadow-lg sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MessageCircle className="h-5 w-5 text-emerald-300" />
          <div>
            <h3 className="text-base font-semibold">Atención al cliente · TukTuk Lite</h3>
            <p className="text-xs text-muted-foreground">El mismo número operativo de soporte, sin duplicarlo.</p>
          </div>
        </div>
        {form ? (
          <span className={openNow(form)
            ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300"
            : "rounded-full bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground"}>
            {openNow(form) ? "Disponible" : "Fuera de servicio"}
          </span>
        ) : null}
      </div>
      {settings.isPending || !form ? (
        settings.isError ? (
          <p role="alert" className="text-sm text-rose-300">Configuración de Lite no disponible. Comprueba que la migración esté aplicada.</p>
        ) : <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="lite-support-number">Teléfono para WhatsApp y SMS</Label>
              <Input id="lite-support-number" type="tel" autoComplete="off" inputMode="tel"
                value={form.supportNumber} onChange={(e) => patch({ supportNumber: e.target.value })}
                placeholder="+535XXXXXXX" maxLength={16} />
              <p className="text-xs text-muted-foreground">El número debe poder recibir SMS. No se modifica el teléfono de cobros.</p>
            </div>
            <div className="flex min-h-10 items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/45 px-3 py-2">
              <Label htmlFor="lite-enabled">Habilitar Lite</Label>
              <Switch id="lite-enabled" checked={form.liteEnabled}
                onCheckedChange={(checked) => patch({ liteEnabled: checked })} />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/45 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-cyan-300" />
                <div>
                  <p className="text-sm font-medium">Horario automático de atención</p>
                  <p className="text-xs text-muted-foreground">Opcional · zona horaria de La Habana</p>
                </div>
              </div>
              <Switch aria-label="Activar horario de atención" checked={form.hoursEnabled}
                onCheckedChange={(checked) => patch({ hoursEnabled: checked })} />
            </div>
            {form.hoursEnabled ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(({ day, label }) => {
                    const selected = form.days.includes(day);
                    return (
                      <button key={day} type="button" aria-pressed={selected}
                        onClick={() => patch({ days: selected ? form.days.filter((n) => n !== day) : [...form.days, day] })}
                        className={selected
                          ? "rounded-lg border border-emerald-400/50 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-200"
                          : "rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground"}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="lite-hours-open">Desde</Label>
                    <Input id="lite-hours-open" type="time" value={form.openTime}
                      onChange={(e) => patch({ openTime: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lite-hours-close">Hasta</Label>
                    <Input id="lite-hours-close" type="time" value={form.closeTime}
                      onChange={(e) => patch({ closeTime: e.target.value })} />
                  </div>
                </div>
              </div>
            ) : <p className="text-xs text-muted-foreground">Sin horario: estará disponible mientras el interruptor Lite siga activado.</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Fuera del horario, Lite dirigirá a la versión completa. El horario usa la hora de Cuba,
            no la del teléfono del cliente. Los cambios sin internet pueden seguir pendientes hasta que el teléfono vuelva a conectarse.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {validation ? <p role="alert" className="text-xs text-rose-300">{validation}</p> : null}
              <p className="text-xs text-muted-foreground">{dirty ? "Cambios sin guardar" : "Configuración guardada"}</p>
            </div>
            <Button type="button" disabled={!dirty || Boolean(validation) || save.isPending}
              onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar atención
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
