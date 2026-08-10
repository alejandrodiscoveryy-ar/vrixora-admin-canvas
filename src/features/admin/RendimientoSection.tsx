import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { adminChartTooltipProps } from "@/lib/chart-theme";
import { supabaseServices, type LicenseStatus, type UsageAnalyticsDay } from "@/lib/services";
import { Badge } from "@/components/ui/badge";
import {
  AnalyticsDateRangePicker,
  usePersistentAnalyticsDateRange,
} from "@/components/admin/AnalyticsDateRange";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileFiltersPanel,
  MobileMetricsGrid,
  type MobileMetric,
} from "@/components/admin/MobileAdminSystem";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { SectionCard } from "@/components/admin/SectionCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { FilterToolbar } from "@/components/admin/FilterToolbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Grain = "daily" | "weekly" | "monthly";

type FilterOption = {
  value: string;
  label: string;
};

const STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "Todos los estados" },
  { value: "active", label: "Activa" },
  { value: "pending", label: "Pendiente" },
  { value: "expired", label: "Vencida" },
  { value: "suspended", label: "Suspendida" },
  { value: "revoked", label: "Revocada" },
];

export default function RendimientoSection({ projectId }: { projectId: string }) {
  const isMobile = useIsMobile();
  const [dateRange, setDateRange] = usePersistentAnalyticsDateRange(
    `vrixora:analytics-range:${projectId}`,
  );
  const [grain, setGrain] = useState<Grain>("daily");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [version, setVersion] = useState("all");

  const fromDate = dateRange.from;
  const toDate = dateRange.to;
  const periodDays = Math.max(
    1,
    Math.round(
      (new Date(`${toDate}T12:00:00`).getTime() - new Date(`${fromDate}T12:00:00`).getTime()) /
        86_400_000,
    ) + 1,
  );

  const setPeriodDays = (days: number) => {
    const end = new Date();
    setDateRange({ to: isoDate(end), from: isoDate(addDays(end, -(days - 1))) });
  };

  const from = isoDate(addDays(new Date(`${fromDate}T12:00:00`), -periodDays));
  const filters = {
    from,
    to: toDate,
    plan: plan === "all" ? undefined : plan,
    licenseStatus: status === "all" ? undefined : (status as LicenseStatus),
    source: source === "all" ? undefined : source,
    campaign: campaign === "all" ? undefined : campaign,
    appVersion: version === "all" ? undefined : version,
  };

  const analytics = useQuery({
    queryKey: ["usage-analytics", projectId, filters],
    queryFn: () => supabaseServices.usageAnalytics.series(projectId, filters),
    refetchInterval: 30_000,
  });
  const dimensions = useQuery({
    queryKey: ["usage-analytics-dimensions", projectId],
    queryFn: () => supabaseServices.usageAnalytics.dimensions(projectId),
  });
  const plans = useQuery({
    queryKey: ["admin-license-plans", projectId],
    queryFn: () => supabaseServices.licenses.listAdminPlans(projectId),
  });
  const retention = useQuery({
    queryKey: ["usage-retention", projectId, plan, source, campaign],
    queryFn: () =>
      supabaseServices.usageAnalytics.retention(projectId, {
        plan: plan === "all" ? undefined : plan,
        source: source === "all" ? undefined : source,
        campaign: campaign === "all" ? undefined : campaign,
      }),
  });

  const allRows = useMemo(() => analytics.data ?? [], [analytics.data]);
  const current = allRows.slice(-periodDays);
  const previous = allRows.slice(-periodDays * 2, -periodDays);
  const chartRows = aggregate(current, grain);

  const currentTotals = totals(current);
  const previousTotals = totals(previous);
  const todayRow = current.at(-1);

  const isLoading = analytics.isLoading || dimensions.isLoading || plans.isLoading;
  const error = analytics.error || dimensions.error || plans.error;
  const activeFilterCount = [plan, status, source, campaign, version].filter(
    (value) => value !== "all",
  ).length;

  const mobileMetrics: MobileMetric[] = [
    { key: "newUsers", icon: Users, label: "Registros", value: String(currentTotals.newUsers) },
    { key: "trials", icon: Activity, label: "Prueba inicial", value: String(currentTotals.trials) },
    {
      key: "paidLicenses",
      icon: TrendingUp,
      label: "Licencias pagadas",
      value: String(currentTotals.paidLicenses),
    },
    {
      key: "activeToday",
      icon: Activity,
      label: "Activos hoy",
      value: String(todayRow?.activeUsers ?? 0),
    },
    {
      key: "renewals",
      icon: TrendingUp,
      label: "Renovaciones",
      value: String(currentTotals.renewals),
    },
    {
      key: "expired",
      icon: TrendingDown,
      label: "Vencidas",
      value: String(currentTotals.expired),
    },
    {
      key: "conversion",
      icon: BarChart3,
      label: "Conversion",
      value: `${retention.data?.trialToPaidRate ?? 0}%`,
    },
    {
      key: "retention30",
      icon: BarChart3,
      label: "Retencion 30 dias",
      value: `${retention.data?.retention30Rate ?? 0}%`,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {friendlyError(error)}
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <ModuleHeader
        title="Rendimiento"
        description="Analítica de uso, adopción, retención y evolución operativa del sistema."
        icon={BarChart3}
        module="rendimiento"
        actions={
          <div className="flex items-center gap-2">
            <GrainSelect value={grain} onChange={setGrain} />
          </div>
        }
      />

      <section className="space-y-3">
        <div className="hidden md:block">
          <AnalyticsDateRangePicker
            range={dateRange}
            onChange={(next) => setDateRange(next)}
          />
        </div>

        <MobileFiltersPanel
          activeFilters={activeFilterCount}
          onClear={() => {
            setPlan("all");
            setStatus("all");
            setSource("all");
            setCampaign("all");
            setVersion("all");
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              value={plan}
              onChange={setPlan}
              label="Plan"
              options={[{ value: "all", label: "Todos los planes" }, ...(plans.data ?? []).map((p) => ({ value: p.code, label: p.name }))]}
            />
            <FilterSelect value={status} onChange={setStatus} label="Estado" options={STATUS_OPTIONS} />
            <FilterSelect
              value={source}
              onChange={setSource}
              label="Fuente"
              options={[{ value: "all", label: "Todas las fuentes" }, ...(dimensions.data?.sources ?? []).map((s) => ({ value: s, label: s }))]}
            />
            <FilterSelect
              value={campaign}
              onChange={setCampaign}
              label="Campaña"
              options={[{ value: "all", label: "Todas las campañas" }, ...(dimensions.data?.campaigns ?? []).map((c) => ({ value: c, label: c }))]}
            />
            <FilterSelect
              value={version}
              onChange={setVersion}
              label="Versión"
              options={[{ value: "all", label: "Todas las versiones" }, ...(dimensions.data?.versions ?? []).map((v) => ({ value: v, label: v }))]}
            />
          </div>
        </MobileFiltersPanel>
      </section>

      {isMobile ? (
        <MobileMetricsGrid metrics={mobileMetrics} moreLabel="Ver metricas completas" />
      ) : null}

      {/* BLOQUE A: ADQUISICIÓN */}
      <SectionCard title="A. Adquisición" module="rendimiento">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard
            label="Registros nuevos"
            value={currentTotals.newUsers}
            comparison={compare(currentTotals.newUsers, previousTotals.newUsers)}
            icon={Users}
            module="rendimiento"
          />
          <MetricCard
            label="Pruebas iniciadas"
            value={currentTotals.trials}
            comparison={compare(currentTotals.trials, previousTotals.trials)}
            icon={Activity}
            module="rendimiento"
          />
          <MetricCard
            label="Licencias pagadas"
            value={currentTotals.paidLicenses}
            comparison={compare(currentTotals.paidLicenses, previousTotals.paidLicenses)}
            icon={TrendingUp}
            semanticState="success"
          />
        </div>
      </SectionCard>

      {/* BLOQUE B: USO */}
      <SectionCard title="B. Uso y Actividad" module="rendimiento">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard
            label="Activos hoy"
            value={todayRow?.activeUsers ?? 0}
            comparison="Usuarios únicos activos"
            icon={Activity}
            module="rendimiento"
          />
          <MetricCard
            label="Activos semanales (WAU)"
            value={averageMetric(current, "activeUsers", 7)}
            comparison="Promedio últimos 7 días"
            icon={Users}
            module="rendimiento"
          />
          <MetricCard
            label="Activos mensuales (MAU)"
            value={averageMetric(current, "activeUsers", 30)}
            comparison="Promedio últimos 30 días"
            icon={Users}
            module="rendimiento"
          />
          <MetricCard
            label="Inicios de sesión"
            value={currentTotals.sessions}
            comparison={compare(currentTotals.sessions, previousTotals.sessions)}
            icon={ShieldCheck}
            module="rendimiento"
          />
        </div>
      </SectionCard>

      {/* BLOQUE C: NEGOCIO */}
      <SectionCard title="C. Negocio y Retención" module="rendimiento">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard
            label="Renovaciones"
            value={currentTotals.renewals}
            comparison={compare(currentTotals.renewals, previousTotals.renewals)}
            icon={TrendingUp}
            semanticState="success"
          />
          <MetricCard
            label="Licencias vencidas"
            value={currentTotals.expired}
            comparison={compare(currentTotals.expired, previousTotals.expired)}
            icon={TrendingDown}
            semanticState="danger"
          />
          <MetricCard
            label="Conversión prueba → pago"
            value={`${retention.data?.trialToPaidRate ?? 0}%`}
            comparison="Tasa global del periodo"
            icon={BarChart3}
            module="rendimiento"
          />
          <MetricCard
            label="Retención (30 días)"
            value={`${retention.data?.retention30Rate ?? 0}%`}
            comparison="Usuarios recurrentes"
            icon={Activity}
            semanticState="info"
          />
        </div>
      </SectionCard>

      {/* GRÁFICO 1: USO REAL DE LA APLICACIÓN */}
      <SectionCard title="Uso real de la aplicación (Activos vs Sesiones)" module="rendimiento">
        {chartRows.length > 0 ? (
          <div className="h-64 md:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartRows} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--module-comercial)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--module-comercial)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <Tooltip {...adminChartTooltipProps} />
                <Area
                  type="monotone"
                  dataKey="activeUsers"
                  name="Usuarios activos"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorActive)"
                />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  name="Sesiones"
                  stroke="var(--module-comercial)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSessions)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="Sin datos de uso"
            description="No se registran métricas de actividad para el rango de fechas seleccionado."
            module="rendimiento"
          />
        )}
      </SectionCard>

      {/* GRÁFICO 2: CRECIMIENTO Y LICENCIAS */}
      <SectionCard title="Crecimiento y licencias (Registros, Pruebas y Pagadas)" module="rendimiento">
        {chartRows.length > 0 ? (
          <div className="h-64 md:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <Tooltip {...adminChartTooltipProps} />
                <Bar dataKey="newUsers" name="Registros" fill="var(--module-clientes)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="trials" name="Pruebas" fill="var(--module-comercial)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="paidLicenses" name="Pagadas" fill="var(--semantic-success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="Sin datos de crecimiento"
            description="No hay registros de licencias ni pruebas para este periodo."
            module="rendimiento"
          />
        )}
      </SectionCard>
    </div>
  );
}

function GrainSelect({ value, onChange }: { value: Grain; onChange: (v: Grain) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Grain)}>
      <SelectTrigger className="h-9 w-32 text-xs bg-card/60">
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
  onChange: (v: string) => void;
  label: string;
  options: FilterOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 text-xs bg-background/60 border-border/80">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function aggregate(rows: UsageAnalyticsDay[], grain: Grain) {
  if (grain === "daily") {
    return rows.map((r) => ({
      ...r,
      label: formatDate(r.date),
    }));
  }

  const map = new Map<string, UsageAnalyticsDay>();
  rows.forEach((r) => {
    const d = new Date(`${r.date}T12:00:00`);
    const key =
      grain === "weekly"
        ? `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`
        : `${d.getFullYear()}-${d.getMonth()}`;
    const existing = map.get(key) ?? {
      date: r.date,
      newUsers: 0,
      trials: 0,
      paidLicenses: 0,
      activeUsers: 0,
      sessions: 0,
      renewals: 0,
      expired: 0,
    };
    existing.newUsers += r.newUsers;
    existing.trials += r.trials;
    existing.paidLicenses += r.paidLicenses;
    existing.activeUsers = Math.max(existing.activeUsers, r.activeUsers);
    existing.sessions += r.sessions;
    existing.renewals += r.renewals;
    existing.expired += r.expired;
    map.set(key, existing);
  });

  return Array.from(map.values()).map((r) => ({
    ...r,
    label: formatDate(r.date),
  }));
}

function totals(rows: UsageAnalyticsDay[]) {
  return rows.reduce(
    (acc, r) => ({
      newUsers: acc.newUsers + r.newUsers,
      trials: acc.trials + r.trials,
      paidLicenses: acc.paidLicenses + r.paidLicenses,
      sessions: acc.sessions + r.sessions,
      renewals: acc.renewals + r.renewals,
      expired: acc.expired + r.expired,
    }),
    { newUsers: 0, trials: 0, paidLicenses: 0, sessions: 0, renewals: 0, expired: 0 },
  );
}

function averageMetric(rows: UsageAnalyticsDay[], key: keyof UsageAnalyticsDay, days: number) {
  const slice = rows.slice(-days);
  if (!slice.length) return 0;
  const sum = slice.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
  return Math.round(sum / slice.length);
}

function compare(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "Sin cambio" : "Sin base anterior";
  const delta = ((current - previous) / previous) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs periodo anterior`;
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(
      new Date(`${dateStr}T12:00:00`),
    );
  } catch {
    return dateStr;
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
