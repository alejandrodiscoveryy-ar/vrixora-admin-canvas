import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";

type Policy = { no_show_wait_minutes: number; recovery_enabled: boolean; automatic_penalties_enabled: boolean };
async function load(projectId: string): Promise<Policy> {
  const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_cancellation_settings", { target_project_id: projectId });
  if (error) throw new Error(error.message);
  return data as unknown as Policy;
}
export default function MarketplaceCancellationPolicyCard({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const cache = useQueryClient();
  const key = ["marketplace-cancellation-policy", projectId];
  const policy = useQuery({ queryKey: key, queryFn: () => load(projectId), enabled: canManage });
  const [minutes, setMinutes] = useState("5");
  const [recovery, setRecovery] = useState(true);
  useEffect(() => {
    if (policy.data) { setMinutes(String(policy.data.no_show_wait_minutes)); setRecovery(policy.data.recovery_enabled); }
  }, [policy.data]);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_set_marketplace_cancellation_settings", {
        target_project_id: projectId, target_no_show_wait_minutes: Number(minutes), target_recovery_enabled: recovery,
      });
      if (error) throw new Error(error.message);
      return data as unknown as Policy;
    },
    onSuccess: (data) => { cache.setQueryData(key, data); toast.success("Política de cancelaciones guardada"); },
    onError: () => toast.error("No se pudo guardar la política. Reintenta."),
  });
  const valid = /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 30;
  const disabled = !canManage || !policy.data || save.isPending;
  return <section className="admin-graphite-panel rounded-2xl border border-border/60 bg-card p-4 space-y-4">
    <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-400" /><h3 className="font-semibold">Políticas de servicio · Cancelaciones</h3></div>
    {!canManage ? <p className="text-sm text-muted-foreground">No tienes permisos para administrar estas reglas.</p> : policy.isLoading ? <p className="text-sm">Consultando la política vigente…</p> : policy.isError ? <div className="space-y-2"><p className="text-sm text-destructive">No se pudo consultar la política.</p><Button variant="outline" onClick={() => void policy.refetch()}>Reintentar</Button></div> : <>
      <div className="admin-graphite-inset rounded-xl border border-border/60 p-3 flex items-center justify-between gap-3">
        <label htmlFor="cancel-wait" className="min-w-0"><span className="block text-sm font-medium">Espera por ausencia del cliente</span><span className="text-xs text-muted-foreground">Minutos desde la llegada confirmada; de 1 a 30.</span></label>
        <Input id="cancel-wait" type="number" min={1} max={30} step={1} value={minutes} disabled={disabled} onChange={e => setMinutes(e.target.value)} className="w-20" />
      </div>
      <div className="admin-graphite-inset rounded-xl border border-border/60 p-3 flex items-center justify-between gap-3">
        <div><p className="text-sm font-medium">Buscar otro conductor</p><p className="text-xs text-muted-foreground">Con autorización del cliente, crea otro intento y conserva el viaje anterior.</p></div>
        <Switch aria-label="Permitir reemplazos" checked={recovery} disabled={disabled} onCheckedChange={setRecovery} />
      </div>
      <p className="text-xs text-muted-foreground">Las multas automáticas están desactivadas. Las incidencias y los motivos se revisan individualmente.</p>
      <Button disabled={disabled || !valid} onClick={() => save.mutate()}>{save.isPending ? "Guardando…" : "Guardar política"}</Button>
    </>}
  </section>;
}
