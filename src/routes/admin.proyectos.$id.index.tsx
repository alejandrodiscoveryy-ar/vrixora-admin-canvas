import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  type LucideIcon,
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  ChevronDown,
  Gauge,
  MapPin,
  Megaphone,
  RefreshCw,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";

import { supabaseServices } from "@/lib/services";
import { useProjectPermissions } from "@/hooks/useProjects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePersistentAnalyticsDateRange } from "@/components/admin/AnalyticsDateRange";
import { AdminPeriodSelector } from "@/components/admin/AdminPeriodSelector";
import type { AdminPeriodKey } from "@/components/admin/admin-period";


import { SectionCard } from "@/components/admin/SectionCard";
import { MetricCard } from "@/components/admin/MetricCard";
import { premiumSurface, premiumHeaderSurface } from "@/components/admin/density";
import { cn } from "@/lib/utils";
import type { AdminModuleKey, SemanticState } from "@/components/admin/types";
import { EmptyState } from "@/components/admin/EmptyState";

import { PageAlert } from "@/components/admin/PageAlert";

export const Route = createFileRoute("/admin/proyectos/$id/")({
  component: ResumenPage,
});

const REFRESH_INTERVAL = 30_000;

function ResumenPage() {
  const { id } = Route.useParams();
  const { data: permissions = [], isLoading: permissionsLoading } =
    useProjectPermissions(id);

  const canViewUsers = permissions.includes("customers.view");
  const canViewMarketplace = permissions.includes("marketplace.view");
  const canViewCommercial = permissions.includes("commercial.view");
  const canViewAudit = permissions.includes("audit.view");

  const [dateRange, setDateRange] = usePersistentAnalyticsDateRange(
    `vrixora:summary-range:${id}`,
  );
  const [period, setPeriod] = useState<AdminPeriodKey>("7d");

  const usersApp = useQuery({
    queryKey: ["admin-clients", id],
    queryFn: () => supabaseServices.licenses.listClients(id),
    enabled: !permissionsLoading && canViewUsers,
    refetchInterval: REFRESH_INTERVAL,
  });

  const marketplace = useQuery({
    queryKey: ["marketplace-overview", id],
    queryFn: () => supabaseServices.marketplace.overview(id),
    enabled: !permissionsLoading && canViewMarketplace,
    refetchInterval: REFRESH_INTERVAL,
  });

  const commercialLeads = useQuery({
    queryKey: ["commercial-leads", id],
    queryFn: () => supabaseServices.commercial.listLeads(id),
    enabled: !permissionsLoading && canViewCommercial,
    refetchInterval: REFRESH_INTERVAL,
  });

  const audit = useQuery({
    queryKey: ["admin-audit", id],
    queryFn: () => supabaseServices.audit.list(id, 30),
    enabled: !permissionsLoading && canViewAudit,
    refetchInterval: REFRESH_INTERVAL,
  });

  const range = useMemo(
    () => ({
      start: new Date(`${dateRange.from}T00:00:00`),
      end: new Date(`${dateRange.to}T23:59:59.999`),
    }),
    [dateRange.from, dateRange.to],
  );

  const users = useMemo(() => usersApp.data ?? [], [usersApp.data]);
  const leads = useMemo(() => commercialLeads.data ?? [], [commercialLeads.data]);

  const newUsersPeriod = users.filter((user) => {
    const createdAt = new Date(user.registeredAt).getTime();
    return createdAt >= range.start.getTime() && createdAt <= range.end.getTime();
  }).length;

  const periodLeads = leads.filter((lead) => {
    if (lead.archivedAt) return false;
    const createdAt = new Date(lead.createdAt).getTime();
    return createdAt >= range.start.getTime() && createdAt <= range.end.getTime();
  });

  const contactedLeads = periodLeads.filter(
    (lead) =>
      Boolean(lead.lastInteractionAt) ||
      ["contacted", "interested", "trial", "ready_to_charge", "customer"].includes(
        lead.status,
      ),
  ).length;

  const interestedLeads = periodLeads.filter((lead) =>
    ["interested", "trial", "ready_to_charge", "customer"].includes(lead.status),
  ).length;

  const registeredLeads = periodLeads.filter(
    (lead) => lead.registered || lead.status === "customer",
  ).length;

  const conversionRate =
    periodLeads.length > 0
      ? Math.round((registeredLeads / periodLeads.length) * 100)
      : null;

  const queryError = [
    usersApp,
    marketplace,
    commercialLeads,
    audit,
  ].find((query) => query.isError)?.error;

  const allLoading = [
    usersApp,
    marketplace,
    commercialLeads,
    audit,
  ].some((query) => query.isLoading);

  const dataUpdatedAt = Math.max(
    usersApp.dataUpdatedAt,
    marketplace.dataUpdatedAt,
    commercialLeads.dataUpdatedAt,
    audit.dataUpdatedAt,
  );

  const overview = marketplace.data;
  const recentActivity = (audit.data ?? []).slice(0, 7);

  const pendingTopups = overview?.pendingTopups ?? 0;
  const openIncidents = overview?.jobsIncidentOpen ?? 0;
  const suspendedDrivers = overview?.driversSuspended ?? 0;
  const hasPendingActions = pendingTopups > 0 || openIncidents > 0 || suspendedDrivers > 0;

  return (
    <div className="min-w-0 space-y-3 md:space-y-4" aria-label="Panel estratégico de TukTuk">
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
            <p className="mt-1 text-xs text-muted-foreground">Prioridades, operación y crecimiento en una sola vista.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <AdminPeriodSelector
              appearance="premium"
              value={period}
              range={dateRange}
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
          Las fechas filtran altas y captación comercial. Conductores e incidencias reflejan el estado actual; trabajos publicados es acumulado.
        </p>
      </header>

      {queryError ? (
        <PageAlert tone="error" title="No fue posible actualizar todo el resumen">
          {friendlyError(queryError)}
        </PageAlert>
      ) : null}

      {canViewMarketplace ? (
        <SectionCard
          density="compact"
          appearance="premium"
          title="Por atender ahora"
          description="Solo gestiones que requieren seguimiento"
          module="resumen"
          contentClassName="p-3 sm:p-4"
        >
          {marketplace.isLoading ? (
            <p className="text-sm text-muted-foreground">Consultando pendientes...</p>
          ) : marketplace.isError ? (
            <p className="text-sm text-muted-foreground">No se pueden comprobar los pendientes. Revisa la conexión.</p>
          ) : hasPendingActions ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pendingTopups > 0 ? (
                <Link
                  to="/admin/proyectos/$id/$section"
                  params={{ id, section: "trabajos" }}
                  search={{ vista: "recargas" }}
                  className="flex min-h-12 items-center gap-3 rounded-[var(--radius-compact)] border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <WalletCards className="h-4 w-4 shrink-0 text-[var(--semantic-warning)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-medium">Revisar recargas pendientes</span>
                  <Badge variant="warning" className="font-mono">{pendingTopups}</Badge>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              ) : null}
              {openIncidents > 0 ? (
                <Link
                  to="/admin/proyectos/$id/$section"
                  params={{ id, section: "trabajos" }}
                  search={{ vista: "incidencias" }}
                  className="flex min-h-12 items-center gap-3 rounded-[var(--radius-compact)] border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
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
                  className={cn("flex min-h-12 items-center gap-3 rounded-[var(--radius-compact)] border px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", premiumSurface)}
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
        </SectionCard>
      ) : null}

      <section aria-label="Indicadores principales" className="grid grid-cols-1 gap-2.5 min-[430px]:grid-cols-2 xl:grid-cols-3">
        {canViewMarketplace ? (
          <>
            <DashboardMetric
              label="Trabajos publicados"
              value={overview?.jobsPublished ?? 0}
              comparison={String(overview?.jobsActive ?? 0) + " en curso · acumulado"}
              icon={BriefcaseBusiness}
              tone="cyan"
              isLoading={marketplace.isLoading}
            />
            <DashboardMetric
              label="Conductores activos"
              value={overview?.driversActive ?? 0}
              comparison={"De " + String(overview?.driversTotal ?? 0) + " registrados · no indica conexión"}
              icon={Users}
              tone="blue"
              isLoading={marketplace.isLoading}
            />
          </>
        ) : null}
        {canViewUsers ? (
          <DashboardMetric
            label="Usuarios de la app"
            value={users.length}
            comparison={String(newUsersPeriod) + " nuevos en el período"}
            icon={Users}
            tone="emerald"
            isLoading={usersApp.isLoading}
          />
        ) : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(17rem,0.7fr)]">
        <SectionCard
          density="compact"
          appearance="premium"
          title="Lectura del negocio"
          description="Qué significan los datos para la siguiente decisión"
          module="resumen"
          contentClassName="space-y-3 p-3 sm:p-4"
        >
          {canViewMarketplace ? (
            <div className="flex gap-3">
              <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              {marketplace.isLoading ? (
                <p className="text-sm text-muted-foreground">Revisando la actividad...</p>
              ) : marketplace.isError ? (
                <p className="text-sm text-muted-foreground">La lectura operativa no está disponible por un error de carga.</p>
              ) : (overview?.jobsPublished ?? 0) === 0 ? (
                <p className="text-sm leading-relaxed text-foreground">
                  Hay conductores registrados, pero todavía no figuran trabajos publicados en este resumen.
                  La prioridad es generar y verificar solicitudes reales de pasajeros, no ampliar indicadores.
                </p>
              ) : (overview?.jobsActive ?? 0) > 0 ? (
                <p className="text-sm leading-relaxed text-foreground">
                  Hay servicios en curso. Prioriza su seguimiento y revisa las incidencias o recargas que aparecen arriba.
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-foreground">
                  Hay trabajos publicados en el histórico, pero ninguno está en curso ahora. Revisa la demanda y la conversión de solicitudes.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">El resumen de la operación solo aparece para los perfiles con permiso.</p>
          )}
          {canViewCommercial && canViewUsers ? (
            <div className="border-t border-border-subtle pt-3">
              <p className="text-sm text-foreground">
                <strong>{newUsersPeriod} nuevos usuarios</strong> de la app y <strong>{periodLeads.length} contactos comerciales</strong> registrados en el período.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Las altas de la app y los leads del seguimiento comercial son fuentes diferentes; no equivalen a pasajeros que hayan solicitado viajes.</p>
            </div>
          ) : canViewCommercial ? (
            <p className="border-t border-border-subtle pt-3 text-sm text-foreground">{periodLeads.length} contactos comerciales registrados en el período.</p>
          ) : null}
        </SectionCard>

        <SectionCard
          density="compact"
          appearance="premium"
          title="Ir a gestionar"
          description="Accesos operativos esenciales"
          module="resumen"
          contentClassName="grid gap-2 p-3 sm:p-4"
        >
          {canViewMarketplace ? (
            <>
              <Link
                to="/admin/proyectos/$id/$section"
                params={{ id, section: "trabajos" }}
                search={{ vista: "mapa" }}
                className={cn("flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-medium text-foreground hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", premiumSurface)}
              >
                <MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> Mapa en vivo <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/admin/proyectos/$id/$section"
                params={{ id, section: "trabajos" }}
                search={{ vista: "trabajos" }}
                className={cn("flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-medium text-foreground hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", premiumSurface)}
              >
                <BriefcaseBusiness className="h-4 w-4 text-primary" aria-hidden="true" /> Carreras <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          ) : null}
          {canViewCommercial ? (
            <Link
              to="/admin/proyectos/$id/$section"
              params={{ id, section: "comercial" }}
              className={cn("flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-medium text-foreground hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", premiumSurface)}
            >
              <Megaphone className="h-4 w-4 text-primary" aria-hidden="true" /> Comercial <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
          {canViewUsers ? (
            <Link
              to="/admin/proyectos/$id/$section"
              params={{ id, section: "clientes" }}
              className={cn("flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-medium text-foreground hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", premiumSurface)}
            >
              <Users className="h-4 w-4 text-primary" aria-hidden="true" /> Usuarios app <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </SectionCard>
      </div>

      {(canViewCommercial || canViewMarketplace) ? (
        <details className={cn("group overflow-hidden rounded-[var(--radius-card)] border", premiumSurface)}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-semibold text-foreground sm:px-4 [&::-webkit-details-marker]:hidden">
            Más indicadores · detalle por área
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="grid gap-3 border-t border-border-subtle p-3 lg:grid-cols-2 sm:p-4">
            {canViewCommercial ? (
              <section aria-label="Detalle comercial">
                <h2 className="mb-2 text-sm font-semibold text-foreground">Seguimiento comercial · período seleccionado</h2>
                <div className="grid grid-cols-2 gap-2">
                  <SummaryItem label="Contactos" value={periodLeads.length} description="Registrados en CRM" />
                  <SummaryItem label="Contactados" value={contactedLeads} description="Con interacción" />
                  <SummaryItem label="Interesados" value={interestedLeads} description="Según su estado" />
                  <SummaryItem label="Registrados" value={registeredLeads} description={conversionRate === null ? "Sin tasa calculable" : String(conversionRate) + "% de los contactos"} />
                </div>
              </section>
            ) : null}
            {canViewMarketplace ? (
              <section aria-label="Detalle operativo">
                <h2 className="mb-2 text-sm font-semibold text-foreground">Operación · estado actual</h2>
                <div className="grid grid-cols-2 gap-2">
                  <SummaryItem label="Conductores registrados" value={overview?.driversTotal ?? 0} description="Total histórico" />
                  <SummaryItem label="En curso" value={overview?.jobsActive ?? 0} description="Servicios actuales" />
                  <SummaryItem label="Incidencias abiertas" value={openIncidents} description="Por resolver" />
                  <SummaryItem label="Suspendidos" value={suspendedDrivers} description="Estado administrativo" />
                </div>
              </section>
            ) : null}
          </div>
        </details>
      ) : null}

      {canViewAudit ? (
        <details className={cn("group overflow-hidden rounded-[var(--radius-card)] border", premiumSurface)}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-semibold text-foreground sm:px-4 [&::-webkit-details-marker]:hidden">
            Actividad administrativa reciente
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-border-subtle p-3 sm:p-4">
            {recentActivity.length ? (
              <ol className="divide-y divide-border-subtle">
                {recentActivity.slice(0, 3).map((event) => (
                  <li key={event.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate text-foreground">{auditActionLabel(event.action)}</span>
                    <time dateTime={event.createdAt} className="text-xs text-muted-foreground">{formatActivityDate(event.createdAt)}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState density="compact" appearance="premium" icon={Activity} title="Sin actividad reciente" description="Los movimientos administrativos aparecerán aquí." module="resumen" />
            )}
            <Button asChild size="sm" variant="ghost" className="mt-2">
              <Link to="/admin/proyectos/$id/$section" params={{ id, section: "auditoria" }}>
                Ver auditoría <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </details>
      ) : null}
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
function SummaryItem({
  label,
  value,
  description,
}: {
  label: string;
  value: number | string;
  description: string;
}) {
  return (
    <div className={cn("relative min-w-0 overflow-hidden rounded-[var(--radius-compact)] border p-3", premiumSurface, "shadow-none")}>
      <div className="relative">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    insert: "Registro creado",
    update: "Registro actualizado",
    delete: "Registro eliminado",
    payment_recorded: "Pago registrado",
    payment_created: "Pago registrado",
    license_renewed: "Licencia renovada",
    license_created: "Licencia creada",
  };

  return labels[action] ?? action.replaceAll("_", " ");
}