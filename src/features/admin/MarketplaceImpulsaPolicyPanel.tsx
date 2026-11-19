import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, TrendingUp, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

type Policy = { enabled: boolean; billing_enabled: boolean; general_rate: number; own_rate: number; commercial_rate: number; live_general_rate: number; version: number };
const pct = (n: number) => String(Number((n * 100).toFixed(4)));
const cup = (n: number) => new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(n) + " CUP";

export default function MarketplaceImpulsaPolicyPanel({ projectId, canView, canEdit }: { projectId: string; canView: boolean; canEdit: boolean }) {
  const qc = useQueryClient();
  const [general, setGeneral] = useState("15");
  const [own, setOwn] = useState("10");
  const [commercial, setCommercial] = useState("5");
  const [fare, setFare] = useState("1000");
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["marketplace-impulsa-policy", projectId], enabled: canView,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_impulsa_policy_v1", { target_project_id: projectId });
      if (error || !data) throw new Error(error?.message || "Configuración no disponible");
      return data as Policy;
    },
  });
  useEffect(() => {
    if (!query.data) return;
    setGeneral(pct(query.data.general_rate)); setOwn(pct(query.data.own_rate)); setCommercial(pct(query.data.commercial_rate));
  }, [query.data]);
  const [g, o, c] = [general, own, commercial].map(Number);
  const valid = [general, own, commercial].every(v => v.trim() !== "") && [g,o,c].every(Number.isFinite) && g>0 && g<=100 && o>0 && o<=g && c>=0 && c<=g;
  const total = Math.max(0, Number(fare) || 0);
  const changed = !!query.data && (g/100 !== Number(query.data.general_rate) || o/100 !== Number(query.data.own_rate) || c/100 !== Number(query.data.commercial_rate));
  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!query.data || !canEdit || !valid) throw new Error("Revisa los porcentajes y permisos.");
      const { error } = await getSupabaseClient().rpc("admin_save_marketplace_impulsa_policy_v1", {
        target_project_id: projectId, target_expected_version: query.data.version,
        target_general_rate: g/100, target_own_rate: o/100, target_commercial_rate: c/100, target_enabled: enabled,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_, enabled) => {
      setMessage(enabled ? "Política activa. Solo nuevas publicaciones; las carreras anteriores conservan su porcentaje." : "Configuración guardada sin activar Impulsa.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["marketplace-impulsa-policy", projectId] }),
        qc.invalidateQueries({ queryKey: ["marketplace-commission-policy", projectId] }),
        qc.invalidateQueries({ queryKey: ["marketplace-welcome-policy", projectId] }),
        qc.invalidateQueries({ queryKey: ["marketplace-overview", projectId] }),
      ]);
    },
    onError: (error: Error) => {
      setMessage(error.message.includes("IMPULSA_POLICY_CHANGED") ? "La configuración cambió. Actualiza y vuelve a guardar." : error.message.includes("IMPULSA_BILLING_DISABLED") ? "Activa primero el cobro general. No se modificó ningún saldo." : "No se pudo guardar. Revisa permisos y configuración.");
      void qc.invalidateQueries({ queryKey: ["marketplace-impulsa-policy", projectId] });
    },
  });
  if (!canView) return null;
  return <section aria-label="Comisiones comerciales Impulsa" className={cp.section}>
    <img src="/admin-premium/economy.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -right-10 top-0 h-44 w-[55%] object-contain object-right-top opacity-[0.15]" />
    <div className="relative space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200"><TrendingUp className="h-5 w-5"/></span><div><p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">TukTuk · Impulsa</p><h2 className="text-lg font-semibold text-text-primary">Comisiones comerciales</h2><p className="text-xs text-text-secondary">Tres porcentajes sobre el importe del viaje.</p></div></div>
        <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200">{query.isLoading ? "Consultando" : query.isError ? "No disponible" : query.data?.enabled && query.data?.billing_enabled ? "Activo" : query.data?.enabled ? "Cobro suspendido" : "Sin activar"}</span>
      </header>
      {query.isError ? <p role="alert" className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">El módulo financiero aún no está instalado o no tienes permiso. No se modificó ningún saldo.</p> : query.isLoading ? <p className="text-sm text-text-secondary">Cargando configuración…</p> : <>
        <div className="grid gap-2 sm:grid-cols-3">
          {([{id:"general",label:"Comisión general",value:general,set:setGeneral,detail:"Carrera normal"},{id:"own",label:"Impulsa · Propia",value:own,set:setOwn,detail:"El promotor realiza el viaje"},{id:"commercial",label:"Impulsa · Comercial",value:commercial,set:setCommercial,detail:"Otro conductor realiza el viaje"}]).map(field=>
            <div key={field.id} className="min-w-0 rounded-xl border border-border-subtle bg-surface-2 p-3 admin-graphite-inset">
              <Label htmlFor={"impulsa-"+field.id} className="text-xs font-semibold text-text-secondary">{field.label}</Label>
              <div className="mt-1 flex items-center gap-1"><Input id={"impulsa-"+field.id} type="number" min="0" max="100" step="0.01" value={field.value} disabled={!canEdit || save.isPending} onChange={e=>field.set(e.target.value)} className="h-12 w-full border-0 bg-transparent p-0 text-3xl font-black text-text-primary tabular-nums shadow-none"/><span className="text-xl font-bold text-cyan-200">%</span></div>
              <p className="text-xs text-text-tertiary">{field.detail}</p>
            </div>)}
        </div>
        <div className={cp.section}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-semibold text-text-primary"><BadgePercent className="h-4 w-4 text-cyan-300"/>Simulador de distribución</div><div className="flex items-center gap-2"><Label htmlFor="impulsa-fare" className="text-xs text-text-secondary">Precio CUP</Label><Input id="impulsa-fare" type="number" min="0" value={fare} onChange={e=>setFare(e.target.value)} className="h-9 w-28"/></div></div>
          <div className="mt-3 divide-y divide-white/10 text-xs sm:text-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-1 py-2 font-semibold text-text-tertiary"><span>Servicio</span><span className="text-right">Conductor</span><span className="text-right">Comercial</span><span className="text-right">TukTuk</span></div>
            {[["Normal",100-g,0,g],["Propio",100-o,0,o],["Flota",100-g,c,g-c]].map(row=><div key={String(row[0])} className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-1 py-2 text-text-primary"><span>{row[0]}</span>{row.slice(1).map((v,i)=><span key={i} className={"text-right tabular-nums "+(i===1?"text-emerald-300":"")}>{cup(total*Number(v)/100)}</span>)}</div>)}
          </div>
          {!valid && <p role="alert" className="mt-2 text-xs text-rose-300">El porcentaje propio y comercial no pueden superar la comisión general. El porcentaje general y propio deben ser positivos.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/20 bg-surface-2 p-3">
          <div className="flex min-w-0 gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300"/><div className="space-y-1 text-xs text-text-secondary"><p className="font-semibold text-text-primary">Comisión general vigente: {pct(query.data?.live_general_rate ?? 0)} % · {query.data?.billing_enabled ? "Cobro activo" : "Cobro desactivado"}</p><p>Solo carreras nuevas, reales y liquidadas. Los viajes propios no generan un segundo crédito. Ganancias de la flota en CUP reales; si el cobro no tiene fondos reales suficientes, quedan pendientes de financiación.</p><p>Las reservas y beneficios de bienvenida existentes se conservan.</p></div></div>
          {canEdit && <div className="flex flex-wrap justify-end gap-2"><Button size="sm" disabled={!valid || !changed || save.isPending} onClick={()=>{if(query.data?.enabled && !window.confirm("Guardar los porcentajes activos para nuevas carreras?"))return;setMessage("");save.mutate(!!query.data?.enabled);}}>Guardar porcentajes</Button><Button size="sm" variant="outline" disabled={!valid || save.isPending || (!query.data?.enabled && !query.data?.billing_enabled)} onClick={()=>{const next=!query.data?.enabled;if(!window.confirm(next?"Activar Impulsa y aplicar la comisión general propuesta a las nuevas carreras? No cambia el interruptor de cobro.":"Desactivar Impulsa para futuras publicaciones? Las carreras y ganancias anteriores se conservan."))return;setMessage("");save.mutate(next);}}>{query.data?.enabled?"Desactivar Impulsa":"Activar Impulsa"}</Button></div>}
          {message && <p role="status" className="w-full text-xs text-cyan-200">{message}</p>}
        </div>
      </>}
    </div>
  </section>;
}
