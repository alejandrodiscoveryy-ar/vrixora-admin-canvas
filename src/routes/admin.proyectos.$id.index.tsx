import { useMemo, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { parseAgencyVitality, agencyVitalitySignals, controlConversionFunnel } from "@/lib/agency-vitality";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { adminChartTooltipProps } from "@/lib/chart-theme";

import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  type LucideIcon,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Gauge,
  MapPin,
  RefreshCw,
  Users,
  WalletCards,
} from "lucide-react";

import { supabaseServices } from "@/lib/services";
import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import { Badge } from "@/components/ui/badge";

import { AdminPeriodSelector } from "@/components/admin/AdminPeriodSelector";
import { adminPeriodOptions, periodRange, identifyAdminPeriod, type AdminPeriodKey } from "@/components/admin/admin-period";


import { SectionCard } from "@/components/admin/SectionCard";
import { MetricCard } from "@/components/admin/MetricCard";
import { premiumSurface, premiumHeaderSurface } from "@/components/admin/density";
import { cn } from "@/lib/utils";
import type { AdminModuleKey, SemanticState } from "@/components/admin/types";

import { PageAlert } from "@/components/admin/PageAlert";

export const Route = createFileRoute("/admin/proyectos/$id/")({
  component: ProjectLandingPage,
});

const REFRESH_INTERVAL = 60_000;

function ProjectLandingPage() {
  const { id } = Route.useParams();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: permissions = [], isLoading: permissionsLoading } = useProjectPermissions(id);
  if (projectLoading || permissionsLoading) return null;
  if (project?.slug === "tuktuk-control" && permissions.includes("settings.manage")) {
    return <Navigate to="/admin/proyectos/$id/$section" params={{ id, section: "salud" }} replace />;
  }
  return <ResumenPage id={id} />;
}

export function ResumenPage({ id }: { id: string }) {
  const { data: permissions = [], isLoading: permissionsLoading } =
    useProjectPermissions(id);

  const canViewUsers = permissions.includes("customers.view");
  const canViewMarketplace = permissions.includes("marketplace.view");
  const canViewPayments = permissions.includes("payments.view");
  const canViewAnalytics = permissions.includes("analytics.view");

  const {data:project}=useProject(id);
  const today=periodRange("today").to;
  const projectStart=project?.createdAt?.slice(0,10);
  const allRange=projectStart && /^\d{4}-\d{2}-\d{2}$/.test(projectStart) && projectStart<=today ? {from:projectStart,to:today} : undefined;
  const options=allRange ? [...adminPeriodOptions,{value:"all" as const,label:"Todo"}] : adminPeriodOptions;
  const [dateRange, setDateRange] = useState(() => periodRange("7d"));
  const [period, setPeriod] = useState<AdminPeriodKey>(() => identifyAdminPeriod(dateRange));

  const usersApp = useQuery({
    queryKey: ["admin-clients", id],
    queryFn: () => supabaseServices.licenses.listClients(id),
    enabled: !permissionsLoading && canViewUsers,
    staleTime: 30_000,
    refetchInterval: (query) => query.state.status === "error" ? 120_000 : REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const marketplace = useQuery({
    queryKey: ["marketplace-overview", id],
    queryFn: () => supabaseServices.marketplace.overview(id),
    enabled: !permissionsLoading && canViewMarketplace,
    staleTime: 30_000,
    refetchInterval: (query) => query.state.status === "error" ? 120_000 : REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const range = useMemo(
    () => ({
      start: new Date(`${dateRange.from}T00:00:00`),
      end: new Date(`${dateRange.to}T23:59:59.999`),
    }),
    [dateRange.from, dateRange.to],
  );

  const users = useMemo(() => usersApp.data ?? [], [usersApp.data]);

  const newUsersPeriod = users.filter((user) => {
    const createdAt = new Date(user.registeredAt).getTime();
    return createdAt >= range.start.getTime() && createdAt <= range.end.getTime();
  }).length;

  const queryError = [
    usersApp,
    marketplace,
  ].find((query) => query.isError)?.error;

  const allLoading = [
    usersApp,
    marketplace,
  ].some((query) => query.isLoading);

  const dataUpdatedAt = Math.max(
    usersApp.dataUpdatedAt,
    marketplace.dataUpdatedAt,
  );

  const overview = marketplace.isError ? undefined : marketplace.data;

  const pendingTopups = overview?.pendingTopups ?? 0;
  const openIncidents = overview?.jobsIncidentOpen ?? 0;
  const suspendedDrivers = overview?.driversSuspended ?? 0;
  const hasPendingActions = pendingTopups > 0 || openIncidents > 0 || suspendedDrivers > 0;

  return (
    <div className="min-w-0 space-y-2 md:space-y-3" aria-label="Panel estratégico de TukTuk">
      <header className={cn("rounded-[var(--radius-card)] border px-3 py-3 sm:px-4", premiumHeaderSurface)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/[0.09] text-primary">
                <Gauge className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Panel general</p>
                <h1 className="text-lg font-semibold tracking-tight text-foreground">Estado del negocio</h1>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <AdminPeriodSelector
              appearance="premium"
              value={period}
              range={dateRange}
              options={options} allRange={allRange} maxCustomDays={401}
              onChange={(nextPeriod, nextRange) => {
                setPeriod(nextPeriod);
                setDateRange(nextRange);
              }}
            />
            <Badge variant="outline" className="w-fit gap-2 border-cyan-400/20 bg-cyan-500/[0.07] px-3 py-1.5 text-[10px]">
              <RefreshCw className={cn("h-3 w-3 text-primary", allLoading && "animate-spin")} aria-hidden="true" />
              {buildFreshnessLabel(dataUpdatedAt, allLoading)}
            </Badge>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Período para resultados y altas. Pendientes y flota: situación actual.
        </p>
      </header>

      {queryError ? (
        <PageAlert tone="error" title="No fue posible actualizar todo el resumen">
          {friendlyError(queryError)}
        </PageAlert>
      ) : null}

      {canViewMarketplace ? (
        <section aria-label="Por atender ahora" className={cn("flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border p-2 sm:px-3", premiumSurface)}>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><AlertTriangle className="size-4 text-[var(--semantic-warning)]" aria-hidden="true"/> Por atender ahora</span>
          {marketplace.isLoading ? (
            <p className="text-sm text-muted-foreground">Consultando pendientes...</p>
          ) : marketplace.isError ? (
            <p className="text-sm text-muted-foreground">No se pueden comprobar los pendientes. Revisa la conexión.</p>
          ) : hasPendingActions ? (
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {pendingTopups > 0 ? (
                canViewPayments ? (
                  <Link
                    to="/admin/proyectos/$id/$section"
                    params={{ id, section: "trabajos" }}
                    search={{ vista: "recargas" }}
                    className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <WalletCards className="h-4 w-4 shrink-0 text-[var(--semantic-warning)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 font-medium">Revisar recargas pendientes</span>
                    <Badge variant="warning" className="font-mono">{pendingTopups}</Badge>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </Link>
                ) : (
                  <div className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] px-2.5 py-1.5 text-xs text-foreground">
                    <WalletCards className="h-4 w-4 shrink-0 text-[var(--semantic-warning)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1 font-medium">Recargas pendientes · área de Finanzas</span>
                    <Badge variant="warning" className="font-mono">{pendingTopups}</Badge>
                  </div>
                )
              ) : null}
              {openIncidents > 0 ? (
                <Link
                  to="/admin/proyectos/$id/$section"
                  params={{ id, section: "trabajos" }}
                  search={{ vista: "incidencias" }}
                  className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--semantic-warning)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-medium">Resolver incidencias abiertas</span>
                  <Badge variant="warning" className="font-mono">{openIncidents}</Badge>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              ) : null}
              {suspendedDrivers > 0 ? (
                <Link
                  to="/admin/proyectos/$id/$section"
                  params={{ id, section: "trabajos" }}
                  search={{ vista: "conductores" }}
                  className={cn("flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", premiumSurface)}
                >
                  <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-medium">Conductores suspendidos · seguimiento</span>
                  <Badge variant="outline" className="font-mono">{suspendedDrivers}</Badge>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin recargas pendientes, incidencias abiertas ni conductores suspendidos.</p>
          )}
        </section>
      ) : null}

      {canViewAnalytics ? (Math.round((Date.parse(dateRange.to)-Date.parse(dateRange.from))/86400000)<=400 ? <StrategicCharts projectId={id} from={dateRange.from} to={dateRange.to} fleet={overview ? {enabled:overview.driversActive,total:overview.driversTotal,inProgress:overview.jobsActive}:undefined} appUsers={usersApp.isError||!usersApp.data?undefined:{total:users.length,newCount:newUsersPeriod}} /> : <p role="alert" className="text-xs text-muted-foreground">El historial supera los 401 días admitidos por los gráficos de Vitalidad.</p>) : null}

      {!canViewAnalytics && <section aria-label="Indicadores principales" className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-3">
        {canViewMarketplace && <><SummaryLink projectId={id} section="trabajos" vista="conductores"><DashboardMetric label="Conductores habilitados" value={overview?.driversActive ?? "—"} comparison="No indica conexión" icon={Users} tone="blue" isLoading={marketplace.isLoading}/></SummaryLink><SummaryLink projectId={id} section="trabajos" vista="mapa"><DashboardMetric label="Servicios en curso" value={overview?.jobsActive ?? "—"} comparison="Ahora · abrir mapa" icon={MapPin} tone="cyan" isLoading={marketplace.isLoading}/></SummaryLink></>}
        {canViewUsers && <SummaryLink projectId={id} section="clientes"><DashboardMetric label="Usuarios de la app" value={usersApp.isError||!usersApp.data?"—":users.length} comparison="Registrados" icon={Users} tone="cyan" isLoading={usersApp.isLoading}/></SummaryLink>}
      </section>}

    </div>
  );
}


type DashboardTone = "cyan" | "blue" | "emerald" | "rose" | "violet" | "amber";

const dashboardMetricAccents: Record<DashboardTone, { module?: AdminModuleKey; semanticState?: SemanticState }> = {
  cyan: { module: "resumen" },
  blue: { module: "clientes" },
  emerald: { semanticState: "success" },
  rose: { semanticState: "danger" },
  violet: { module: "comercial" },
  amber: { semanticState: "warning" },
};

function DashboardMetric({
  label, value, comparison, icon: Icon, tone, isLoading,
}: {
  label: string; value: number | string; comparison: string; icon: LucideIcon;
  tone: DashboardTone; isLoading: boolean;
}) {
  return <MetricCard density="compact" appearance="premium" label={label} value={value}
    description={comparison} icon={Icon} isLoading={isLoading} {...dashboardMetricAccents[tone]} />;
}
function buildFreshnessLabel(timestamp: number, loading: boolean) {
  if (loading) return "Cargando datos...";
  if (!timestamp) return "Sin datos recientes";

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60_000),
  );

  return `Actualizado hace ${minutes} min`;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("connection")
  ) {
    return "Sin conexión: no fue posible actualizar los datos.";
  }

  return `Error al cargar datos: ${message}`;
}

function SummaryLink({projectId, section, vista, children}: {projectId:string; section:"trabajos"|"clientes"|"rendimiento"|"comercial"; vista?:"trabajos"|"conductores"|"mapa"|"clientes"; children:ReactNode}) {
  return <Link to="/admin/proyectos/$id/$section" params={{id:projectId,section}} search={vista ? {vista} : {}}
    className="block min-w-0 rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:brightness-105">{children}</Link>;
}

function StrategicCharts({ projectId, from, to, fleet, appUsers }: { projectId: string; from: string; to: string; fleet?: {enabled:number;total:number;inProgress:number}; appUsers?:{total:number;newCount:number} }) {
  const query = useQuery({
    queryKey: ["agency-vitality-v1", projectId, from, to],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_agency_vitality_v1", {
        target_project_id: projectId, target_from: from, target_to: to,
      });
      if (error) throw error;
      return parseAgencyVitality(data);
    },
    staleTime: 60_000, refetchInterval: (query) => query.state.status === "error" ? 120_000 : 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: false, retry: 1,
  });
  const d = query.isError ? undefined : query.data;
  const fmt = (v: number) => new Intl.NumberFormat("es-CU", { maximumFractionDigits: 1 }).format(v);
  const rows = d ? [
    { name: "Control", actual: d.control.registered, anterior: d.control.previous_registered },
    ...(d.clients ? [{ name: "Clientes", actual: d.clients.new, anterior: d.clients.previous_new }] : []),
    ...(d.rides ? [{ name: "Viajes", actual: d.rides.completed, anterior: d.rides.previous_completed }] : []),
  ] : [];
  const priorities = d ? agencyVitalitySignals(d).filter(x => ["clients", "rides", "cancelled"].includes(x.id) && x.priority >= 2).sort((a,b) => b.priority-a.priority) : [];
  const funnel = d ? controlConversionFunnel(d.control) : null;
  const rides = d?.rides;
  const conversion = rides && rides.requested > 0 && rides.completed <= rides.requested ? rides.completed*100/rides.requested : null;
  const delta = (current:number, previous:number) => previous >= 5 ? ((current-previous)*100/previous > 0 ? "+" : "") + fmt((current-previous)*100/previous) + "% vs. anterior" : "Sin base anterior suficiente";
  const loading = query.isLoading;
  return (
    <section aria-label="Inteligencia del negocio" className="space-y-2">
      {query.isError ? <p role="alert" className="text-xs text-muted-foreground">Datos estratégicos no disponibles. No se sustituyen por ceros.</p> : null}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryLink projectId={projectId} section="rendimiento">
          <DashboardMetric label="Clientes nuevos" value={d?.clients ? fmt(d.clients.new) : "—"} comparison={d?.clients ? delta(d.clients.new,d.clients.previous_new) : "No disponible"} icon={Users} tone="blue" isLoading={loading}/>
        </SummaryLink>
        <SummaryLink projectId={projectId} section="rendimiento">
          <DashboardMetric label="Solicitudes reales" value={rides ? fmt(rides.requested) : "—"} comparison="En el período" icon={BriefcaseBusiness} tone="cyan" isLoading={loading}/>
        </SummaryLink>
        <SummaryLink projectId={projectId} section="rendimiento">
          <DashboardMetric label="Viajes completados" value={rides ? fmt(rides.completed) : "—"} comparison={rides ? delta(rides.completed,rides.previous_completed) : "No disponible"} icon={BriefcaseBusiness} tone="emerald" isLoading={loading}/>
        </SummaryLink>
        <SummaryLink projectId={projectId} section="rendimiento">
          <DashboardMetric label="Volumen liquidado" value={d?.finance ? fmt(d.finance.cup)+" MN" : "—"} comparison="Liquidado en MN · base tarifaria USD" icon={WalletCards} tone="cyan" isLoading={loading}/>
        </SummaryLink>
      </div>

      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard density="compact" appearance="premium" module="rendimiento"
          title="Crecimiento del negocio" description="Actual frente al período anterior equivalente"
          contentClassName="p-3">
          {loading ? <p className="text-xs text-muted-foreground">Consultando…</p> : !d ? <p className="text-xs text-muted-foreground">Sin datos disponibles.</p> : <>
            <div className="h-44 min-w-0 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{top:8,right:8,left:-18,bottom:4}}>
                  <CartesianGrid stroke="var(--border-subtle)" vertical={false} strokeDasharray="3 3"/>
                  <XAxis dataKey="name" tick={{fontSize:11,fill:"var(--text-secondary)"}} interval={0} tickLine={false} axisLine={false}/>
                  <YAxis allowDecimals={false} tick={{fontSize:11,fill:"var(--text-secondary)"}} axisLine={false} tickLine={false}/>
                  <Tooltip {...adminChartTooltipProps}/>
                  <Legend wrapperStyle={{fontSize:11}}/>
                  <Bar dataKey="anterior" name="Anterior" fill="var(--semantic-inactive)" radius={[4,4,0,0]} maxBarSize={42}/>
                  <Bar dataKey="actual" name="Actual" fill="var(--primary)" radius={[4,4,0,0]} maxBarSize={42}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {appUsers && <Link to="/admin/proyectos/$id/$section" params={{id:projectId,section:"clientes"}} className="flex flex-wrap items-center gap-2 text-xs text-primary">{fmt(appUsers.total)} usuarios app · {fmt(appUsers.newCount)} nuevos <ArrowRight className="size-3"/></Link>}
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {rows.map(row=><span key={row.name}>{row.name}: <strong className="text-foreground">{fmt(row.actual)}</strong> / {fmt(row.anterior)}</span>)}
            </div>
          </>}
        </SectionCard>
        <SectionCard density="compact" appearance="premium" module="rendimiento"
          title="Conversión de viajes" description="Solicitudes del período · excluye pruebas"
          contentClassName="p-3">
          {rides && rides.requested>=rides.completed+rides.cancelled+rides.unassigned ? <HomeDonut total={rides.requested} center={conversion===null?"—":fmt(conversion)+"%"} subtitle="Completadas" rows={[{label:"Completadas",value:rides.completed,color:"#22c55e"},{label:"Canceladas",value:rides.cancelled,color:"#ef4444"},{label:"Sin asignar",value:rides.unassigned,color:"#f59e0b"},{label:"Otros estados",value:rides.requested-rides.completed-rides.cancelled-rides.unassigned,color:"#64748b"}]}/> : <p className="text-sm text-muted-foreground">Datos de carreras no disponibles.</p>}
        </SectionCard>
      </div>

      <div className="grid min-w-0 gap-2 lg:grid-cols-2">
        <SectionCard density="compact" appearance="premium" module="resumen" title="Oferta y demanda" description="Flota actual · demanda del período" contentClassName="p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border-subtle bg-surface-2/50 p-3"><Users className="size-5 text-primary"/><p className="mt-2 text-3xl font-semibold tabular-nums">{fleet?fmt(fleet.enabled):"—"}</p><p className="text-xs text-muted-foreground">Conductores habilitados</p><p className="text-xs text-muted-foreground">{fleet?fmt(fleet.total)+" registrados":"Sin datos"}</p></div>
            <div className="rounded-xl border border-border-subtle bg-surface-2/50 p-3"><BriefcaseBusiness className="size-5 text-primary"/><p className="mt-2 text-3xl font-semibold tabular-nums">{rides?fmt(rides.requested):"—"}</p><p className="text-xs text-muted-foreground">Solicitudes del período</p></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Habilitado no indica conexión ni disponibilidad real.</p>
          {fleet && <SummaryLink projectId={projectId} section="trabajos" vista="mapa"><span className="mt-2 inline-flex min-h-10 items-center gap-2 text-sm text-primary"><MapPin className="size-4"/>{fmt(fleet.inProgress)} servicios en curso · Abrir mapa</span></SummaryLink>}
        </SectionCard>
        <SectionCard density="compact" appearance="premium" module="resumen" title="Rendimiento económico" description="Base tarifaria USD · importes en MN" contentClassName="p-3">
          <p className="text-3xl font-semibold tabular-nums">{d?.finance?fmt(d.finance.cup)+" MN":"—"}</p><p className="text-xs text-muted-foreground">Volumen de viajes, no ingresos de la agencia</p>
          {d?.finance && d.finance.usd>0 && <p className="text-sm">{fmt(d.finance.usd)} USD liquidados</p>}
          {d?.finance && d.finance.eur>0 && <p className="text-sm">{fmt(d.finance.eur)} EUR liquidados</p>}
          <div className="mt-3 border-t border-border-subtle pt-2"><p className="text-xs text-muted-foreground">Comisiones cobradas</p><p className="text-xl font-semibold">—</p><p className="text-xs text-muted-foreground">Sin fuente contable agregada validada.</p></div>
        </SectionCard>
      </div>
      <SectionCard density="compact" appearance="premium" module="resumen" title="Decisiones estratégicas" actions={<Link to="/admin/proyectos/$id/$section" params={{id:projectId,section:"rendimiento"}} className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary">Ver análisis <ArrowRight className="size-4"/></Link>} contentClassName="grid gap-2 p-3 lg:grid-cols-3">
        {priorities.some(p=>p.id==="cancelled"||p.id==="rides") ? <Decision title="Conversión de servicios" text="Revisar las causas de cancelación y el proceso de asignación antes de aumentar la captación." urgent/> : <Decision title="Conversión de servicios" text={!rides?"Datos de carreras no disponibles.":rides.requested===0?"Priorizar captación de solicitudes reales.":"Revisar la evolución de solicitudes y servicios completados."}/>}
        <Decision title="Activación de conductores" text={funnel?.consistent && d && d.control.activated>0 && d.control.first_ride<d.control.activated ? fmt(d.control.activated-d.control.first_ride)+" habilitados de la cohorte aún sin primera carrera liquidada. Revisar incorporación y oportunidades de servicio.":"Revisar la primera carrera de la cohorte en Analítica."}/>
        <Decision title="Crecimiento comercial" text={d?.clients && d.clients.previous_new>=5 && d.clients.new>d.clients.previous_new?"Aprovechar el crecimiento de nuevos clientes para impulsar solicitudes efectivas.":d?.clients?"Revisar la captación y su conversión en pasajeros.":"Sin datos suficientes de clientes."}/>
      </SectionCard>
    </section>
  );
}

function Decision({title,text,urgent=false}:{title:string;text:string;urgent?:boolean}){
  return <div className="flex gap-2 rounded-lg border border-border-subtle bg-surface-2/50 p-3"><AlertTriangle className={cn("mt-0.5 size-4 shrink-0",urgent?"text-[var(--semantic-danger)]":"text-primary")} aria-hidden="true"/><div className="min-w-0"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{text}</p></div></div>;
}
function HomeDonut({total,center,subtitle,rows}:{total:number;center:string;subtitle:string;rows:{label:string;value:number;color:string}[]}){
  let offset=0;
  return <div className="grid min-w-0 items-center gap-3 sm:grid-cols-2">
    <svg viewBox="0 0 140 140" className="mx-auto w-full max-w-[200px]" role="img" aria-label={rows.map(r=>r.label+": "+r.value).join(", ")}>
      <circle cx="70" cy="70" r="53" fill="none" stroke="var(--border-default)" strokeWidth="18"/>
      {total>0&&rows.map(r=>{const share=r.value*100/total,start=offset;offset+=share;return share>0?<circle key={r.label} cx="70" cy="70" r="53" fill="none" stroke={r.color} strokeWidth="18" pathLength="100" strokeDasharray={share+" 100"} strokeDashoffset={-start} transform="rotate(-90 70 70)"/>:null;})}
      <text x="70" y="70" textAnchor="middle" fill="var(--text-primary)" fontSize="23" fontWeight="600">{center}</text><text x="70" y="85" textAnchor="middle" fill="var(--text-secondary)" fontSize="10">{subtitle}</text>
    </svg>
    <div className="space-y-2">{rows.map(r=><div key={r.label} className="flex justify-between gap-2 text-xs"><span className="flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-full" style={{background:r.color}}/>{r.label}</span><strong className="tabular-nums">{r.value}</strong></div>)}<p className="text-xs text-muted-foreground">{total===0?"Sin registros":total+" en total"}</p></div>
  </div>;
}
