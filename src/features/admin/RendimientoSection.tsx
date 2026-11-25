import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { getSupabaseClient } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2 } from "lucide-react";
import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import { adminPeriodOptions, periodRange, identifyAdminPeriod, type AdminPeriodKey } from "@/components/admin/admin-period";
import { AdminPeriodSelector } from "@/components/admin/AdminPeriodSelector";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import AgencyVitalityOverview from "@/features/admin/AgencyVitalityOverview";
import { SectionCard } from "@/components/admin/SectionCard";
import { premiumColumnHeaderSurface, premiumControlSurface } from "@/components/admin/density";
import { cn } from "@/lib/utils";

export default function RendimientoSection({projectId}:{projectId:string}) {
  const {data:project}=useProject(projectId);
  const today=periodRange("today").to;
  const projectStart=project?.createdAt?.slice(0,10);
  const allRange=projectStart && /^\d{4}-\d{2}-\d{2}$/.test(projectStart) && projectStart<=today ? {from:projectStart,to:today} : undefined;
  const options=allRange ? [...adminPeriodOptions,{value:"all" as const,label:"Todo"}] : adminPeriodOptions;

  const { data: permissions = [], isLoading: permissionsLoading } =
    useProjectPermissions(projectId);

  const canViewCommercial = permissions.includes("commercial.view");


  const [dateRange, setDateRange] = useState(() => periodRange("7d"));

  const [period, setPeriod] = useState<AdminPeriodKey>(() =>
    identifyAdminPeriod(dateRange),
  );

  const fromDate = period==="all" && allRange ? allRange.from : dateRange.from;
  const toDate = period==="all" && allRange ? allRange.to : dateRange.to;

  const periodDays =
    Math.max(
      1,
      Math.round(
        (new Date(`${toDate}T12:00:00`).getTime() -
          new Date(`${fromDate}T12:00:00`).getTime()) /
          86_400_000,
      ) + 1,
    );

  const rangeSupported=periodDays<=401;

  if (permissionsLoading) return <div role="status" className="flex items-center justify-center py-12 text-sm text-text-secondary"><Loader2 className="mr-2 size-5 animate-spin text-primary" aria-hidden="true"/> Comprobando acceso…</div>;
  return (
    <div data-admin-module="rendimiento" className="min-w-0 space-y-3">
      <ModuleHeader
        density="compact"
        appearance="premium"
        module="rendimiento"
        title="Analítica · Vitalidad de la Agencia TukTuk"
        icon={Activity}
        actions={
          <AdminPeriodSelector appearance="premium"
            value={period} range={{from:fromDate,to:toDate}} options={options} allRange={allRange} maxCustomDays={401}
            onChange={(nextPeriod, nextRange) => {
              setPeriod(nextPeriod);
              setDateRange(nextRange);
            }}
          />
        }
      />
      {rangeSupported ? <AgencyVitalityOverview projectId={projectId} from={fromDate} to={toDate} /> : <p role="alert" className="text-sm text-text-secondary">El historial supera el límite actual de 401 días de Vitalidad. Selecciona un período menor; no se recortan los datos automáticamente.</p>}
      {canViewCommercial ? <CommercialChannelSummary projectId={projectId}/> : null}
    </div>
  );
}

type ChannelTotals = {link_opens?:number;clicks?:number;requests_created?:number};
type ChannelReport = {totals?:ChannelTotals;drivers?:{completed_real?:number}[];campaigns?:{campaign:string;link_opens?:number;requests_created?:number}[]};
type AllyReport = {clicks?:number;requests?:number;completed?:number};
const isObservedCount=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=0;
const observedCount=(v:unknown)=>isObservedCount(v) ? v.toLocaleString("es-CU") : "—";
// Event ratio within the same channel/window, not a matched visitor conversion.
export function channelEventConversion(clicks:unknown,requests:unknown):number|undefined {
  if(!isObservedCount(clicks)||!isObservedCount(requests)||clicks===0||requests>clicks) return undefined;
  return requests/clicks;
}
const conversionLabel=(clicks:unknown,requests:unknown)=>{
  const value=channelEventConversion(clicks,requests);
  return value===undefined?"—":value.toLocaleString("es-CU",{style:"percent",maximumFractionDigits:1});
};
const channelColumns="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center";
function ChannelCountCell({label,value,bar,color}:{label:string;value:unknown;bar?:number;color?:string}){
  return <div role="cell" className="min-w-0">
    <span className="block text-[11px] text-text-secondary md:sr-only">{label}</span>
    <span className="block break-words text-base font-semibold tabular-nums">{observedCount(value)}</span>
    {bar!==undefined?<div aria-hidden="true" className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/60"><div className="h-full rounded-full" style={{width:bar+"%",backgroundColor:color}}/></div>:null}
  </div>;
}
function sumObserved<T>(rows:T[]|undefined,read:(row:T)=>number|undefined):number|undefined {
  if(!rows || rows.some(row=>typeof read(row)!=="number" || !Number.isFinite(read(row)) || read(row)!<0)) return undefined;
  return rows.reduce((sum,row)=>sum+read(row)!,0);
}
function CommercialChannelSummary({projectId}:{projectId:string}){
  const [days,setDays]=useState<7|30|90>(30);
  const official=useQuery({queryKey:["commercial-overview-official",projectId,days],queryFn:async()=>{
    const {data,error}=await getSupabaseClient().rpc("admin_get_marketplace_tuktuk_communications_v1",{target_project_id:projectId,target_days:days});
    if(error)throw error;return data as ChannelReport;
  },staleTime:60_000,refetchOnWindowFocus:false,retry:1});
  const impulsa=useQuery({queryKey:["commercial-overview-impulsa",projectId,days],queryFn:async()=>{
    const {data,error}=await getSupabaseClient().rpc("admin_get_marketplace_impulsa_communications_v1",{target_project_id:projectId,target_days:days});
    if(error)throw error;return data as ChannelReport;
  },staleTime:60_000,refetchOnWindowFocus:false,retry:1});
  const allies=useQuery({queryKey:["commercial-overview-allies",projectId],queryFn:async()=>{
    const {data,error}=await getSupabaseClient().rpc("admin_list_marketplace_allies_v1",{target_project_id:projectId});
    if(error)throw error;if(!Array.isArray(data))throw Error("INVALID_ALLIES_REPORT");return data as AllyReport[];
  },staleTime:60_000,refetchOnWindowFocus:false,retry:1});
  const o=official.isError?undefined:official.data,i=impulsa.isError?undefined:impulsa.data,a=allies.isError?undefined:allies.data;
  const rows=[
    {name:"TukTuk oficial · incluye campañas",period:days+" días",clicks:o?.totals?.link_opens,requests:o?.totals?.requests_created,completed:undefined},
    {name:"Impulsa",period:days+" días",clicks:i?.totals?.clicks,requests:i?.totals?.requests_created,completed:sumObserved(i?.drivers,x=>x.completed_real)},
    {name:"Aliados",period:"Histórico",clicks:sumObserved(a,x=>x.clicks),requests:sumObserved(a,x=>x.requests),completed:sumObserved(a,x=>x.completed)},
  ];
  const comparable=rows.slice(0,2);
  const maxClicks=Math.max(1,...comparable.map(row=>isObservedCount(row.clicks)?row.clicks:0));
  const comparisonIncomplete=comparable.some(row=>!isObservedCount(row.clicks)||!isObservedCount(row.requests)||!isObservedCount(row.completed));
  return <SectionCard density="compact" appearance="premium" module="comercial" title="Captación por canales"
    description="Rendimiento por canal · Aliados: histórico"
    actions={<div className="flex flex-wrap gap-1">{([7,30,90] as const).map(n=><button key={n} type="button" aria-pressed={days===n} onClick={()=>setDays(n)} className={days===n?"min-h-11 rounded-md bg-primary/15 px-3 py-2 text-xs font-semibold text-primary":"min-h-11 rounded-md px-3 py-2 text-xs text-muted-foreground"}>{n} d</button>)}</div>}
    contentClassName="p-3 sm:p-4">
    <div className="space-y-3" data-channel-comparison>
      <div role="table" aria-label={"Rendimiento por canal, últimos "+days+" días"} className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-border-default">
        <div role="row" className={cn(channelColumns,"sr-only px-4 py-2.5 text-xs font-medium text-text-secondary md:not-sr-only md:grid",premiumColumnHeaderSurface)}>
          {["Canal","Clics","Solicitudes","Liquidados","Conversión*"].map(label=><span key={label} role="columnheader">{label}</span>)}
        </div>
        {comparable.map((row,index)=>{
          const color=index===0?"#a78bfa":"#22b8cf";
          return <div role="row" key={row.name} className={cn(channelColumns,"border-t border-border-subtle px-3 py-3 sm:px-4",premiumControlSurface)}>
            <div role="cell" className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
              <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full" style={{backgroundColor:color}}/>
              <div className="min-w-0"><p className="text-sm font-semibold">{index===0?"TukTuk oficial":"Impulsa"}</p><p className="text-[11px] text-text-secondary">{index===0?"Incluye campañas":"Conductores"}</p></div>
            </div>
            <ChannelCountCell label="Clics" value={row.clicks} bar={isObservedCount(row.clicks)?row.clicks/maxClicks*100:undefined} color={color}/>
            <ChannelCountCell label="Solicitudes" value={row.requests}/>
            <ChannelCountCell label="Liquidados" value={row.completed}/>
            <div role="cell" className="min-w-0"><span className="block text-[11px] text-text-secondary md:sr-only">Conversión*</span><span className={cn("block text-base font-semibold tabular-nums",channelEventConversion(row.clicks,row.requests)!>0?"text-emerald-600 dark:text-emerald-300":"text-text-secondary")}>{conversionLabel(row.clicks,row.requests)}</span></div>
          </div>;
        })}
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">* Solicitudes ÷ clics del mismo período. Orienta sobre eventos, no sobre personas únicas. — Sin dato o sin base válida.{comparisonIncomplete?" Comparación incompleta.":""}</p>
      <div className={cn("min-w-0 rounded-xl border border-border-default px-3 py-3 sm:px-4",premiumControlSurface)} data-channel-history>
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h4 className="text-sm font-semibold">Aliados · Histórico</h4>
          <span className="text-xs text-text-secondary">Acumulado · independiente del filtro</span>
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-2 divide-x divide-border-subtle">
          {([{key:"clicks",label:"Clics"},{key:"requests",label:"Solicitudes"},{key:"completed",label:"Liquidados"}] as const).map((m,index)=><div key={m.key} className={cn("min-w-0",index>0&&"pl-3")}><dt className="text-xs text-text-secondary">{m.label}</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums">{observedCount(rows[2][m.key])}</dd></div>)}
        </dl>
      </div>
    </div>
    <details className="mt-2 text-xs text-text-secondary"><summary className="cursor-pointer py-2 font-medium">Ver detalle de campañas</summary>
      {o?.campaigns?.length ? o.campaigns.map(c=><div key={c.campaign} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle py-2"><span className="break-all font-medium">{c.campaign}</span><span>{observedCount(c.link_opens)} clics · {observedCount(c.requests_created)} solicitudes</span></div>) : <p className="py-2">{official.isPending?"Consultando campañas…":official.isError?"No se pudieron consultar las campañas.":"Sin campañas registradas en este período."}</p>}
      <p className="py-1">Los eventos no se suman entre canales. Aliados se muestra aparte. Las campañas forman parte de TukTuk oficial.</p>
    </details>
    {official.isError||impulsa.isError||allies.isError ? <p role="alert" className="text-xs text-muted-foreground">Alguna fuente no está disponible.</p>:null}

    <Link to="/admin/proyectos/$id/$section" params={{id:projectId,section:"comercial"}} className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-primary">Consultar campañas y canales</Link>
  </SectionCard>;
}
