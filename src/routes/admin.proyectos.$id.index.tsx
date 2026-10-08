import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  type LucideIcon,
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Gauge,
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
    <div className="space-y-3.5 md:space-y-4">
      <section className="relative overflow-hidden rounded-[24px] border border-cyan-400/15 bg-gradient-to-r from-cyan-500/[0.075] via-background/72 to-emerald-500/[0.035] px-4 py-3.5 shadow-[0_22px_64px_-46px_rgba(34,211,238,0.75)] backdrop-blur-xl sm:px-5">
        <img
          src="/admin-premium/overview.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-1/2 hidden h-44 w-[34%] -translate-y-1/2 object-cover object-right opacity-[0.09] mix-blend-screen lg:block"
        />

        <div className="pointer-events-none absolute -left-20 -top-24 h-48 w-48 rounded-full bg-cyan-400/[0.06] blur-3xl" />

        <div className="relative flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/[0.09] text-cyan-200 shadow-[0_0_26px_-14px_rgba(34,211,238,0.95)]">
                <Gauge className="h-4 w-4" />
              </div>

              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-300/85">
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

            <span className="hidden rounded-full border border-white/10 bg-background/45 px-3 py-1.5 text-[10px] text-muted-foreground lg:inline-flex">
              {rangeLabel}
            </span>

            <Badge
              variant="outline"
              className="w-fit gap-2 border-cyan-400/20 bg-cyan-500/[0.07] px-3 py-1.5 text-[10px] shadow-inner shadow-cyan-500/[0.03]"
            >
              <RefreshCw
                className={`h-3 w-3 text-cyan-300 ${allLoading ? "animate-spin" : ""}`}
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
        <SectionCard
          title="Captación"
          description="Recorrido comercial del período seleccionado"
          module="comercial"
          className="border-violet-400/14 bg-gradient-to-br from-violet-500/[0.045] via-surface-1 to-background/55 shadow-[0_20px_58px_-46px_rgba(139,92,246,0.8)]"
          headerClassName="px-4 py-3 sm:px-4"
          contentClassName="p-3 sm:p-4"
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
              className="min-h-[116px] py-3"
            />
          )}
        </SectionCard>

        <SectionCard
          title="Operación Marketplace"
          description="Situación operativa actual"
          module="resumen"
          className="border-cyan-400/14 bg-gradient-to-br from-cyan-500/[0.045] via-surface-1 to-background/55 shadow-[0_20px_58px_-46px_rgba(34,211,238,0.75)]"
          headerClassName="px-4 py-3 sm:px-4"
          contentClassName="p-3 sm:p-4"
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
              className="min-h-[116px] py-3"
            />
          )}
        </SectionCard>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        {canViewAudit ? (
          <SectionCard
            title="Actividad reciente"
            description="Últimos movimientos administrativos"
            module="resumen"
            className="border-cyan-400/12 bg-gradient-to-br from-cyan-500/[0.03] via-surface-1 to-background/50"
            headerClassName="px-4 py-3 sm:px-4"
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
            {recentActivity.length ? (
              <ol className="divide-y divide-border-subtle">
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
              <EmptyState
                icon={Activity}
                title="Sin actividad reciente"
                description="Los próximos movimientos auditados aparecerán aquí."
                module="resumen"
                className="min-h-[116px] py-3"
              />
            )}
          </SectionCard>
        ) : null}

        <div className="space-y-4">
          <SectionCard
            title="Accesos rápidos"
            module="resumen"
            className="border-cyan-400/12 bg-gradient-to-br from-cyan-500/[0.035] via-surface-1 to-background/50"
            headerClassName="px-4 py-3 sm:px-4"
            contentClassName="grid gap-2 p-3 sm:p-3"
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
              className="border-amber-400/18 bg-gradient-to-br from-amber-500/[0.05] via-surface-1 to-background/50"
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
  );
}

type DashboardTone =
  | "cyan"
  | "blue"
  | "emerald"
  | "rose"
  | "violet"
  | "amber";

const dashboardToneClasses: Record<
  DashboardTone,
  { shell: string; icon: string; glow: string }
> = {
  cyan: {
    shell:
      "border-cyan-400/16 bg-gradient-to-br from-cyan-500/[0.065] via-background/64 to-background/48",
    icon: "border-cyan-400/20 bg-cyan-500/[0.08] text-cyan-300",
    glow: "bg-cyan-400/[0.065]",
  },
  blue: {
    shell:
      "border-sky-400/16 bg-gradient-to-br from-sky-500/[0.065] via-background/64 to-background/48",
    icon: "border-sky-400/20 bg-sky-500/[0.08] text-sky-300",
    glow: "bg-sky-400/[0.065]",
  },
  emerald: {
    shell:
      "border-emerald-400/16 bg-gradient-to-br from-emerald-500/[0.065] via-background/64 to-background/48",
    icon: "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-300",
    glow: "bg-emerald-400/[0.065]",
  },
  rose: {
    shell:
      "border-rose-400/18 bg-gradient-to-br from-rose-500/[0.07] via-background/64 to-background/48",
    icon: "border-rose-400/20 bg-rose-500/[0.08] text-rose-300",
    glow: "bg-rose-400/[0.07]",
  },
  violet: {
    shell:
      "border-violet-400/16 bg-gradient-to-br from-violet-500/[0.065] via-background/64 to-background/48",
    icon: "border-violet-400/20 bg-violet-500/[0.08] text-violet-300",
    glow: "bg-violet-400/[0.065]",
  },
  amber: {
    shell:
      "border-amber-400/18 bg-gradient-to-br from-amber-500/[0.07] via-background/64 to-background/48",
    icon: "border-amber-400/20 bg-amber-500/[0.08] text-amber-300",
    glow: "bg-amber-400/[0.07]",
  },
};

function DashboardMetric({
  label,
  value,
  comparison,
  icon: Icon,
  tone,
  isLoading,
}: {
  label: string;
  value: number | string;
  comparison: string;
  icon: LucideIcon;
  tone: DashboardTone;
  isLoading: boolean;
}) {
  const palette = dashboardToneClasses[tone];

  return (
    <article
      className={`group relative min-h-[106px] overflow-hidden rounded-[20px] border px-3.5 py-3 shadow-[0_18px_50px_-42px_rgba(0,0,0,0.95)] transition duration-200 hover:-translate-y-0.5 ${palette.shell}`}
    >
      <div
        className={`pointer-events-none absolute -right-9 -top-10 h-24 w-24 rounded-full blur-3xl ${palette.glow}`}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
            {label}
          </p>

          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${palette.icon}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-2">
          {isLoading ? (
            <div className="h-7 w-14 animate-pulse rounded-lg bg-white/[0.06]" />
          ) : (
            <p className="font-mono text-2xl font-bold leading-none tracking-tight text-foreground">
              {value}
            </p>
          )}

          <p className="mt-2 truncate text-[11px] text-muted-foreground">
            {comparison}
          </p>
        </div>
      </div>
    </article>
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
    <div className="group relative overflow-hidden rounded-[16px] border border-white/[0.075] bg-background/38 px-3.5 py-3 shadow-[0_14px_34px_-28px_rgba(0,0,0,0.95)] transition duration-200 hover:border-white/15 hover:bg-background/48">
      <div className="pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-full bg-cyan-400/[0.035] blur-2xl" />
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