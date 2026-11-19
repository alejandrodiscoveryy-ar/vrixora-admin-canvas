import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

type Policy = { version: number; credit_enabled: boolean; credit_limit_cup: number; withdrawals_enabled: boolean; withdrawal_minimum_cup: number; remove_free_days: boolean; engine_ready: boolean; activated_at?: string | null };
type DebtSummary={debt_cup:number;debt_drivers:number;pending_withdrawals:number;pending_withdrawal_cup:number;drivers:{user_id:string;display_name:string;debt_cup:number}[]};
type Withdrawal={id:string;display_name:string;amount:number;status:string;requested_at:string;payment_reference?:string};
const cup=(n:number)=>new Intl.NumberFormat("es-CU",{style:"currency",currency:"CUP",maximumFractionDigits:2}).format(n);
export default function MarketplaceImpulsaTransitionPanel({projectId,canEdit,embedded=false}:{projectId:string;canEdit:boolean;embedded?:boolean}) {
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
  if(!query.data||!canEdit||!valid)throw new Error("Revisa la configuración");
  const {error}=await getSupabaseClient().rpc("admin_save_marketplace_wallet_transition_v1",{target_project_id:projectId,target_expected_version:query.data.version,target_credit_enabled:credit,target_credit_limit_cup:Number(limit),target_withdrawals_enabled:withdrawals,target_withdrawal_minimum_cup:Number(minimum),target_remove_free_days:removeFree});
  if(error)throw new Error(error.message);
 },onSuccess:async()=>{setMessage("Política guardada. No se activaron cobros automáticamente.");await qc.invalidateQueries({queryKey:["marketplace-wallet-transition",projectId]});},onError:(e:Error)=>{setMessage(e.message.includes("WALLET_TRANSITION_CHANGED")?"Otra persona modificó la política. Revisa los valores actualizados.":"No se pudo guardar la política.");void qc.invalidateQueries({queryKey:["marketplace-wallet-transition",projectId]});}});
 const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:["marketplace-wallet-transition",projectId]}),qc.invalidateQueries({queryKey:["wallet-transition-summary",projectId]}),qc.invalidateQueries({queryKey:["impulsa-withdrawals",projectId]}),qc.invalidateQueries({queryKey:["marketplace-impulsa-policy",projectId]})]);};
 const summary=useQuery({queryKey:["wallet-transition-summary",projectId],enabled:canEdit&&!!query.data?.engine_ready,queryFn:async()=>{const {data,error}=await getSupabaseClient().rpc("admin_get_marketplace_wallet_transition_summary_v1",{target_project_id:projectId});if(error)throw error;return data as DebtSummary;}});
 const requests=useQuery({queryKey:["impulsa-withdrawals",projectId],enabled:canEdit&&!!query.data?.engine_ready,queryFn:async()=>{const {data,error}=await getSupabaseClient().rpc("admin_list_marketplace_impulsa_withdrawals_v1",{target_project_id:projectId});if(error)throw error;return (data??[]) as Withdrawal[];}});
 const attempts=useRef(new Map<string,string>());
 const resolve=useMutation({mutationFn:async({id,status,reference}:{id:string;status:"paid"|"rejected";reference:string})=>{const attempt=[id,status,reference].join(":");const key=attempts.current.get(attempt)??crypto.randomUUID();attempts.current.set(attempt,key);const {error}=await getSupabaseClient().rpc("admin_resolve_marketplace_impulsa_withdrawal_v1",{target_project_id:projectId,target_id:id,target_status:status,target_reference:reference,target_key:key});if(error)throw new Error(error.message);attempts.current.delete(attempt);},onSuccess:async()=>{setMessage("Solicitud actualizada.");await refresh();},onError:async()=>{setMessage("No se pudo confirmar el estado. Revisa la solicitud antes de reintentar.");await refresh();}});
 const activate=useMutation({mutationFn:async()=>{if(!query.data?.engine_ready||!canEdit||changed)throw new Error("Guarda la configuración primero");const {error}=await getSupabaseClient().rpc("admin_activate_marketplace_wallet_transition_v1",{target_project_id:projectId,target_expected_version:query.data.version});if(error)throw new Error(error.message);},onSuccess:async()=>{setMessage("Política de cobro activada.");await refresh();},onError:async()=>{setMessage("No se pudo activar. Verifica la configuración y los permisos.");await refresh();}});
 const resolveRequest=(w:Withdrawal,status:"paid"|"rejected")=>{const reference=window.prompt(status==="paid"?"Referencia del pago externo ya realizado":"Motivo del rechazo")?.trim();if(!reference)return;if(!window.confirm(status==="paid"?`Confirmar que ya pagaste ${cup(w.amount)} a ${w.display_name}? Este registro no ejecuta una transferencia.`:"¿Rechazar y liberar el saldo reservado?"))return;resolve.mutate({id:w.id,status,reference});};
 const disabled=!canEdit||save.isPending;
 return <section aria-label="Crédito y retiradas" className={embedded ? "min-w-0 space-y-3" : cp.section}>
 {!embedded && <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200"><Wallet className="h-5 w-5"/></span><div><p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">TukTuk · Billetera</p><h2 className="text-lg font-extrabold text-text-primary">Crédito inicial y retiradas</h2><p className="text-xs text-text-secondary">Política configurable para la transición al cobro de comisiones.</p></div></div>}
 {query.isError?<p role="alert" className="mt-3 text-sm text-amber-200">Configuración no disponible. No se modificó ningún saldo.</p>:query.isLoading?<p className="mt-3 text-sm text-text-secondary">Cargando política…</p>:<div className="mt-4 space-y-3">
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="min-w-0 space-y-3 rounded-xl border border-border-subtle bg-surface-2 p-3">
 <label className="flex items-center gap-2 text-sm font-semibold text-text-primary"><input type="checkbox" checked={credit} onChange={e=>setCredit(e.target.checked)} disabled={disabled}/>Primera carrera a crédito</label>
 <p className="text-xs text-text-secondary">Una por conductor. La deuda debe liquidarse antes de otra carrera.</p>
 <Label htmlFor="initial-credit-limit" className="text-text-secondary">Límite máximo de deuda (CUP)</Label><Input id="initial-credit-limit" type="number" min=".01" max="1000000" step=".01" value={limit} onChange={e=>setLimit(e.target.value)} disabled={disabled||!credit}/>
 </div>
 <div className="min-w-0 space-y-3 rounded-xl border border-border-subtle bg-surface-2 p-3">
 <label className="flex items-center gap-2 text-sm font-semibold text-text-primary"><input type="checkbox" checked={withdrawals} onChange={e=>setWithdrawals(e.target.checked)} disabled={disabled}/>Solicitudes de retirada Impulsa</label>
 <p className="text-xs text-text-secondary">Solo ganancias comerciales disponibles. Aprobación manual; nunca bonos ni recargas.</p>
 <Label htmlFor="impulsa-withdrawal-minimum" className="text-text-secondary">Retirada mínima (CUP)</Label><Input id="impulsa-withdrawal-minimum" type="number" min=".01" max="100000000" step=".01" value={minimum} onChange={e=>setMinimum(e.target.value)} disabled={disabled||!withdrawals}/>
 </div>
 </div>
 <div className="min-w-0 rounded-xl border border-border-subtle bg-surface-2 p-3"><label className="flex items-center gap-2 text-sm font-semibold text-text-primary"><input type="checkbox" checked={removeFree} onChange={e=>setRemoveFree(e.target.checked)} disabled={disabled||!!query.data?.activated_at}/>Eliminar días gratuitos al activar la nueva política</label><p className="mt-1 text-xs text-text-secondary">Las carreras ya aceptadas conservan sus condiciones. Los premios por referidos se mantienen separados.</p></div>
 <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/20 bg-surface-2 p-3"><div className="flex min-w-0 flex-1 gap-2 text-xs text-text-secondary"><ShieldCheck className="h-5 w-5 shrink-0 text-cyan-300"/><div><p className="font-semibold text-text-primary">{query.data?.activated_at?"Política activada":query.data?.engine_ready?"Motor listo · cobro protegido":"Borrador · cobro protegido"}</p><p>{query.data?.activated_at?"Las nuevas carreras siguen la política vigente.":"La configuración se guarda y audita. No activa comisiones automáticamente."}</p></div></div>{canEdit&&<Button size="sm" disabled={disabled||!valid||!changed} onClick={()=>{setMessage("");save.mutate();}}>Guardar política</Button>}</div>
 {canEdit&&query.data?.engine_ready&&!query.data.activated_at&&<Button disabled={changed||activate.isPending||save.isPending||!credit||!removeFree} onClick={()=>{if(window.confirm("Activar las comisiones configuradas, Impulsa y el crédito inicial, y terminar los días gratuitos para nuevas carreras. ¿Confirmas?"))activate.mutate();}}>Activar política económica</Button>}
 {canEdit&&query.data?.engine_ready&&<div className="min-w-0 space-y-3 rounded-xl border border-border-subtle bg-surface-2 p-3">
 <h3 className="font-bold text-text-primary">Control de deuda y retiradas</h3>
 {(summary.isError||requests.isError)?<p className="text-sm text-amber-200">No se pudo cargar el control de saldos.</p>:summary.isLoading||requests.isLoading?<p className="text-sm text-text-secondary">Cargando…</p>:<>
 <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-surface-1 p-3"><p className="text-xs text-text-secondary">Deuda por cobrar · {summary.data?.debt_drivers??0} conductores</p><strong className="text-lg text-amber-200">{cup(summary.data?.debt_cup??0)}</strong></div><div className="rounded-lg bg-surface-1 p-3"><p className="text-xs text-text-secondary">Retiradas pendientes · {summary.data?.pending_withdrawals??0}</p><strong className="text-lg text-cyan-200">{cup(summary.data?.pending_withdrawal_cup??0)}</strong></div></div>
 {summary.data?.drivers.map(d=><div key={d.user_id} className="flex justify-between gap-2 border-b border-border-subtle py-2 text-sm"><span>{d.display_name||d.user_id}</span><span className="text-amber-200">{cup(d.debt_cup)}</span></div>)}
 <h4 className="text-sm font-semibold text-text-primary">Solicitudes Impulsa</h4>
 {!requests.data?.length&&<p className="text-xs text-text-secondary">No hay solicitudes.</p>}
 {requests.data?.map(w=><div key={w.id} className="rounded-lg border border-border-subtle p-3 text-sm"><div className="flex justify-between gap-2"><strong>{w.display_name||"Conductor"}</strong><strong>{cup(w.amount)}</strong></div><p className="text-xs text-text-secondary">{({requested:"Pendiente",paid:"Pagada",rejected:"Rechazada",cancelled:"Cancelada"} as Record<string,string>)[w.status]??w.status} · {new Date(w.requested_at).toLocaleDateString("es-CU")}</p>{w.payment_reference&&<p className="text-xs text-slate-400">{w.payment_reference}</p>}{w.status==="requested"&&<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" disabled={resolve.isPending} onClick={()=>resolveRequest(w,"paid")}>Registrar pago realizado</Button><Button size="sm" variant="outline" disabled={resolve.isPending} onClick={()=>resolveRequest(w,"rejected")}>Rechazar</Button></div>}</div>)}
 </>}
 </div>}
 {message&&<p role="status" className="text-xs text-cyan-200">{message}</p>}
 </div>}
 </section>;
}
