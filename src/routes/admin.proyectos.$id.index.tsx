import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  FileKey2,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  Filter as FilterIcon,
  Layers,
  ArrowRight,
  Activity,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
} from "recharts";

import { supabaseServices } from "@/lib/services";
import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePersistentAnalyticsDateRange } from "@/components/admin/AnalyticsDateRange";
import { AdminPeriodSelector } from "@/components/admin/AdminPeriodSelector";
import type { AdminPeriodKey } from "@/components/admin/admin-period";
import { adminChartSeries, adminChartTooltipProps } from "@/lib/chart-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MobileFiltersPanel } from "@/components/admin/MobileAdminSystem";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { SectionCard } from "@/components/admin/SectionCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { ChartCard } from "@/components/admin/ChartCard";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { PageAlert } from "@/components/admin/PageAlert";

export const Route = createFileRoute("/admin/proyectos/$id/")({
  component: ResumenPage,
});

const REFRESH_INTERVAL = 30_000;
const DAY = 86_400_000;

function ResumenPage() {
  const { id } = Route.useParams();
  const { data: project } = useProject(id);
  const { data: permissions = [], isLoading: permissionsLoading } = useProjectPermissions(id);

  const canViewClients = permissions.includes("customers.view");
  const canViewLicenses = permissions.includes("licenses.view");
  const canViewPayments = permissions.includes("payments.view");
  const canViewAudit = permissions.includes("audit.view");
  const canViewAnalytics = permissions.includes("analytics.view");
  const canViewCommercial = permissions.includes("commercial.view");
  const canManageLicenses = permissions.includes("licenses.manage");
  const canManagePayments = permissions.includes("payments.manage");

  const [dateRange, setDateRange] = usePersistentAnalyticsDateRange(
    `vrixora:analytics-range:${id}`,
  );
  const [period, setPeriod] = useState<AdminPeriodKey>("7d");
  const [planFilter, setPlanFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");

  const clients = useQuery({
    queryKey: ["admin-clients", id],
    queryFn: () => supabaseServices.licenses.listClients(id),
    enabled: !permissionsLoading && canViewClients,
    refetchInterval: REFRESH_INTERVAL,
  });
  const licenses = useQuery({
    queryKey: ["admin-licenses", id],
    queryFn: () => supabaseServices.licenses.list(id),
    enabled: !permissionsLoading && canViewLicenses,
    refetchInterval: REFRESH_INTERVAL,
  });
  const payments = useQuery({
    queryKey: ["admin-payments", id],
    queryFn: () => supabaseServices.payments.listAdmin(id),
    enabled: !permissionsLoading && canViewPayments,
    refetchInterval: REFRESH_INTERVAL,
  });
  const plans = useQuery({
    queryKey: ["admin-license-plans", id],
    queryFn: () => supabaseServices.licenses.listAdminPlans(id),
    enabled: !permissionsLoading && canViewLicenses,
    refetchInterval: REFRESH_INTERVAL,
  });
  const audit = useQuery({
    queryKey: ["admin-audit", id],
    queryFn: () => supabaseServices.audit.list(id, 30),
    enabled: !permissionsLoading && canViewAudit,
    refetchInterval: REFRESH_INTERVAL,
  });
  const analytics = useQuery({
    queryKey: ["summary-usage-analytics", id, dateRange.from, dateRange.to],
    queryFn: () =>
      supabaseServices.usageAnalytics.series(id, {
        from: dateRange.from,
        to: dateRange.to,
      }),
    enabled: !permissionsLoading && canViewAnalytics,
    refetchInterval: REFRESH_INTERVAL,
  });
  const commercialLeads = useQuery({
    queryKey: ["admin-commercial-leads", id],
    queryFn: () => supabaseServices.commercial.listLeads(id),
    enabled: !permissionsLoading && canViewCommercial,
    refetchInterval: REFRESH_INTERVAL,
  });

  const now = Date.now();
  const licensesRows = useMemo(() => licenses.data ?? [], [licenses.data]);
  const clientsRows = useMemo(() => clients.data ?? [], [clients.data]);
  const paymentRows = useMemo(() => payments.data ?? [], [payments.data]);
  const leadsRows = useMemo(() => commercialLeads.data ?? [], [commercialLeads.data]);
  const licenseById = useMemo(
    () => new Map(licensesRows.map((license) => [license.id, license])),
    [licensesRows],
  );
  const planByCode = useMemo(
    () => new Map((plans.data ?? []).map((plan) => [plan.code.toLowerCase(), plan])),
    [plans.data],
  );

  const planCodes = useMemo(
    () => [...new Set(paymentRows.map((row) => row.plan).filter(Boolean))],
    [paymentRows],
  );
  const operatorValues = useMemo(
    () =>
      [
        ...new Set(paymentRows.map((row) => row.operatorLabel ?? row.employeeId).filter(Boolean)),
      ].sort(),
    [paymentRows],
  );

  const filteredPayments = useMemo(
    () =>
      paymentRows.filter((row) => {
        const operator = row.operatorLabel ?? row.employeeId;
        return (
          (planFilter === "all" || row.plan === planFilter) &&
          (paymentStatusFilter === "all" || row.status === paymentStatusFilter) &&
          (methodFilter === "all" || row.method === methodFilter) &&
          (operatorFilter === "all" || operator === operatorFilter)
        );
      }),
    [paymentRows, planFilter, paymentStatusFilter, methodFilter, operatorFilter],
  );

  const range = useMemo(
    () => toRange(dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to],
  );
  const previousRange = useMemo(
    () => previousWindow(range.start, range.end),
    [range.start, range.end],
  );

  const periodPayments = useMemo(
    () => byDateRange(filteredPayments, range.start, range.end),
    [filteredPayments, range.start, range.end],
  );
  const previousPeriodPayments = useMemo(
    () => byDateRange(filteredPayments, previousRange.start, previousRange.end),
    [filteredPayments, previousRange.start, previousRange.end],
  );

  const paidPeriod = periodPayments.filter((payment) => payment.status === "paid");
  const paidPrevious = previousPeriodPayments.filter((payment) => payment.status === "paid");
  const pendingPeriod = periodPayments.filter((payment) => payment.status === "pending");
  const missingReceiptPeriod = periodPayments.filter(
    (payment) => ["paid", "complimentary"].includes(payment.status) && !payment.hasReceipt,
  );

  const selectedLicenseRows = useMemo(
    () =>
      licensesRows.filter((license) => {
        return planFilter === "all" || license.plan === planFilter;
      }),
    [licensesRows, planFilter],
  );

  const isActiveLicense = (license: (typeof licensesRows)[number]) =>
    license.status === "active" &&
    (!license.expiresAt || new Date(license.expiresAt).getTime() >= now);

  const hasLicenseType = (license: (typeof licensesRows)[number], type: string) => {
    const normalizedType = type.toLowerCase();
    const planCode = license.plan.toLowerCase();
    return (
      license.licenseType.toLowerCase() === normalizedType ||
      planCode === normalizedType ||
      planByCode.get(planCode)?.licenseType.toLowerCase() === normalizedType
    );
  };

  const hasConfirmedPayment = (license: (typeof licensesRows)[number]) =>
    paymentRows.some(
      (payment) =>
        payment.status === "paid" &&
        (payment.licenseId === license.id || payment.userId === license.userId),
    );

  const isPaidCommercialLicense = (license: (typeof licensesRows)[number]) =>
    isActiveLicense(license) &&
    !hasLicenseType(license, "trial") &&
    !hasLicenseType(license, "admin") &&
    hasConfirmedPayment(license);

  const activeLicenses = selectedLicenseRows.filter(isActiveLicense).length;
  const activeClientsCount = clientsRows.filter((client) => {
    if (!client.licenseId || client.status !== "active") return false;
    const license = licenseById.get(client.licenseId);
    const expiresAt = license?.expiresAt ?? client.expiresAt;
    return (
      (!license || license.status === "active") &&
      (!expiresAt || new Date(expiresAt).getTime() >= now)
    );
  }).length;

  // Corrected "Licencias pagadas" rule: active licenses, excluding trial and admin, with confirmed payment history
  const paidLicensesCount = licensesRows.filter(isPaidCommercialLicense).length;

  // Corrected "Renovaciones próximas" rule: paid commercial licenses expiring within 30 days
  const upcomingRenewalsCount = licensesRows.filter((license) => {
    if (!isPaidCommercialLicense(license) || !license.expiresAt) return false;
    const delta = new Date(license.expiresAt).getTime() - now;
    return delta >= 0 && delta <= 30 * DAY;
  }).length;

  const expiring7 = selectedLicenseRows.filter((license) => {
    if (!license.expiresAt || !isPaidCommercialLicense(license)) return false;
    const delta = new Date(license.expiresAt).getTime() - now;
    return delta >= 0 && delta <= 7 * DAY;
  }).length;
  const clientsWithoutLicense = clientsRows.filter((client) => !client.licenseId).length;
  const newClientsPeriod = clientsRows.filter((client) => {
    const created = new Date(client.registeredAt).getTime();
    return created >= range.start.getTime() && created <= range.end.getTime();
  }).length;

  const trialCohort = leadsRows.filter((lead) => {
    const createdAt = new Date(lead.createdAt).getTime();
    return (
      Boolean(lead.userId) &&
      lead.trialStarted &&
      createdAt >= range.start.getTime() &&
      createdAt <= range.end.getTime()
    );
  });
  const convertedTrialUsers = trialCohort.filter((lead) => lead.paid).length;
  const conversionRate =
    trialCohort.length > 0 ? Math.round((convertedTrialUsers / trialCohort.length) * 100) : null;

  const revenuePeriod = totalByStatus(paidPeriod);
  const revenuePrevious = totalByStatus(paidPrevious);
  // Revenue time series for chart
  const revenueTimeSeries = useMemo(() => {
    const totals = new Map<string, Record<string, number>>();
    paidPeriod.forEach((payment) => {
      const date = payment.createdAt.slice(0, 10);
      const dailyTotals = totals.get(date) ?? {};
      dailyTotals[payment.currency] = (dailyTotals[payment.currency] ?? 0) + payment.amount;
      totals.set(date, dailyTotals);
    });

    const rows = [];
    const cursor = new Date(range.start);
    cursor.setHours(12, 0, 0, 0);
    const end = new Date(range.end);
    end.setHours(12, 0, 0, 0);
    while (cursor <= end) {
      const date = toIsoDate(cursor);
      rows.push({
        date,
        label: formatDateShort(cursor),
        CUP: totals.get(date)?.CUP ?? 0,
        USD: totals.get(date)?.USD ?? 0,
        EUR: totals.get(date)?.EUR ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  }, [paidPeriod, range.start, range.end]);

  // Plan distribution for chart
  const planDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    selectedLicenseRows.forEach((l) => {
      const p = l.plan || "general";
      counts.set(p, (counts.get(p) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([plan, count]) => ({
        plan: plan.toUpperCase(),
        count,
      }))
      .sort((a, b) => {
        if (a.plan === "ADMIN") return 1;
        if (b.plan === "ADMIN") return -1;
        return b.count - a.count;
      });
  }, [selectedLicenseRows]);

  // Corrected Commercial Funnel Data from actual leadsRows
  const funnelSteps = useMemo(() => {
    const activeLeads = leadsRows.filter((l) => !l.archivedAt);
    const totalLeads = activeLeads.length;
    const contactedStatuses = new Set([
      "contacted",
      "interested",
      "trial",
      "ready_to_charge",
      "customer",
      "not_interested",
    ]);
    const contacted = activeLeads.filter((lead) => contactedStatuses.has(lead.status)).length;
    const inTrial = activeLeads.filter((lead) => lead.trialStarted).length;
    const converted = activeLeads.filter((lead) => lead.paid).length;
    const renewed = activeLeads.filter((lead) => lead.renewalCount > 0).length;

    if (totalLeads === 0) return null;

    return [
      { label: "Leads", count: totalLeads, desc: "Leads comerciales activos" },
      { label: "Contactados", count: contacted, desc: "Con contacto/interacción" },
      { label: "Prueba", count: inTrial, desc: "En trial/prueba" },
      { label: "Pago", count: converted, desc: "Convertidos a pago" },
      { label: "Renovación", count: renewed, desc: "Renovaciones periodo" },
    ];
  }, [leadsRows]);

  const analyticsRows = analytics.data ?? [];
  const chartRows = analyticsRows.map((row) => ({
    ...row,
    label: new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(
      new Date(`${row.date}T12:00:00`),
    ),
  }));
  const chartCompact = chartRows.slice(-14);

  const queryError = [clients, licenses, payments, plans, audit, analytics, commercialLeads].find(
    (q) => q.isError,
  )?.error;
  const allLoading = [clients, licenses, payments, plans, audit, analytics].some(
    (q) => q.isLoading,
  );

  const dataUpdatedAt = Math.max(
    clients.dataUpdatedAt,
    licenses.dataUpdatedAt,
    payments.dataUpdatedAt,
    plans.dataUpdatedAt,
    audit.dataUpdatedAt,
    analytics.dataUpdatedAt,
  );

  const inactivePlanAssignments = selectedLicenseRows.filter((license) => {
    const plan = (plans.data ?? []).find((item) => item.code === license.plan);
    return plan ? !plan.isActive : false;
  }).length;

  const alertItems = [
    {
      label: "Pagos pendientes",
      value: pendingPeriod.length,
      to: `/admin/proyectos/${id}/pagos`,
    },
    {
      label: "Licencias vencen en 7 días",
      value: expiring7,
      to: `/admin/proyectos/${id}/licencias`,
    },
    {
      label: "Pagos sin recibo",
      value: missingReceiptPeriod.length,
      to: `/admin/proyectos/${id}/pagos`,
    },
    {
      label: "Clientes sin licencia",
      value: clientsWithoutLicense,
      to: `/admin/proyectos/${id}/clientes`,
    },
    {
      label: "Planes inactivos asignados",
      value: inactivePlanAssignments,
      to: `/admin/proyectos/${id}/licencias`,
      search: { issue: "inactive-assigned-plans" },
    },
  ].filter((item) => item.value > 0);

  const activeFilterCount = [planFilter, paymentStatusFilter, methodFilter, operatorFilter].filter(
    (value) => value !== "all",
  ).length;

  const quickActions = [
    {
      label: "Registrar pago",
      to: `/admin/proyectos/${id}/pagos`,
      show: canManagePayments,
      icon: CreditCard,
    },
    {
      label: "Buscar cliente",
      to: `/admin/proyectos/${id}/clientes`,
      show: canViewClients,
      icon: Search,
    },
    {
      label: "Crear licencia",
      to: `/admin/proyectos/${id}/licencias`,
      show: canManageLicenses,
      icon: FileKey2,
    },
    {
      label: "Ver vencimientos",
      to: `/admin/proyectos/${id}/licencias`,
      show: canViewLicenses,
      icon: CalendarClock,
    },
    {
      label: "Pagos pendientes",
      to: `/admin/proyectos/${id}/pagos`,
      show: canViewPayments,
      icon: AlertTriangle,
    },
  ].filter((item) => item.show);

  const recentActivity = (audit.data ?? []).slice(0, 7);

  const rangeLabel = `${formatDateShort(range.start)} - ${formatDateShort(range.end)}`;
  const freshnessLabel = buildFreshnessLabel(dataUpdatedAt, allLoading);

  return (
    <div className="space-y-4 md:space-y-8">
      <ModuleHeader
        title="Resumen ejecutivo"
        description={rangeLabel}
        icon={TrendingUp}
        module="resumen"
        actions={
          <Badge variant="outline" className="gap-2 bg-card/50 px-3 py-1 text-xs">
            <RefreshCw className={`h-3 w-3 text-primary ${allLoading ? "animate-spin" : ""}`} />
            {freshnessLabel}
          </Badge>
        }
      />

      <section className="space-y-3">
        <AdminPeriodSelector
          value={period}
          range={dateRange}
          onChange={(nextPeriod, nextRange) => {
            setPeriod(nextPeriod);
            setDateRange(nextRange);
          }}
        />

        <MobileFiltersPanel
          activeFilters={activeFilterCount}
          onClear={() => {
            setPlanFilter("all");
            setPaymentStatusFilter("all");
            setMethodFilter("all");
            setOperatorFilter("all");
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <Filter
              label="Plan"
              value={planFilter}
              onChange={setPlanFilter}
              options={["all", ...planCodes]}
              renderOption={planLabel}
            />
            <Filter
              label="Estado"
              value={paymentStatusFilter}
              onChange={setPaymentStatusFilter}
              options={[
                "all",
                "paid",
                "pending",
                "cancelled",
                "refunded",
                "complimentary",
                "voided",
              ]}
              renderOption={statusLabel}
            />
            <Filter
              label="Metodo"
              value={methodFilter}
              onChange={setMethodFilter}
              options={["all", "transfer", "cash", "other", "card", "paypal"]}
              renderOption={methodLabel}
            />
            <Filter
              label="Operador"
              value={operatorFilter}
              onChange={setOperatorFilter}
              options={["all", ...operatorValues]}
              renderOption={(value) => (value === "all" ? "Todos" : value)}
            />
          </div>
        </MobileFiltersPanel>
      </section>

      {queryError ? (
        <PageAlert tone="error" title="No fue posible actualizar el resumen">
          {friendlyError(queryError)}
        </PageAlert>
      ) : null}

      <section aria-labelledby="summary-kpis" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--module-foreground)]">
              Estado del negocio
            </p>
            <h2 id="summary-kpis" className="mt-1 text-lg font-semibold text-text-primary">
              Indicadores principales
            </h2>
          </div>
          <span className="hidden text-xs text-text-tertiary sm:block">{rangeLabel}</span>
        </div>
        <KpiGrid columns={5} density="compact">
          <Link
            to="/admin/proyectos/$id/$section"
            params={{ id, section: "pagos" }}
            className="block group"
          >
            <MetricCard
              label="Ingresos del período"
              value={allLoading ? "Cargando..." : revenuePeriod || "0"}
              comparison={renderComparison(revenuePeriod, revenuePrevious, "vs periodo anterior")}
              icon={CreditCard}
              module="resumen"
              isLoading={allLoading}
            />
          </Link>
          <Link
            to="/admin/proyectos/$id/$section"
            params={{ id, section: "clientes" }}
            className="block group"
          >
            <MetricCard
              label="Clientes activos"
              value={allLoading ? "Cargando..." : String(activeClientsCount)}
              comparison={`${newClientsPeriod} nuevos en periodo`}
              icon={Users}
              semanticState="info"
              isLoading={allLoading}
            />
          </Link>
          <Link
            to="/admin/proyectos/$id/$section"
            params={{ id, section: "licencias" }}
            className="block group"
          >
            <MetricCard
              label="Licencias pagadas"
              value={allLoading ? "Cargando..." : String(paidLicensesCount)}
              comparison={`${activeLicenses} licencias activas total`}
              icon={FileKey2}
              semanticState="success"
              isLoading={allLoading}
            />
          </Link>
          <Link
            to="/admin/proyectos/$id/$section"
            params={{ id, section: "clientes" }}
            className="block group"
          >
            <MetricCard
              label="Conversión prueba → pago"
              value={
                allLoading
                  ? "Cargando..."
                  : conversionRate === null
                    ? "Sin datos"
                    : `${conversionRate}%`
              }
              comparison={
                conversionRate === null
                  ? "Sin datos de cohorte Trial"
                  : `${convertedTrialUsers} de ${trialCohort.length} convertidos`
              }
              icon={TrendingUp}
              module="resumen"
              isLoading={allLoading}
            />
          </Link>
          <Link
            to="/admin/proyectos/$id/$section"
            params={{ id, section: "licencias" }}
            className="block group"
          >
            <MetricCard
              label="Renovaciones próximas"
              value={allLoading ? "Cargando..." : String(upcomingRenewalsCount)}
              comparison={`${expiring7} vencen en 7 días`}
              icon={CalendarClock}
              semanticState="warning"
              isLoading={allLoading}
            />
          </Link>
        </KpiGrid>
      </section>

      <section aria-label="Evolución del negocio" className="grid gap-4 xl:grid-cols-2">
        {canViewPayments ? (
          <ChartCard
            title="Ingresos"
            description="Pagos confirmados por día y moneda"
            module="resumen"
            isLoading={payments.isLoading}
            isEmpty={paidPeriod.length === 0}
            emptyTitle="Sin ingresos registrados"
            emptyDescription="No hay pagos confirmados para el período y filtros actuales."
            legend={<CurrencyLegend />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={revenueTimeSeries} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.12} />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                  stroke="var(--text-tertiary)"
                />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--text-tertiary)"
                />
                <Tooltip
                  {...adminChartTooltipProps}
                  formatter={(value: unknown, currency: unknown) => [
                    typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
                    String(currency),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="CUP"
                  stroke="var(--semantic-success)"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="USD"
                  stroke="var(--module-resumen)"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="EUR"
                  stroke="var(--module-clientes)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {canViewAnalytics ? (
          <ChartCard
            title="Crecimiento"
            description="Registros, pruebas y licencias pagadas"
            module="resumen"
            isLoading={analytics.isLoading}
            isEmpty={chartCompact.length === 0}
            emptyTitle="Sin datos de crecimiento"
            emptyDescription="Todavía no hay actividad suficiente en el período seleccionado."
            legend={<GrowthLegend />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartCompact} margin={{ left: -14, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.12} />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                  stroke="var(--text-tertiary)"
                />
                <YAxis
                  allowDecimals={false}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--text-tertiary)"
                />
                <Tooltip {...adminChartTooltipProps} />
                <Line
                  type="monotone"
                  dataKey="newUsers"
                  name="Registros"
                  stroke={adminChartSeries.registrations}
                  strokeWidth={2.25}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="trials"
                  name="Pruebas"
                  stroke={adminChartSeries.trials}
                  strokeWidth={2.25}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="paidLicenses"
                  name="Pagadas"
                  stroke={adminChartSeries.paid}
                  strokeWidth={2.25}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}
      </section>

      <section aria-label="Distribución y conversión" className="grid gap-4 xl:grid-cols-2">
        {canViewLicenses ? (
          <SectionCard
            title="Distribución por plan"
            description="Licencias asignadas por plan real"
            module="resumen"
          >
            {planDistribution.length > 0 ? (
              <div className="space-y-4">
                <div className="h-48 w-full sm:h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={planDistribution}
                      layout="vertical"
                      margin={{ left: 20, right: 20, top: 10, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.15} />
                      <XAxis
                        type="number"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        dataKey="plan"
                        type="category"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        stroke="var(--muted-foreground)"
                        width={80}
                      />
                      <Tooltip {...adminChartTooltipProps} />
                      <Bar dataKey="count" fill="var(--module-accent)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {planDistribution.map((item) => (
                    <div
                      key={item.plan}
                      className="flex min-w-28 flex-1 items-center justify-between gap-3 rounded-[var(--radius-compact)] border border-border-subtle bg-surface-2 px-3 py-2"
                    >
                      <span className="truncate text-xs font-medium text-text-secondary">
                        {item.plan}
                      </span>
                      <span className="font-mono text-sm font-bold text-text-primary">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Layers}
                title="Sin distribución de planes"
                description="No hay licencias registradas con los filtros actuales."
                module="resumen"
                className="min-h-56"
              />
            )}
          </SectionCard>
        ) : null}

        <SectionCard
          title="Embudo comercial"
          description="Progreso basado en datos reales del módulo Comercial"
          module="resumen"
        >
          {funnelSteps ? (
            <div className="space-y-2.5">
              {funnelSteps.map((step, idx) => {
                const firstCount = funnelSteps[0].count;
                const pct = firstCount > 0 ? Math.round((step.count / firstCount) * 100) : 0;
                return (
                  <div
                    key={step.label}
                    className="rounded-[var(--radius-compact)] border border-border-subtle bg-surface-2 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">{step.label}</p>
                        <p className="truncate text-xs text-text-tertiary">{step.desc}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-lg font-bold text-text-primary">
                          {step.count}
                        </span>
                        <Badge variant="info" className="rounded-full font-mono">
                          {pct}%
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-[var(--module-accent)] transition-[width] duration-[var(--motion-layout)]"
                        style={{ width: `${pct}%`, opacity: Math.max(0.42, 1 - idx * 0.1) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={FilterIcon}
              title="Sin datos comerciales"
              description="No se dispone de permisos o registros en el módulo comercial para construir el embudo."
              module="comercial"
              className="min-h-56"
            />
          )}
        </SectionCard>
      </section>

      <section
        aria-label="Operación reciente"
        className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]"
      >
        {canViewAudit ? (
          <SectionCard
            title="Actividad reciente"
            description="Últimos movimientos administrativos"
            module="resumen"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin/proyectos/$id/$section" params={{ id, section: "auditoria" }}>
                  Ver toda la auditoría <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          >
            {recentActivity.length ? (
              <ol className="divide-y divide-border-subtle" aria-label="Eventos recientes">
                {recentActivity.map((event) => (
                  <li key={event.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--module-border)] bg-[var(--module-surface)] text-[var(--module-foreground)]">
                      <Activity className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
                        {auditEntityLabel(event.entityType)} · {event.actorEmail ?? "Sistema"}
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
                className="min-h-48 p-6"
              />
            )}
          </SectionCard>
        ) : null}

        <div className="space-y-4">
          {quickActions.length ? (
            <SectionCard
              title="Acciones rápidas"
              module="resumen"
              contentClassName="grid gap-2 sm:grid-cols-2 xl:grid-cols-1"
            >
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.label}
                    asChild
                    variant={index === 0 ? "subtle" : "outline"}
                    className="justify-start"
                  >
                    <Link to={action.to}>
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{action.label}</span>
                    </Link>
                  </Button>
                );
              })}
            </SectionCard>
          ) : null}

          {alertItems.length ? (
            <SectionCard title="Requiere atención" module="resumen" contentClassName="space-y-2">
              {alertItems.map((alert) => (
                <Button
                  key={alert.label}
                  asChild
                  variant="outline"
                  className="w-full justify-between border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)]"
                >
                  <Link to={alert.to}>
                    <span className="truncate text-xs">{alert.label}</span>
                    <Badge variant="warning" className="ml-2 shrink-0 font-mono">
                      {alert.value}
                    </Badge>
                  </Link>
                </Button>
              ))}
            </SectionCard>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
  renderOption,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  renderOption: (value: string) => string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {renderOption(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CurrencyLegend() {
  return (
    <>
      <LegendItem color="var(--semantic-success)" label="CUP" />
      <LegendItem color="var(--module-resumen)" label="USD" />
      <LegendItem color="var(--module-clientes)" label="EUR" />
    </>
  );
}

function GrowthLegend() {
  return (
    <>
      <LegendItem color={adminChartSeries.registrations} label="Registros" />
      <LegendItem color={adminChartSeries.trials} label="Pruebas" />
      <LegendItem color={adminChartSeries.paid} label="Pagadas" />
    </>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    license_renewed: "Licencia renovada",
    license_created: "Licencia creada",
    payment_recorded: "Pago registrado",
    payment_created: "Pago registrado",
    insert: "Registro creado",
    update: "Registro actualizado",
    delete: "Registro eliminado",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function auditEntityLabel(entity: string) {
  const labels: Record<string, string> = {
    payment: "Pago",
    payments: "Pago",
    license: "Licencia",
    licenses: "Licencia",
    customer: "Cliente",
    profile: "Cliente",
    project_member: "Empleado",
    commercial_lead: "Lead comercial",
  };
  return labels[entity] ?? entity.replaceAll("_", " ");
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toRange(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00`),
    end: new Date(`${to}T23:59:59.999`),
  };
}

function byDateRange<T extends { createdAt: string }>(rows: T[], start: Date, end: Date) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return rows.filter((row) => {
    const at = new Date(row.createdAt).getTime();
    return at >= startMs && at <= endMs;
  });
}

function previousWindow(start: Date, end: Date) {
  const rangeMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - rangeMs);
  return { start: previousStart, end: previousEnd };
}

function totalByStatus(rows: Awaited<ReturnType<typeof supabaseServices.payments.listAdmin>>) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount);
  });
  if (!totals.size) return "0";
  return [...totals]
    .map(([currency, value]) => `${value.toLocaleString()} ${currency}`)
    .join(" · ");
}

function minutesAgo(timestamp: number) {
  if (!timestamp) return "—";
  const delta = Date.now() - timestamp;
  return Math.max(0, Math.floor(delta / 60_000));
}

function buildFreshnessLabel(timestamp: number, loading: boolean) {
  if (loading) return "Cargando datos...";
  if (!timestamp) return "Sin datos recientes";
  return `Datos actualizados hace ${minutesAgo(timestamp)} min`;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("connection")
  ) {
    return "Sin conexión: no fue posible actualizar los datos. Revisa internet e inténtalo de nuevo.";
  }
  if (lower.includes("not configured")) {
    return "El entorno no está configurado para cargar datos de Supabase.";
  }
  return `Error al cargar datos: ${message}`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatDateShort(date: Date) {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(date);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function renderComparison(current: string, previous: string, suffix: string) {
  const currentByCurrency = parseMoneyByCurrency(current);
  const previousByCurrency = parseMoneyByCurrency(previous);
  const currencies = [...new Set([...currentByCurrency.keys(), ...previousByCurrency.keys()])];

  if (currencies.length === 0) return `${suffix}: sin cambio`;
  if (currencies.length > 1) return `${suffix}: comparación por moneda no disponible`;

  const currency = currencies[0];
  const currentTotal = currentByCurrency.get(currency) ?? 0;
  const previousTotal = previousByCurrency.get(currency) ?? 0;
  if (previousTotal === 0) {
    return currentTotal === 0 ? `${suffix}: sin cambio` : `${suffix}: sin base comparativa`;
  }

  const delta = ((currentTotal - previousTotal) / previousTotal) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% ${suffix}`;
}

function parseMoneyByCurrency(value: string) {
  const totals = new Map<string, number>();
  if (!value || value === "0") return totals;
  value.split(" · ").forEach((part) => {
    const [amountRaw, currency] = part.trim().split(" ");
    const amount = Number((amountRaw ?? "").replaceAll(",", ""));
    if (!currency || Number.isNaN(amount)) return;
    totals.set(currency, amount);
  });
  return totals;
}

function planLabel(value: string) {
  return value === "all" ? "Todos los planes" : value;
}

function methodLabel(value: string) {
  const labels: Record<string, string> = {
    all: "Todos los métodos",
    transfer: "Transferencia",
    cash: "Efectivo",
    other: "Otro",
    card: "Tarjeta",
    paypal: "PayPal",
  };
  return labels[value] ?? value;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    all: "Todos los estados",
    paid: "Pagado",
    pending: "Pendiente",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    complimentary: "Cortesía",
    voided: "Anulado",
  };
  return labels[value] ?? value;
}
