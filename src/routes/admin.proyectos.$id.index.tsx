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
import { premiumSurface, premiumHeaderSurface, premiumControlSurface } from "@/components/admin/density";
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

  const rangeLabel = `${formatDateShort(range.start)} - ${formatDateShort(range.end)}`;

  return (
    <>

      <div className="space-y-3 sm:hidden" aria-label="Panel general móvil">
        <header className={cn("rounded-[var(--radius-card)] border p-3", premiumHeaderSurface)}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">VRIXORA · Panel general</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-foreground">Resumen operativo</h1>
            <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] text-[var(--semantic-success)]">{allLoading ? "Cargando" : "En vivo"}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{buildFreshnessLabel(dataUpdatedAt, allLoading)}</p>
        </header>
        {queryError ? <PageAlert tone="error" title="Error al actualizar">{friendlyError(queryError)}</PageAlert> : null}
        <section className="grid grid-cols-2 gap-2" aria-label="Indicadores principales">
          {canViewUsers ? <MobileDashboardStat label="Usuarios app" value={users.length} note={String(newUsersPeriod) + " nuevos"} icon={Users} loading={usersApp.isLoading} /> : null}
          {canViewMarketplace ? (
            <>
              <MobileDashboardStat label="Conductores" value={overview?.driversTotal ?? 0} note={String(overview?.driversActive ?? 0) + " activos"} icon={Users} loading={marketplace.isLoading} />
              <MobileDashboardStat label="Servicios activos" value={overview?.jobsActive ?? 0} note="En curso" icon={BriefcaseBusiness} loading={marketplace.isLoading} />
              <MobileDashboardStat label="Incidencias abiertas" value={overview?.jobsIncidentOpen ?? 0} note="Por atender" icon={AlertTriangle} loading={marketplace.isLoading} warning={(overview?.jobsIncidentOpen ?? 0) > 0} />
            </>
          ) : null}
        </section>
        <nav className="grid grid-cols-2 gap-2" aria-label="Accesos directos">
          {canViewMarketplace ? (
            <>
              <Link to="/admin/proyectos/$id/$section" params={{ id, section: "trabajos" }} search={{ vista: "mapa" }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-2 text-xs font-semibold text-primary">
                <MapPin className="h-4 w-4 shrink-0" /> Mapa en vivo
              </Link>
              <Link to="/admin/proyectos/$id/$section" params={{ id, section: "trabajos" }} search={{ vista: "trabajos" }} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border p-2 text-xs font-semibold text-foreground", premiumSurface)}>
                <BriefcaseBusiness className="h-4 w-4 shrink-0" /> Carreras
              </Link>
            </>
          ) : null}
          {canViewUsers ? <Link to="/admin/proyectos/$id/$section" params={{ id, section: "clientes" }} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border p-2 text-xs font-semibold text-foreground", premiumSurface)}><Users className="h-4 w-4 shrink-0" /> Usuarios</Link> : null}
          {canViewCommercial ? <Link to="/admin/proyectos/$id/$section" params={{ id, section: "comercial" }} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border p-2 text-xs font-semibold text-foreground", premiumSurface)}><Megaphone className="h-4 w-4 shrink-0" /> Comercial</Link> : null}
        </nav>
        {(canViewMarketplace || canViewCommercial) ? (
          <details className={cn("group overflow-hidden rounded-[var(--radius-card)] border", premiumSurface)}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">Más indicadores <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
            <div className="space-y-3 border-t border-border/50 p-3">
              {canViewMarketplace ? (
                <div className="grid grid-cols-2 gap-2">
                  <MobileDashboardStat label="Recargas pendientes" value={overview?.pendingTopups ?? 0} note="Finanzas" icon={WalletCards} loading={marketplace.isLoading} />
                  <MobileDashboardStat label="Suspendidos" value={overview?.driversSuspended ?? 0} note="Conductores" icon={AlertTriangle} loading={marketplace.isLoading} />
                  <MobileDashboardStat label="Trabajos publicados" value={overview?.jobsPublished ?? 0} note="Histórico" icon={BriefcaseBusiness} loading={marketplace.isLoading} />
                </div>
              ) : null}
              {canViewCommercial ? (
                <section className="space-y-2" aria-label="Captación comercial">
                  <p className="text-xs font-semibold text-[var(--module-comercial)]">Captación del período</p>
                  <div className="max-w-full overflow-x-auto">
                    <AdminPeriodSelector value={period} range={dateRange} onChange={(nextPeriod, nextRange) => { setPeriod(nextPeriod); setDateRange(nextRange); }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MobileDashboardStat label="Leads" value={periodLeads.length} note="Recibidos" icon={Megaphone} loading={commercialLeads.isLoading} />
                    <MobileDashboardStat label="Contactados" value={contactedLeads} note="Atendidos" icon={Users} loading={commercialLeads.isLoading} />
                    <MobileDashboardStat label="Registrados" value={registeredLeads} note="Convertidos" icon={Users} loading={commercialLeads.isLoading} />
                    <MobileDashboardStat label="Conversión" value={conversionRate === null ? "—" : String(conversionRate) + "%"} note={conversionRate === null ? "Sin leads" : "A registro"} icon={TrendingUp} loading={commercialLeads.isLoading} />
                  </div>
                </section>
              ) : null}
            </div>
          </details>
        ) : null}
        {canViewAudit ? (
          <details className={cn("group overflow-hidden rounded-[var(--radius-card)] border", premiumSurface)}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">Actividad reciente <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
            <div className="border-t border-border/50 p-3">
              {recentActivity.length ? (
                <ol className="divide-y divide-border/40">
                  {recentActivity.slice(0, 3).map((event) => (
                    <li key={event.id} className="min-w-0 py-2">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs text-foreground">{auditActionLabel(event.action)}</span>
                        <time dateTime={event.createdAt} className="shrink-0 text-[10px] text-muted-foreground">{formatActivityDate(event.createdAt)}</time>
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">{event.actorEmail ?? "Sistema"}</p>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-xs text-muted-foreground">Sin movimientos recientes.</p>}
              <Link to="/admin/proyectos/$id/$section" params={{ id, section: "auditoria" }} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">Ver auditoría completa <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </details>
        ) : null}
      </div>
      <div className="hidden sm:block">
    <div className="min-w-0">
      <div className="space-y-3 md:space-y-4">
      <section className={cn("relative overflow-hidden rounded-[var(--radius-card)] border px-3 py-3 sm:px-4", premiumHeaderSurface)}>


        <div className="relative flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/[0.09] text-primary shadow-[0_0_26px_-14px_rgba(34,211,238,0.95)]">
                <Gauge className="h-4 w-4" />
              </div>

              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/85">
                  Panel general
                </p>
                <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  Estado del negocio
                </h1>
              </div>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Operación, captación y alertas principales en una sola vista.
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center xl:justify-end">
            <AdminPeriodSelector
              value={period}
              range={dateRange}
              onChange={(nextPeriod, nextRange) => {
                setPeriod(nextPeriod);
                setDateRange(nextRange);
              }}
            />

            <span className={cn("hidden rounded-[var(--radius-control)] border px-3 py-1.5 text-xs text-text-secondary lg:inline-flex", premiumControlSurface)}>
              {rangeLabel}
            </span>

            <Badge
              variant="outline"
              className="w-fit gap-2 border-cyan-400/20 bg-cyan-500/[0.07] px-3 py-1.5 text-[10px] shadow-inner shadow-cyan-500/[0.03]"
            >
              <RefreshCw
                className={`h-3 w-3 text-primary ${allLoading ? "animate-spin" : ""}`}
              />
              {buildFreshnessLabel(dataUpdatedAt, allLoading)}
            </Badge>
          </div>
        </div>
      </section>
      {queryError ? (
        <PageAlert tone="error" title="No fue posible actualizar el resumen">
          {friendlyError(queryError)}
        </PageAlert>
      ) : null}

      <section className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <DashboardMetric
          label="Usuarios app"
          value={users.length}
          comparison={`${newUsersPeriod} nuevos en el período`}
          icon={Users}
          tone="cyan"
          isLoading={usersApp.isLoading}
        />

        <DashboardMetric
          label="Conductores"
          value={overview?.driversTotal ?? 0}
          comparison={`${overview?.driversActive ?? 0} activos`}
          icon={Users}
          tone="blue"
          isLoading={marketplace.isLoading}
        />

        <DashboardMetric
          label="Trabajos publicados"
          value={overview?.jobsPublished ?? 0}
          comparison={`${overview?.jobsActive ?? 0} activos ahora`}
          icon={BriefcaseBusiness}
          tone="emerald"
          isLoading={marketplace.isLoading}
        />

        <DashboardMetric
          label="Incidencias abiertas"
          value={overview?.jobsIncidentOpen ?? 0}
          comparison={`${overview?.jobsIncidentResolved ?? 0} resueltas`}
          icon={AlertTriangle}
          tone={(overview?.jobsIncidentOpen ?? 0) > 0 ? "rose" : "emerald"}
          isLoading={marketplace.isLoading}
        />

        <DashboardMetric
          label="Leads del período"
          value={periodLeads.length}
          comparison={`${contactedLeads} contactados`}
          icon={Megaphone}
          tone="violet"
          isLoading={commercialLeads.isLoading}
        />

        <DashboardMetric
          label="Registrados"
          value={registeredLeads}
          comparison={`${interestedLeads} interesados`}
          icon={Users}
          tone="emerald"
          isLoading={commercialLeads.isLoading}
        />

        <DashboardMetric
          label="Conversión a registro"
          value={conversionRate === null ? "Sin datos" : `${conversionRate}%`}
          comparison={
            conversionRate === null
              ? "Sin leads en el período"
              : `${registeredLeads} de ${periodLeads.length} leads`
          }
          icon={TrendingUp}
          tone="cyan"
          isLoading={commercialLeads.isLoading}
        />

        <DashboardMetric
          label="Recargas pendientes"
          value={overview?.pendingTopups ?? 0}
          comparison="Operación financiera"
          icon={WalletCards}
          tone={(overview?.pendingTopups ?? 0) > 0 ? "amber" : "emerald"}
          isLoading={marketplace.isLoading}
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <SectionCard density="compact" appearance="premium"
          title="Captación"
          description="Recorrido comercial del período seleccionado"
          module="comercial"
          className="relative isolate"
          headerClassName="relative z-10 px-4 py-3 sm:px-4"
          contentClassName="p-3 sm:p-4"
        >
          <img
            src="/admin-premium/customers.svg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 right-3 h-16 w-16 object-contain opacity-[0.06] dark:opacity-[0.07]"
          />

          {periodLeads.length ? (
            <div className="relative z-10 grid gap-3 sm:grid-cols-2">
              <SummaryItem
                label="Leads"
                value={periodLeads.length}
                description="Personas captadas"
              />
              <SummaryItem
                label="Contactados"
                value={contactedLeads}
                description="Con interacción comercial"
              />
              <SummaryItem
                label="Interesados"
                value={interestedLeads}
                description="Con interés identificado"
              />
              <SummaryItem
                label="Registrados"
                value={registeredLeads}
                description="Convertidos en usuarios"
              />
            </div>
          ) : (
            <EmptyState density="compact"
              icon={Megaphone}
              title="Sin captación en el período"
              description="No hay leads comerciales registrados en las fechas seleccionadas."
              module="comercial"
              className="relative z-10 min-h-[116px] py-3"
            />
          )}
        </SectionCard>

        <SectionCard density="compact" appearance="premium"
          title="Operación Marketplace"
          description="Situación operativa actual"
          module="resumen"
          className="relative isolate"
          headerClassName="relative z-10 px-4 py-3 sm:px-4"
          contentClassName="p-3 sm:p-4"
        >
          <img
            src="/admin-premium/operations.svg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 right-3 h-16 w-16 object-contain opacity-[0.06] dark:opacity-[0.07]"
          />

          {canViewMarketplace ? (
            <div className="relative z-10 grid gap-3 sm:grid-cols-2">
              <SummaryItem
                label="Conductores activos"
                value={overview?.driversActive ?? 0}
                description={`De ${overview?.driversTotal ?? 0} registrados`}
              />
              <SummaryItem
                label="Conductores suspendidos"
                value={overview?.driversSuspended ?? 0}
                description="Requieren control administrativo"
              />
              <SummaryItem
                label="Trabajos activos"
                value={overview?.jobsActive ?? 0}
                description="Servicios en curso"
              />
              <SummaryItem
                label="Incidencias abiertas"
                value={overview?.jobsIncidentOpen ?? 0}
                description="Pendientes de resolución"
              />
            </div>
          ) : (
            <EmptyState density="compact"
              icon={BriefcaseBusiness}
              title="Sin acceso a Marketplace"
              description="No tienes permisos para consultar los indicadores operativos."
              module="resumen"
              className="relative z-10 min-h-[116px] py-3"
            />
          )}
        </SectionCard>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        {canViewAudit ? (
          <SectionCard density="compact" appearance="premium"
            title="Actividad reciente"
            description="Últimos movimientos administrativos"
            module="resumen"
            className="relative isolate"
            headerClassName="relative z-10 px-4 py-3 sm:px-4"
            contentClassName="p-3.5 sm:p-4"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link
                  to="/admin/proyectos/$id/$section"
                  params={{ id, section: "auditoria" }}
                >
                  Ver auditoría
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          >
            <img
              src="/admin-premium/activity.svg"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 right-3 h-16 w-16 object-contain opacity-[0.06] dark:opacity-[0.07]"
            />

            {recentActivity.length ? (
              <ol className="relative z-10 divide-y divide-border-subtle">
                {recentActivity.map((event) => (
                  <li
                    key={event.id}
                    className="flex gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--module-border)] bg-[var(--module-surface)] text-[var(--module-foreground)]">
                      <Activity className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {auditActionLabel(event.action)}
                        </p>
                        <time
                          className="shrink-0 text-xs text-text-tertiary"
                          dateTime={event.createdAt}
                        >
                          {formatActivityDate(event.createdAt)}
                        </time>
                      </div>

                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {event.actorEmail ?? "Sistema"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState density="compact"
                icon={Activity}
                title="Sin actividad reciente"
                description="Los próximos movimientos auditados aparecerán aquí."
                module="resumen"
                className="relative z-10 min-h-[116px] py-3"
              />
            )}
          </SectionCard>
        ) : null}

        <div className="space-y-4">
          <SectionCard density="compact" appearance="premium"
            title="Accesos rápidos"
            module="resumen"
            className="relative isolate"
            headerClassName="relative z-10 px-4 py-3 sm:px-4"
            contentClassName="grid gap-2 p-3 sm:p-3"
          >
            <img
              src="/admin-premium/shortcuts.svg"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 right-3 h-16 w-16 object-contain opacity-[0.06] dark:opacity-[0.07]"
            />
            <Button asChild variant="subtle" className="relative z-10 justify-start">
              <Link
                to="/admin/proyectos/$id/$section"
                params={{ id, section: "trabajos" }}
              >
                <BriefcaseBusiness className="h-4 w-4" />
                Operación Marketplace
              </Link>
            </Button>

            <Button asChild variant="outline" className="relative z-10 justify-start">
              <Link
                to="/admin/proyectos/$id/$section"
                params={{ id, section: "clientes" }}
              >
                <Users className="h-4 w-4" />
                Usuarios app
              </Link>
            </Button>

            <Button asChild variant="outline" className="relative z-10 justify-start">
              <Link
                to="/admin/proyectos/$id/$section"
                params={{ id, section: "comercial" }}
              >
                <Megaphone className="h-4 w-4" />
                Comercial
              </Link>
            </Button>

            <Button asChild variant="outline" className="relative z-10 justify-start">
              <Link
                to="/admin/proyectos/$id/$section"
                params={{ id, section: "planes" }}
              >
                <TrendingUp className="h-4 w-4" />
                Tarifas
              </Link>
            </Button>
          </SectionCard>

          {canViewMarketplace &&
          ((overview?.jobsIncidentOpen ?? 0) > 0 ||
            (overview?.driversSuspended ?? 0) > 0 ||
            (overview?.pendingTopups ?? 0) > 0) ? (
            <SectionCard density="compact" appearance="premium"
              title="Requiere atención"
              module="resumen"
              className="relative isolate"
              headerClassName="px-4 py-3 sm:px-4"
              contentClassName="space-y-2 p-3 sm:p-3"
            >
              {(overview?.jobsIncidentOpen ?? 0) > 0 ? (
                <AttentionItem
                  label="Incidencias abiertas"
                  value={overview?.jobsIncidentOpen ?? 0}
                />
              ) : null}

              {(overview?.driversSuspended ?? 0) > 0 ? (
                <AttentionItem
                  label="Conductores suspendidos"
                  value={overview?.driversSuspended ?? 0}
                />
              ) : null}

              {(overview?.pendingTopups ?? 0) > 0 ? (
                <AttentionItem
                  label="Recargas pendientes"
                  value={overview?.pendingTopups ?? 0}
                />
              ) : null}
            </SectionCard>
          ) : null}
        </div>
      </section>
      </div>
    </div>
      </div>
    </>
  );
}

function MobileDashboardStat({
  label, value, note, icon: Icon, loading, warning = false,
}: {
  label: string; value: number | string; note: string; icon: LucideIcon; loading: boolean; warning?: boolean;
}) {
  return <MetricCard density="compact" appearance="premium" label={label} value={value}
    description={note} icon={Icon} isLoading={loading}
    semanticState={warning ? "warning" : "info"} />;
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

function AttentionItem({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] px-3 py-2.5">
      <span className="text-sm text-text-primary">{label}</span>
      <Badge variant="warning" className="font-mono">
        {value}
      </Badge>
    </div>
  );
}

function formatDateShort(date: Date) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
  }).format(date);
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