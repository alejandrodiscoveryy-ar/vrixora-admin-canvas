import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
type Summary = { generated_jobs:number; own_paid_jobs:number; own_savings_cup:number; fleet_credited_jobs:number; credited_cup:number; pending_cup:number; funding_required_cup:number; reversal_pending_cup:number; recent:{job_id:string;amount:number;state:string;created_at:string;commercial_rate:number}[] };
const cup=(v:number)=>new Intl.NumberFormat("es",{maximumFractionDigits:2}).format(v)+" CUP";
const labels:Record<string,string>={pending:"Pendiente de acreditar",funding_required:"Pendiente de financiación",credited:"Acreditada",cancelled:"Cancelada",reversal_pending:"Ajuste pendiente",reversed:"Revertida"};
export default function MarketplaceImpulsaEarnings({projectId,driverUserId}:{projectId:string;driverUserId:string}){
 const query=useQuery({queryKey:["impulsa-earnings",projectId,driverUserId],queryFn:async()=>{
  const {data,error}=await getSupabaseClient().rpc("admin_get_marketplace_impulsa_summary_v1",{target_project_id:projectId,target_driver_user_id:driverUserId});
  if(error||!data)throw new Error("No disponible");return data as Summary;
 }});
 if(query.isLoading)return <p className="text-xs text-muted-foreground">Consultando ganancias Impulsa…</p>;
 if(query.isError||!query.data)return <p className="text-xs text-muted-foreground">Ganancias comerciales no disponibles para esta cuenta o permisos.</p>;
 const d=query.data;
 return <section className="space-y-3 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.04] p-3" aria-label="Rendimiento comercial Impulsa">
  <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-400"/><h3 className="font-bold">Rendimiento comercial</h3></div>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Solicitudes generadas",String(d.generated_jobs)],["Viajes propios con comisión",String(d.own_paid_jobs)],["Ahorro propio",cup(d.own_savings_cup)],["Ganancias acreditadas",cup(d.credited_cup)]].map(([label,value])=><div key={label} className="min-w-0 rounded-lg border border-border/60 bg-background/50 p-2"><p className="text-xs text-muted-foreground">{label}</p><p className="text-base font-extrabold tabular-nums">{value}</p></div>)}</div>
  <div className="grid gap-2 text-xs sm:grid-cols-3"><p>Por acreditar: <strong>{cup(d.pending_cup)}</strong></p><p>Por financiar: <strong>{cup(d.funding_required_cup)}</strong></p><p>Ajustes pendientes: <strong>{cup(d.reversal_pending_cup)}</strong></p></div>
  {d.recent.length>0&&<div className="divide-y divide-border/60">{d.recent.map(x=><div key={x.job_id} className="flex flex-wrap items-center justify-between gap-1 py-2 text-xs"><div><p className="font-semibold">{labels[x.state]??x.state} · {Number(x.commercial_rate*100).toFixed(2)}%</p><p className="text-muted-foreground">{new Date(x.created_at).toLocaleString("es-CU",{timeZone:"America/Havana"})} · {x.job_id.slice(0,8)}</p></div><strong className="tabular-nums">{cup(x.amount)}</strong></div>)}</div>}
 </section>;
}
