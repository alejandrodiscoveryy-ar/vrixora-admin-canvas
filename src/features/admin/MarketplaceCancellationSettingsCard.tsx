import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabase";

type Settings = { no_show_wait_minutes: number; replacement_enabled: boolean };

export default function MarketplaceCancellationSettingsCard({projectId,canManage}: {projectId:string;canManage:boolean}) {
  const client = useQueryClient();
  const key = ["marketplace-cancellation-settings", projectId];
  const [minutes,setMinutes] = useState("5");
  const [replacement,setReplacement] = useState(true);
  const settings = useQuery({
    queryKey:key,enabled:canManage,
    queryFn: async (): Promise<Settings> => {
      const {data,error} = await getSupabaseClient().rpc("admin_get_marketplace_cancellation_settings",{target_project_id:projectId});
      if(error) throw error;
      const row = data as unknown as Settings;
      if(!row || !Number.isInteger(row.no_show_wait_minutes) || typeof row.replacement_enabled!=="boolean") throw new Error("Configuración no disponible");
      return row;
    },
  });
  useEffect(()=>{if(settings.data){setMinutes(String(settings.data.no_show_wait_minutes));setReplacement(settings.data.replacement_enabled);}},[settings.data]);
  const n=Number(minutes),valid=Number.isInteger(n)&&n>=1&&n<=60;
  const save=useMutation({
    mutationFn:async()=>{
      if(!valid) throw new Error("Espera de 1 a 60 minutos");
      const {error}=await getSupabaseClient().rpc("admin_set_marketplace_cancellation_settings",{
        target_project_id:projectId,target_no_show_wait_minutes:n,target_replacement_enabled:replacement,
      });
      if(error) throw error;
    },
    onSuccess:async()=>{await client.invalidateQueries({queryKey:key});},
  });
  return <section className="rounded-[24px] border border-border/60 bg-card/90 p-4 sm:p-5 admin-graphite-inset">
    <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-cyan-300"/><div><h3 className="font-semibold">Políticas de servicio · Cancelaciones</h3><p className="text-xs text-muted-foreground">Protege la continuidad del servicio y registra responsabilidades sin multas automáticas.</p></div></div>
    {!canManage ? <p className="mt-4 text-sm text-muted-foreground">Se requiere permiso para gestionar Marketplace y configuración.</p>
    : settings.isPending ? <Loader2 className="mt-4 h-5 w-5 animate-spin"/>
    : settings.isError ? <p role="alert" className="mt-4 text-sm text-rose-400">No se pudo consultar la política.</p>
    : <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-border/50 p-3">
        <Label htmlFor="tuktuk-no-show-wait">Espera mínima después de notificar llegada (minutos)</Label>
        <Input id="tuktuk-no-show-wait" type="number" min={1} max={60} value={minutes} onChange={e=>setMinutes(e.target.value)} disabled={save.isPending} className="mt-2 w-32"/>
        <p className="mt-2 text-xs text-muted-foreground">El conductor solo podrá declarar que el cliente no se presentó cuando haya llegada registrada y se cumpla este tiempo.</p>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 p-3"><div><p className="text-sm font-medium">Buscar otro conductor</p><p className="text-xs text-muted-foreground">Si el conductor cancela, conserva el precio, recorrido y notas. Requiere confirmación del cliente u operadora.</p></div><Switch checked={replacement} onCheckedChange={setReplacement} disabled={save.isPending} aria-label="Permitir buscar otro conductor"/></div>
      <p className="text-xs text-muted-foreground">No se aplican cargos ni multas automáticas. Las incidencias y cancelaciones se conservan en el historial.</p>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{save.isSuccess?"Política guardada":"Espera inicial: 5 minutos"}</span><Button type="button" disabled={!valid||save.isPending} onClick={()=>save.mutate()}>{save.isPending?"Guardando…":"Guardar políticas"}</Button></div>
      {!valid&&<p role="alert" className="text-sm text-rose-400">Indica entre 1 y 60 minutos.</p>}
      {save.isError&&<p role="alert" className="text-sm text-rose-400">No se pudo guardar la política.</p>}
    </div>}
  </section>;
}
