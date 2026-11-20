import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  Loader2,
  LogIn,
  Megaphone,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  supabaseServices,
  type CommercialSource,
  type UsageAnalyticsDay,
} from "@/lib/services";
import { adminChartTooltipProps } from "@/lib/chart-theme";
import { useProjectPermissions } from "@/hooks/useProjects";
import { usePersistentAnalyticsDateRange } from "@/components/admin/AnalyticsDateRange";
import { AdminPeriodSelector } from "@/components/admin/AdminPeriodSelector";
import {
  identifyAdminPeriod,
  type AdminPeriodKey,
} from "@/components/admin/admin-period";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileFiltersPanel,
  MobileMetricsGrid,
  type MobileMetric,
} from "@/components/admin/MobileAdminSystem";

import { MetricCard } from "@/components/admin/MetricCard";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import AgencyVitalityOverview from "@/features/admin/AgencyVitalityOverview";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { SectionCard } from "@/components/admin/SectionCard";
import { EmptyState } from "@/components/admin/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Grain = "daily" | "weekly" | "monthly";

type FilterOption = {
  value: string;
  label: string;
};

type UsageTrendRow = {
  date: string;
  newUsers: number;
  logins: number;
  label: string;
};

export default function RendimientoSection({
  projectId,
}: {
  projectId: string;
}) {
  const isMobile = useIsMobile();

  const { data: permissions = [], isLoading: permissionsLoading } =
    useProjectPermissions(projectId);

  const canViewCommercial = permissions.includes("commercial.view");
  const canViewMarketplace = permissions.includes("marketplace.view");

  const [dateRange, setDateRange] = usePersistentAnalyticsDateRange(
    `vrixora:analytics-range:${projectId}`,
  );

  const [period, setPeriod] = useState<AdminPeriodKey>(() =>
    identifyAdminPeriod(dateRange),
  );

  const [grain, setGrain] = useState<Grain>("daily");
  const [source, setSource] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [version, setVersion] = useState("all");

  const fromDate = dateRange.from;
  const toDate = dateRange.to;

  const periodDays =
    Math.max(
      1,
      Math.round(
        (new Date(`${toDate}T12:00:00`).getTime() -
          new Date(`${fromDate}T12:00:00`).getTime()) /
          86_400_000,
      ) + 1,
    );

  const analyticsFrom = isoDate(
    addDays(new Date(`${fromDate}T12:00:00`), -periodDays),
  );

  const analyticsFilters = {
    from: analyticsFrom,
    to: toDate,
    source: source === "all" ? undefined : source,
    campaign: campaign === "all" ? undefined : campaign,
    appVersion: version === "all" ? undefined : version,
  };

  const analytics = useQuery({
    queryKey: ["usage-analytics-v2", projectId, analyticsFilters],
    queryFn: () =>
      supabaseServices.usageAnalytics.series(projectId, analyticsFilters),
    refetchInterval: 30_000,
  });

  const dimensions = useQuery({
    queryKey: ["usage-analytics-dimensions", projectId],
    queryFn: () => supabaseServices.usageAnalytics.dimensions(projectId),
  });

  const retention = useQuery({
    queryKey: ["usage-retention-v2", projectId, source, campaign],
    queryFn: () =>
      supabaseServices.usageAnalytics.retention(projectId, {
        source: source === "all" ? undefined : source,
        campaign: campaign === "all" ? undefined : campaign,
      }),
  });

  const commercialLeads = useQuery({
    queryKey: ["commercial-leads", projectId],
    queryFn: () => supabaseServices.commercial.listLeads(projectId),
    enabled: !permissionsLoading && canViewCommercial,
    refetchInterval: 30_000,
  });

  const marketplace = useQuery({
    queryKey: ["marketplace-overview", projectId],
    queryFn: () => supabaseServices.marketplace.overview(projectId),
    enabled: !permissionsLoading && canViewMarketplace,
    refetchInterval: 30_000,
  });

  const allRows = useMemo(() => analytics.data ?? [], [analytics.data]);

  const current = allRows.slice(-periodDays);
  const previous = allRows.slice(-periodDays * 2, -periodDays);

  const chartRows = aggregateUsage(current, grain);

  const currentTotals = usageTotals(current);
  const previousTotals = usageTotals(previous);

  const rangeStart = new Date(`${fromDate}T00:00:00`).getTime();
  const rangeEnd = new Date(`${toDate}T23:59:59.999`).getTime();

  const periodLeads = useMemo(() => {
    return (commercialLeads.data ?? []).filter((lead) => {
      const createdAt = new Date(lead.createdAt).getTime();

      return (
        createdAt >= rangeStart &&
        createdAt <= rangeEnd &&
        (source === "all" || lead.source === source) &&
        (campaign === "all" || lead.campaign === campaign)
      );
    });
  }, [
    commercialLeads.data,
    rangeStart,
    rangeEnd,
    source,
    campaign,
  ]);

  const contactedLeads = periodLeads.filter(
    (lead) =>
      Boolean(lead.lastInteractionAt) ||
      ["contacted", "interested", "trial", "ready_to_charge", "customer"].includes(
        lead.status,
      ),
  ).length;

  const interestedLeads = periodLeads.filter((lead) =>
    ["interested", "trial", "ready_to_charge", "customer"].includes(
      lead.status,
    ),
  ).length;

  const registeredLeads = periodLeads.filter(
    (lead) => lead.registered || lead.status === "customer",
  ).length;

  const commercialConversion =
    periodLeads.length > 0
      ? Math.round((registeredLeads / periodLeads.length) * 100)
      : null;

  const sourceDistribution = useMemo(() => {
    const counts = new Map<string, number>();

    periodLeads.forEach((lead) => {
      counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([currentSource, count]) => ({
        source: sourceLabel(currentSource as CommercialSource),
        count,
      }))
      .sort((left, right) => right.count - left.count);
  }, [periodLeads]);

  const overview = marketplace.data;

  const activeFilterCount = [source, campaign, version].filter(
    (value) => value !== "all",
  ).length;

  const isLoading =
    permissionsLoading ||
    analytics.isLoading ||
    dimensions.isLoading ||
    retention.isLoading ||
    (canViewCommercial && commercialLeads.isLoading) ||
    (canViewMarketplace && marketplace.isLoading);

  const error =
    analytics.error ||
    dimensions.error ||
    retention.error ||
    (canViewCommercial ? commercialLeads.error : null) ||
    (canViewMarketplace ? marketplace.error : null);

  const mobileMetrics: MobileMetric[] = [
    {
      key: "newUsers",
      icon: Users,
      label: "Registros",
      value: String(currentTotals.newUsers),
    },
    {
      key: "logins",
      icon: LogIn,
      label: "Accesos",
      value: String(currentTotals.logins),
    },
    {
      key: "retention7",
      icon: Activity,
      label: "Retención 7 días",
      value: `${retention.data?.retention7Rate ?? 0}%`,
    },
    {
      key: "retention30",
      icon: Activity,
      label: "Retención 30 días",
      value: `${retention.data?.retention30Rate ?? 0}%`,
    },
    {
      key: "leads",
      icon: Megaphone,
      label: "Leads",
      value: canViewCommercial ? String(periodLeads.length) : "—",
    },
    {
      key: "conversion",
      icon: TrendingUp,
      label: "Conversión",
      value:
        canViewCommercial && commercialConversion !== null
          ? `${commercialConversion}%`
          : "—",
    },
    {
      key: "drivers",
      icon: Users,
      label: "Conductores activos",
      value: canViewMarketplace
        ? String(overview?.driversActive ?? 0)
        : "—",
    },
    {
      key: "jobs",
      icon: BriefcaseBusiness,
      label: "Trabajos activos",
      value: canViewMarketplace
        ? String(overview?.jobsActive ?? 0)
        : "—",
    },
  ];

  if (permissionsLoading) {
    return <div role="status" className="flex items-center justify-center py-12 text-sm text-text-secondary">
      <Loader2 className="mr-2 size-5 animate-spin text-primary" aria-hidden="true"/> Comprobando acceso…
    </div>;
  }

  return (
    <div data-admin-module="rendimiento" className="min-w-0 space-y-3">
      <ModuleHeader
        density="compact"
        appearance="premium"
        module="rendimiento"
        title="Vitalidad de la Agencia TukTuk"
        description="Crecimiento, clientes, carreras y problemas que requieren atención"
        icon={Activity}
        actions={
          <AdminPeriodSelector appearance="premium"
            value={period} range={dateRange}
            onChange={(nextPeriod, nextRange) => {
              setPeriod(nextPeriod);
              setDateRange(nextRange);
            }}
          />
        }
      />
      <AgencyVitalityOverview projectId={projectId} from={fromDate} to={toDate} />
      <details className="group min-w-0 rounded-[var(--radius-card)] border border-border-default bg-surface-1/70 shadow-[var(--shadow-xs)]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-text-primary marker:hidden [&::-webkit-details-marker]:hidden sm:px-4">
          <span className="inline-flex items-center gap-2">
            <BarChart3 className="size-4 text-[var(--module-accent)]" aria-hidden="true"/>
            Análisis detallado · Usuarios, captación y gráficos
          </span>
          <ChevronDown className="size-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180" aria-hidden="true"/>
        </summary>
        <div className="space-y-3 border-t border-border-subtle p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-secondary">Gráficos y filtros adicionales</span>
            <GrainSelect value={grain} onChange={setGrain}/>
          </div>
          <MobileFiltersPanel
            activeFilters={activeFilterCount}
            onClear={() => {
              setSource("all"); setCampaign("all"); setVersion("all");
            }}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <FilterSelect value={source} onChange={setSource} label="Fuente"
                options={[{value:"all",label:"Todas las fuentes"},...(dimensions.data?.sources ?? []).map(item=>({value:item,label:item}))]}/>
              <FilterSelect value={campaign} onChange={setCampaign} label="Campaña"
                options={[{value:"all",label:"Todas las campañas"},...(dimensions.data?.campaigns ?? []).map(item=>({value:item,label:item}))]}/>
              <FilterSelect value={version} onChange={setVersion} label="Versión"
                options={[{value:"all",label:"Todas las versiones"},...(dimensions.data?.versions ?? []).map(item=>({value:item,label:item}))]}/>
            </div>
          </MobileFiltersPanel>
          <p className="text-xs leading-relaxed text-text-secondary">
            Los filtros de fuente, campaña y versión afectan solo a estos gráficos heredados.
            La Vitalidad usa las cuentas verificadas del proyecto. La retención es acumulada, no del período.
          </p>
          {isLoading ? (
            <div role="status" className="p-4 text-sm text-text-secondary">Consultando estadísticas detalladas…</div>
          ) : error ? (
            <div role="alert" className="rounded-[var(--radius-compact)] border border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-surface)] p-3 text-sm text-text-primary">
              No se pudieron cargar los gráficos detallados. La Vitalidad mantiene su consulta independiente.
            </div>
          ) : (
          <>
      {isMobile ? (
        <MobileMetricsGrid
          metrics={mobileMetrics}
          moreLabel="Ver métricas completas"
        />
      ) : null}

      <SectionCard density="compact" appearance="premium"
        title="Usuarios app"
        description="Registro, acceso y retorno de usuarios"
        module="rendimiento"
        className="relative isolate border-cyan-400/14 bg-gradient-to-br from-cyan-500/[0.045] via-surface-1 to-background/55 shadow-[0_20px_58px_-46px_rgba(34,211,238,0.72)]"
        headerClassName="relative z-10 px-4 py-3 sm:px-4"
        contentClassName="p-3 sm:p-4"
      >
        <img
          src="/admin-premium/customers.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 top-4 h-52 w-[48%] object-contain object-right opacity-[0.08] mix-blend-screen"
        />
        <KpiGrid columns={4} density="compact" className="relative z-10">
          <MetricCard density="compact" appearance="premium"
            label="Registros nuevos"
            value={currentTotals.newUsers}
            comparison={compare(
              currentTotals.newUsers,
              previousTotals.newUsers,
            )}
            icon={Users}
            module="rendimiento"
          />

          <MetricCard density="compact" appearance="premium"
            label="Accesos"
            value={currentTotals.logins}
            comparison={compare(
              currentTotals.logins,
              previousTotals.logins,
            )}
            icon={LogIn}
            module="rendimiento"
          />

          <MetricCard density="compact" appearance="premium"
            label="Retención 7 días"
            value={`${retention.data?.retention7Rate ?? 0}%`}
            comparison={`${retention.data?.retained7 ?? 0} de ${
              retention.data?.eligible7 ?? 0
            } usuarios elegibles`}
            icon={Activity}
            semanticState="info"
          />

          <MetricCard density="compact" appearance="premium"
            label="Retención 30 días"
            value={`${retention.data?.retention30Rate ?? 0}%`}
            comparison={`${retention.data?.retained30 ?? 0} de ${
              retention.data?.eligible30 ?? 0
            } usuarios elegibles`}
            icon={Activity}
            semanticState="info"
          />
        </KpiGrid>
      </SectionCard>

      <SectionCard density="compact" appearance="premium"
        title="Captación comercial"
        description="Conversión de personas interesadas a usuarios registrados"
        module="comercial"
        className="relative isolate border-violet-400/16 bg-gradient-to-br from-violet-500/[0.05] via-surface-1 to-background/55 shadow-[0_20px_58px_-46px_rgba(139,92,246,0.78)]"
        headerClassName="relative z-10 px-4 py-3 sm:px-4"
        contentClassName="p-3 sm:p-4"
      >
        <img
          src="/admin-premium/acquisition.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 top-2 h-56 w-[52%] object-contain object-right opacity-[0.095] mix-blend-screen"
        />
        {canViewCommercial ? (
          <KpiGrid columns={5} density="compact" className="relative z-10">
            <MetricCard density="compact" appearance="premium"
              label="Leads"
              value={periodLeads.length}
              comparison="Captados en el período"
              icon={Megaphone}
              module="comercial"
            />

            <MetricCard density="compact" appearance="premium"
              label="Contactados"
              value={contactedLeads}
              comparison="Con interacción"
              icon={Activity}
              module="comercial"
            />

            <MetricCard density="compact" appearance="premium"
              label="Interesados"
              value={interestedLeads}
              comparison="Con interés identificado"
              icon={Users}
              module="comercial"
            />

            <MetricCard density="compact" appearance="premium"
              label="Registrados"
              value={registeredLeads}
              comparison="Convertidos en usuarios"
              icon={Users}
              semanticState="success"
            />

            <MetricCard density="compact" appearance="premium"
              label="Conversión"
              value={
                commercialConversion === null
                  ? "Sin datos"
                  : `${commercialConversion}%`
              }
              comparison="Lead a usuario registrado"
              icon={TrendingUp}
              semanticState="info"
            />
          </KpiGrid>
        ) : (
          <EmptyState density="compact" appearance="premium"
            icon={Megaphone}
            title="Sin acceso a Comercial"
            description="No tienes permisos para consultar la captación comercial."
            module="comercial"
            className="relative z-10 min-h-[120px] py-3"
          />
        )}
      </SectionCard>

      <SectionCard density="compact" appearance="premium"
        title="Marketplace actual"
        description="Estado operativo en este momento"
        module="rendimiento"
        className="relative isolate border-emerald-400/14 bg-gradient-to-br from-emerald-500/[0.045] via-surface-1 to-background/55 shadow-[0_20px_58px_-46px_rgba(52,211,153,0.72)]"
        headerClassName="relative z-10 px-4 py-3 sm:px-4"
        contentClassName="p-3 sm:p-4"
      >
        <img
          src="/admin-premium/operations.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 top-2 h-56 w-[52%] object-contain object-right opacity-[0.09] mix-blend-screen"
        />
        {canViewMarketplace ? (
          <KpiGrid columns={4} density="compact" className="relative z-10">
            <MetricCard density="compact" appearance="premium"
              label="Conductores activos"
              value={overview?.driversActive ?? 0}
              comparison={`De ${overview?.driversTotal ?? 0} registrados`}
              icon={Users}
              semanticState="info"
            />

            <MetricCard density="compact" appearance="premium"
              label="Trabajos activos"
              value={overview?.jobsActive ?? 0}
              comparison={`${overview?.jobsPublished ?? 0} publicados`}
              icon={BriefcaseBusiness}
              module="rendimiento"
            />

            <MetricCard density="compact" appearance="premium"
              label="Incidencias abiertas"
              value={overview?.jobsIncidentOpen ?? 0}
              comparison={`${overview?.jobsIncidentResolved ?? 0} resueltas`}
              icon={AlertTriangle}
              semanticState={
                (overview?.jobsIncidentOpen ?? 0) > 0
                  ? "warning"
                  : "success"
              }
            />

            <MetricCard density="compact" appearance="premium"
              label="Recargas pendientes"
              value={overview?.pendingTopups ?? 0}
              comparison="Pendientes de gestión"
              icon={WalletCards}
              semanticState={
                (overview?.pendingTopups ?? 0) > 0
                  ? "warning"
                  : "success"
              }
            />
          </KpiGrid>
        ) : (
          <EmptyState density="compact" appearance="premium"
            icon={BriefcaseBusiness}
            title="Sin acceso a Marketplace"
            description="No tienes permisos para consultar la operación."
            module="rendimiento"
            className="relative z-10 min-h-[120px] py-3"
          />
        )}
      </SectionCard>

      <section className="grid gap-3 xl:grid-cols-2">
        <SectionCard density="compact" appearance="premium"
          title="Registros y accesos"
          description="Evolución de altas y accesos a la aplicación"
          module="rendimiento"
          className="relative isolate border-cyan-400/14 bg-gradient-to-br from-cyan-500/[0.04] via-surface-1 to-background/55"
          headerClassName="relative z-10 px-4 py-3 sm:px-4"
          contentClassName="p-3 sm:p-4"
        >
          <img
            src="/admin-premium/analytics.svg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 bottom-0 h-[90%] w-[58%] object-contain object-right-bottom opacity-[0.075] mix-blend-screen"
          />
          {chartRows.length ? (
            <div className="relative z-10 h-56 w-full md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartRows}
                  margin={{ left: -10, right: 10, top: 10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    opacity={0.15}
                  />

                  <XAxis
                    dataKey="label"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                  />

                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                    allowDecimals={false}
                  />

                  <Tooltip {...adminChartTooltipProps} />

                  <Bar
                    dataKey="newUsers"
                    name="Registros"
                    fill="var(--module-clientes)"
                    radius={[4, 4, 0, 0]}
                  />

                  <Bar
                    dataKey="logins"
                    name="Accesos"
                    fill="var(--module-comercial)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState density="compact" appearance="premium"
              icon={BarChart3}
              title="Sin datos de usuarios"
              description="No hay registros o accesos para el período seleccionado."
              module="rendimiento"
              className="relative z-10 min-h-[132px] py-4"
            />
          )}
        </SectionCard>

        <SectionCard density="compact" appearance="premium"
          title="Fuentes de captación"
          description="Origen de los leads del período seleccionado"
          module="comercial"
          className="relative isolate border-violet-400/14 bg-gradient-to-br from-violet-500/[0.045] via-surface-1 to-background/55"
          headerClassName="relative z-10 px-4 py-3 sm:px-4"
          contentClassName="p-3 sm:p-4"
        >
          <img
            src="/admin-premium/acquisition.svg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-14 bottom-0 h-[92%] w-[60%] object-contain object-right-bottom opacity-[0.075] mix-blend-screen"
          />
          {canViewCommercial && sourceDistribution.length ? (
            <div className="relative z-10 h-56 w-full md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sourceDistribution}
                  layout="vertical"
                  margin={{ left: 20, right: 20, top: 10, bottom: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    opacity={0.15}
                  />

                  <XAxis
                    type="number"
                    allowDecimals={false}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                  />

                  <YAxis
                    dataKey="source"
                    type="category"
                    width={85}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                  />

                  <Tooltip {...adminChartTooltipProps} />

                  <Bar
                    dataKey="count"
                    name="Leads"
                    fill="var(--module-comercial)"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState density="compact" appearance="premium"
              icon={Megaphone}
              title="Sin datos de captación"
              description="No hay fuentes comerciales para el período y filtros seleccionados."
              module="comercial"
              className="relative z-10 min-h-[132px] py-4"
            />
          )}
        </SectionCard>
      </section>
          </>
          )}
        </div>
      </details>
    </div>
  );
}

function GrainSelect({
  value,
  onChange,
}: {
  value: Grain;
  onChange: (value: Grain) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as Grain)}
    >
      <SelectTrigger className="h-9 w-32 bg-card/60 text-xs">
        <SelectValue placeholder="Granularidad" />
      </SelectTrigger>

      <SelectContent>
        <SelectItem value="daily">Diaria</SelectItem>
        <SelectItem value="weekly">Semanal</SelectItem>
        <SelectItem value="monthly">Mensual</SelectItem>
      </SelectContent>
    </Select>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: FilterOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 border-border/80 bg-background/60 text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>

      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function aggregateUsage(
  rows: UsageAnalyticsDay[],
  grain: Grain,
): UsageTrendRow[] {
  if (grain === "daily") {
    return rows.map((row) => ({
      date: row.date,
      newUsers: row.newUsers,
      logins: row.logins,
      label: formatDate(row.date),
    }));
  }

  const grouped = new Map<
    string,
    {
      date: string;
      newUsers: number;
      logins: number;
    }
  >();

  rows.forEach((row) => {
    const date = new Date(`${row.date}T12:00:00`);
    const key =
      grain === "weekly"
        ? weekStart(date)
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const existing = grouped.get(key) ?? {
      date: grain === "weekly" ? key : row.date,
      newUsers: 0,
      logins: 0,
    };

    existing.newUsers += row.newUsers;
    existing.logins += row.logins;

    grouped.set(key, existing);
  });

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    label: formatDate(row.date),
  }));
}

function usageTotals(rows: UsageAnalyticsDay[]) {
  return rows.reduce(
    (total, row) => ({
      newUsers: total.newUsers + row.newUsers,
      logins: total.logins + row.logins,
    }),
    {
      newUsers: 0,
      logins: 0,
    },
  );
}

function compare(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? "Sin cambio" : "Sin base anterior";
  }

  const delta = ((current - previous) / previous) * 100;

  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs período anterior`;
}

function sourceLabel(source: CommercialSource) {
  const labels: Record<CommercialSource, string> = {
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    instagram: "Instagram",
    sms: "SMS",
    referral: "Referido",
    direct: "Directo",
    other: "Otro",
  };

  return labels[source] ?? source;
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "short",
    }).format(new Date(`${dateStr}T12:00:00`));
  } catch {
    return dateStr;
  }
}

function weekStart(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;

  start.setDate(start.getDate() + offset);

  return isoDate(start);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
