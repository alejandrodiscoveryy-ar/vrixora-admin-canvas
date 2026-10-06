import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
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
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { SectionCard } from "@/components/admin/SectionCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { KpiGrid } from "@/components/admin/KpiGrid";
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
    <div className="space-y-4 md:space-y-8">
      <ModuleHeader
        title="Resumen ejecutivo"
        description={`Visión general del ecosistema · ${rangeLabel}`}
        icon={TrendingUp}
        module="resumen"
        actions={
          <Badge variant="outline" className="gap-2 bg-card/50 px-3 py-1 text-xs">
            <RefreshCw
              className={`h-3 w-3 text-primary ${allLoading ? "animate-spin" : ""}`}
            />
            {buildFreshnessLabel(dataUpdatedAt, allLoading)}
          </Badge>
        }
      />

      <AdminPeriodSelector
        value={period}
        range={dateRange}
        onChange={(nextPeriod, nextRange) => {
          setPeriod(nextPeriod);
          setDateRange(nextRange);
        }}
      />

      {queryError ? (
        <PageAlert tone="error" title="No fue posible actualizar el resumen">
          {friendlyError(queryError)}
        </PageAlert>
      ) : null}

      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-foreground)]">
            Estado actual
          </p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">
            Indicadores principales
          </h2>
        </div>

        <KpiGrid columns={4} density="compact">
          <MetricCard
            label="Usuarios app"
            value={allLoading ? "Cargando..." : users.length}
            comparison={`${newUsersPeriod} nuevos en el período`}
            icon={Users}
            module="resumen"
            isLoading={usersApp.isLoading}
          />

          <MetricCard
            label="Conductores"
            value={overview?.driversTotal ?? 0}
            comparison={`${overview?.driversActive ?? 0} activos`}
            icon={Users}
            semanticState="info"
            isLoading={marketplace.isLoading}
          />

          <MetricCard
            label="Trabajos publicados"
            value={overview?.jobsPublished ?? 0}
            comparison={`${overview?.jobsActive ?? 0} activos ahora`}
            icon={BriefcaseBusiness}
            module="resumen"
            isLoading={marketplace.isLoading}
          />

          <MetricCard
            label="Incidencias abiertas"
            value={overview?.jobsIncidentOpen ?? 0}
            comparison={`${overview?.jobsIncidentResolved ?? 0} resueltas`}
            icon={AlertTriangle}
            semanticState={
              (overview?.jobsIncidentOpen ?? 0) > 0 ? "warning" : "success"
            }
            isLoading={marketplace.isLoading}
          />

          <MetricCard
            label="Leads del período"
            value={periodLeads.length}
            comparison={`${contactedLeads} contactados`}
            icon={Megaphone}
            module="comercial"
            isLoading={commercialLeads.isLoading}
          />

          <MetricCard
            label="Registrados"
            value={registeredLeads}
            comparison={`${interestedLeads} interesados`}
            icon={Users}
            semanticState="success"
            isLoading={commercialLeads.isLoading}
          />

          <MetricCard
            label="Conversión a registro"
            value={conversionRate === null ? "Sin datos" : `${conversionRate}%`}
            comparison={
              conversionRate === null
                ? "No hay leads en el período"
                : `${registeredLeads} de ${periodLeads.length} leads`
            }
            icon={TrendingUp}
            module="resumen"
            isLoading={commercialLeads.isLoading}
          />

          <MetricCard
            label="Recargas pendientes"
            value={overview?.pendingTopups ?? 0}
            comparison="Operación financiera Marketplace"
            icon={WalletCards}
            semanticState={
              (overview?.pendingTopups ?? 0) > 0 ? "warning" : "success"
            }
            isLoading={marketplace.isLoading}
          />
        </KpiGrid>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Captación"
          description="Recorrido comercial durante el período seleccionado"
          module="comercial"
        >
          {periodLeads.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
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
            <EmptyState
              icon={Megaphone}
              title="Sin captación en el período"
              description="No hay leads comerciales registrados en las fechas seleccionadas."
              module="comercial"
              className="min-h-48"
            />
          )}
        </SectionCard>

        <SectionCard
          title="Operación Marketplace"
          description="Situación operativa actual"
          module="resumen"
        >
          {canViewMarketplace ? (
            <div className="grid gap-3 sm:grid-cols-2">
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
            <EmptyState
              icon={BriefcaseBusiness}
              title="Sin acceso a Marketplace"
              description="No tienes permisos para consultar los indicadores operativos."
              module="resumen"
              className="min-h-48"
            />
          )}
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        {canViewAudit ? (
          <SectionCard
            title="Actividad reciente"
            description="Últimos movimientos administrativos"
            module="resumen"
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
            {recentActivity.length ? (
              <ol className="divide-y divide-border-subtle">
                {recentActivity.map((event) => (
                  <li
                    key={event.id}
                    className="flex gap-3 py-3 first:pt-0 last:pb-0"
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
              <EmptyState
                icon={Activity}
                title="Sin actividad reciente"
                description="Los próximos movimientos auditados aparecerán aquí."
                module="resumen"
                className="min-h-48"
              />
            )}
          </SectionCard>
        ) : null}

        <div className="space-y-4">
          <SectionCard
            title="Accesos rápidos"
            module="resumen"
            contentClassName="grid gap-2"
          >
            <Button asChild variant="subtle" className="justify-start">
              <Link
                to="/admin/proyectos/$id/$section"
                params={{ id, section: "trabajos" }}
              >
                <BriefcaseBusiness className="h-4 w-4" />
                Operación Marketplace
              </Link>
            </Button>

            <Button asChild variant="outline" className="justify-start">
              <Link
                to="/admin/proyectos/$id/$section"
                params={{ id, section: "clientes" }}
              >
                <Users className="h-4 w-4" />
                Usuarios app
              </Link>
            </Button>

            <Button asChild variant="outline" className="justify-start">
              <Link
                to="/admin/proyectos/$id/$section"
                params={{ id, section: "comercial" }}
              >
                <Megaphone className="h-4 w-4" />
                Comercial
              </Link>
            </Button>

            <Button asChild variant="outline" className="justify-start">
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
            <SectionCard
              title="Requiere atención"
              module="resumen"
              contentClassName="space-y-2"
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
  );
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
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-secondary">{description}</p>
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