import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  type LucideIcon,
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CarFront,
  CheckCircle2,
  Clock3,
  ChevronDown,
  Gauge,
  MapPin,
  MapPinOff,
  Megaphone,
  RefreshCw,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";

import { supabaseServices } from "@/lib/services";
import { getSupabaseClient } from "@/lib/supabase";
import { parseAgencyVitality } from "@/lib/agency-vitality";
import { OperationalSummaryPriorities } from "@/features/admin/OperationalSummaryPriorities";
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
  const canViewPayments = permissions.includes("payments.view");
  const canViewAnalytics = permissions.includes("analytics.view");

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

  // Reutiliza los mismos contratos y claves de caché que Pulso; no se infiere
  // disponibilidad a partir de perfiles habilitados ni de GPS sin actualizar.
  const radar = useQuery({
    queryKey: ["marketplace-radar-readiness", id],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_radar_readiness", {
        target_project_id: id,
      });
      if (error) throw error;
      if (!data || typeof data !== "object") throw new Error("RADAR_UNAVAILABLE");
      const row = data as Record<string, unknown>;
      for (const field of ["working", "gps_recent", "gps_missing"]) {
        if (typeof row[field] !== "number" || !Number.isFinite(row[field]) || Number(row[field]) < 0) {
          throw new Error("RADAR_INVALID");
        }
      }
      return { working: Number(row.working), gpsRecent: Number(row.gps_recent), gpsMissing: Number(row.gps_missing) };
    },
    enabled: !permissionsLoading && canViewMarketplace,
    refetchInterval: REFRESH_INTERVAL,
    staleTime: 10_000,
    retry: 1,
  });

  const cubaToday = dateInCuba(new Date());
  const cubaWeekStart = dateInCuba(new Date(Date.now() - 6 * 86_400_000));
  const vitality = useQuery({
    queryKey: ["agency-vitality-v1", id, cubaWeekStart, cubaToday],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_get_agency_vitality_v1", {
        target_project_id: id, target_from: cubaWeekStart, target_to: cubaToday,
      });
      if (error) throw error;
      return parseAgencyVitality(data);
    },
    enabled: !permissionsLoading && canViewMarketplace && canViewAnalytics,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
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
    usersApp, marketplace, radar, vitality, commercialLeads, audit,
  ].find((query) => query.isError)?.error;

  const allLoading = [
    usersApp, marketplace, radar, vitality, commercialLeads, audit,
  ].some((query) => query.isLoading);

  const dataUpdatedAt = Math.max(
    usersApp.dataUpdatedAt, marketplace.dataUpdatedAt, radar.dataUpdatedAt,
    vitality.dataUpdatedAt, commercialLeads.dataUpdatedAt, audit.dataUpdatedAt,
  );

  const overview = marketplace.data;
  const rides = vitality.data?.rides ?? null;
  const newClients = vitality.data?.clients?.new ?? null;
  const operating = radar.data ?? null;
  const operationalLoading = marketplace.isLoading || radar.isLoading || (canViewAnalytics && vitality.isLoading);
  const operationalIncomplete = marketplace.isError || radar.isError || (canViewAnalytics && vitality.isError);
  const countOrDash = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : value;
  const recentActivity = (audit.data ?? []).slice(0, 7);

  return (
    <>

      <div className="space-y-3 sm:hidden" aria-label="Panel general móvil">
        <header className={cn("rounded-[var(--radius-card)] border p-3", premiumHeaderSurface)}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">VRIXORA · Panel general</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-foreground">Resumen operativo</h1>
            <span className={cn("shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium",
              queryError ? "border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] text-[var(--semantic-warning-foreground)]" :
              "border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] text-[var(--semantic-success-foreground)]")}>
              {allLoading ? "Consultando" : queryError ? "Datos parciales" : dataUpdatedAt ? "Actualizado" : "Sin datos"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{buildFreshnessLabel(dataUpdatedAt, allLoading)}</p>
        </header>
        {queryError ? <PageAlert tone="error" title="Error al actualizar">{friendlyError(queryError)}</PageAlert> : null}
        <section className="grid grid-cols-2 gap-2" aria-label="Indicadores principales">
          {canViewMarketplace ? (
            <>
              <MobileDashboardStat label="Sin conductor" value={countOrDash(overview?.jobsPublished)} note="Esperando asignación" icon={Clock3} loading={marketplace.isLoading} warning={(overview?.jobsPublished ?? 0) > 0} />
              <MobileDashboardStat label="En servicio" value={countOrDash(overview?.jobsActive)} note="Carreras en curso" icon={BriefcaseBusiness} loading={marketplace.isLoading} />
              <MobileDashboardStat label="Trabajando" value={countOrDash(operating?.working)} note="Jornada y aceptación activas" icon={CarFront} loading={radar.isLoading} />
              <MobileDashboardStat label="Incidencias" value={countOrDash(overview?.jobsIncidentOpen)} note="Sin resolver" icon={AlertTriangle} loading={marketplace.isLoading} warning={(overview?.jobsIncidentOpen ?? 0) > 0} />
            </>
          ) : canViewUsers ? (
            <MobileDashboardStat label="Usuarios app" value={usersApp.isError ? "—" : users.length} note={String(newUsersPeriod) + " nuevos en el período"} icon={Users} loading={usersApp.isLoading} />
          ) : null}
        </section>
        {canViewMarketplace ? (
          <OperationalSummaryPriorities
            projectId={id}
            waiting={overview?.jobsPublished ?? null}
            incidents={overview?.jobsIncidentOpen ?? null}
            topups={canViewPayments ? overview?.pendingTopups ?? null : null}
            gpsMissing={operating?.gpsMissing ?? null}
            cancellations={rides ? { requested: rides.requested, cancelled: rides.cancelled } : null}
            loading={operationalLoading}
            incomplete={operationalIncomplete}
          />
        ) : null}
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
                <section className="space-y-2" aria-label="Cobertura y resultados">
                  <p className="text-xs font-semibold text-primary">Cobertura actual</p>
                  <div className="grid grid-cols-2 gap-2">
                    <MobileDashboardStat label="GPS reciente" value={countOrDash(operating?.gpsRecent)} note="Ubicación en últimos 5 min" icon={MapPin} loading={radar.isLoading} />
                    <MobileDashboardStat label="GPS antiguo" value={countOrDash(operating?.gpsMissing)} note="Siguen trabajando" icon={MapPinOff} loading={radar.isLoading} warning={(operating?.gpsMissing ?? 0) > 0} />
                    <MobileDashboardStat label="Habilitados" value={countOrDash(overview?.driversActive)} note="No equivale a trabajando" icon={Users} loading={marketplace.isLoading} />
                    {canViewPayments ? <MobileDashboardStat label="Recargas pendientes" value={countOrDash(overview?.pendingTopups)} note="Sin verificar, no ingresos" icon={WalletCards} loading={marketplace.isLoading} warning={(overview?.pendingTopups ?? 0) > 0} /> :
                      <MobileDashboardStat label="Suspendidos" value={countOrDash(overview?.driversSuspended)} note="Conductores" icon={AlertTriangle} loading={marketplace.isLoading} />}
                  </div>
                  {canViewAnalytics ? (
                    <>
                      <p className="pt-1 text-xs font-semibold text-primary">Resultados · 7 fechas en Cuba</p>
                      <div className="grid grid-cols-2 gap-2">
                        <MobileDashboardStat label="Solicitadas" value={countOrDash(rides?.requested)} note="Carreras reales" icon={CarFront} loading={vitality.isLoading} />
                        <MobileDashboardStat label="Completadas" value={countOrDash(rides?.completed)} note="Incluye liquidadas" icon={CheckCircle2} loading={vitality.isLoading} />
                        <MobileDashboardStat label="Canceladas" value={countOrDash(rides?.cancelled)} note={rides?.requested ? Math.round((rides.cancelled / rides.requested) * 100) + "% de solicitudes" : "Sin tasa calculable"} icon={AlertTriangle} loading={vitality.isLoading} warning={(rides?.cancelled ?? 0) > 0} />
                        <MobileDashboardStat label="Clientes nuevos" value={countOrDash(newClients)} note="Registrados en el período" icon={Users} loading={vitality.isLoading} />
                        {canViewPayments && vitality.data?.finance ? (
                          <div className="col-span-2">
                            <MobileDashboardStat label="Valor de carreras liquidadas" value={formatCUP(vitality.data.finance.cup)} note="Importe en CUP · no ingreso de la agencia" icon={WalletCards} loading={vitality.isLoading} />
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : <p className="text-xs text-text-secondary">El histórico de carreras y clientes requiere permiso de Analítica.</p>}
                  {canViewUsers ? <p className="text-xs text-text-secondary">Usuarios app registrados: {usersApp.isError ? "—" : users.length}. Nuevos en el período comercial: {usersApp.isError ? "—" : newUsersPeriod}.</p> : null}
                </section>
              ) : null}
              {canViewCommercial ? (
                <section className="space-y-2" aria-label="Captación comercial">
                  <p className="text-xs font-semibold text-[var(--module-comercial)]">Captación del período</p>
                  <div className="max-w-full overflow-x-auto">
                    <AdminPeriodSelector appearance="premium" value={period} range={dateRange} onChange={(nextPeriod, nextRange) => { setPeriod(nextPeriod); setDateRange(nextRange); }} />
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

          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center xl:justify-end">
            <AdminPeriodSelector appearance="premium"
              value={period}
              range={dateRange}
              onChange={(nextPeriod, nextRange) => {
                setPeriod(nextPeriod);
                setDateRange(nextRange);
              }}
            />

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

      <section className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de gestión del negocio">
        {canViewMarketplace ? (
          <>
            <DashboardMetric label="Sin conductor" value={countOrDash(overview?.jobsPublished)} comparison="Carreras publicadas y vigentes" icon={Clock3} tone="amber" isLoading={marketplace.isLoading} />
            <DashboardMetric label="En servicio" value={countOrDash(overview?.jobsActive)} comparison="Carreras activas ahora" icon={BriefcaseBusiness} tone="emerald" isLoading={marketplace.isLoading} />
            <DashboardMetric label="Conductores trabajando" value={countOrDash(operating?.working)} comparison="Jornada y aceptación activas" icon={CarFront} tone="blue" isLoading={radar.isLoading} />
            <DashboardMetric label="Incidencias abiertas" value={countOrDash(overview?.jobsIncidentOpen)} comparison="Necesitan seguimiento" icon={AlertTriangle} tone={(overview?.jobsIncidentOpen ?? 0) > 0 ? "rose" : "emerald"} isLoading={marketplace.isLoading} />
            {canViewAnalytics ? (
              <>
                <DashboardMetric label="Solicitadas · 7 fechas" value={countOrDash(rides?.requested)} comparison="Carreras reales en Cuba" icon={CarFront} tone="cyan" isLoading={vitality.isLoading} />
                <DashboardMetric label="Completadas · 7 fechas" value={countOrDash(rides?.completed)} comparison="Incluye las liquidadas" icon={CheckCircle2} tone="emerald" isLoading={vitality.isLoading} />
                <DashboardMetric label="Canceladas · 7 fechas" value={countOrDash(rides?.cancelled)} comparison={rides?.requested ? Math.round(rides.cancelled / rides.requested * 100) + "% de solicitudes" : "Sin tasa calculable"} icon={AlertTriangle} tone={(rides?.cancelled ?? 0) > 0 ? "amber" : "blue"} isLoading={vitality.isLoading} />
                {vitality.data?.clients ? <DashboardMetric label="Clientes nuevos · 7 fechas" value={countOrDash(newClients)} comparison="Registrados en Cuba" icon={Users} tone="violet" isLoading={vitality.isLoading} /> : null}
              </>
            ) : null}
            {canViewPayments ? <DashboardMetric label="Recargas por verificar" value={countOrDash(overview?.pendingTopups)} comparison="No son ingresos confirmados" icon={WalletCards} tone={(overview?.pendingTopups ?? 0) > 0 ? "amber" : "emerald"} isLoading={marketplace.isLoading} /> : null}
          </>
        ) : (
          <>
            {canViewUsers ? <DashboardMetric label="Usuarios app" value={usersApp.isError ? "—" : users.length} comparison={`${newUsersPeriod} nuevos en el período`} icon={Users} tone="cyan" isLoading={usersApp.isLoading} /> : null}
            {canViewCommercial ? (
              <>
                <DashboardMetric label="Leads del período" value={commercialLeads.isError ? "—" : periodLeads.length} comparison={`${contactedLeads} contactados`} icon={Megaphone} tone="violet" isLoading={commercialLeads.isLoading} />
                <DashboardMetric label="Registrados" value={commercialLeads.isError ? "—" : registeredLeads} comparison={`${interestedLeads} interesados`} icon={Users} tone="emerald" isLoading={commercialLeads.isLoading} />
                <DashboardMetric label="Conversión a registro" value={commercialLeads.isError || conversionRate === null ? "—" : `${conversionRate}%`} comparison={conversionRate === null ? "Sin leads en el período" : `${registeredLeads} de ${periodLeads.length} leads`} icon={TrendingUp} tone="cyan" isLoading={commercialLeads.isLoading} />
              </>
            ) : null}
          </>
        )}
      </section>

      {canViewMarketplace ? (
        <OperationalSummaryPriorities
          projectId={id}
          waiting={overview?.jobsPublished ?? null}
          incidents={overview?.jobsIncidentOpen ?? null}
          topups={canViewPayments ? overview?.pendingTopups ?? null : null}
          gpsMissing={operating?.gpsMissing ?? null}
          cancellations={rides ? { requested: rides.requested, cancelled: rides.cancelled } : null}
          loading={operationalLoading}
          incomplete={operationalIncomplete}
        />
      ) : null}

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
            <EmptyState density="compact" appearance="premium"
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
              <SummaryItem label="Perfiles habilitados" value={countOrDash(overview?.driversActive)} description="No equivale a trabajando" />
              <SummaryItem label="GPS reciente" value={countOrDash(operating?.gpsRecent)} description="Ubicación actualizada en 5 min" />
              <SummaryItem label="GPS sin actualizar" value={countOrDash(operating?.gpsMissing)} description="Siguen trabajando; revisar señal" />
              <SummaryItem label="Conductores suspendidos" value={countOrDash(overview?.driversSuspended)} description="No disponibles para nuevas carreras" />
              {canViewPayments && vitality.data?.finance ? (
                <div className="sm:col-span-2">
                  <SummaryItem label="Valor de carreras liquidadas · 7 fechas" value={formatCUP(vitality.data.finance.cup)} description="Importe en CUP, no ingreso ni comisión de la agencia" />
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState density="compact" appearance="premium"
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
              <EmptyState density="compact" appearance="premium"
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