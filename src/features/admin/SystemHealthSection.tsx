import { createContext, useContext, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, RefreshCw, ExternalLink, CheckCircle2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { PageAlert } from "@/components/admin/PageAlert";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/admin/SectionCard";
import { premiumHeaderSurface, premiumSurface } from "@/components/admin/density";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
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
type HealthData = { server_time: string; snapshot: Snapshot; incidents: Incident[]; history: HistoryPoint[] };
type Level = "ok" | "warning" | "critical" | "unknown";
type Signal = { label: string; value: string; detail: string; level: Level; action: string };

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
  return { server_time: row.server_time, snapshot: parseSnapshot(row.snapshot), incidents: row.incidents as Incident[], history: row.history as HistoryPoint[] };
}
function useHealthQuery(projectId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-system-health-v2", projectId, userId],
    queryFn: async ({ signal }) => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_system_health_v2", { target_project_id: projectId }).abortSignal(signal);
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
    { label: "Base de datos", value: mb(d.database_bytes), detail: percent(size) + " de 500 MB de referencia Free", level: threshold(size, 75, 90), action: "Revisar tablas e historial técnico; no borrar registros operativos." },
    { label: "Conexiones PostgreSQL", value: d.client_connections + " / " + d.max_connections, detail: connections === null ? "Límite no disponible" : percent(connections) + " del máximo configurado", level: connections === null ? "unknown" : threshold(connections, 70, 85), action: "Reducir consultas repetitivas y revisar conexiones activas; no terminar sesiones indiscriminadamente." },
    { label: "Consultas bloqueadas", value: String(d.blocked_queries), detail: d.active_queries + " consultas activas (sin esta medición)", level: d.blocked_queries > 0 ? "warning" : "ok", action: "Revisar bloqueos y transacciones antes de intervenir." },
    { label: "Historial técnico Cron", value: mb(d.cron_history_bytes), detail: "Parte del almacenamiento de la base de datos", level: threshold(100*d.cron_history_bytes/DATABASE_LIMIT_BYTES, 10, 25), action: "Revisar retención y mantenimiento técnico fuera de horas de carga." },
    { label: "Procesos programados", value: String(d.active_cron), detail: "Tareas activas; no certifica ejecución correcta", level: d.active_cron === 0 ? "critical" : "unknown", action: "Verificar que las tareas esenciales continúan activas." },
    { label: "Fallos de Cron", value: d.cron_completed_sample > 0 ? d.cron_failed_sample + " / " + d.cron_completed_sample : "—", detail: "Hasta 300 ejecuciones recientes, últimos 15 min", level: d.cron_completed_sample === 0 ? "unknown" : d.cron_failed_sample >= 2 ? "critical" : d.cron_failed_sample === 1 ? "warning" : "ok", action: "Identificar la tarea fallida antes de modificar su frecuencia." },
  ];
}
function unavailable(q: ReturnType<typeof useHealthQuery>) {
  return q.isError || q.fetchStatus === "paused" || Boolean(q.data && Date.parse(q.data.server_time)-Date.parse(q.data.snapshot.sampled_at)>12*60_000);
}

export function SystemHealthProvider({ projectId, userId, enabled, children }: { projectId: string; userId: string; enabled: boolean; children: ReactNode }) {
  const q = useHealthQuery(projectId, userId, enabled);
  const alerts = enabled && q.data && !unavailable(q) ? q.data.incidents.filter(i => !i.resolved_at) : [];
  return <HealthContext.Provider value={enabled ? { q, projectId } : null}>
    {enabled && (unavailable(q) || alerts.length > 0) && <PageAlert tone={unavailable(q) || alerts.some(s => s.severity === "critical") ? "error" : "warning"} title={unavailable(q) ? "No se puede verificar la salud del sistema" : alerts.length + " alerta(s) de infraestructura"}>
      <span>{unavailable(q) ? "Última medición no confirmada. Revisa conexión y estado del proveedor." : alerts.map(s => s.detail).join(" · ")}</span>{" "}
      <Link className="font-semibold underline" to="/admin/proyectos/$id/$section" params={{ id: projectId, section: "salud" }}>Abrir Salud del sistema</Link>
    </PageAlert>}
    {children}
  </HealthContext.Provider>;
}

const missing = [
  ["CPU y memoria RAM", "Consumo de infraestructura"],
  ["Disk IO Balance", "Capacidad de operaciones de disco"],
  ["Egress y Cached Egress", "Cuotas mensuales de tráfico"],
  ["Log Ingestion y Log Query", "Cuotas mensuales de registros"],
  ["HTTP 5xx y 429", "Errores y restricciones de la API"],
  ["Renovaciones y cierres de sesión", "Eventos de autenticación"],
  ["Sincronización de dispositivos", "Pendientes locales y conciliación"],
  ["Radar, GPS, billetera e Impulsa", "Salud funcional de extremo a extremo"],
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
  const alerts = q.data && !stale ? q.data.incidents.filter(i=>!i.resolved_at) : [];
  const critical = alerts.filter(m => m.severity === "critical").length;
  const observed = d ? new Date(d.sampled_at).toLocaleString("es") : "Sin medición";
  const checks = d && !stale ? d.essential_cron : [];
  const history = (q.data?.history ?? []).map(p=>({ ...p, mb: p.database_bytes / 1_000_000, label: new Date(p.at).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"}) }));
  if(d && !history.some(p=>Math.abs(Date.parse(p.at)-Date.parse(d.sampled_at))<300_000)) history.push({at:d.sampled_at,database_bytes:d.database_bytes,client_connections:d.client_connections,blocked_queries:d.blocked_queries,mb:d.database_bytes/1_000_000,label:new Date(d.sampled_at).toLocaleTimeString("es",{hour:"2-digit",minute:"2-digit"})});
  const dateLabel=(value:string)=>new Date(value).toLocaleString("es");
  return <main className="space-y-3 min-w-0" aria-label="Salud del sistema">
    <header className={cn("rounded-[var(--radius-card)] border p-4 flex flex-wrap gap-3 items-center justify-between", premiumHeaderSurface)}>
      <div className="flex gap-3 items-center"><Activity className="size-6 text-primary"/><div><h1 className="text-lg font-semibold">Salud del sistema</h1><p className="text-xs text-muted-foreground">Infraestructura · prevención de incidencias</p></div></div>
      <Button variant="outline" disabled={q.isFetching || q.fetchStatus === "paused"} onClick={() => { if(Date.now()-lastManual.current<15000)return; lastManual.current=Date.now(); void q.refetch(); }}><RefreshCw className={cn("size-4", q.isFetching && "animate-spin")}/> Actualizar</Button>
      <div className="w-full text-xs text-muted-foreground">Última medición: {observed} (hora del dispositivo) · Servidor cada 5 min, panel cada 60 s · Sin consultas de logs</div>
    </header>
    {stale ? <PageAlert tone="error" title="Estado no confirmado">No se presentan mediciones antiguas como actuales. Sin conexión o última muestra de más de 12 minutos. El próximo intento será automático.</PageAlert> :
      q.isPending ? <p role="status" className="text-sm text-muted-foreground">Consultando el servidor…</p> :
      <PageAlert tone={critical ? "error" : alerts.length ? "warning" : "info"} title={critical ? critical+" alerta(s) crítica(s)" : alerts.length ? alerts.length+" alerta(s) preventiva(s)" : "Sin alertas en las métricas verificadas"}>La cobertura es parcial: los indicadores externos y de dispositivos requieren otras fuentes.</PageAlert>}
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(m => <article key={m.label} className={cn("rounded-[var(--radius-card)] border p-3", premiumSurface)}>
      <div className="flex justify-between items-start gap-2"><h2 className="text-sm font-semibold">{m.label}</h2><span className={cn("text-xs font-medium", colors[m.level])}>● {levels[m.level]}</span></div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{m.value}</p><p className="mt-1 text-xs text-muted-foreground">{m.detail}</p>
    </article>)}</div>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Alertas y acciones" description="Prioridad de intervención · no se oculta una incidencia al reconocerla" contentClassName="space-y-2 p-3">
      {alerts.length ? alerts.sort((a,b)=>Number(b.severity==="critical")-Number(a.severity==="critical")).map(m=><div key={m.id} className="flex flex-wrap gap-2 border border-border-subtle rounded-lg p-3"><AlertTriangle className={cn("size-4 shrink-0 mt-1",colors[m.severity])}/><div className="flex-1 min-w-0"><p className="text-sm font-semibold">{levels[m.severity]} · {m.acknowledged_at ? "En gestión" : "Abierta"}</p><p className="text-xs text-muted-foreground">{m.detail}</p><p className="text-xs text-muted-foreground mt-1">Desde {dateLabel(m.opened_at)} · Última detección {dateLabel(m.last_seen_at)}</p></div>{!m.acknowledged_at && <Button size="sm" variant="outline" disabled={ack.isPending} onClick={()=>ack.mutate(m.id)}>En gestión</Button>}</div>) : <p className="text-sm text-muted-foreground">{stale || !q.data ? "Alertas no verificables sin conexión." : "Sin acciones urgentes detectadas en la muestra."}</p>}
      {ack.isError && <PageAlert tone="error" title="No se pudo reconocer la incidencia">Intenta de nuevo cuando se restablezca la conexión.</PageAlert>}
      {q.data && !stale && q.data.incidents.some(i=>i.resolved_at) && <details className="text-sm"><summary className="cursor-pointer font-medium">Incidencias resueltas recientes</summary><div className="mt-2 space-y-2">{q.data.incidents.filter(i=>i.resolved_at).map(i=><div key={i.id} className="flex gap-2 text-xs"><CheckCircle2 className="size-4 shrink-0 text-[var(--semantic-success)]"/><div>{i.detail}<p className="text-muted-foreground">Resuelta: {dateLabel(i.resolved_at!)}</p></div></div>)}</div></details>}
      <a href={dashboard} target="_blank" rel="noreferrer" className="inline-flex gap-2 items-center text-sm text-primary"><ExternalLink className="size-4"/> Abrir Supabase para gestionar recursos</a>
    </SectionCard>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Procesos esenciales" description="Última ejecución exitosa observada en la muestra de Cron" contentClassName="space-y-2 p-3">
      {!checks.length && <p className="text-sm text-muted-foreground">Sin datos vigentes.</p>}
      {checks.map(c=>{const timely=c.enabled && c.last_success && d && Date.parse(d.sampled_at)-Date.parse(c.last_success)<=c.allowed_minutes*60_000;return <div key={c.name} className="flex flex-wrap justify-between gap-1 border border-border-subtle rounded-lg p-2 text-xs"><span className="font-medium">{c.name}</span><span className={cn(timely?colors.ok:c.enabled?colors.warning:colors.critical)}>{!c.enabled?"Desactivado":timely?"Éxito reciente":"Sin éxito reciente confirmado"} · {c.last_success?dateLabel(c.last_success):"—"}</span></div>})}
    </SectionCard>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Evolución de almacenamiento" description="Últimas 24 horas · muestras cada 30 min en gráfico" contentClassName="p-3 space-y-2">
      {history.length >= 2 ? <div className="h-48 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={history}><CartesianGrid stroke="var(--border-subtle)" vertical={false}/><XAxis dataKey="label" tick={{fontSize:10,fill:"var(--text-secondary)"}}/><YAxis tick={{fontSize:10,fill:"var(--text-secondary)"}} unit=" MB"/><Tooltip {...adminChartTooltipProps}/><Line type="linear" dataKey="mb" name="Base de datos (MB)" stroke="var(--primary)" dot={false}/></LineChart></ResponsiveContainer></div> : <p className="text-sm text-muted-foreground">El monitor está reuniendo mediciones; aún no existe una serie suficiente.</p>}
      <p className="text-xs text-muted-foreground">{stale?"Histórico no actualizado. ": ""}{!stale && typeof d?.growth_24h_bytes==="number" ? "Cambio neto en 24 h: "+(d.growth_24h_bytes/1_000_000).toFixed(1)+" MB. "+(typeof d.days_to_90_percent==="number"?"Proyección lineal al 90%: "+d.days_to_90_percent+" días (estimación).":"Sin crecimiento neto positivo.") : "Proyección disponible después de reunir 24 horas de datos."}</p>
    </SectionCard>
    <SectionCard appearance="premium" density="compact" module="resumen" title="Cobertura pendiente" description="Sin acceso a métricas externas desde PostgreSQL" contentClassName="p-3">
      <div className="grid gap-2 md:grid-cols-2">{missing.map(([label,detail])=><div key={label} className="border border-border-subtle rounded-lg p-3"><div className="flex flex-wrap justify-between gap-1"><h3 className="text-sm font-medium">{label}</h3><span className="text-xs text-muted-foreground">No disponible</span></div><p className="text-xs text-muted-foreground mt-1">{detail}</p></div>)}</div>
      <p className="mt-3 text-xs text-muted-foreground">El servidor sigue midiendo con Admin cerrado. Una caída total puede impedir las mediciones; las alertas aquí se muestran al abrir Admin. Los umbrales son preventivos, no límites oficiales. El tamaño y las conexiones son del proyecto Supabase compartido; confirma las cuotas vigentes en Usage. No se aplican cambios automáticos.</p>
    </SectionCard>
  </main>;
}
