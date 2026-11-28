import { createContext, useContext, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { Activity, AlertTriangle, RefreshCw, ExternalLink, CheckCircle2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { PageAlert } from "@/components/admin/PageAlert";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/SectionCard";
import { premiumHeaderSurface, premiumSurface, premiumControlSurface } from "@/components/admin/density";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { adminChartTooltipProps } from "@/lib/chart-theme";

const REFRESH_MS = 60_000;
const DATABASE_LIMIT_BYTES = 500_000_000; // Free plan reference; confirm in Usage.
const dashboard = "https://supabase.com/dashboard/project/vvxvnywzgtqhlaqpxyqh";
const fields = ["database_bytes", "cron_history_bytes", "client_connections", "max_connections", "active_queries", "blocked_queries", "active_cron", "cron_completed_sample", "cron_failed_sample"] as const;
type Field = typeof fields[number];
type CronCheck = { name: string; enabled: boolean; last_success: string | null; allowed_minutes: number };
type Snapshot = Record<Field, number> & { sampled_at: string; essential_cron: CronCheck[]; growth_24h_bytes?: number; days_to_90_percent?: number | null };
type Incident = { id: number; code: string; severity: "warning" | "critical"; detail: string; opened_at: string; last_seen_at: string; resolved_at: string | null; acknowledged_at: string | null };
type HistoryPoint = { at: string; database_bytes: number; client_connections: number; blocked_queries: number };
type ProviderSample = { sampled_at: string; http_status: number; duration_ms?: number; metric_families?: number; ram_pct?: number | null; ram_total_mb?: number | null; swap_pct?: number | null; swap_total_mb?: number | null; cpu_pct?: number | null; cpu_iowait_pct?: number | null; disk_busy_pct?: number | null; load1?: number | null; cpu_count?: number | null; read_mbps?: number | null; write_mbps?: number | null; network_rx_mbps?: number | null; network_tx_mbps?: number | null };
type OperationsSample = { sampled_at: string; push_due_10m: number; push_processing_10m: number; push_failed_created_1h: number; push_sent_created_1h: number; published_jobs: number; published_no_trace_2m: number; jobs_in_incident: number; gps_stored: number; gps_recent_5m: number; topups_pending: number; topups_no_ledger_24h: number; impulsa_pending: number };
const operationsFields = ["push_due_10m","push_processing_10m","push_failed_created_1h","push_sent_created_1h","published_jobs","published_no_trace_2m","jobs_in_incident","gps_stored","gps_recent_5m","topups_pending","topups_no_ledger_24h","impulsa_pending"] as const;
function parseOperations(raw: unknown): OperationsSample | null {
  if (!raw || typeof raw !== "object") return null;
  const p=raw as OperationsSample;
  if (typeof p.sampled_at!=="string" || !Number.isFinite(Date.parse(p.sampled_at)) || !operationsFields.every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)) return null;
  return p;
}
type HealthData = { operations: OperationsSample | null; server_time: string; snapshot: Snapshot; incidents: Incident[]; history: HistoryPoint[]; provider: ProviderSample | null; provider_history: ProviderSample[] };
function parseProvider(raw: unknown): ProviderSample | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as ProviderSample;
  if (typeof p.sampled_at !== "string" || !Number.isFinite(Date.parse(p.sampled_at)) || !Number.isInteger(p.http_status)) return null;
  return p;
}
type Level = "ok" | "warning" | "critical" | "unknown";
type Signal = { label: string; value: string; detail: string; level: Level; action: string; gauge?: { value: number | null; warning: number; critical: number } };

function parseSnapshot(raw: unknown): Snapshot {
  if (!raw || typeof raw !== "object") throw new Error("Medición no disponible");
  const row = raw as Record<string, unknown>;
  if (typeof row.sampled_at !== "string" || !Number.isFinite(Date.parse(row.sampled_at))) throw new Error("Medición inválida");
  for (const field of fields) {
    if (typeof row[field] !== "number" || !Number.isFinite(row[field]) || Number(row[field]) < 0) throw new Error("Medición incompleta");
  }
  if (!Array.isArray(row.essential_cron)) throw new Error("Cobertura de tareas incompleta");
  return row as Snapshot;
}

function parseHealth(raw: unknown): HealthData {
  if (!raw || typeof raw !== "object") throw new Error("Monitor no disponible");
  const row = raw as Record<string, unknown>;
  if (typeof row.server_time !== "string" || !Number.isFinite(Date.parse(row.server_time)) || !Array.isArray(row.incidents) || !Array.isArray(row.history)) throw new Error("Monitor incompleto");
  return { operations: parseOperations(row.operations), server_time: row.server_time, snapshot: parseSnapshot(row.snapshot), incidents: row.incidents as Incident[], history: row.history as HistoryPoint[], provider: parseProvider(row.provider), provider_history: Array.isArray(row.provider_history) ? row.provider_history.map(parseProvider).filter((p): p is ProviderSample => p !== null) : [] };
}
function useHealthQuery(projectId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-system-health-v4", projectId, userId],
    queryFn: async ({ signal }) => {
      let { data, error } = await getSupabaseClient().rpc("admin_get_system_health_v4", { target_project_id: projectId }).abortSignal(signal);
      if (error?.code==="PGRST202") ({data,error}=await getSupabaseClient().rpc("admin_get_system_health_v3", {target_project_id:projectId}).abortSignal(signal));
      if (error) throw error;
      return parseHealth(data);
    },
    enabled, staleTime: REFRESH_MS, refetchInterval: q => q.state.status === "error" ? 120_000 : REFRESH_MS,
    refetchIntervalInBackground: false, refetchOnWindowFocus: false, retry: false,
  });
}
const HealthContext = createContext<{ q: ReturnType<typeof useHealthQuery>; projectId: string } | null>(null);
const mb = (bytes: number) => (bytes / 1_000_000).toLocaleString("es", { maximumFractionDigits: 1 }) + " MB";
const percent = (n: number) => Math.round(n) + "%";
const threshold = (n: number, warning: number, critical: number): Level => n >= critical ? "critical" : n >= warning ? "warning" : "ok";
const levels: Record<Level, string> = { ok: "Normal", warning: "Preventiva", critical: "Crítica", unknown: "Sin verificar" };
const colors: Record<Level, string> = { ok: "text-[var(--semantic-success)]", warning: "text-[var(--semantic-warning)]", critical: "text-[var(--semantic-danger)]", unknown: "text-muted-foreground" };

function signals(d: Snapshot): Signal[] {
  const size = 100 * d.database_bytes / DATABASE_LIMIT_BYTES;
  const connections = d.max_connections > 0 ? 100 * d.client_connections / d.max_connections : null;
  return [
    { label: "Base de datos", value: mb(d.database_bytes), detail: percent(size) + " de 500 MB de referencia Free", level: threshold(size, 75, 90), gauge: { value: size, warning: 75, critical: 90 }, action: "Revisar tablas e historial técnico; no borrar registros operativos." },
    { label: "Conexiones PostgreSQL", value: d.client_connections + " / " + d.max_connections, detail: connections === null ? "Límite no disponible" : percent(connections) + " del máximo configurado", level: connections === null ? "unknown" : threshold(connections, 70, 85), gauge: { value: connections, warning: 70, critical: 85 }, action: "Reducir consultas repetitivas y revisar conexiones activas; no terminar sesiones indiscriminadamente." },
    { label: "Consultas bloqueadas", value: String(d.blocked_queries), detail: d.active_queries + " consultas activas (sin esta medición)", level: d.blocked_queries > 0 ? "warning" : "ok", action: "Revisar bloqueos y transacciones antes de intervenir." },
    { label: "Historial técnico Cron", value: mb(d.cron_history_bytes), detail: "Parte del almacenamiento de la base de datos", level: threshold(100*d.cron_history_bytes/DATABASE_LIMIT_BYTES, 10, 25), action: "Revisar retención y mantenimiento técnico fuera de horas de carga." },
    { label: "Procesos programados", value: String(d.active_cron), detail: "Tareas activas; no certifica ejecución correcta", level: d.active_cron === 0 ? "critical" : "unknown", action: "Verificar que las tareas esenciales continúan activas." },
    { label: "Fallos de Cron", value: d.cron_completed_sample > 0 ? d.cron_failed_sample + " / " + d.cron_completed_sample : "—", detail: "Hasta 300 ejecuciones recientes, últimos 15 min", level: d.cron_completed_sample === 0 ? "unknown" : d.cron_failed_sample >= 2 ? "critical" : d.cron_failed_sample === 1 ? "warning" : "ok", action: "Identificar la tarea fallida antes de modificar su frecuencia." },
  ];
}

const gaugeColors = ["var(--semantic-success, #35bd91)", "var(--semantic-warning, #e7b74e)", "var(--semantic-danger, #ef6876)"];
function MetricGauge({ signal }: { signal: Signal }) {
  const g=signal.gauge!;
  const measured=g.value!==null && Number.isFinite(g.value);
  const v=measured?Math.max(0,Math.min(100,g.value!)):0;
  const angle=Math.PI*(1-v/100);
  const x=80+56*Math.cos(angle), y=69-56*Math.sin(angle);
  const zones=[{start:0,end:g.warning},{start:g.warning,end:g.critical},{start:g.critical,end:100}];
  return <div className="relative mx-auto w-full max-w-[220px]">
    <svg viewBox="0 0 160 88" className="w-full overflow-visible" role="img" aria-label={signal.label+": "+(measured?signal.value:"Sin medición")+"; preventiva "+g.warning+"%, crítica "+g.critical+"%"}>
      <path d="M16 69 A64 64 0 0 1 144 69" fill="none" stroke="currentColor" className="text-muted-foreground opacity-15" strokeWidth="9"/>
      {zones.map((z,i)=><path key={i} d="M16 69 A64 64 0 0 1 144 69" pathLength="100" fill="none" stroke={gaugeColors[i]} strokeWidth="9" strokeDasharray={(z.end-z.start)+" 100"} strokeDashoffset={-z.start} opacity={measured?0.78:0.16}/>)}
      {measured&&<><path d={"M80 69 L"+x+" "+y} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><circle cx="80" cy="69" r="3" fill="currentColor"/></>}
      <text x="13" y="84" fontSize="8" fill="currentColor" opacity=".65">0</text>
      <text x="147" y="84" textAnchor="end" fontSize="8" fill="currentColor" opacity=".65">100%</text>
    </svg>
    <p className={cn("text-center text-[clamp(1.65rem,5vw,2.15rem)] leading-none font-semibold tabular-nums",colors[signal.level])}>{measured?g.value!.toLocaleString("es",{maximumFractionDigits:1})+"%":"—"}</p>
    {measured&&!signal.value.endsWith("%")&&<p className="mt-1 text-center text-xs tabular-nums text-muted-foreground">{signal.value}</p>}
  </div>;
}
function MetricPanel({ signal }: { signal: Signal }) {
  return <article className={cn("min-w-0 rounded-lg border border-border-subtle p-2 sm:p-3",premiumSurface)} title={signal.action}>
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5"><h3 className="text-sm font-semibold">{signal.label}</h3><span className={cn("text-[11px] leading-tight",colors[signal.level])}>{signal.level==="unknown"?(signal.value==="—"||signal.gauge?.value===null?"Sin datos":"Sin umbral"):"● "+levels[signal.level]}</span></div>
    {signal.gauge?<MetricGauge signal={signal}/>:<p className="mt-3 text-lg sm:text-xl font-semibold tabular-nums break-words">{signal.value}</p>}
    <p className="mt-1 text-xs leading-snug text-muted-foreground">{signal.detail}</p>
  </article>;
}

function unavailable(q: ReturnType<typeof useHealthQuery>) {
  return q.isError || q.fetchStatus === "paused" || Boolean(q.data && Date.parse(q.data.server_time)-Date.parse(q.data.snapshot.sampled_at)>12*60_000);
}

function providerUnavailable(data: HealthData | undefined) {
  return !data?.provider || data.provider.http_status !== 200 || Date.parse(data.server_time)-Date.parse(data.provider.sampled_at)>12*60_000;
}
const validNumber=(n: unknown): n is number => typeof n==="number" && Number.isFinite(n) && n>=0;
function providerSignals(p: ProviderSample | null, stale: boolean): Signal[] {
  const value=(k: keyof ProviderSample)=>!stale && p && validNumber(p[k]) ? p[k] as number : null;
  const usage=(label:string,k:keyof ProviderSample,w:number,c:number,detail:string):Signal=>{
    const n=value(k); const valid=n!==null && n<=100;
    return {label,value:valid?n.toLocaleString("es",{maximumFractionDigits:1})+"%":"—",detail:valid?detail:"Esperando datos comparables",level:valid?threshold(n,w,c):"unknown",gauge:{value:valid?n:null,warning:w,critical:c},action:"Consultar recursos y carga en Supabase."};
  };
  const rate=(k:keyof ProviderSample)=>{const n=value(k);return n===null?"—":n.toLocaleString("es",{maximumFractionDigits:3})+" MB/s";};
  const load=value("load1"), cores=value("cpu_count"), latency=value("duration_ms");
  return [
    usage("CPU","cpu_pct",70,90,"Incluye espera de E/S"),
    usage("Memoria RAM","ram_pct",80,90,"Memoria no disponible"+(value("ram_total_mb")!==null?" · "+value("ram_total_mb")+" MB":"")),
    usage("Swap","swap_pct",50,85,"Espacio utilizado"+(value("swap_total_mb")!==null?" · "+value("swap_total_mb")+" MB":"")),
    usage("Actividad de disco","disk_busy_pct",70,90,"Disco más ocupado; no es Disk IO Balance"),
    usage("Espera de E/S","cpu_iowait_pct",15,30,"CPU esperando disco"),
    {label:"Lectura / escritura",value:rate("read_mbps")+" / "+rate("write_mbps"),detail:"Máximo por disco; no es cuota",level:"unknown",action:"Comparar con los límites del proveedor."},
    {label:"Red: recepción / envío",value:rate("network_rx_mbps")+" / "+rate("network_tx_mbps"),detail:"Máximo por interfaz; no es consumo facturable",level:"unknown",action:"Consultar cuotas mensuales en Usage."},
    {label:"Carga del servidor",value:load===null?"—":load.toLocaleString("es",{maximumFractionDigits:2}),detail:"Media de 1 minuto"+(cores!==null?" · "+cores+" CPU lógicas":""),level:"unknown",action:"Revisar CPU y espera de E/S."},
    {label:"API oficial de métricas",value:latency===null?"—":latency+" ms",detail:stale?"Sin respuesta reciente válida":"HTTP 200 · "+(value("metric_families")??"—")+" familias de métricas",level:stale?"unknown":"ok",action:"Verificar disponibilidad de Supabase."}
  ];
}
export function SystemHealthProvider({ projectId, userId, enabled, children }: { projectId: string; userId: string; enabled: boolean; children: ReactNode }) {
  const q = useHealthQuery(projectId, userId, enabled);
  const matchRoute = useMatchRoute();
  const onHealthPage = !!matchRoute({ to: "/admin/proyectos/$id/$section", params: { id: projectId, section: "salud" } });
  const alerts = enabled && q.data && !unavailable(q) ? q.data.incidents.filter(i => !i.resolved_at) : [];
  const providerStale = enabled && !!q.data && providerUnavailable(q.data);
  return <HealthContext.Provider value={enabled ? { q, projectId } : null}>
    {enabled && !onHealthPage && (unavailable(q) || providerStale || alerts.length > 0) && <PageAlert tone={unavailable(q) || alerts.some(s => s.severity === "critical") ? "error" : "warning"} title={unavailable(q) ? "No se puede verificar la salud del sistema" : alerts.length ? alerts.length + " alerta(s) de infraestructura" : "Métricas oficiales sin confirmar"}>
      <span>{unavailable(q) ? "Última medición no confirmada. Revisa conexión y estado del proveedor." : [providerStale ? "API de métricas sin lectura reciente." : "", ...alerts.map(s => s.detail)].filter(Boolean).join(" · ")}</span>{" "}
      <Link className="font-semibold underline" to="/admin/proyectos/$id/$section" params={{ id: projectId, section: "salud" }}>Abrir Salud del sistema</Link>
    </PageAlert>}
    {children}
  </HealthContext.Provider>;
}

const missing = [
  ["Disk IO Balance exacto", "Créditos de ráfaga; actividad de disco y espera de E/S ya se miden"],
  ["Egress y Cached Egress", "Cuotas mensuales de tráfico"],
  ["Log Ingestion y Log Query", "Cuotas mensuales de registros"],
  ["HTTP 5xx y 429", "Errores y restricciones de la API"],
  ["Renovaciones y cierres de sesión", "Eventos de autenticación"],
  ["Sincronización de dispositivos", "Pendientes locales y conciliación"],
  ["Pruebas de extremo a extremo", "Radar, GPS, billetera e Impulsa: señales parciales disponibles; falta probar el recorrido completo"],
];

export default function SystemHealthSection() {
  const ctx = useContext(HealthContext);
  const lastManual = useRef(0);
  const ack = useMutation({ mutationFn: async (id: number) => {
    if (!ctx) throw new Error("Acceso restringido");
    const { error } = await getSupabaseClient().rpc("admin_ack_system_health_incident_v2", { target_project_id: ctx.projectId, target_incident_id: id });
    if (error) throw error;
  }, onSuccess: () => { void ctx?.q.refetch(); } });
  if (!ctx) return <PageAlert tone="warning" title="Acceso restringido">La salud de infraestructura está reservada a administradores de TukTuk.</PageAlert>;
  const q = ctx.q;
  const stale = unavailable(q);
  const d = q.data?.snapshot;
  const metrics = d && !stale ? signals(d) : [];
  const providerStale=stale || providerUnavailable(q.data);
  const provider=q.data?.provider??null;
  const resourceMetrics=providerSignals(provider,providerStale);
  const resourceHistory=[...(q.data?.provider_history??[])];
  if(provider && !resourceHistory.some(p=>p.sampled_at===provider.sampled_at))resourceHistory.push(provider);
  const resourceChart=resourceHistory.map(p=>({...p, ...(p.http_status!==200?{cpu_pct:null,ram_pct:null,swap_pct:null,disk_busy_pct:null,read_mbps:null,write_mbps:null,network_rx_mbps:null,network_tx_mbps:null,duration_ms:null}:{}),label:new Date(p.sampled_at).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"})}));
  const alerts = q.data && !stale ? q.data.incidents.filter(i=>!i.resolved_at).sort((a,b)=>Number(b.severity==="critical")-Number(a.severity==="critical")) : [];
  const critical = alerts.filter(m => m.severity === "critical").length;
  const checks = d && !stale ? d.essential_cron : [];
  const history = (q.data?.history ?? []).map(p=>({ ...p, mb: p.database_bytes / 1_000_000, label: new Date(p.at).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"}) }));
  if(d && !history.some(p=>Math.abs(Date.parse(p.at)-Date.parse(d.sampled_at))<300_000)) history.push({at:d.sampled_at,database_bytes:d.database_bytes,client_connections:d.client_connections,blocked_queries:d.blocked_queries,mb:d.database_bytes/1_000_000,label:new Date(d.sampled_at).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"})});
  const ops=q.data?.operations;
  const opsFresh=!stale && !!ops && !!q.data && Date.parse(q.data.server_time)-Date.parse(ops.sampled_at)<=12*60_000;
  const observedSignal=(label:string,k:typeof operationsFields[number],detail:string,attention=false):Signal=>{
    const n=opsFresh && ops?ops[k]:null;
    return {label,value:n===null?"—":String(n),detail,level:n===null?"unknown":attention&&n>0?"warning":"unknown",action:"Evidencia parcial: investigar el origen antes de intervenir."};
  };
  const serviceSignals=[
    observedSignal("Push pendientes vencidos","push_due_10m","En cola ≥10 min y elegibles para envío",true),
    observedSignal("Push en proceso","push_processing_10m","Reclamados hace ≥10 min",true),
    observedSignal("Push fallidos","push_failed_created_1h","Filas creadas en la última hora",true),
    observedSignal("Push enviados","push_sent_created_1h","Filas creadas en la última hora; no confirma recepción"),
  ];
  const operationalSignals=[
    observedSignal("Carreras publicadas","published_jobs","Vigentes · excluye pruebas"),
    observedSignal("Radar sin evaluación","published_no_trace_2m","Publicadas ≥2 min sin traza; revisar contexto",true),
    observedSignal("Carreras en incidencia","jobs_in_incident","Estado operativo registrado",true),
    observedSignal("GPS reciente","gps_recent_5m","Posiciones recibidas en 5 min; no equivale a conectados"),
    observedSignal("GPS registrado","gps_stored","Últimas posiciones guardadas"),
    observedSignal("Recargas pendientes","topups_pending","Solicitudes pendientes de gestión"),
    observedSignal("Recargas sin asiento","topups_no_ledger_24h","Confirmadas en 24 h sin movimiento vinculado",true),
    observedSignal("Impulsa pendiente","impulsa_pending","Solicitudes por revisar"),
  ];
  const dateLabel=(value:string)=>new Date(value).toLocaleString("es");
  return <main className="space-y-3 min-w-0" aria-label="Salud del sistema">
    <header className={cn("rounded-[var(--radius-card)] border p-3 space-y-2", premiumHeaderSurface)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2"><Activity className="size-5 shrink-0 text-primary"/><h1 className="text-base font-semibold">Salud del sistema</h1></div>
        <Button size="sm" variant="subtle" className={premiumControlSurface} aria-label="Actualizar salud del sistema" disabled={q.isFetching || q.fetchStatus === "paused"} onClick={() => { if(Date.now()-lastManual.current<15000)return; lastManual.current=Date.now(); void q.refetch(); }}><RefreshCw className={cn("size-4", q.isFetching && "animate-spin")}/><span className="hidden sm:inline">Actualizar</span></Button>
      </div>
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle pt-2">
        <span className={cn("text-sm font-semibold",colors[stale||critical?"critical":alerts.length||providerStale?"warning":"ok"])}>{stale?"● Estado no confirmado":q.isPending?"Consultando…":critical?"● Incidencia crítica":alerts.length?"● Alerta preventiva":providerStale?"● Métricas sin confirmar":"● Sin alertas detectadas"}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{stale||q.isPending?"Incidencias sin verificar":alerts.length===1?"1 incidencia":alerts.length+" incidencias"}</span>
        <span className="text-xs text-muted-foreground">Última lectura: {d?new Date(d.sampled_at).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"}):"—"}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{stale?"No se presentan mediciones antiguas como actuales.": "Servidor 5 min · Panel 60 s · Cobertura parcial"}</p>
      {(alerts.length>0 || stale || (!q.isPending && providerStale) || ack.isError) && <div className="border-t border-border-subtle pt-2 space-y-1">
        {stale && <p className="text-xs text-[var(--semantic-danger)]">No se pueden verificar las incidencias. Comprueba la conexión.</p>}
        {!stale && !q.isPending && providerStale && <p className="text-xs text-[var(--semantic-warning)]">API de recursos sin lectura vigente.</p>}
        {alerts.length>0 && <details className="group text-sm" aria-label="Alertas y acciones">
          <summary className="cursor-pointer rounded-md px-1 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className={colors[alerts[0].severity]}>{alerts[0].detail}</span>{alerts.length>1&&<span className="ml-2 text-xs text-muted-foreground">+{alerts.length-1} más</span>}<span className="ml-2 text-xs text-muted-foreground">· Ver detalles</span></summary>
          <div className="mt-2 space-y-2">
            {alerts.map(m=><div key={m.id} className="flex flex-wrap gap-2 border border-border-subtle rounded-lg p-2 bg-surface-1"><AlertTriangle className={cn("size-4 shrink-0 mt-0.5",colors[m.severity])}/><div className="flex-1 min-w-0"><p className="text-xs font-semibold">{levels[m.severity]} · {m.acknowledged_at?"En gestión":"Abierta"}</p><p className="text-sm">{m.detail}</p><p className="text-xs text-muted-foreground mt-1">Desde {dateLabel(m.opened_at)} · Última detección {dateLabel(m.last_seen_at)}</p></div>{!m.acknowledged_at&&<Button size="sm" variant="subtle" className={premiumControlSurface} disabled={ack.isPending} onClick={()=>ack.mutate(m.id)}>En gestión</Button>}</div>)}
            <a href={dashboard} target="_blank" rel="noreferrer" className="inline-flex gap-1 items-center text-xs text-primary"><ExternalLink className="size-3.5"/> Gestionar recursos en Supabase</a>
          </div>
        </details>}
        {ack.isError && <p role="alert" className="text-xs text-[var(--semantic-danger)]">No se pudo reconocer la incidencia. Intenta de nuevo.</p>}
      </div>}
    </header>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Recursos del servidor" description="Supabase · medición cada 5 min" contentClassName="p-2 sm:p-3 space-y-2">
      <p className="text-xs text-muted-foreground">Última lectura: {provider?dateLabel(provider.sampled_at):"Pendiente"}{providerStale?" · Sin confirmación vigente":""}.</p>
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-3 2xl:grid-cols-5">{resourceMetrics.filter(m=>m.gauge || m.label==="API oficial de métricas").map(m=><MetricPanel key={m.label} signal={m}/>)}</div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">{resourceMetrics.filter(m=>!m.gauge && m.label!=="API oficial de métricas").map(m=><MetricPanel key={m.label} signal={m}/>)}</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span className="text-[var(--semantic-success)]">● Normal</span><span className="text-[var(--semantic-warning)]">● Preventiva</span><span className="text-[var(--semantic-danger)]">● Crítica</span><span>Escala 0–100 % · límites por recurso</span></div>
      <div className="text-sm font-semibold pt-2">Evolución de recursos · últimas 24 h</div>
      {resourceChart.length>=2?<div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={resourceChart}><CartesianGrid stroke="var(--border-subtle)" vertical={false}/><XAxis dataKey="label" tick={{fontSize:11}}/><YAxis domain={[0,100]} unit="%" tick={{fontSize:10}}/><Tooltip {...adminChartTooltipProps}/><Legend wrapperStyle={{fontSize:11}}/><Line type="linear" dataKey="cpu_pct" name="CPU" stroke="#38bdf8" dot={{r:2}} connectNulls={false}/><Line type="linear" dataKey="ram_pct" name="RAM" stroke="#34d399" dot={{r:2}} connectNulls={false}/><Line type="linear" dataKey="swap_pct" name="Swap" stroke="#fbbf24" dot={{r:2}} connectNulls={false}/><Line type="linear" dataKey="disk_busy_pct" name="Disco" stroke="#f472b6" dot={{r:2}} connectNulls={false}/></LineChart></ResponsiveContainer></div>:<p className="text-xs text-muted-foreground">Histórico en formación; se necesitan al menos dos muestras.</p>}
      <div className="grid gap-2 lg:grid-cols-2">
        {([{title:"Disco · MB/s",a:"read_mbps",b:"write_mbps",an:"Lectura",bn:"Escritura"},{title:"Red · MB/s",a:"network_rx_mbps",b:"network_tx_mbps",an:"Recepción",bn:"Envío"}] as const).map(c=><div key={c.title} className={cn("rounded-lg border border-border-subtle p-2 min-w-0",premiumSurface)}><h3 className="text-xs font-semibold mb-1">{c.title}</h3>{resourceChart.length>=2?<div className="h-44"><ResponsiveContainer width="100%" height="100%"><LineChart data={resourceChart}><CartesianGrid stroke="var(--border-subtle)" vertical={false}/><XAxis dataKey="label" tick={{fontSize:10}} minTickGap={28}/><YAxis tick={{fontSize:10}} width={40}/><Tooltip {...adminChartTooltipProps}/><Legend wrapperStyle={{fontSize:10}}/><Line type="linear" dataKey={c.a} name={c.an} stroke="#38bdf8" dot={{r:2}} connectNulls={false}/><Line type="linear" dataKey={c.b} name={c.bn} stroke="#fbbf24" dot={{r:2}} connectNulls={false}/></LineChart></ResponsiveContainer></div>:<p className="text-xs text-muted-foreground">Histórico en formación.</p>}</div>)}
      </div>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Cómo interpretar las métricas</summary><p className="mt-1">Umbrales preventivos, no límites oficiales. CPU y disco requieren dos lecturas comparables; los reinicios pueden dejar datos sin valor. El tráfico de red no equivale a Egress facturado.</p></details>
    </SectionCard>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Base de datos y operaciones" description="Capacidad, conexiones y ejecución de tareas" contentClassName="p-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">{metrics.map(m=><MetricPanel key={m.label} signal={m}/>)}</div>
      {!metrics.length&&<p className="text-xs text-muted-foreground">Sin medición vigente.</p>}
    </SectionCard>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Servicios digitales" description="Cola de notificaciones · observación cada 5 min" contentClassName="p-2 sm:p-3 space-y-2">
      {!opsFresh&&<p role="status" className="text-xs text-muted-foreground">Sin muestra vigente de servicios. No se sustituyen datos por ceros.</p>}
      {opsFresh&&ops&&<p className="text-xs text-muted-foreground">Lectura: {dateLabel(ops.sampled_at)}</p>}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{serviceSignals.map(m=><MetricPanel key={m.label} signal={m}/>)}</div>
      <p className="text-xs text-muted-foreground">La cola no certifica la entrega al teléfono ni incluye todos los canales externos.</p>
    </SectionCard>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Operaciones de TukTuk" description="Evidencia registrada en el servidor · cobertura parcial" contentClassName="p-2 sm:p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{operationalSignals.map(m=><MetricPanel key={m.label} signal={m}/>)}</div>
      <p className="text-xs text-muted-foreground">Los conteos no garantizan el funcionamiento extremo a extremo. Sin actividad tampoco equivale a una falla. Estas señales son de revisión, no generan avisos push automáticos aún.</p>
    </SectionCard>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Procesos esenciales" description="Última ejecución exitosa observada en la muestra de Cron" contentClassName="space-y-2 p-3">
      {!checks.length && <p className="text-sm text-muted-foreground">Sin datos vigentes.</p>}
      {checks.map(c=>{const timely=c.enabled && c.last_success && d && Date.parse(d.sampled_at)-Date.parse(c.last_success)<=c.allowed_minutes*60_000;return <div key={c.name} className="flex flex-wrap justify-between gap-1 border border-border-subtle rounded-lg p-2 text-xs"><span className="font-medium">{c.name}</span><span className={cn(timely?colors.ok:c.enabled?colors.warning:colors.critical)}>{!c.enabled?"Desactivado":timely?"Éxito reciente":"Sin éxito reciente confirmado"} · {c.last_success?dateLabel(c.last_success):"—"}</span></div>})}
    </SectionCard>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Evolución de almacenamiento" description="Últimas 24 horas · muestras cada 30 min en gráfico" contentClassName="p-3 space-y-2">
      {history.length >= 2 ? <div className="h-48 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={history}><CartesianGrid stroke="var(--border-subtle)" vertical={false}/><XAxis dataKey="label" tick={{fontSize:10,fill:"var(--text-secondary)"}}/><YAxis tick={{fontSize:10,fill:"var(--text-secondary)"}} unit=" MB"/><Tooltip {...adminChartTooltipProps}/><Line type="linear" dataKey="mb" name="Base de datos (MB)" stroke="var(--primary)" dot={false}/></LineChart></ResponsiveContainer></div> : <p className="text-sm text-muted-foreground">El monitor está reuniendo mediciones; aún no existe una serie suficiente.</p>}
      <p className="text-xs text-muted-foreground">{stale?"Histórico no actualizado. ": ""}{!stale && typeof d?.growth_24h_bytes==="number" ? "Cambio neto en 24 h: "+(d.growth_24h_bytes/1_000_000).toFixed(1)+" MB. "+(typeof d.days_to_90_percent==="number"?"Proyección lineal al 90%: "+d.days_to_90_percent+" días (estimación).":"Sin crecimiento neto positivo.") : "Proyección disponible después de reunir 24 horas de datos."}</p>
    </SectionCard>
    {!stale && !q.isPending && <SectionCard appearance="premium" density="compact" module="resumen" title="Historial de incidencias" contentClassName="p-2">
      <details className="text-xs"><summary className="cursor-pointer font-medium">Ver incidencias resueltas</summary><div className="mt-2 space-y-2">{q.data?.incidents.filter(i=>i.resolved_at).map(i=><div key={i.id} className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-[var(--semantic-success)]"/><div>{i.detail}<p className="text-muted-foreground">Resuelta: {dateLabel(i.resolved_at!)}</p></div></div>)}{!q.data?.incidents.some(i=>i.resolved_at)&&<p className="text-muted-foreground">Sin incidencias resueltas recientes.</p>}</div></details>
      <a href={dashboard} target="_blank" rel="noreferrer" className="mt-2 inline-flex gap-1 items-center text-xs text-primary"><ExternalLink className="size-3.5"/> Gestionar recursos en Supabase</a>
    </SectionCard>}
    <SectionCard appearance="premium" density="compact" module="resumen" title="Cobertura pendiente" description="Indicadores todavía sin fuente directa" contentClassName="p-3">
      <details><summary className="cursor-pointer text-sm font-medium">Ver {missing.length} indicadores sin fuente directa</summary><div className="mt-2 grid gap-2 md:grid-cols-2">{missing.map(([label,detail])=><div key={label} className="border border-border-subtle rounded-lg p-3"><div className="flex flex-wrap justify-between gap-1"><h3 className="text-sm font-medium">{label}</h3><span className="text-xs text-muted-foreground">No disponible</span></div><p className="text-xs text-muted-foreground mt-1">{detail}</p></div>)}</div></details>
      <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Alcance y límites del monitor</summary><p className="mt-1">El servidor sigue midiendo con Admin cerrado. Una caída total puede impedir mediciones. Las alertas se muestran al abrir Admin. Los recursos corresponden al proyecto compartido; confirma cuotas en Usage. No se aplican cambios automáticos.</p></details>
    </SectionCard>
  </main>;
}
