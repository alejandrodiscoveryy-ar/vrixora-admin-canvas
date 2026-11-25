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
        description="Evolución histórica y conversión del negocio"
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
const observedCount=(v:unknown)=>typeof v==="number" && Number.isFinite(v) && v>=0 ? v.toLocaleString("es-CU") : "—";
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
  return <SectionCard density="compact" appearance="premium" module="comercial" title="Captación por canales"
    description="Comparación de TukTuk e Impulsa · Aliados: histórico"
    actions={<div className="flex flex-wrap gap-1">{([7,30,90] as const).map(n=><button key={n} type="button" aria-pressed={days===n} onClick={()=>setDays(n)} className={days===n?"min-h-11 rounded-md bg-primary/15 px-3 py-2 text-xs font-semibold text-primary":"min-h-11 rounded-md px-3 py-2 text-xs text-muted-foreground"}>{n} d</button>)}</div>}
    contentClassName="p-3 sm:p-4">
    <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-violet-400"/>TukTuk oficial</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--module-accent)]"/>Impulsa</span><span>— Sin dato</span></div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-3 md:grid-cols-3">
        {([{key:"clicks",label:"Clics",color:"#a78bfa"},{key:"requests",label:"Solicitudes",color:"var(--module-accent)"},{key:"completed",label:"Viajes liquidados",color:"var(--semantic-success)"}] as const).map(metric=>{
          const comparable=rows.slice(0,2);
          const max=Math.max(1,...comparable.map(row=>{const v=row[metric.key];return typeof v==="number"&&Number.isFinite(v)&&v>=0?v:0;}));
          return <div key={metric.key} className="min-w-0 rounded-lg border border-border-subtle bg-surface-2/50 p-3">
            <h4 className="text-sm font-semibold">{metric.label}</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {comparable.map((row,index)=>{
                const value=row[metric.key];
                const valid=typeof value==="number"&&Number.isFinite(value)&&value>=0;
                return <div key={row.name} className="min-w-0 text-center">
                  <strong className="text-lg tabular-nums">{observedCount(value)}</strong>
                  <div className="relative mx-auto mt-1 flex h-24 w-full max-w-16 items-end justify-center border-b border-border-default" aria-hidden="true">
                    {valid?<div className="w-3/5 rounded-t-md" style={{height:value!*100/max+"%",background:index===0?"#a78bfa":"var(--module-accent)"}}/>:<span className="self-center text-xs text-muted-foreground">—</span>}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{index===0?"TukTuk":"Impulsa"}</p>
                </div>;
              })}
            </div>
          </div>;
        })}
      </div>
      <div className="min-w-0 rounded-lg border border-border-subtle bg-surface-2/50 p-3">
        <h4 className="text-sm font-semibold">Aliados · Histórico</h4>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {([{key:"clicks",label:"Clics"},{key:"requests",label:"Solicitudes"},{key:"completed",label:"Liquidados"}] as const).map(m=><div key={m.key}><p className="break-words text-xl font-semibold tabular-nums">{observedCount(rows[2][m.key])}</p><p className="text-xs text-muted-foreground">{m.label}</p></div>)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Histórico independiente.</p>
      </div>
    </div>
    <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Ver campañas y cifras exactas</summary>
      {rows.map(row=><p key={row.name} className="py-1">{row.name} · {row.period}: {observedCount(row.clicks)} clics, {observedCount(row.requests)} solicitudes, {observedCount(row.completed)} liquidados.</p>)}
      {o?.campaigns?.map(c=><p key={c.campaign} className="py-1">{c.campaign}: {observedCount(c.link_opens)} clics · {observedCount(c.requests_created)} solicitudes</p>)}
      <p>— = sin dato. Clics y solicitudes son eventos; no se suman entre canales. Las campañas forman parte de TukTuk oficial.</p>
    </details>
    {official.isError||impulsa.isError||allies.isError ? <p role="alert" className="text-xs text-muted-foreground">Alguna fuente no está disponible.</p>:null}

    <Link to="/admin/proyectos/$id/$section" params={{id:projectId,section:"comercial"}} className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-primary">Consultar campañas y canales</Link>
  </SectionCard>;
}
