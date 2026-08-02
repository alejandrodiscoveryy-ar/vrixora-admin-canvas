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
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { adminChartLegendProps, adminChartTooltipProps } from "@/lib/chart-theme";
import { supabaseServices, type LicenseStatus, type UsageAnalyticsDay } from "@/lib/services";
import { Badge } from "@/components/ui/badge";
import {
  AnalyticsDateRangePicker,
  usePersistentAnalyticsDateRange,
} from "@/components/admin/AnalyticsDateRange";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileFiltersPanel,
  MobileMetricsGrid,
  MobileSectionHeader,
  type MobileMetric,
} from "@/components/admin/MobileAdminSystem";

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
  const yesterdayRow = current.at(-2);
  const weekAgoRow = current.at(-8);

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
      <div className="space-y-4">
        <div className="flex items-center justify-center py-14">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/10">
        <CardContent className="p-4 text-sm text-destructive">{friendlyError(error)}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <MobileSectionHeader
        title="Rendimiento"
        subtitle="Actividad real, conversion y renovaciones por periodo comparable."
        badge={<Badge variant="outline">Actualiza cada 30s</Badge>}
      />

      <section className="space-y-2 md:hidden">
        <div className="flex gap-2">
          <PeriodChip active={periodDays <= 7} onClick={() => setPeriodDays(7)}>
            7 días
          </PeriodChip>
          <PeriodChip active={periodDays > 7 && periodDays <= 30} onClick={() => setPeriodDays(30)}>
            30 días
          </PeriodChip>
          <PeriodChip active={periodDays > 30} onClick={() => setPeriodDays(90)}>
            90 días
          </PeriodChip>
        </div>
      </section>

      <section className="hidden md:block">
        <AnalyticsDateRangePicker range={dateRange} onChange={setDateRange} />
      </section>

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
        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          <Filter
            value={String(periodDays)}
            onChange={(value) => setPeriodDays(Number(value))}
            label="Periodo"
            values={[
              { value: "7", label: "Últimos 7 días" },
              { value: "30", label: "Últimos 30 días" },
              { value: "90", label: "Últimos 90 días" },
              { value: "180", label: "Últimos 180 días" },
            ]}
          />
          <Filter
            value={grain}
            onChange={(value) => setGrain(value as Grain)}
            label="Agrupación"
            values={[
              { value: "daily", label: "Diaria" },
              { value: "weekly", label: "Semanal" },
              { value: "monthly", label: "Mensual" },
            ]}
          />
          <Filter
            value={plan}
            onChange={setPlan}
            label="Plan"
            values={[
              { value: "all", label: "Todos los planes" },
              ...(plans.data ?? []).map((item) => ({ value: item.code, label: item.name })),
            ]}
          />
          <Filter value={status} onChange={setStatus} label="Estado" values={STATUS_OPTIONS} />
          <Filter
            value={source}
            onChange={setSource}
            label="Fuente"
            values={[
              { value: "all", label: "Todas las fuentes" },
              ...(dimensions.data?.sources ?? []).map(option),
            ]}
          />
          <Filter
            value={campaign}
            onChange={setCampaign}
            label="Campaña"
            values={[
              { value: "all", label: "Todas las campañas" },
              ...(dimensions.data?.campaigns ?? []).map(option),
            ]}
          />
          <Filter
            value={version}
            onChange={setVersion}
            label="Versión"
            values={[
              { value: "all", label: "Todas las versiones" },
              ...(dimensions.data?.versions ?? []).map(option),
            ]}
          />
        </section>
      </MobileFiltersPanel>

      {isMobile ? <MobileMetricsGrid metrics={mobileMetrics} moreLabel="Ver mas metricas" /> : null}

      <section className="hidden gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:grid">
        <Metric
          label="Registros nuevos"
          value={currentTotals.newUsers}
          previous={previousTotals.newUsers}
        />
        <Metric
          label="Pruebas iniciadas"
          value={currentTotals.trials}
          previous={previousTotals.trials}
        />
        <Metric
          label="Licencias pagadas nuevas"
          value={currentTotals.paidLicenses}
          previous={previousTotals.paidLicenses}
        />
        <Metric
          label="Activos hoy"
          value={todayRow?.activeUsers ?? 0}
          previous={yesterdayRow?.activeUsers ?? 0}
          comparison="vs ayer"
        />
        <Metric
          label="Activos semanales"
          value={todayRow?.weeklyActiveUsers ?? 0}
          previous={weekAgoRow?.weeklyActiveUsers ?? 0}
          comparison="vs hace 7 días"
        />
        <Metric
          label="Activos mensuales"
          value={todayRow?.monthlyActiveUsers ?? 0}
          previous={weekAgoRow?.monthlyActiveUsers ?? 0}
          comparison="vs hace 7 días"
        />
        <Metric
          label="Inicios de sesión"
          value={currentTotals.logins}
          previous={previousTotals.logins}
        />
        <Metric
          label="Renovaciones"
          value={currentTotals.renewals}
          previous={previousTotals.renewals}
        />
        <Metric
          label="Licencias vencidas"
          value={currentTotals.expired}
          previous={previousTotals.expired}
          inverse
        />
        <Metric
          label="Conversión prueba a pago"
          value={`${retention.data?.trialToPaidRate ?? 0}%`}
        />
        <Metric label="Retención 7 días" value={`${retention.data?.retention7Rate ?? 0}%`} />
        <Metric label="Retención 30 días" value={`${retention.data?.retention30Rate ?? 0}%`} />
      </section>

      {chartRows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No hay datos de rendimiento para este filtro.
          </CardContent>
        </Card>
      ) : (
        <section className="grid gap-6 xl:grid-cols-2">
          <ChartCard
            title="Uso real de la aplicación"
            description="Usuarios activos y sesiones sin inflar métricas por recargas."
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip {...adminChartTooltipProps} />
                <Legend {...adminChartLegendProps} />
                <Area
                  type="monotone"
                  dataKey="activeUsers"
                  name="Activos"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.2}
                />
                <Area
                  type="monotone"
                  dataKey="logins"
                  name="Sesiones"
                  stroke="#a78bfa"
                  fill="#a78bfa"
                  fillOpacity={0.12}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Crecimiento y licencias"
            description="Registros, pruebas y pagadas en el mismo periodo para lectura de embudo."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip {...adminChartTooltipProps} />
                <Legend {...adminChartLegendProps} />
                <Bar dataKey="newUsers" name="Registros" fill="#38bdf8" />
                <Bar dataKey="trials" name="Pruebas" fill="#fbbf24" />
                <Bar dataKey="paidLicenses" name="Pagadas" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>
      )}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">Ingresos confirmados</CardTitle>
          <CardDescription>
            Se muestran separados por moneda para evitar interpretaciones incorrectas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Money currency="CUP" value={currentTotals.revenueCUP} />
            <Money currency="USD" value={currentTotals.revenueUSD} />
            <Money currency="EUR" value={currentTotals.revenueEUR} />
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2">
        <Comparison
          title="Hoy frente a ayer"
          current={todayRow?.activeUsers ?? 0}
          previous={yesterdayRow?.activeUsers ?? 0}
        />
        <Comparison
          title="Hoy frente a hace 7 días"
          current={todayRow?.activeUsers ?? 0}
          previous={weekAgoRow?.activeUsers ?? 0}
          subtitle="Comparación del mismo indicador semanal"
        />
      </section>
    </div>
  );
}

function PeriodChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      className="h-9 flex-1 rounded-xl"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function option(value: string) {
  return { value, label: value };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function variation(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function totals(rows: UsageAnalyticsDay[]) {
  return rows.reduce(
    (sum, row) => ({
      newUsers: sum.newUsers + row.newUsers,
      trials: sum.trials + row.trials,
      paidLicenses: sum.paidLicenses + row.paidLicenses,
      activeUsers: sum.activeUsers + row.activeUsers,
      logins: sum.logins + row.logins,
      renewals: sum.renewals + row.renewals,
      expired: sum.expired + row.expired,
      revenueCUP: sum.revenueCUP + row.revenueCUP,
      revenueUSD: sum.revenueUSD + row.revenueUSD,
      revenueEUR: sum.revenueEUR + row.revenueEUR,
    }),
    {
      newUsers: 0,
      trials: 0,
      paidLicenses: 0,
      activeUsers: 0,
      logins: 0,
      renewals: 0,
      expired: 0,
      revenueCUP: 0,
      revenueUSD: 0,
      revenueEUR: 0,
    },
  );
}

function aggregate(rows: UsageAnalyticsDay[], grain: Grain) {
  if (grain === "daily") return rows;

  const groups = new Map<string, UsageAnalyticsDay[]>();
  rows.forEach((row) => {
    const date = new Date(`${row.date}T12:00:00`);
    const key =
      grain === "monthly"
        ? row.date.slice(0, 7)
        : isoDate(addDays(date, -((date.getDay() + 6) % 7)));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return [...groups].map(([date, values]) => ({ date, ...totals(values) }));
}

function Filter({
  value,
  onChange,
  label,
  values,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  values: FilterOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {values.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Metric({
  label,
  value,
  previous,
  comparison = "vs periodo anterior",
  inverse = false,
}: {
  label: string;
  value: string | number;
  previous?: number;
  comparison?: string;
  inverse?: boolean;
}) {
  const numeric = typeof value === "number" ? value : null;
  const change = numeric !== null && previous !== undefined ? variation(numeric, previous) : null;
  const positive = change !== null && (inverse ? change < 0 : change > 0);

  return (
    <Card className="glass-panel">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {change !== null ? (
          <div
            className={`mt-1 flex items-center gap-1 text-xs ${
              change === 0
                ? "text-muted-foreground"
                : positive
                  ? "text-emerald-500"
                  : "text-destructive"
            }`}
          >
            {change > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : change < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Activity className="h-3 w-3" />
            )}
            {change > 0 ? "+" : ""}
            {change.toFixed(1)}% {comparison}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-80 min-w-0">{children}</CardContent>
    </Card>
  );
}

function Money({ currency, value }: { currency: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{currency}</div>
      <div className="text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function Comparison({
  title,
  current,
  previous,
  subtitle,
}: {
  title: string;
  current: number;
  previous: number;
  subtitle?: string;
}) {
  const change = variation(current, previous);

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <CalendarDays className="h-4 w-4 text-primary" />
            {title}
          </div>
          <div className="text-xs text-muted-foreground">
            {subtitle ?? `${current} activos frente a ${previous}`}
          </div>
        </div>
        <Badge variant={change >= 0 ? "default" : "destructive"}>
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}%
        </Badge>
      </CardContent>
    </Card>
  );
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/network|fetch|connection|offline/i.test(message)) {
    return "Sin conexión. Verifica internet para actualizar los indicadores de rendimiento.";
  }
  return message;
}
