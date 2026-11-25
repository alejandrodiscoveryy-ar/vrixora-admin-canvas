import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getSupabaseClient } from "@/lib/supabase";
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
import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import { adminPeriodOptions, periodRange } from "@/components/admin/admin-period";
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
  const {data:project}=useProject(projectId);
  const today=periodRange("today").to;
  const projectStart=project?.createdAt?.slice(0,10);
  const allRange=projectStart && /^\d{4}-\d{2}-\d{2}$/.test(projectStart) && projectStart<=today ? {from:projectStart,to:today} : undefined;
  const options=allRange ? [...adminPeriodOptions,{value:"all" as const,label:"Todo"}] : adminPeriodOptions;

  const { data: permissions = [], isLoading: permissionsLoading } =
    useProjectPermissions(projectId);

  const canViewCommercial = permissions.includes("commercial.view");
  const canViewMarketplace = permissions.includes("marketplace.view");

  const [dateRange, setDateRange] = useState(() => periodRange("7d"));

  const [period, setPeriod] = useState<AdminPeriodKey>(() =>
    identifyAdminPeriod(dateRange),
  );

  const [grain, setGrain] = useState<Grain>("daily");
  const [source, setSource] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [version, setVersion] = useState("all");

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

  const analyticsFrom = period==="all" ? fromDate : isoDate(addDays(new Date(`${fromDate}T12:00:00`), -periodDays));
  const rangeSupported=periodDays<=401;

  const analyticsFilters = {
    from: analyticsFrom,
    to: toDate,
    source: source === "all" ? undefined : source,
    campaign: campaign === "all" ? undefined : campaign,
    appVersion: version === "all" ? undefined : version,
  };

  const analytics = useQuery({
    queryKey: ["usage-analytics-v2", projectId, analyticsFilters],
    queryFn: async () => {
      const chunks: UsageAnalyticsDay[]=[];
      for(let start=analyticsFrom;start<=toDate;){
        const end=isoDate(addDays(new Date(`${start}T12:00:00`),400));
        const until=end<toDate?end:toDate;
        chunks.push(...await supabaseServices.usageAnalytics.series(projectId,{...analyticsFilters,from:start,to:until}));
        start=isoDate(addDays(new Date(`${until}T12:00:00`),1));
      }
      return chunks;
    },
    enabled:rangeSupported,
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

  const current = allRows.filter(row => row.date >= fromDate && row.date <= toDate);
  const previous = allRows.filter(row => row.date >= analyticsFrom && row.date < fromDate);

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
      {rangeSupported ? <details className="group min-w-0 rounded-[var(--radius-card)] border border-border-default bg-surface-1/70 shadow-[var(--shadow-xs)]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-text-primary marker:hidden [&::-webkit-details-marker]:hidden sm:px-4">
          <span className="inline-flex items-center gap-2">
            <BarChart3 className="size-4 text-[var(--module-accent)]" aria-hidden="true"/>
            Análisis detallado · Usuarios, captación y gráficos
          </span>
          <ChevronDown className="size-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180" aria-hidden="true"/>
        </summary>
        <div className="space-y-3 border-t border-border-subtle p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-secondary">Filtros de los gráficos históricos</span>
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
            Los filtros de fuente, campaña y versión afectan los gráficos históricos de usuarios; fuente y campaña también filtran los leads.
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
          title="Actividad de usuarios de la app"
          description="Registros y eventos de inicio de sesión; no mide conversión a conductor"
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
          title="Origen de contactos CRM"
          description="Contactos comerciales registrados manualmente o en CRM"
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
      </details> : null}
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
  }});
  const impulsa=useQuery({queryKey:["commercial-overview-impulsa",projectId,days],queryFn:async()=>{
    const {data,error}=await getSupabaseClient().rpc("admin_get_marketplace_impulsa_communications_v1",{target_project_id:projectId,target_days:days});
    if(error)throw error;return data as ChannelReport;
  }});
  const allies=useQuery({queryKey:["commercial-overview-allies",projectId],queryFn:async()=>{
    const {data,error}=await getSupabaseClient().rpc("admin_list_marketplace_allies_v1",{target_project_id:projectId});
    if(error)throw error;if(!Array.isArray(data))throw Error("INVALID_ALLIES_REPORT");return data as AllyReport[];
  }});
  const o=official.isError?undefined:official.data,i=impulsa.isError?undefined:impulsa.data,a=allies.isError?undefined:allies.data;
  const rows=[
    {name:"TukTuk oficial · incluye campañas",period:days+" días",clicks:o?.totals?.link_opens,requests:o?.totals?.requests_created,completed:undefined},
    {name:"Impulsa",period:days+" días",clicks:i?.totals?.clicks,requests:i?.totals?.requests_created,completed:sumObserved(i?.drivers,x=>x.completed_real)},
    {name:"Aliados",period:"Histórico",clicks:sumObserved(a,x=>x.clicks),requests:sumObserved(a,x=>x.requests),completed:sumObserved(a,x=>x.completed)},
  ];
  return <SectionCard density="compact" appearance="premium" module="comercial" title="Captación por canales"
    description="Período móvil independiente · Aliados: histórico"
    actions={<div className="flex flex-wrap gap-1">{([7,30,90] as const).map(n=><button key={n} type="button" aria-pressed={days===n} onClick={()=>setDays(n)} className={days===n?"rounded-md bg-primary/15 px-3 py-2 text-xs font-semibold text-primary":"rounded-md px-3 py-2 text-xs text-muted-foreground"}>{n} d</button>)}</div>}
    contentClassName="p-3 sm:p-4">
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="grid gap-3 sm:grid-cols-3">
        {([{key:"clicks",label:"Clics",color:"#a78bfa"},{key:"requests",label:"Solicitudes",color:"var(--module-accent)"},{key:"completed",label:"Viajes liquidados",color:"var(--semantic-success)"}] as const).map(metric=>{
          const comparable=rows.slice(0,2);
          const max=Math.max(1,...comparable.map(row=>row[metric.key]??0));
          return <div key={metric.key} className="min-w-0 rounded-lg border border-border-subtle bg-surface-2/50 p-3">
            <h4 className="text-sm font-semibold">{metric.label}</h4>
            {comparable.map(row=><div key={row.name} className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-1 text-xs"><span>{row.name.startsWith("TukTuk")?"TukTuk oficial":row.name}</span><strong className="tabular-nums">{observedCount(row[metric.key])}</strong></div>
              {row[metric.key]!=null?<div className="h-3 rounded-md bg-surface-3" aria-hidden="true"><div className="h-full rounded-md" style={{width:row[metric.key]!*100/max+"%",background:metric.color}}/></div>:<p className="text-xs text-muted-foreground">Sin dato</p>}
            </div>)}
          </div>;
        })}
      </div>
      <div className="min-w-0 rounded-lg border border-border-subtle bg-surface-2/50 p-3">
        <h4 className="text-sm font-semibold">Aliados · Histórico</h4>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {([{key:"clicks",label:"Clics"},{key:"requests",label:"Solicitudes"},{key:"completed",label:"Liquidados"}] as const).map(m=><div key={m.key}><p className="text-xl font-semibold tabular-nums">{observedCount(rows[2][m.key])}</p><p className="text-xs text-muted-foreground">{m.label}</p></div>)}
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
