import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";

type Item = {job_id:string;status:string;from_status:string|null;reason:string|null;created_at:string;decision:"pending"|"justified"|"unjustified";review_note:string|null;reviewed_at:string|null};
type Review = {pending:number;justified:number;unjustified:number;items:Item[]};
const labels={pending:"Pendiente de revisión",justified:"Justificada",unjustified:"Injustificada"} as const;

export default function MarketplaceDriverCancellationReview({projectId,driverUserId,canManage,onOpenJob}:{projectId:string;driverUserId:string;canManage:boolean;onOpenJob:(id:string)=>void}) {
 const qc=useQueryClient(),key=["marketplace-driver-cancellation-reviews",projectId,driverUserId];
 const [editing,setEditing]=useState<Item|null>(null);
 const [decision,setDecision]=useState<"justified"|"unjustified">("justified");
 const [note,setNote]=useState("");
 const query=useQuery({queryKey:key,queryFn:async():Promise<Review>=>{
  const {data,error}=await getSupabaseClient().rpc("admin_get_marketplace_driver_cancellation_reviews",{target_project_id:projectId,target_driver_user_id:driverUserId});
  if(error)throw error;return data as unknown as Review;
 }});
 const save=useMutation({mutationFn:async()=>{
  if(!editing||note.trim().length<8)throw new Error("Motivo requerido");
  const {error}=await getSupabaseClient().rpc("admin_review_marketplace_cancellation",{target_project_id:projectId,target_job_id:editing.job_id,target_decision:decision,target_note:note.trim()});
  if(error)throw error;
 },onSuccess:async()=>{setEditing(null);toast.success("Evaluación de cancelación registrada.");await qc.invalidateQueries({queryKey:key});},onError:()=>toast.error("No se pudo guardar la evaluación.")});
 return <section className="marketplace-360-panel min-w-0 space-y-3 rounded-[var(--radius-card)] border border-border/60 bg-card/70 p-3 sm:p-4" aria-label="Evaluación de cancelaciones">
  <div><p className="marketplace-360-kicker">Cumplimiento</p><h3 className="mt-1 font-semibold">Cancelaciones y responsabilidad</h3><p className="mt-1 text-xs text-muted-foreground">Las causas declaradas no implican culpabilidad. La agencia revisa los casos; no se aplican multas automáticas.</p></div>
  {query.isPending?<p className="text-sm text-muted-foreground">Consultando…</p>:query.isError?<p role="alert" className="text-sm text-amber-300">No se pudo consultar la evaluación.</p>:<>
    <div className="grid grid-cols-3 gap-2">
      {(["pending","justified","unjustified"] as const).map(k=><div key={k} className="min-w-0 rounded-xl border border-border/50 p-2"><p className="text-[11px] leading-tight text-muted-foreground">{labels[k]}</p><p className="mt-1 text-lg font-semibold tabular-nums">{query.data[k]}</p></div>)}
    </div>
    <div className="space-y-2">
      {query.data.items.length===0?<p className="text-sm text-muted-foreground">Sin cancelaciones del conductor ni solicitudes de cancelación atribuidas a él.</p>:query.data.items.map(item=><article key={item.job_id} className="rounded-xl border border-border/50 p-2.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{item.status==="cancelled_by_driver"?"Canceló el conductor":"Cliente atribuye cancelación al conductor"}</span><span className="font-medium text-muted-foreground">{labels[item.decision]}</span></div>
        <p className="mt-1 break-words">{item.reason||"Sin motivo registrado"}</p>
        <p className="mt-1 text-muted-foreground">{new Date(item.created_at).toLocaleString("es-CU",{timeZone:"America/Havana"})}</p>
        {item.review_note&&<p className="mt-1 break-words text-muted-foreground">Evaluación: {item.review_note}</p>}
        <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>onOpenJob(item.job_id)}>Ver carrera</Button>{canManage&&<Button size="sm" variant="outline" onClick={()=>{setEditing(item);setDecision(item.decision==="unjustified"?"unjustified":"justified");setNote(item.review_note||"");}}>Evaluar</Button>}</div>
      </article>)}
      {query.data.items.length===50&&<p className="text-xs text-muted-foreground">Se muestran los últimos 50 casos; los contadores incluyen todos.</p>}
    </div>
    {editing&&<div className="space-y-2 rounded-xl border border-cyan-400/20 p-3"><p className="text-sm font-semibold">Evaluar cancelación</p><div className="flex gap-2"><Button size="sm" variant={decision==="justified"?"default":"outline"} onClick={()=>setDecision("justified")}>Justificada</Button><Button size="sm" variant={decision==="unjustified"?"default":"outline"} onClick={()=>setDecision("unjustified")}>Injustificada</Button></div><Textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} placeholder="Explica la evidencia y el motivo (mínimo 8 caracteres)"/><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>setEditing(null)} disabled={save.isPending}>Volver</Button><Button size="sm" disabled={note.trim().length<8||save.isPending} onClick={()=>save.mutate()}>Guardar evaluación</Button></div></div>}
  </>}
 </section>;
}
