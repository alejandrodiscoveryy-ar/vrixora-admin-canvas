import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

type Policy = { version: number; credit_enabled: boolean; credit_limit_cup: number; withdrawals_enabled: boolean; withdrawal_minimum_cup: number; remove_free_days: boolean; engine_ready: boolean; activated_at?: string | null };
type DebtSummary={debt_cup:number;debt_drivers:number;pending_withdrawals:number;pending_withdrawal_cup:number;drivers:{user_id:string;display_name:string;debt_cup:number}[]};
type Withdrawal={id:string;display_name:string;amount:number;status:string;requested_at:string;payment_reference?:string};
const cup=(n:number)=>new Intl.NumberFormat("es-CU",{maximumFractionDigits:2}).format(n)+" CUP";
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
 const disabled = !canEdit || save.isPending;
 return (
  <section aria-label="Crédito y retiradas" className={embedded ? "min-w-0 space-y-4" : cp.section}>
    {!embedded && (
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Crédito inicial y retiradas</h2>
        <p className="mt-1 text-sm text-text-secondary">Configura condiciones económicas y revisa deudas y solicitudes.</p>
      </div>
    )}
    {query.isError ? (
      <p role="alert" className="rounded-lg border border-amber-400/30 p-3 text-sm text-text-secondary">No se pudo cargar la política. No se modificó ningún saldo.</p>
    ) : query.isLoading ? (
      <p className="py-4 text-sm text-text-secondary">Consultando la política…</p>
    ) : (
      <div className="space-y-4">
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="min-w-0 space-y-3 lg:border-r lg:border-border-subtle lg:pr-6">
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-text-primary">
              <input className="size-4" type="checkbox" checked={credit} onChange={e => setCredit(e.target.checked)} disabled={disabled} />
              Primera carrera a crédito
            </label>
            <p className="text-xs text-text-secondary">Un servicio por conductor. La deuda debe liquidarse antes del siguiente.</p>
            <div className="space-y-1.5">
              <Label htmlFor="initial-credit-limit">Límite máximo de deuda (CUP)</Label>
              <Input id="initial-credit-limit" type="number" min=".01" max="1000000" step=".01"
                value={limit} onChange={e => setLimit(e.target.value)} disabled={disabled || !credit}
                className="h-11 w-full max-w-[240px] tabular-nums" />
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-text-primary">
              <input className="size-4" type="checkbox" checked={withdrawals} onChange={e => setWithdrawals(e.target.checked)} disabled={disabled} />
              Retiradas de ganancias Impulsa
            </label>
            <p className="text-xs text-text-secondary">Solo ganancias comerciales reales. Se aprueban manualmente, nunca con bonos o recargas.</p>
            <div className="space-y-1.5">
              <Label htmlFor="impulsa-withdrawal-minimum">Importe mínimo de retirada (CUP)</Label>
              <Input id="impulsa-withdrawal-minimum" type="number" min=".01" max="100000000" step=".01"
                value={minimum} onChange={e => setMinimum(e.target.value)} disabled={disabled || !withdrawals}
                className="h-11 w-full max-w-[240px] tabular-nums" />
            </div>
          </div>
        </div>
        <label className="flex min-h-11 items-start gap-3 border-t border-border-subtle pt-3 text-sm text-text-primary">
          <input className="mt-1 size-4 shrink-0" type="checkbox" checked={removeFree} onChange={e => setRemoveFree(e.target.checked)}
            disabled={disabled || Boolean(query.data?.activated_at)} />
          <span><span className="font-medium">Finalizar días gratuitos al activar la nueva política</span>
            <span className="mt-1 block text-xs text-text-secondary">Las carreras aceptadas y los premios por referidos mantienen sus condiciones.</span>
          </span>
        </label>
        {!valid && <p role="alert" className="text-sm text-destructive">Revisa los importes y sus límites antes de guardar.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <p className="text-xs text-text-secondary">
            <strong className="text-text-primary">{query.data?.activated_at ? "Política activa" : query.data?.engine_ready ? "Motor listo · aún no activada" : "Configuración en preparación"}</strong>
            <span className="mt-1 block">Guardar no activa comisiones ni realiza movimientos financieros.</span>
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="max-sm:min-h-11" disabled={disabled || !valid || !changed}
                onClick={() => { setMessage(""); save.mutate(); }}>Guardar política</Button>
              {query.data?.engine_ready && !query.data.activated_at && (
                <Button size="sm" className="max-sm:min-h-11" variant="outline"
                  disabled={changed || activate.isPending || save.isPending || !credit || !removeFree}
                  onClick={() => {
                    if (window.confirm("Activar las comisiones configuradas, Impulsa y el crédito inicial, y terminar los días gratuitos para nuevas carreras. ¿Confirmas?")) activate.mutate();
                  }}>Activar política económica</Button>
              )}
            </div>
          )}
        </div>

        {canEdit && query.data?.engine_ready && (
          <section aria-label="Control de deudas y retiradas" className="space-y-3 border-t border-border-subtle pt-4">
            <h3 className="text-sm font-semibold text-text-primary">Deuda y retiradas pendientes</h3>
            {summary.isError || requests.isError ? (
              <p role="alert" className="text-sm text-text-secondary">No se pudieron cargar los movimientos. Revisa el estado antes de operar.</p>
            ) : summary.isLoading || requests.isLoading ? (
              <p className="text-sm text-text-secondary">Consultando saldos…</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-xl border border-border-subtle bg-surface-2 p-3">
                    <p className="text-xs text-text-secondary">Deuda por cobrar · {summary.data?.debt_drivers ?? 0} conductores</p>
                    <strong className="mt-1 block text-xl font-semibold tabular-nums text-text-primary">{cup(summary.data?.debt_cup ?? 0)}</strong>
                  </div>
                  <div className="min-w-0 rounded-xl border border-border-subtle bg-surface-2 p-3">
                    <p className="text-xs text-text-secondary">Retiradas pendientes · {summary.data?.pending_withdrawals ?? 0}</p>
                    <strong className="mt-1 block text-xl font-semibold tabular-nums text-text-primary">{cup(summary.data?.pending_withdrawal_cup ?? 0)}</strong>
                  </div>
                </div>
                <details className="group rounded-xl border border-border-subtle">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-text-primary">
                    Ver conductores con deuda y solicitudes de retirada
                  </summary>
                  <div className="space-y-3 border-t border-border-subtle p-3">
                    {!summary.data?.drivers.length && <p className="text-xs text-text-secondary">No hay conductores con deuda.</p>}
                    {summary.data?.drivers.map(d => (
                      <div key={d.user_id} className="flex flex-wrap justify-between gap-2 border-b border-border-subtle py-2 text-sm">
                        <span>{d.display_name || d.user_id}</span><strong className="tabular-nums">{cup(d.debt_cup)}</strong>
                      </div>
                    ))}
                    <h4 className="text-sm font-semibold text-text-primary">Solicitudes Impulsa</h4>
                    {!requests.data?.length && <p className="text-xs text-text-secondary">No hay solicitudes.</p>}
                    {requests.data?.map(w => (
                      <div key={w.id} className="space-y-2 border-b border-border-subtle py-2 text-sm last:border-b-0">
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong>{w.display_name || "Conductor"}</strong><strong className="tabular-nums">{cup(w.amount)}</strong>
                        </div>
                        <p className="text-xs text-text-secondary">
                          {({requested:"Pendiente", paid:"Pagada", rejected:"Rechazada", cancelled:"Cancelada"} as Record<string,string>)[w.status] ?? w.status}
                          {" · "}{new Date(w.requested_at).toLocaleDateString("es-CU")}
                        </p>
                        {w.payment_reference && <p className="break-all text-xs text-text-secondary">{w.payment_reference}</p>}
                        {w.status === "requested" && (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" className="max-sm:min-h-11" disabled={resolve.isPending} onClick={() => resolveRequest(w,"paid")}>Registrar pago realizado</Button>
                            <Button size="sm" className="max-sm:min-h-11" variant="outline" disabled={resolve.isPending} onClick={() => resolveRequest(w,"rejected")}>Rechazar</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </section>
        )}
        {message && <p role="status" className="text-sm text-text-primary">{message}</p>}
      </div>
    )}
  </section>
 );
}
