import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Link as LinkIcon, RefreshCw, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type Report = {
  name: string; slug: string; rate: number; status: "active" | "paused";
  visits: number; quotes: number; requests: number; attributed: number;
  completed: number; earned: number; paid: number; pending: number;
  trend: { day: string; visits: number; requests: number }[];
};
const money = (n: number) => Number(n || 0).toLocaleString("es-CU", { maximumFractionDigits: 2 }) + " CUP";
export const Route = createFileRoute("/aliados")({
  head: () => ({ meta: [
    { title: "Mis resultados · TukTuk Aliados" },
    { name: "robots", content: "noindex,nofollow,noarchive" },
    { name: "referrer", content: "no-referrer" },
  ] }),
  component: AllyDashboard,
});

function AllyDashboard() {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.hash.slice(1)).get("k");
    setKey(raw && /^[0-9a-f]{64}$/.test(raw) ? raw : "");
    // URL fragments do not reach the server; keeping this one supports refresh.
  }, []);
  const report = useQuery({
    queryKey: ["ally-private-report-v1", key],
    enabled: Boolean(key),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("get_marketplace_ally_report_v1", { target_key: key });
      if (error) throw error;
      if (!data || typeof data !== "object") throw Error("El enlace ha expirado o fue reemplazado.");
      return data as Report;
    },
    retry: false,
    staleTime: 60000,
  });
  const d = report.data;
  return <main className="min-h-screen bg-[#07131a] px-4 py-8 text-slate-100 sm:px-6">
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center justify-between rounded-2xl border border-orange-400/20 bg-white/5 p-4">
        <div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-orange-300">Agencia TukTuk</p>
          <h1 className="mt-1 text-2xl font-extrabold">Aliados · Mis resultados</h1>
          <p className="text-xs text-slate-400">Panel individual y privado</p></div>
        <ShieldCheck className="size-8 text-emerald-300" aria-hidden="true"/>
      </header>
      {key === null ? <p className="text-sm text-slate-400">Abriendo panel…</p> :
        !key ? <div role="alert" className="rounded-xl border border-orange-400/30 bg-white/5 p-5">
          <h2 className="font-semibold">Falta tu enlace de acceso</h2>
          <p className="mt-2 text-sm text-slate-300">Abre el enlace privado completo que te entregó la Agencia TukTuk. No requiere cuenta ni Google.</p>
        </div> :
        report.isLoading ? <p className="text-sm text-slate-400">Consultando resultados…</p> :
        report.isError || !d ? <div role="alert" className="rounded-xl border border-red-400/30 bg-white/5 p-5">
          <h2 className="font-semibold">Acceso no disponible</h2>
          <p className="mt-2 text-sm text-slate-300">El enlace ha expirado o fue reemplazado. Solicita uno nuevo a TukTuk.</p>
        </div> : <>
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div><h2 className="text-xl font-semibold">{d.name}</h2>
          <p className="text-xs text-slate-400">Tu comisión: {(Number(d.rate)*100).toLocaleString("es-CU")}% · {d.status==="active"?"Enlace activo":"Difusión pausada"}</p></div>
          <Button variant="outline" size="sm" onClick={()=>void report.refetch()}><RefreshCw className="mr-1 size-4"/>Actualizar</Button>
        </section>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Indicadores de captación">
          {[
            ["Aperturas",d.visits],["Cotizaciones",d.quotes],["Solicitudes",d.requests],
            ["Carreras atribuidas",d.attributed],["Carreras completadas",d.completed],
            ["Comisión calculada",money(d.earned)],
          ].map(([label,v])=><div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-xl font-bold tabular-nums">{v}</p></div>)}
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="font-semibold">Estado económico</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#123028] p-3"><p className="text-xs text-slate-300">Pagos registrados</p>
              <p className="mt-1 text-lg font-bold text-emerald-300">{money(d.paid)}</p></div>
            <div className="rounded-xl bg-[#302511] p-3"><p className="text-xs text-slate-300">Pendiente calculado</p>
              <p className="mt-1 text-lg font-bold text-orange-300">{money(d.pending)}</p></div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">Las ganancias corresponden a carreras reales liquidadas, no a clics ni solicitudes. La Agencia registra los pagos realizados; estas cifras no representan una transferencia automática.</p>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-4 flex items-center gap-2"><BarChart3 className="size-5 text-orange-300"/><h3 className="font-semibold">Actividad de los últimos 30 días</h3></div>
          {d.trend.length ? <div className="space-y-2">
            {d.trend.map(t => <div key={t.day} className="grid grid-cols-[100px_1fr_auto] items-center gap-3 text-xs">
              <span className="text-slate-400">{t.day}</span>
              <div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-orange-400" style={{width:Math.max(2,Math.min(100,100*Number(t.visits)/Math.max(1,...d.trend.map(v=>Number(v.visits)))) )+"%"}}/></div>
              <span className="text-slate-200">{t.visits} visitas · {t.requests} solicitudes</span>
            </div>)}
          </div> : <p className="text-sm text-slate-400">Todavía no se han registrado visitas en este período.</p>}
        </section>
        <a href={"https://www.vrixora.com/cliente/tuk/?aliado="+encodeURIComponent(d.slug)}
          className="flex items-center justify-center gap-2 rounded-xl border border-orange-400/30 px-4 py-3 text-sm font-semibold text-orange-200"
          rel="noreferrer"><LinkIcon className="size-4"/>Ver mi enlace promocional</a>
        </>}
      <p className="text-center text-xs text-slate-500">Agencia TukTuk · Powered by Vrixora</p>
    </div>
  </main>;
}
