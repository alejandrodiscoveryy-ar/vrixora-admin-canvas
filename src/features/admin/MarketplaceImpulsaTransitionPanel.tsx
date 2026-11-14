import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

type Policy = { version: number; credit_enabled: boolean; credit_limit_cup: number; withdrawals_enabled: boolean; withdrawal_minimum_cup: number; remove_free_days: boolean; engine_ready: boolean };
export default function MarketplaceImpulsaTransitionPanel({projectId,canEdit}:{projectId:string;canEdit:boolean}) {
 const qc=useQueryClient();
 const query=useQuery({queryKey:["marketplace-wallet-transition",projectId],queryFn:async()=>{
  const {data,error}=await getSupabaseClient().rpc("admin_get_marketplace_wallet_transition_v1",{target_project_id:projectId});
  if(error||!data)throw new Error(error?.message||"Configuración no disponible");
  return data as Policy;
 }});
 const [credit,setCredit]=useState(true),[limit,setLimit]=useState("500");
 const [withdrawals,setWithdrawals]=useState(true),[minimum,setMinimum]=useState("5000");
 const [removeFree,setRemoveFree]=useState(true),[message,setMessage]=useState("");
 useEffect(()=>{if(query.data){setCredit(query.data.credit_enabled);setLimit(String(query.data.credit_limit_cup));setWithdrawals(query.data.withdrawals_enabled);setMinimum(String(query.data.withdrawal_minimum_cup));setRemoveFree(query.data.remove_free_days);}},[query.data]);
 const valid=limit.trim()!==""&&minimum.trim()!==""&&Number.isFinite(Number(limit))&&Number.isFinite(Number(minimum))&&Number(limit)>=.01&&Number(limit)<=1000000&&Number(minimum)>=.01&&Number(minimum)<=100000000;
 const changed=!!query.data&&(credit!==query.data.credit_enabled||Number(limit)!==Number(query.data.credit_limit_cup)||withdrawals!==query.data.withdrawals_enabled||Number(minimum)!==Number(query.data.withdrawal_minimum_cup)||removeFree!==query.data.remove_free_days);
 const save=useMutation({mutationFn:async()=>{
  if(!query.data||!canEdit||!valid||query.data.engine_ready)throw new Error("Revisa la configuración");
  const {error}=await getSupabaseClient().rpc("admin_save_marketplace_wallet_transition_v1",{target_project_id:projectId,target_expected_version:query.data.version,target_credit_enabled:credit,target_credit_limit_cup:Number(limit),target_withdrawals_enabled:withdrawals,target_withdrawal_minimum_cup:Number(minimum),target_remove_free_days:removeFree});
  if(error)throw new Error(error.message);
 },onSuccess:async()=>{setMessage("Borrador guardado. No se activaron cobros ni retiradas.");await qc.invalidateQueries({queryKey:["marketplace-wallet-transition",projectId]});},onError:(e:Error)=>{setMessage(e.message.includes("WALLET_TRANSITION_CHANGED")?"Otra persona modificó la política. Revisa los valores actualizados.":"No se pudo guardar la política.");void qc.invalidateQueries({queryKey:["marketplace-wallet-transition",projectId]});}});
 const disabled=!canEdit||save.isPending||!!query.data?.engine_ready;
 return <section aria-label="Crédito y retiradas" className="relative isolate overflow-hidden rounded-[22px] border border-cyan-300/25 bg-gradient-to-br from-[#0d2729] via-[#101d2c] to-[#17182c] p-3 sm:p-4 admin-graphite-panel">
 <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200"><Wallet className="h-5 w-5"/></span><div><p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">TukTuk · Billetera</p><h2 className="text-lg font-extrabold text-white">Crédito inicial y retiradas</h2><p className="text-xs text-slate-300">Política configurable para la transición al cobro de comisiones.</p></div></div>
 {query.isError?<p role="alert" className="mt-3 text-sm text-amber-200">Configuración no disponible. No se modificó ningún saldo.</p>:query.isLoading?<p className="mt-3 text-sm text-slate-300">Cargando política…</p>:<div className="mt-4 space-y-3">
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-3 rounded-xl border border-white/10 bg-[#071725]/80 p-3 admin-graphite-inset">
 <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" checked={credit} onChange={e=>setCredit(e.target.checked)} disabled={disabled}/>Primera carrera a crédito</label>
 <p className="text-xs text-slate-300">Una por conductor. La deuda debe liquidarse antes de otra carrera.</p>
 <Label htmlFor="initial-credit-limit" className="text-slate-300">Límite máximo de deuda (CUP)</Label><Input id="initial-credit-limit" type="number" min=".01" max="1000000" step=".01" value={limit} onChange={e=>setLimit(e.target.value)} disabled={disabled||!credit}/>
 </div>
 <div className="space-y-3 rounded-xl border border-white/10 bg-[#071725]/80 p-3 admin-graphite-inset">
 <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" checked={withdrawals} onChange={e=>setWithdrawals(e.target.checked)} disabled={disabled}/>Solicitudes de retirada Impulsa</label>
 <p className="text-xs text-slate-300">Solo ganancias comerciales disponibles. Aprobación manual; nunca bonos ni recargas.</p>
 <Label htmlFor="impulsa-withdrawal-minimum" className="text-slate-300">Retirada mínima (CUP)</Label><Input id="impulsa-withdrawal-minimum" type="number" min=".01" max="100000000" step=".01" value={minimum} onChange={e=>setMinimum(e.target.value)} disabled={disabled||!withdrawals}/>
 </div>
 </div>
 <div className="rounded-xl border border-white/10 bg-[#071725]/80 p-3 admin-graphite-inset"><label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" checked={removeFree} onChange={e=>setRemoveFree(e.target.checked)} disabled={disabled}/>Eliminar días gratuitos al activar la nueva política</label><p className="mt-1 text-xs text-slate-300">Las carreras ya aceptadas conservan sus condiciones. Los premios por referidos se mantienen separados.</p></div>
 <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/20 bg-[#071725]/80 p-3"><div className="flex min-w-0 flex-1 gap-2 text-xs text-slate-300"><ShieldCheck className="h-5 w-5 shrink-0 text-cyan-300"/><div><p className="font-semibold text-white">Borrador · cobro protegido</p><p>La configuración se guarda y audita. No crea deuda, no permite retiradas y no activa comisiones hasta instalar y validar el motor de transición.</p></div></div>{canEdit&&<Button size="sm" disabled={disabled||!valid||!changed} onClick={()=>{setMessage("");save.mutate();}}>Guardar política</Button>}</div>
 {message&&<p role="status" className="text-xs text-cyan-200">{message}</p>}
 </div>}
 </section>;
}
