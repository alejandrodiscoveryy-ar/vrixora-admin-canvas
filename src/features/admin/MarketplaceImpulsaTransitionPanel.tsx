import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronDown, Wallet, Clock3 } from "lucide-react";
import { PolicyTile, PolicyNumberField, PolicyToggle, PolicyStatus } from "@/features/admin/CommercialPolicyControls";
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
 const creditChanged = Boolean(query.data) && (credit !== query.data?.credit_enabled || Number(limit) !== Number(query.data?.credit_limit_cup));
 const withdrawalChanged = Boolean(query.data) && (withdrawals !== query.data?.withdrawals_enabled || Number(minimum) !== Number(query.data?.withdrawal_minimum_cup));
 const freeDaysChanged = Boolean(query.data) && removeFree !== query.data?.remove_free_days;

 return (
  <section aria-label="Crédito y retiradas" className={embedded ? "min-w-0 space-y-3" : cp.section}>
    {!embedded && (
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-text-primary">Crédito inicial y retiradas</h2>
        <p className="mt-1 text-sm text-text-secondary">Condiciones económicas y movimientos pendientes.</p>
      </div>
    )}
    {query.isError ? (
      <p role="alert" className="rounded-xl border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] p-3 text-sm text-text-primary">
        No se pudo cargar la política. No se modificó ningún saldo.
      </p>
    ) : query.isLoading ? (
      <p role="status" className="py-4 text-sm text-text-secondary">Consultando la política de crédito y retiradas…</p>
    ) : (
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <PolicyStatus active={Boolean(query.data?.activated_at)}
            label={query.data?.activated_at ? "Política activa" : query.data?.engine_ready ? "Preparada para activar" : "En preparación"} />
          {changed && <PolicyStatus active={false} pending />}
          <p className="text-xs text-text-secondary sm:ml-auto">Guardar ajustes no realiza movimientos de dinero.</p>
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <PolicyTile
            title="Primera carrera a crédito"
            description="Solo un servicio inicial por conductor. La deuda se liquida antes del siguiente."
            controls={
              <PolicyToggle id="initial-credit-enabled"
                label="Activar primera carrera a crédito"
                checked={credit} onChange={setCredit}
                disabled={disabled} pending={creditChanged} />
            }
          >
            <PolicyNumberField id="initial-credit-limit"
              label="Límite máximo de deuda" unit="CUP"
              value={limit} onChange={setLimit} min="0.01" max="1000000" step="0.01"
              disabled={disabled || !credit}
              hint={credit ? "Tope permitido por conductor." : "Activa el crédito para editar su límite."} />
          </PolicyTile>

          <PolicyTile
            title="Retiradas de ganancias Impulsa"
            description="Solo ganancias comerciales reales; aprobación manual, nunca bonos ni recargas."
            controls={
              <PolicyToggle id="impulsa-withdrawals-enabled"
                label="Activar retiradas de ganancias Impulsa"
                checked={withdrawals} onChange={setWithdrawals}
                disabled={disabled} pending={withdrawalChanged} />
            }
          >
            <PolicyNumberField id="impulsa-withdrawal-minimum"
              label="Importe mínimo de retirada" unit="CUP"
              value={minimum} onChange={setMinimum} min="0.01" max="100000000" step="0.01"
              disabled={disabled || !withdrawals}
              hint={withdrawals ? "Las solicitudes requieren aprobación antes del registro de pago." : "Activa las retiradas para editar el mínimo."} />
          </PolicyTile>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border-default bg-surface-2/45 px-3 py-3 sm:px-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-text-primary">Finalizar días gratuitos al activar la política</p>
            <p className="text-xs leading-relaxed text-text-secondary">
              Las carreras aceptadas y los premios por referidos conservarán sus condiciones.
              {query.data?.activated_at ? " Esta decisión ya no puede editarse." : ""}
            </p>
          </div>
          <PolicyToggle id="impulsa-remove-free-days" checked={removeFree} onChange={setRemoveFree}
            disabled={disabled || Boolean(query.data?.activated_at)}
            pending={freeDaysChanged}
            label="Finalizar días gratuitos al activar la nueva política" />
        </div>

        {!valid && <p role="alert" className="text-sm text-destructive">Revisa los importes: deben ser mayores que cero y estar dentro de los límites permitidos.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <p className="text-xs leading-relaxed text-text-secondary">
            {changed ? "Hay cambios sin guardar." : "Condiciones guardadas."}
            {" "}La activación del motor es una acción independiente.
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {changed && (
                <Button size="sm" className="min-h-11 sm:min-h-9"
                  disabled={disabled || !valid}
                  onClick={() => { setMessage(""); save.mutate(); }}>
                  {save.isPending ? "Guardando…" : "Guardar política"}
                </Button>
              )}
              {query.data?.engine_ready && !query.data.activated_at && (
                <Button size="sm" className="min-h-11 sm:min-h-9" variant="subtle"
                  disabled={changed || activate.isPending || save.isPending || !credit || !removeFree}
                  onClick={() => {
                    if (window.confirm("Activar las comisiones configuradas, Impulsa y el crédito inicial, y terminar los días gratuitos para nuevas carreras. ¿Confirmas?")) activate.mutate();
                  }}>
                  Activar política económica
                </Button>
              )}
            </div>
          )}
        </div>

        {canEdit && query.data?.engine_ready && (
          <section aria-label="Control de deudas y retiradas" className="min-w-0 space-y-3 border-t border-border-subtle pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-primary sm:text-base">Deuda y retiradas pendientes</h3>
              <span className="text-xs text-text-secondary">Movimientos reales · control manual</span>
            </div>
            {summary.isError || requests.isError ? (
              <p role="alert" className="text-sm text-text-secondary">No se pudieron cargar los movimientos. Revisa el estado antes de operar.</p>
            ) : summary.isLoading || requests.isLoading ? (
              <p role="status" className="text-sm text-text-secondary">Consultando saldos…</p>
            ) : (
              <>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--radius-card)] border border-border-default bg-surface-2/65 p-3 sm:p-4">
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      <Wallet className="size-4 text-[var(--module-accent)]" aria-hidden="true" />
                      Deuda por cobrar
                    </div>
                    <strong className="mt-2 block text-2xl font-semibold tabular-nums tracking-tight text-text-primary">
                      {cup(summary.data?.debt_cup ?? 0)}
                    </strong>
                    <p className="mt-1 text-xs text-text-secondary">
                      {summary.data?.debt_drivers ?? 0} {(summary.data?.debt_drivers ?? 0) === 1 ? "conductor" : "conductores"}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-card)] border border-border-default bg-surface-2/65 p-3 sm:p-4">
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      <Clock3 className="size-4 text-[var(--module-accent)]" aria-hidden="true" />
                      Retiradas pendientes
                    </div>
                    <strong className="mt-2 block text-2xl font-semibold tabular-nums tracking-tight text-text-primary">
                      {cup(summary.data?.pending_withdrawal_cup ?? 0)}
                    </strong>
                    <p className="mt-1 text-xs text-text-secondary">
                      {summary.data?.pending_withdrawals ?? 0} {(summary.data?.pending_withdrawals ?? 0) === 1 ? "solicitud" : "solicitudes"}
                    </p>
                  </div>
                </div>
                <details className="group overflow-hidden rounded-[var(--radius-card)] border border-border-default bg-surface-2/45">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm text-text-primary [&::-webkit-details-marker]:hidden sm:px-4">
                    <span className="font-medium">Ver conductores y solicitudes</span>
                    <ChevronDown className="size-4 text-text-secondary transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="space-y-3 border-t border-border-subtle p-3 sm:p-4">
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
                            <Button size="sm" className="min-h-11 sm:min-h-9"
                              disabled={resolve.isPending}
                              onClick={() => resolveRequest(w,"paid")}>Registrar pago realizado</Button>
                            <Button size="sm" className="min-h-11 sm:min-h-9" variant="subtle"
                              disabled={resolve.isPending}
                              onClick={() => resolveRequest(w,"rejected")}>Rechazar</Button>
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
        {message && <p role="status" className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary">{message}</p>}
      </div>
    )}
  </section>
 );
}
