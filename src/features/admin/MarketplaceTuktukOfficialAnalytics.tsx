import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Copy, Link2, MessageCircle, MousePointerClick, RefreshCw, Share2, Users } from "lucide-react";
import { ResponsiveContainer, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { getSupabaseClient } from "@/lib/supabase";
import { adminChartTooltipProps } from "@/lib/chart-theme";

type PeriodDays = 7 | 30 | 90;
type Channel = "direct" | "whatsapp_private" | "whatsapp_groups" | "whatsapp_status" | "facebook" | "instagram" | "qr" | "other";
type Totals = {
  share_attempts:number; copies:number; link_opens:number; visitor_sessions:number;
  app_opens:number; origins:number; destinations:number; quotes:number;
  requests_started:number; requests_created:number; survey_answers:number;
};
type CampaignRow = {campaign:string;link_opens:number;quotes:number;requests_created:number;share_attempts:number};
type ChannelRow = {channel:string;link_opens:number;quotes:number;requests_created:number};
type Trend = {day:string;link_opens:number;quotes:number;requests_created:number};
type Reason = {reason:string;total:number};
type Band = {price_band:string;quoted_sessions:number;sessions_with_request:number};
type Report = {days:PeriodDays;measured_since:string|null;totals:Totals;
  channels:ChannelRow[];campaigns:CampaignRow[];trend:Trend[];reasons:Reason[];price_segments:Band[]};

const BASE = "https://www.vrixora.com/cliente/tuk/";
const sources: Record<string,string> = {
  direct:"Enlace directo",whatsapp_private:"WhatsApp privado",
  whatsapp_groups:"Grupos WhatsApp",whatsapp_status:"Estados WhatsApp",
  facebook:"Facebook",instagram:"Instagram",qr:"QR / impresos",other:"Otros",
  unknown:"Sin identificar",
};
const reasons: Record<string,string> = {
  price:"Precio alto",comparing:"Solo consultaba",no_driver:"Sin transporte",
  difficult:"Dificultad al solicitar",later:"Lo solicitará después",other:"Otro motivo",
};
const priceBands:Record<string,string> = {
  under_500:"Menos de 500 CUP","500_1500":"500–1499 CUP","1500_3000":"1500–2999 CUP",
  "3000_5000":"3000–4999 CUP",over_5000:"5000 CUP o más",
};
const availableChannels: Channel[] = [
  "direct","whatsapp_private","whatsapp_groups","whatsapp_status","facebook","instagram","qr","other"
];
const zero:Totals = {
  share_attempts:0,copies:0,link_opens:0,visitor_sessions:0,app_opens:0,
  origins:0,destinations:0,quotes:0,requests_started:0,requests_created:0,survey_answers:0,
};
const num=(v:unknown)=>Number.isFinite(Number(v)) && Number(v)>=0 ? Number(v) : 0;
const fmt=(v:unknown)=>num(v).toLocaleString("es-CU");
function taggedLink(channel: Channel, campaign:string):string {
  const url=new URL(BASE);
  url.searchParams.set("utm_source",channel);
  url.searchParams.set("utm_campaign",campaign);
  return url.toString();
}
async function getReport(projectId:string,days:PeriodDays):Promise<Report> {
  const {data,error}=await getSupabaseClient().rpc("admin_get_marketplace_tuktuk_communications_v1",{
    target_project_id:projectId,target_days:days,
  });
  if(error) throw new Error(error.message);
  if(!data || typeof data!=="object") throw new Error("REPORT_NOT_AVAILABLE");
  const value=data as Record<string,unknown>;
  const raw=value.totals && typeof value.totals==="object" ? value.totals as Record<string,unknown> : {};
  return {
    days,measured_since:typeof value.measured_since==="string"?value.measured_since:null,
    totals:Object.fromEntries(Object.keys(zero).map(k=>[k,num(raw[k])])) as unknown as Totals,
    channels:Array.isArray(value.channels)?value.channels as ChannelRow[]:[],
    campaigns:Array.isArray(value.campaigns)?value.campaigns as CampaignRow[]:[],
    trend:Array.isArray(value.trend)?value.trend as Trend[]:[],
    reasons:Array.isArray(value.reasons)?value.reasons as Reason[]:[],
    price_segments:Array.isArray(value.price_segments)?value.price_segments as Band[]:[],
  };
}

export default function MarketplaceTuktukOfficialAnalytics({projectId,canManage,mode="both"}:{
  projectId:string;canManage:boolean;mode?:"generator"|"analytics"|"both";
}) {
  const [days,setDays]=useState<PeriodDays>(30);
  const [channel,setChannel]=useState<Channel>("direct");
  const [action,setAction]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const campaign=action?"tuktuk_"+action:"tuktuk";
  const link=useMemo(()=>taggedLink(channel,campaign),[channel,campaign]);
  const message="Solicita tu transporte con Agencia TukTuk. Consulta las modalidades y el precio antes de confirmar:\n"+link;
  const query=useQuery({
    queryKey:["tuktuk-official-communications",projectId,days],
    queryFn:()=>getReport(projectId,days),enabled:Boolean(projectId)&&mode!=="generator",
    staleTime:60_000,refetchInterval:120_000,refetchIntervalInBackground:false,retry:1,
  });
  const d=query.data,t=d?.totals??zero;
  const timeline=useMemo(()=>(d?.trend??[]).map(v=>({
    date:v.day.slice(5),clics:num(v.link_opens),precios:num(v.quotes),solicitudes:num(v.requests_created),
  })),[d?.trend]);

  async function record(kind:"share_attempt"|"link_copied"|"message_copied", source:Channel=channel) {
    try {
      const {data,error}=await getSupabaseClient().rpc("admin_record_marketplace_tuktuk_share_action_v1",{
        target_project_id:projectId,target_action:kind,target_channel:source,target_campaign:campaign,
      });
      if(error || data!==true) throw Error("TRACKING_UNAVAILABLE");
      if(mode!=="generator")void query.refetch();
    } catch(_) {setNotice("Acción realizada, pero no se pudo registrar en las estadísticas.");}
  }
  async function copy(value:string,kind:"link_copied"|"message_copied",source:Channel=channel) {
    if(!canManage || busy) return;
    setBusy(true);setNotice("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(kind==="link_copied"?"Enlace copiado.":"Mensaje copiado.");
      await record(kind,source);
    } catch(_) {setNotice("No se pudo copiar. Comprueba el permiso del navegador.");}
    finally {setBusy(false);}
  }
  async function share() {
    if(!canManage || busy) return;
    if(!navigator.share) {await copy(message,"message_copied");return;}
    setBusy(true);setNotice("");
    try {
      // Native share must run directly from the user gesture (without
      // waiting for tracking). This records an ATTEMPT, not confirmed delivery.
      const recording=record("share_attempt");
      await navigator.share({title:"Agencia TukTuk",text:message,url:link});
      setNotice("Opción de compartir abierta; no es posible confirmar la entrega.");
      await recording;
    } catch(_) {setNotice("Compartir cancelado o no disponible; no se confirmó una entrega.");}
    finally {setBusy(false);}
  }
  const stages=[
    ["Enlace abierto",t.link_opens],["App cargada",t.app_opens],
    ["Recogida seleccionada",t.origins],["Destino seleccionado",t.destinations],
    ["Precio consultado",t.quotes],["Solicitud iniciada",t.requests_started],
    ["Solicitud señalada",t.requests_created],
  ] as const;
  const metrics: Array<{label:string;value:number;Icon:typeof Share2}> = [
    {label:"Compartidos intentados",value:t.share_attempts,Icon:Share2},
    {label:"Aperturas registradas",value:t.link_opens,Icon:MousePointerClick},
    {label:"Sesiones del enlace",value:t.visitor_sessions,Icon:Users},
    {label:"Solicitudes señaladas",value:t.requests_created,Icon:BarChart3},
  ];
  return <section aria-label="TukTuk enlace oficial y campañas"
      className="space-y-3 rounded-xl border border-orange-400/25 bg-background/50 p-3 sm:p-4">
    <header className="flex flex-wrap items-center gap-2">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-500">
        <Link2 className="h-5 w-5"/>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold">{mode==="analytics"?"TukTuk · Resultados":"TukTuk · Enlace oficial"}</h3>
        <p className="text-xs text-muted-foreground">Campaña propia, separada de Impulsa y de los conductores</p>
      </div>
      {mode!=="generator"&&<div role="group" aria-label="Periodo de TukTuk" className="flex gap-1">
        {([7,30,90] as const).map(period=><button type="button" key={period} aria-pressed={days===period}
          onClick={()=>setDays(period)}
          className={"rounded-md border px-2 py-1.5 text-xs font-semibold "+(days===period?"border-orange-400/35 bg-orange-500/15":"border-border/60 text-muted-foreground")}>
          {period}d
        </button>)}
      </div>}
      {mode!=="generator"&&<button type="button" aria-label="Actualizar estadísticas TukTuk" title="Actualizar"
        disabled={query.isFetching} onClick={()=>void query.refetch()}
        className="rounded-md border border-border p-2 disabled:opacity-50">
        <RefreshCw className={"h-4 w-4 "+(query.isFetching?"animate-spin":"")}/>
      </button>}
    </header>
    {mode!=="analytics"&&<div className="rounded-lg border border-border/50 bg-muted/10 p-3">
      <p className="text-xs font-semibold">Enlace principal de TukTuk Cliente</p>
      <p className="mt-1 break-all text-xs text-muted-foreground">{BASE}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium">Dónde publicarás
          <select aria-label="Canal de la campaña" value={channel}
            onChange={e=>setChannel(e.target.value as Channel)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-xs">
            {availableChannels.map(v=><option key={v} value={v}>{sources[v]}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium">Nombre de la acción (opcional)
          <input aria-label="Identificador de acción TukTuk" value={action} maxLength={20}
            placeholder="hospitales, noviembre, pegatinas"
            onChange={e=>setAction(e.target.value.toLowerCase().normalize("NFD")
              .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9_]/g,"").slice(0,20))}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-xs"/>
        </label>
      </div>
      <p className="mt-2 break-all rounded-md border border-border/40 bg-background/50 p-2 font-mono text-[11px] text-muted-foreground">{link}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={!canManage||busy} onClick={()=>void copy(link,"link_copied")}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-orange-400/30 px-3 py-1.5 text-xs font-semibold hover:bg-orange-400/10 disabled:opacity-50">
          <Copy className="h-3.5 w-3.5"/> Copiar enlace</button>
        <button type="button" disabled={!canManage||busy} onClick={()=>void copy(message,"message_copied")}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/25 disabled:opacity-50">
          <MessageCircle className="h-3.5 w-3.5"/> Copiar mensaje</button>
        <button type="button" disabled={!canManage||busy} onClick={()=>void share()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/25 disabled:opacity-50">
          <Share2 className="h-3.5 w-3.5"/> Compartir</button>
        <button type="button" disabled={!canManage||busy}
          onClick={()=>void copy(taggedLink("qr",campaign),"link_copied","qr")}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted/25 disabled:opacity-50">
          <Link2 className="h-3.5 w-3.5"/> Copiar enlace QR</button>
      </div>
      {notice&&<p role="status" className="mt-2 text-xs text-muted-foreground">{notice}</p>}
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        No modifica el acceso normal a Cliente. Los canales y acciones son etiquetas voluntarias;
        una copia o un intento de compartir no certifican su envío.
      </p>
    </div>}
    {mode!=="generator"&&(query.isPending?<p className="p-3 text-xs text-muted-foreground">Cargando el seguimiento oficial…</p>:
      query.isError?<p role="alert" className="p-3 text-xs text-amber-600">
        No se pudieron leer las estadísticas.
        <button type="button" onClick={()=>void query.refetch()} className="ml-2 underline">Reintentar</button></p>:<>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {metrics.map(({label,value,Icon})=><div key={label} className="rounded-lg border border-border/50 p-3">
          <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span>{String(label)}</span><Icon className="h-4 w-4"/>
          </div><p className="mt-1 text-xl font-bold tabular-nums">{fmt(value)}</p>
        </div>)}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/50 p-3">
          <h4 className="text-sm font-semibold">Evolución de la campaña</h4>
          {timeline.length?<div className="mt-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{left:-25,right:7}}>
                <CartesianGrid vertical={false} strokeOpacity={0.15}/>
                <XAxis dataKey="date" tick={{fontSize:10}}/>
                <YAxis allowDecimals={false} tick={{fontSize:10}}/>
                <Tooltip {...adminChartTooltipProps}/>
                <Line type="monotone" dataKey="clics" name="Clics" stroke="#e6a14d" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="precios" name="Cotizaciones" stroke="#2baeb6" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="solicitudes" name="Solicitudes" stroke="#4aae86" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>:<p className="py-6 text-xs text-muted-foreground">Aún no hay visitas etiquetadas al enlace oficial.</p>}
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <h4 className="text-sm font-semibold">Recorrido del cliente</h4>
          <div className="mt-2 space-y-2">
            {stages.map(([label,value])=><div key={label}>
              <div className="flex justify-between gap-2 text-[11px]">
                <span>{label}</span><strong className="tabular-nums">{fmt(value)}</strong></div>
              <div className="mt-1 h-2 rounded-full bg-muted/30">
                <div className="h-full rounded-full bg-orange-500/60"
                  style={{width:String(t.link_opens?Math.min(100,100*num(value)/t.link_opens):0)+"%"}}/>
              </div>
            </div>)}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Etapas registradas, no personas únicas. Una solicitud señalada no certifica una carrera real.
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/50 p-3">
          <h4 className="text-sm font-semibold">Canales de difusión</h4>
          {d!.channels.length?<div className="mt-2 divide-y divide-border/30">
            {d!.channels.map(row=><div key={row.channel} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span>{sources[row.channel]??row.channel}</span>
              <span className="tabular-nums">{fmt(row.link_opens)} clics · {fmt(row.quotes)} precios · {fmt(row.requests_created)} solicitudes</span>
            </div>)}
          </div>:<p className="py-4 text-xs text-muted-foreground">Aún no hay canales con actividad.</p>}
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <h4 className="text-sm font-semibold">Acciones de comunicación</h4>
          {d!.campaigns.length?<div className="mt-2 divide-y divide-border/30">
            {d!.campaigns.map(row=><div key={row.campaign} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span className="min-w-0 truncate">{row.campaign==="tuktuk"?"TukTuk general":row.campaign.replace(/^tuktuk_/,"TukTuk · ")}</span>
              <span className="tabular-nums">{fmt(row.link_opens)} clics · {fmt(row.requests_created)} solicitudes</span>
            </div>)}
          </div>:<p className="py-4 text-xs text-muted-foreground">Sin acciones etiquetadas todavía.</p>}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/50 p-3">
          <h4 className="text-sm font-semibold">Motivos de abandono declarados</h4>
          {d!.reasons.length?<div className="mt-2 space-y-1.5">
            {d!.reasons.map(v=><div key={v.reason} className="flex justify-between gap-2 rounded-md bg-muted/15 px-2 py-2 text-xs">
              <span>{reasons[v.reason]??v.reason}</span><strong>{fmt(v.total)}</strong></div>)}
          </div>:<p className="py-4 text-xs text-muted-foreground">Aún no hay respuestas a la encuesta opcional.</p>}
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <h4 className="text-sm font-semibold">Interés por rango de precio</h4>
          {d!.price_segments.length?<div className="mt-2 space-y-1.5">
            {d!.price_segments.map(v=><div key={v.price_band} className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/15 px-2 py-2 text-xs">
              <span>{priceBands[v.price_band]??v.price_band}</span>
              <strong>{fmt(v.quoted_sessions)} presup. · {fmt(v.sessions_with_request)} con solicitud</strong></div>)}
          </div>:<p className="py-4 text-xs text-muted-foreground">Sin consultas de precio registradas.</p>}
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Medición desde {d!.measured_since?new Date(d!.measured_since).toLocaleDateString("es-CU",{timeZone:"America/Havana"}):"la primera visita etiquetada"}.
        Las aperturas se deduplican por pestaña y acción. No identificamos grupos de WhatsApp,
        reenvíos ni visitantes individuales. El tráfico general sin etiqueta se contabiliza aparte.
      </p>
    </>)}
  </section>;
}
