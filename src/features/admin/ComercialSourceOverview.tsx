import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, RefreshCw } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { commercialPremium as cp } from "@/features/admin/commercial-premium";

type Period = 7 | 30 | 90;
type Official = { totals?: { link_opens?: number; visitor_sessions?: number; app_opens?: number; quotes?: number; requests_created?: number } };
type Impulsa = { totals?: { clicks?: number; sessions?: number; app_opens?: number; quotes?: number; requests_created?: number }; organic_totals?: { app_opens?: number; quotes?: number; requests_created?: number }; drivers?: Array<{ attributed_real?: number; completed_real?: number }> };
type Ally = { id: string; clicks: number; attributed: number; completed: number };
const count = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0,Number(value)).toLocaleString("es-CU") : "—";

export default function ComercialSourceOverview({ projectId }: { projectId: string }) {
  const [days, setDays] = useState<Period>(30);
  const official = useQuery({
    queryKey: ["commercial-overview-official", projectId, days],
    queryFn: async () => {
      const { data,error } = await getSupabaseClient().rpc("admin_get_marketplace_tuktuk_communications_v1", { target_project_id: projectId, target_days: days });
      if (error) throw error;
      return data as Official;
    },
    enabled: Boolean(projectId),
  });
  const impulsa = useQuery({
    queryKey: ["commercial-overview-impulsa", projectId, days],
    queryFn: async () => {
      const { data,error } = await getSupabaseClient().rpc("admin_get_marketplace_impulsa_communications_v1", { target_project_id: projectId, target_days: days });
      if (error) throw error;
      return data as Impulsa;
    },
    enabled: Boolean(projectId),
  });
  const allies = useQuery({
    queryKey: ["commercial-overview-allies", projectId],
    queryFn: async () => {
      const { data,error } = await getSupabaseClient().rpc("admin_list_marketplace_allies_v1", { target_project_id: projectId });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Ally[];
    },
    enabled: Boolean(projectId),
  });
  const allySummary = (allies.data ?? []).reduce((acc, row) => ({
    clicks: acc.clicks + Number(row.clicks ?? 0),
    attributed: acc.attributed + Number(row.attributed ?? 0),
    completed: acc.completed + Number(row.completed ?? 0),
  }), { clicks:0, attributed:0, completed:0 });
  const driverSummary = (impulsa.data?.drivers ?? []).reduce((acc, row) => ({
    attributed: acc.attributed + Number(row.attributed_real ?? 0),
    completed: acc.completed + Number(row.completed_real ?? 0),
  }), { attributed:0, completed:0 });
  const cards = [
    { name:"TukTuk oficial", period:`Últimos ${days} días`, clicks:official.data?.totals?.link_opens,
      sessions:official.data?.totals?.visitor_sessions, appOpens:official.data?.totals?.app_opens,
      quotes:official.data?.totals?.quotes, requests:official.data?.totals?.requests_created,
      attributed:undefined, completed:undefined, error:official.isError, loading:official.isLoading },
    { name:"Impulsa · Conductores", period:`Últimos ${days} días`, clicks:impulsa.data?.totals?.clicks,
      sessions:impulsa.data?.totals?.sessions, appOpens:impulsa.data?.totals?.app_opens,
      quotes:impulsa.data?.totals?.quotes, requests:impulsa.data?.totals?.requests_created,
      attributed:driverSummary.attributed, completed:driverSummary.completed, error:impulsa.isError, loading:impulsa.isLoading },
    { name:"Aliados · Externos", period:"Histórico completo", clicks:allySummary.clicks,
      sessions:undefined, appOpens:undefined, quotes:undefined, requests:undefined,
      attributed:allySummary.attributed, completed:allySummary.completed,
      error:allies.isError, loading:allies.isLoading },
    { name:"Orgánico · Sin atribución", period:`Últimos ${days} días`,
      clicks:undefined, sessions:undefined, appOpens:impulsa.data?.organic_totals?.app_opens,
      quotes:impulsa.data?.organic_totals?.quotes, requests:impulsa.data?.organic_totals?.requests_created,
      attributed:undefined, completed:undefined, error:impulsa.isError, loading:impulsa.isLoading },
  ];
  return <section data-admin-module="comercial" aria-label="Vista por fuentes de captación" className="space-y-3">
    <div className={cp.section + " flex flex-wrap items-center justify-between gap-3"}>
      <div className="flex items-center gap-2">
        <BarChart3 className="size-5 text-violet-300" aria-hidden="true"/>
        <div>
          <h3 className="text-base font-semibold">Fuentes de captación</h3>
          <p className="text-xs text-muted-foreground">Comparación transparente, sin sumar visitantes o pasajeros entre fuentes.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {([7,30,90] as const).map(value => <Button key={value} type="button" size="sm"
          variant={days===value ? "default" : "outline"} aria-pressed={days===value} onClick={()=>setDays(value)}>
          {value} días
        </Button>)}
        <Button type="button" size="sm" variant="outline" aria-label="Actualizar fuentes"
          onClick={()=>{void official.refetch();void impulsa.refetch();void allies.refetch();}}>
          <RefreshCw className="size-4"/>
        </Button>
      </div>
    </div>
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => <article key={card.name} className={cp.section}>
        <h4 className="font-semibold text-foreground">{card.name}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{card.period}</p>
        {card.error ? <p role="alert" className="mt-3 text-xs text-amber-300">No se pudo consultar esta fuente. No se muestran ceros artificiales.</p>
        : card.loading ? <p className="mt-3 text-xs text-muted-foreground">Consultando resultados…</p>
        : <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div><dt className="text-muted-foreground">Aperturas de enlaces</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{count(card.clicks)}</dd></div>
          <div><dt className="text-muted-foreground">Sesiones identificadas</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{card.sessions === undefined ? "—" : count(card.sessions)}</dd></div>
          <div><dt className="text-muted-foreground">Aperturas de app</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{count(card.appOpens)}</dd></div>
          <div><dt className="text-muted-foreground">Cotizaciones</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{count(card.quotes)}</dd></div>
          <div><dt className="text-muted-foreground">Solicitudes en app</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{card.requests === undefined ? "—" : count(card.requests)}</dd></div>
          <div><dt className="text-muted-foreground">Viajes atribuidos</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{card.attributed === undefined ? "—" : count(card.attributed)}</dd></div>
          <div><dt className="text-muted-foreground">Viajes completados</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{card.completed === undefined ? "—" : count(card.completed)}</dd></div>
        </dl>}
      </article>)}
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">Las aperturas no equivalen a personas únicas; un mismo pasajero puede visitar varios enlaces. «Orgánico · Sin atribución» proviene de la lectura ya existente en Impulsa y no se suma a los enlaces identificados. Las cifras de Aliados son históricas y no se comparan como si fueran del período seleccionado. Para medir TukTuk oficial, comparte un enlace etiquetado creado en Campañas: la URL genérica no demuestra el origen publicitario. «—» significa dato no disponible, no cero. No se muestra un total único de clientes o carreras hasta poder deduplicar por identificador y fuente de atribución.</p>
  </section>;
}
