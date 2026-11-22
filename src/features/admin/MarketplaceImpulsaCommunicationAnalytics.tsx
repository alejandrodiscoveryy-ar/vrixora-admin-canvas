import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronDown, ExternalLink, MousePointerClick, RefreshCw, Share2, Users, TrendingUp, AlertCircle, MessageCircle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend } from "recharts";
import { getSupabaseClient } from "@/lib/supabase";
import { supabaseServices, type MarketplaceCursor } from "@/lib/services";
import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { adminChartTooltipProps } from "@/lib/chart-theme";

type PeriodDays = 7 | 30 | 90;
type Numbers = {
  shares: number; copies: number; clicks: number; sessions: number; app_opens: number;
  origins: number; destinations: number; quotes: number; requests_started: number;
  requests_created: number; surveyed: number;
};
type Promoter = {driver_user_id: string; name: string; active: boolean;
  shares: number; copies: number; downloads: number; clicks: number; sessions: number;
  quotes: number; requests: number; attributed_real: number; completed_real: number};
type Channel = {channel: string; campaign: string | null; shares: number; clicks: number; sessions: number; quotes: number; requests: number};
type Trend = {day: string; shares: number; clicks: number; quotes: number; requests: number};
type Reason = {reason: string; total: number};
type PriceBand = {price_band: string; quoted_sessions: number; sessions_with_request: number};
type Organic = {app_opens:number;quotes:number;requests_created:number};
type Report = {days: PeriodDays; measured_since: string | null; totals: Numbers; organic_totals: Organic;
  drivers: Promoter[]; channels: Channel[]; trend: Trend[]; reasons: Reason[]; price_segments: PriceBand[]};

const channelLabels: Record<string,string> = {
  unknown: "Sin identificar", direct: "Enlace directo",
  whatsapp_private: "WhatsApp privado", whatsapp_groups: "Grupos de WhatsApp",
  whatsapp_status: "Estados de WhatsApp", facebook: "Facebook",
  instagram: "Instagram", qr: "Código QR", other: "Otros",
};
const reasonLabels: Record<string,string> = {
  price:"Precio alto", comparing:"Solo consultaba", no_driver:"No encontró transporte",
  difficult:"Dificultad al solicitar", later:"Lo solicitará después", other:"Otro motivo",
};
const bandLabels: Record<string,string> = {
  under_500:"Menos de 500 CUP", "500_1500":"500–1499 CUP",
  "1500_3000":"1500–2999 CUP", "3000_5000":"3000–4999 CUP",
  over_5000:"5000 CUP o más",
};
const zero: Numbers = {shares:0,copies:0,clicks:0,sessions:0,app_opens:0,origins:0,destinations:0,
  quotes:0,requests_started:0,requests_created:0,surveyed:0};
const number = (value: unknown) => Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : 0;
const fmt = (value: number) => value.toLocaleString("es-CU");
const pct = (numerator: number, denominator: number) => denominator>0 ? `${(100*numerator/denominator).toFixed(1)}%` : "—";
const dateLabel = (s: string) => {
  const parts=s.split("-");
  return parts.length===3 ? `${parts[2]}/${parts[1]}` : s;
};

async function fetchReport(projectId: string, days: PeriodDays): Promise<Report> {
  const {data,error} = await getSupabaseClient().rpc("admin_get_marketplace_impulsa_communications_v1",{
    target_project_id:projectId,target_days:days,
  });
  if(error) throw new Error(error.message);
  if(!data || typeof data!=="object") throw Error("INVALID_COMMUNICATION_REPORT");
  const d=data as Record<string,unknown>;
  const o=d.totals && typeof d.totals==="object" ? d.totals as Record<string,unknown> : {};
  return {
    days,measured_since:typeof d.measured_since==="string"?d.measured_since:null,
    totals:Object.fromEntries(Object.keys(zero).map(k=>[k,number(o[k])])) as unknown as Numbers,
    organic_totals:(() => {
      const raw=d.organic_totals && typeof d.organic_totals==="object" ? d.organic_totals as Record<string,unknown> : {};
      return {app_opens:number(raw.app_opens),quotes:number(raw.quotes),requests_created:number(raw.requests_created)};
    })(),
    drivers:(Array.isArray(d.drivers)?d.drivers:[]) as Promoter[],
    channels:(Array.isArray(d.channels)?d.channels:[]) as Channel[],
    trend:(Array.isArray(d.trend)?d.trend:[]) as Trend[],
    reasons:(Array.isArray(d.reasons)?d.reasons:[]) as Reason[],
    price_segments:(Array.isArray(d.price_segments)?d.price_segments:[]) as PriceBand[],
  };
}


// Los teléfonos son los ya registrados en el directorio operativo; no se escriben ni se duplican.
// Solo crear enlaces verificables: Cuba (+53, móvil de 8 dígitos) o E.164 explícito.
export function normalizeImpulsaDriverWhatsApp(phone: string | null): string | null {
  const raw = phone?.trim() ?? "";
  if (!raw || !/^[+0-9() .-]+$/.test(raw) || (raw.includes("+") && !raw.startsWith("+"))) return null;
  const digits = raw.replace(/\D/g, "");
  if (/^5\d{7}$/.test(digits)) return "53" + digits;
  if (/^535\d{7}$/.test(digits)) return digits;
  if (raw.startsWith("+") && /^[1-9]\d{7,14}$/.test(digits)) return digits;
  return null;
}

async function fetchImpulsaDriverContacts(projectId: string, promoterIds: string[]): Promise<Record<string, string>> {
  const pending = new Set(promoterIds);
  const contacts: Record<string, string> = {};
  const cursors = new Set<string>();
  let cursor: MarketplaceCursor | undefined;
  // Consulta la RPC existente del directorio (requiere marketplace.view).
  // No expone teléfonos mediante las estadísticas de commercial.view.
  for (let page = 0; page < 50 && pending.size > 0; page++) {
    const result = await supabaseServices.marketplace.listDrivers(projectId, { limit: 200, cursor });
    for (const driver of result.items) {
      if (!pending.has(driver.userId)) continue;
      pending.delete(driver.userId);
      const normalized = normalizeImpulsaDriverWhatsApp(driver.phone);
      if (normalized) contacts[driver.userId] = normalized;
    }
    if (!result.nextCursor) return contacts;
    const key = result.nextCursor.at + "/" + result.nextCursor.id;
    if (cursors.has(key)) throw new Error("IMPULSA_CONTACT_PAGINATION_INVALID");
    cursors.add(key);
    cursor = result.nextCursor;
  }
  return contacts;
}

function MiniMetric({label,value,icon:Icon,detail}: {label:string;value:number;icon:typeof Share2;detail?:string}) {
  return <div className={cp.metric}>
    <div className="flex items-center justify-between gap-2 text-muted-foreground">
      <span className="text-[11px] font-semibold">{label}</span><Icon className="h-4 w-4 shrink-0"/>
    </div>
    <p className="mt-1 text-xl font-semibold tabular-nums">{fmt(value)}</p>
    {detail && <p className="mt-1 text-xs leading-snug text-text-secondary">{detail}</p>}
  </div>;
}

export default function MarketplaceImpulsaCommunicationAnalytics({projectId,canManage=false}: {projectId:string;canManage?:boolean}) {
  const [days,setDays]=useState<PeriodDays>(30);
  // Las fichas comienzan plegadas y se pueden abrir independientemente.
  const [expanded,setExpanded]=useState<Set<string>>(() => new Set());
  const query=useQuery({queryKey:["impulsa-communication-analytics",projectId,days],
    queryFn:()=>fetchReport(projectId,days),enabled:Boolean(projectId),
    staleTime:60_000,refetchInterval:120_000,refetchIntervalInBackground:false,retry:1,
  });
  const d=query.data,t=d?.totals??zero;
  const promoterIds=(d?.drivers??[]).map(driver=>driver.driver_user_id);
  const contacts=useQuery({
    queryKey:["impulsa-driver-contacts",projectId,promoterIds.join("|")],
    queryFn:()=>fetchImpulsaDriverContacts(projectId,promoterIds),
    enabled:canManage && query.isSuccess && promoterIds.length>0,
    staleTime:60_000,refetchInterval:120_000,refetchIntervalInBackground:false,retry:1,
  });
  const timeline=useMemo(()=>d?.trend.map(x=>({date:dateLabel(x.day),clics:number(x.clicks),
    cotizaciones:number(x.quotes),solicitudes:number(x.requests),difusiones:number(x.shares)}))??[],[d?.trend]);
  const stages=[{title:"Enlace abierto",value:t.clicks},
    {title:"App cargada",value:t.app_opens},
    {title:"Recogida seleccionada",value:t.origins},
    {title:"Destino seleccionado",value:t.destinations},
    {title:"Cotización calculada",value:t.quotes},
    {title:"Solicitud iniciada",value:t.requests_started},
    {title:"Solicitud creada",value:t.requests_created}];
  return <section aria-label="Impulsa Analytics — Comunicación y conversión"
    className={cp.section}>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
        <BarChart3 className="h-5 w-5"/>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">Resultados de Impulsa</h3>
        <p className="text-xs text-muted-foreground">Comunicación, llegada de clientes y puntos de abandono</p>
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Periodo de análisis">
        {([7,30,90] as const).map(period=><button type="button" key={period}
          aria-pressed={period===days} onClick={()=>{setDays(period);setExpanded(new Set());}}
          className={`min-h-11 rounded-[var(--radius-control)] border px-3 py-2 text-xs font-semibold ${period===days?"border-border-strong bg-surface-3 text-text-primary":"border-border-subtle text-text-secondary hover:bg-surface-2"}`}>
          {period}d</button>)}
      </div>
      <button type="button" aria-label="Actualizar analítica" title="Actualizar"
        disabled={query.isFetching} onClick={()=>void query.refetch()}
        className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-border-default text-text-secondary disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${query.isFetching?"animate-spin":""}`}/></button>
    </div>

    {query.isPending ? <p className="p-5 text-sm text-muted-foreground">Consultando Impulsa Analytics…</p> :
     query.isError ? <p role="alert" className="flex items-center gap-2 rounded-lg border border-amber-400/30 p-3 text-sm text-amber-600">
       <AlertCircle className="h-4 w-4"/> No se pudieron cargar las métricas de comunicación. Comprueba los permisos.
       <button type="button" className="underline" onClick={()=>void query.refetch()}>Reintentar</button></p> :
     <>
       <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
         <MiniMetric label="Intentos de compartir" value={t.shares} icon={Share2} detail="Abrió Compartir; no confirma envío"/>
         <MiniMetric label="Clics en enlaces" value={t.clicks} icon={MousePointerClick} detail="Aperturas registradas en Cliente"/>
         <MiniMetric label="Sesiones desde Impulsa" value={t.sessions} icon={Users} detail="Pestañas distintas; no personas únicas"/>
         <MiniMetric label="Solicitudes creadas" value={t.requests_created} icon={TrendingUp} detail="Evento de cliente, no carrera completada"/>
       </div>

       <details className={cp.inset + " group"}>
         <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-text-primary [&::-webkit-details-marker]:hidden">
           Análisis detallado de campañas
           <span className="text-xs font-normal text-text-secondary">Evolución, abandonos y cotizaciones</span>
         </summary>
         <div className="space-y-3 border-t border-border-subtle p-3">
       <div className="grid gap-3 lg:grid-cols-2">
         <div className={cp.inset}>
           <h4 className="text-sm font-semibold">Evolución de la campaña</h4>
           {timeline.length ? <div className="mt-2 h-44 w-full">
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={timeline} margin={{left:-26,right:8,top:7,bottom:0}}>
                 <CartesianGrid vertical={false} strokeOpacity={0.13}/>
                 <XAxis dataKey="date" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:10}}/>
                 <Tooltip {...adminChartTooltipProps}/><Legend wrapperStyle={{fontSize:10}}/>
                 <Line dataKey="clics" name="Clics" stroke="#22a6bd" strokeWidth={2} dot={false}/>
                 <Line dataKey="cotizaciones" name="Cotizaciones" stroke="#efa94d" strokeWidth={2} dot={false}/>
                 <Line dataKey="solicitudes" name="Solicitudes" stroke="#35b98f" strokeWidth={2} dot={false}/>
               </LineChart>
             </ResponsiveContainer>
           </div> : <p className="py-7 text-xs text-muted-foreground">Aún no hay datos de tráfico registrados.</p>}
         </div>
         <div className={cp.inset}>
           <h4 className="text-sm font-semibold">Recorrido del cliente</h4>
           <div className="mt-3 space-y-2">
             {stages.map((s,i)=>{
               const width=t.clicks>0?Math.max(2,Math.min(100,100*s.value/t.clicks)):0;
               return <div key={s.title}>
                 <div className="flex justify-between gap-2 text-[11px]"><span>{s.title}</span>
                   <strong className="tabular-nums">{fmt(s.value)}</strong></div>
                 <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted/40">
                   <div className="h-full rounded-full" style={{width:`${width}%`,background:i<2?"#22a6bd":i<5?"#efa94d":"#35b98f"}}/>
                 </div>
               </div>;
             })}
           </div>
           <p className="mt-2 text-[10px] text-muted-foreground">Los eventos representan etapas registradas, no necesariamente la misma audiencia. El gráfico no certifica conversión hasta reconciliar las sesiones.</p>
           <div className="mt-2 rounded-md border border-border/40 bg-muted/10 p-2 text-[10px] text-muted-foreground">
             Sin enlace Impulsa: <strong>{fmt(d!.organic_totals.app_opens)}</strong> entradas,
             {" "}<strong>{fmt(d!.organic_totals.quotes)}</strong> cotizaciones y
             {" "}<strong>{fmt(d!.organic_totals.requests_created)}</strong> solicitudes.
             Se muestran aparte para no atribuirlas a los conductores.
           </div>
         </div>
       </div>

       <div className="grid gap-3 lg:grid-cols-2">
         <div className={cp.inset}>
           <h4 className="mb-2 text-sm font-semibold">Origen declarado del enlace</h4>
           {d!.channels.length ? <div className="space-y-2 text-xs">
             {d!.channels.map(x=><div key={`${x.channel}:${x.campaign??""}`} className="flex items-center justify-between gap-3 border-b border-border/30 pb-1">
               <span className="min-w-0 truncate">{channelLabels[x.channel]??x.channel}{x.campaign ? ` · ${x.campaign}` : ""}</span>
               <span className="shrink-0 text-right tabular-nums"><strong>{fmt(number(x.clicks))}</strong> clics
                 <span className="ml-2 text-muted-foreground">{fmt(number(x.shares))} dif.</span></span>
             </div>)}
           </div> : <p className="py-4 text-xs text-muted-foreground">Sin canales medidos todavía.</p>}
           <p className="mt-2 text-[10px] text-muted-foreground">El canal identifica cómo se etiquetó el enlace, no el grupo o destinatario final. Los reenvíos pueden cambiarlo.</p>
         </div>
         <div className={cp.inset}>
           <h4 className="mb-2 text-sm font-semibold">Motivos de abandono (respuesta voluntaria)</h4>
           {d!.reasons.length ? <div className="h-40">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={d!.reasons.map(x=>({reason:reasonLabels[x.reason]??x.reason,total:number(x.total)}))}
                 layout="vertical" margin={{top:0,right:12,bottom:0,left:4}}>
                 <XAxis type="number" allowDecimals={false} tick={{fontSize:10}}/>
                 <YAxis type="category" dataKey="reason" width={104} tick={{fontSize:10}}/>
                 <Tooltip {...adminChartTooltipProps}/>
                 <Bar dataKey="total" fill="#efa94d" radius={[0,4,4,0]}/>
               </BarChart>
             </ResponsiveContainer>
           </div> : <p className="py-4 text-xs text-muted-foreground">Sin respuestas registradas. No debemos asumir que todos abandonan por precio.</p>}
         </div>
       </div>

       <div className={cp.inset}>
         <h4 className="text-sm font-semibold">Comportamiento por importe de la cotización</h4>
         <p className="mt-1 text-[10px] text-muted-foreground">Precios aproximados mostrados por Cliente; estos datos no prueban causalidad. No se ajustan tarifas desde aquí.</p>
         {d!.price_segments.length ? <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
           {d!.price_segments.map(b=><div key={b.price_band} className="flex flex-wrap items-center justify-between gap-1 rounded-md bg-muted/20 px-2.5 py-2 text-xs">
             <span>{bandLabels[b.price_band]??b.price_band}</span>
             <strong className="tabular-nums">{fmt(number(b.quoted_sessions))} presup. · {fmt(number(b.sessions_with_request))} solicitudes</strong>
           </div>)}
         </div> : <p className="py-3 text-xs text-muted-foreground">Aún no hay precios registrados para comparar.</p>}
       </div>

         </div>
       </details>

       <section aria-label="Conductores de Impulsa" className="min-w-0 space-y-2.5">
         <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default/60 pb-2">
           <div className="min-w-0">
             <h4 className="text-sm font-semibold text-text-primary">Aportación de cada conductor</h4>
             <p className="mt-1 text-[11px] text-muted-foreground">
               Cada ficha se abre por separado para consultar la captación y los viajes atribuidos.
             </p>
           </div>
           <span className="rounded-full border border-border-subtle bg-surface-2 px-2.5 py-1 text-[11px] font-medium tabular-nums text-text-secondary">
             {fmt(d!.drivers.length)} conductores
           </span>
         </div>
         {d!.drivers.length ? d!.drivers.map(x=>{
           const open=expanded.has(x.driver_user_id);
           const phone=canManage ? contacts.data?.[x.driver_user_id] : undefined;
           const initials=x.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]??"").join("").toUpperCase()||"C";
           return <article key={x.driver_user_id} data-impulsa-expanded={open?"true":"false"}
             className={cp.inset + " group relative min-w-0 overflow-hidden p-0 shadow-sm transition-colors hover:border-cyan-400/35 sm:p-0"}>
             <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-cyan-500/60" />
             <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
             <button type="button" aria-expanded={open}
               aria-label={`${open?"Plegar":"Desplegar"} detalles de Impulsa de ${x.name}`}
               aria-controls={`impulsa-marketing-driver-${x.driver_user_id}`}
               onClick={() => setExpanded(current => {
                 const next=new Set(current);
                 if(next.has(x.driver_user_id))next.delete(x.driver_user_id);
                 else next.add(x.driver_user_id);
                 return next;
               })}
               className="flex min-h-16 min-w-0 flex-1 flex-wrap items-center gap-3 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/60 hover:bg-surface-2/60 sm:flex-nowrap">
               <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-sm font-bold text-cyan-200">
                 {initials}
               </span>
               <span className="min-w-0 flex-1">
                 <span className="block truncate text-sm font-semibold text-text-primary" title={x.name}>{x.name}</span>
                 <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-secondary">
                   <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${x.active?"border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300":"border-amber-400/25 bg-amber-400/[0.08] text-amber-300"}`}>
                     {x.active?"Activo":"Inactivo"}
                   </span>
                   <span>{fmt(number(x.clicks))} clics</span>
                   <span aria-hidden="true">·</span>
                   <span>{fmt(number(x.attributed_real))} viajes atribuidos</span>
                   <span aria-hidden="true">·</span>
                   <span>{fmt(number(x.completed_real))} completados</span>
                 </span>
               </span>
               <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-500/[0.05] px-3 text-xs font-semibold text-cyan-200">
                 {open?"Plegar":"Detalles"}
                 <ChevronDown aria-hidden="true" className={`size-4 transition-transform motion-reduce:transition-none ${open?"rotate-180":""}`}/>
               </span>
             </button>
             {canManage && phone && (
               <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"
                 aria-label={`Abrir WhatsApp de ${x.name}`}
                 title={`Contactar por WhatsApp con ${x.name}`}
                 className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/[0.06] px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 sm:min-h-9">
                 <MessageCircle aria-hidden="true" className="size-4" />WhatsApp
               </a>
             )}
             </div>
             <div id={`impulsa-marketing-driver-${x.driver_user_id}`} hidden={!open} className="border-t border-border-subtle bg-surface-2/35 px-4 pb-4 pt-3 sm:px-5">
               {open && <>
                 <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Captación y actividad del enlace</p>
                 <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                   {[
                     ["Intentos de compartir",x.shares],["Enlace copiado",x.copies],["Descargas",x.downloads],
                     ["Clics",x.clicks],["Sesiones",x.sessions],["Cotizaciones",x.quotes],
                     ["Solicitudes en Cliente",x.requests],["Viajes atribuidos",x.attributed_real],
                     ["Completados",x.completed_real],
                   ].map(([label,value])=><div key={String(label)}
                     className="min-w-0 rounded-xl border border-border-subtle bg-surface-2/80 px-3 py-2.5">
                     <p className="text-[11px] leading-snug text-text-secondary">{label}</p>
                     <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{fmt(number(value))}</p>
                   </div>)}
                   <div className="col-span-2 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.045] px-3 py-2.5 sm:col-span-3 xl:col-span-1">
                     <p className="text-[11px] leading-snug text-text-secondary">Solicitudes / clics registrados</p>
                     <p className="mt-1 text-lg font-semibold tabular-nums text-cyan-300">{pct(number(x.requests),number(x.clicks))}</p>
                   </div>
                 </div>
                 <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
                   El seguimiento refleja acciones registradas, no identifica personas únicas ni confirma ganancias.
                 </p>
               </>}
             </div>
           </article>;
         }) : (
           <p className={cp.inset + " px-3 py-5 text-xs text-muted-foreground"}>
             Todavía no hay conductores con perfil Impulsa para analizar.
           </p>
         )}
       </section>
       <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
         <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
         Las cifras de difusión son acciones de la WebApp, no confirmaciones de envío en WhatsApp o Facebook. Las sesiones son pestañas, no personas identificadas. Los viajes reales se toman de la base operativa y nunca se mezclan con pruebas.
         {d!.measured_since ? ` Medición disponible desde ${new Date(d!.measured_since).toLocaleDateString("es-CU",{timeZone:"America/Havana"})}.` : " La medición empieza con la activación del sistema."}
       </p>
     </>}
  </section>;
}
