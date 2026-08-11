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
  ShieldAlert,
  TrendingUp,
  Users,
  Filter as FilterIcon,
  Layers,
  ArrowRight,
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
import {
  AnalyticsDateRangePicker,
  usePersistentAnalyticsDateRange,
} from "@/components/admin/AnalyticsDateRange";
import { adminChartTooltipProps } from "@/lib/chart-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Route = createFileRoute("/admin/proyectos/$id/")({
  component: ResumenPage,
});

const REFRESH_INTERVAL = 30_000;
const DAY = 86_400_000;

type PeriodKey = "today" | "7d" | "30d" | "month" | "prev-month" | "custom";

function ResumenPage() {
  const { id } = Route.useParams();
  const isMobile = useIsMobile();
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
  const [period, setPeriod] = useState<PeriodKey>("7d");
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
  const cancelledPeriod = periodPayments.filter((payment) => payment.status === "cancelled");
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
  const expiring30 = selectedLicenseRows.filter((license) => {
    if (!license.expiresAt || license.status !== "active") return false;
    const delta = new Date(license.expiresAt).getTime() - now;
    return delta >= 0 && delta <= 30 * DAY;
  }).length;

  const clientsWithoutLicense = clientsRows.filter((client) => !client.licenseId).length;
  const newClientsPeriod = clientsRows.filter((client) => {
    const created = new Date(client.registeredAt).getTime();
    return created >= range.start.getTime() && created <= range.end.getTime();
  }).length;

  const renewalsPeriod = (audit.data ?? []).filter((entry) => {
    const at = new Date(entry.createdAt).getTime();
    return (
      entry.action === "license_renewed" && at >= range.start.getTime() && at <= range.end.getTime()
    );
  }).length;
  const renewalsPrevious = (audit.data ?? []).filter((entry) => {
    const at = new Date(entry.createdAt).getTime();
    return (
      entry.action === "license_renewed" &&
      at >= previousRange.start.getTime() &&
      at <= previousRange.end.getTime()
    );
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
  const revenueToday = totalByStatus(
    byDateRange(filteredPayments, startOfToday(), endOfToday()).filter(
      (payment) => payment.status === "paid",
    ),
  );
  const revenueYesterday = totalByStatus(
    byDateRange(filteredPayments, startOfYesterday(), endOfYesterday()).filter(
      (payment) => payment.status === "paid",
    ),
  );

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
      .sort((a, b) => b.count - a.count);
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

    if (totalLeads === 0 && !canViewCommercial) {
      return null; // indicates no commercial data available
    }

    return [
      { label: "Leads", count: totalLeads, desc: "Leads comerciales activos" },
      { label: "Contactados", count: contacted, desc: "Con contacto/interacción" },
      { label: "Prueba", count: inTrial, desc: "En trial/prueba" },
      { label: "Pago", count: converted, desc: "Convertidos a pago" },
      { label: "Renovación", count: renewed, desc: "Renovaciones periodo" },
    ];
  }, [leadsRows, canViewCommercial]);

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

  const mobileSummaryMetrics: MobileMetric[] = [
    {
      key: "today",
      label: "Ingresos hoy",
      value: allLoading ? "Cargando..." : revenueToday || "0",
    },
    {
      key: "period",
      label: "Ingresos periodo",
      value: allLoading ? "Cargando..." : revenuePeriod || "0",
    },
    {
      key: "activeClients",
      label: "Clientes activos",
      value: allLoading ? "Cargando..." : String(activeClientsCount),
    },
    {
      key: "paidLicenses",
      label: "Licencias pagadas",
      value: allLoading ? "Cargando..." : String(paidLicensesCount),
    },
    {
      key: "conversion",
      label: "Conversión",
      value: allLoading
        ? "Cargando..."
        : conversionRate === null
          ? "Sin datos"
          : `${conversionRate}%`,
    },
    {
      key: "renewals",
      label: "Renovaciones próximas",
      value: allLoading ? "Cargando..." : String(upcomingRenewalsCount),
    },
  ];

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

  const rangeLabel = `${formatDateShort(range.start)} - ${formatDateShort(range.end)}`;
  const freshnessLabel = buildFreshnessLabel(dataUpdatedAt, allLoading);

  return (
    <div className="space-y-6 md:space-y-8">
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
        <div className="flex flex-wrap gap-2">
          <PeriodChip
            active={period === "today"}
            onClick={() => setPreset("today", setDateRange, setPeriod)}
          >
            Hoy
          </PeriodChip>
          <PeriodChip
            active={period === "7d"}
            onClick={() => setPreset("7d", setDateRange, setPeriod)}
          >
            7 días
          </PeriodChip>
          <PeriodChip
            active={period === "30d"}
            onClick={() => setPreset("30d", setDateRange, setPeriod)}
          >
            30 días
          </PeriodChip>
          <PeriodChip
            active={period === "month"}
            onClick={() => setPreset("month", setDateRange, setPeriod)}
          >
            Mes actual
          </PeriodChip>
          <PeriodChip
            active={period === "prev-month"}
            onClick={() => setPreset("prev-month", setDateRange, setPeriod)}
          >
            Mes anterior
          </PeriodChip>
          <PeriodChip active={period === "custom"} onClick={() => setPeriod("custom")}>
            Personalizado
          </PeriodChip>
        </div>

        <div className="hidden md:block">
          <AnalyticsDateRangePicker
            range={dateRange}
            onChange={(next) => {
              setPeriod("custom");
              setDateRange(next);
            }}
          />
        </div>

        {period === "custom" ? (
          <div className="grid gap-2 md:hidden min-[360px]:grid-cols-2">
            <DateField
              label="Desde"
              value={dateRange.from}
              onChange={(value) => setDateRange({ from: value, to: dateRange.to })}
            />
            <DateField
              label="Hasta"
              value={dateRange.to}
              onChange={(value) => setDateRange({ from: dateRange.from, to: value })}
            />
          </div>
        ) : null}

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
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {friendlyError(queryError)}
        </div>
      ) : null}

      {alertItems.length ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Alertas operativas
          </h3>
          <div className="grid gap-2.5 md:grid-cols-2">
            {alertItems.map((alert) => (
              <Button
                key={alert.label}
                asChild
                variant="outline"
                className="h-11 justify-between rounded-xl border-amber-500/30 bg-amber-500/5 text-left hover:bg-amber-500/10 transition-colors"
              >
                <Link to={alert.to}>
                  <span className="truncate text-xs font-medium">{alert.label}</span>
                  <Badge
                    variant="secondary"
                    className="ml-2 shrink-0 bg-amber-500/20 text-amber-300 font-mono"
                  >
                    {alert.value}
                  </Badge>
                </Link>
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {/* 1. LOS 5 KPI PRINCIPALES (Semánticamente correctos) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">KPI principales</h3>
        {isMobile ? (
          <MobileMetricsGrid metrics={mobileSummaryMetrics} moreLabel="Ver mas metricas" />
        ) : null}
        <div className="hidden grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 md:grid">
          <Link to={`/admin/proyectos/${id}/pagos`} className="block group">
            <MetricCard
              label="Ingresos del período"
              value={allLoading ? "Cargando..." : revenuePeriod || "0"}
              comparison={renderComparison(revenuePeriod, revenuePrevious, "vs periodo anterior")}
              icon={CreditCard}
              module="resumen"
              isLoading={allLoading}
            />
          </Link>
          <Link to={`/admin/proyectos/${id}/clientes`} className="block group">
            <MetricCard
              label="Clientes activos"
              value={allLoading ? "Cargando..." : String(activeClientsCount)}
              comparison={`${newClientsPeriod} nuevos en periodo`}
              icon={Users}
              module="clientes"
              isLoading={allLoading}
            />
          </Link>
          <Link to={`/admin/proyectos/${id}/licencias`} className="block group">
            <MetricCard
              label="Licencias pagadas"
              value={allLoading ? "Cargando..." : String(paidLicensesCount)}
              comparison={`${activeLicenses} licencias activas total`}
              icon={FileKey2}
              module="licencias"
              isLoading={allLoading}
            />
          </Link>
          <Link to={`/admin/proyectos/${id}/clientes`} className="block group">
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
              module="pagos"
              isLoading={allLoading}
            />
          </Link>
          <Link to={`/admin/proyectos/${id}/licencias`} className="block group">
            <MetricCard
              label="Renovaciones próximas"
              value={allLoading ? "Cargando..." : String(upcomingRenewalsCount)}
              comparison={`${expiring7} vencen en 7 días`}
              icon={CalendarClock}
              module="planes"
              isLoading={allLoading}
            />
          </Link>
        </div>
      </section>

      {quickActions.length ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Accesos rápidos</h3>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  asChild
                  variant="outline"
                  className="h-11 justify-start rounded-xl px-3 border-border/70 bg-card/60 hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Link to={action.to}>
                    <Icon className="h-4 w-4 text-primary mr-2" />
                    <span className="truncate text-xs font-medium">{action.label}</span>
                  </Link>
                </Button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* 2. GRÁFICO DE INGRESOS */}
      {canViewPayments ? (
        <SectionCard title="Evolución de ingresos del período" module="resumen">
          {paidPeriod.length > 0 ? (
            <div className="h-64 md:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={revenueTimeSeries}
                  margin={{ left: -10, right: 10, top: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
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
                  />
                  <Tooltip
                    {...adminChartTooltipProps}
                    formatter={(val: unknown, currency: unknown) => [
                      typeof val === "number" ? val.toLocaleString() : val,
                      String(currency),
                    ]}
                  />
                  <Bar dataKey="CUP" fill="var(--semantic-success)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="USD" fill="var(--module-pagos)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="EUR" fill="var(--module-clientes)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={CreditCard}
              title="Sin ingresos registrados"
              description="No se registran pagos confirmados para el rango de fechas actual."
              module="pagos"
            />
          )}
        </SectionCard>
      ) : null}

      {/* 3. DISTRIBUCIÓN POR PLAN */}
      {canViewLicenses ? (
        <SectionCard title="Distribución de licencias por plan" module="resumen">
          {planDistribution.length > 0 ? (
            <div className="space-y-4">
              <div className="h-48 md:h-56 w-full">
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
                    <Bar dataKey="count" fill="var(--module-licencias)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
                {planDistribution.map((item) => (
                  <div
                    key={item.plan}
                    className="rounded-xl border border-border/70 bg-muted/20 p-3 text-center"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {item.plan}
                    </span>
                    <p className="mt-1 text-lg font-bold font-mono text-foreground">{item.count}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Layers}
              title="Sin distribución de planes"
              description="No hay licencias registradas con los filtros actuales."
              module="licencias"
            />
          )}
        </SectionCard>
      ) : null}

      {/* 4. EMBUDO COMERCIAL (Basado estrictamente en datos reales del módulo Comercial) */}
      <SectionCard title="Embudo comercial" module="resumen">
        {funnelSteps ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {funnelSteps.map((step, idx) => {
              const firstCount = funnelSteps[0].count;
              const pct = firstCount > 0 ? Math.round((step.count / firstCount) * 100) : 0;
              return (
                <div
                  key={step.label}
                  className="relative rounded-2xl border border-border/70 bg-card/60 p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {step.label}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {pct}%
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-extrabold font-mono text-foreground">
                      {step.count}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{step.desc}</p>
                  </div>
                  {idx < funnelSteps.length - 1 ? (
                    <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm">
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  ) : null}
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
          />
        )}
      </SectionCard>

      {canViewAnalytics ? (
        <SectionCard title="Actividad comercial (Registros y Pruebas)" module="resumen">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-xs min-[412px]:grid-cols-4">
              <MiniStat label="Nuevos hoy" value={chartCompact.at(-1)?.newUsers ?? 0} />
              <MiniStat label="Pruebas hoy" value={chartCompact.at(-1)?.trials ?? 0} />
              <MiniStat label="Pagadas hoy" value={chartCompact.at(-1)?.paidLicenses ?? 0} />
              <MiniStat label="Activos hoy" value={chartCompact.at(-1)?.activeUsers ?? 0} />
            </div>
            <div className="h-48 md:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartCompact} margin={{ left: -14, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis
                    dataKey="label"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={10}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    allowDecimals={false}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip {...adminChartTooltipProps} />
                  <Bar
                    dataKey="newUsers"
                    name="Nuevos"
                    fill="var(--module-clientes)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="paidLicenses"
                    name="Pagadas"
                    fill="var(--semantic-success)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="activeUsers"
                    name="Activos"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </SectionCard>
      ) : null}
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
      className="h-9 rounded-xl px-3"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold font-mono">{value}</p>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
    </label>
  );
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

function setPreset(
  preset: PeriodKey,
  setDateRange: (range: { from: string; to: string }) => void,
  setPeriod: (value: PeriodKey) => void,
) {
  const today = new Date();
  const todayIso = toIsoDate(today);

  const applyRange = (from: Date, to: Date) => {
    setDateRange({ from: toIsoDate(from), to: toIsoDate(to) });
    setPeriod(preset);
  };

  if (preset === "today") {
    setDateRange({ from: todayIso, to: todayIso });
    setPeriod(preset);
    return;
  }

  if (preset === "7d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    applyRange(start, today);
    return;
  }

  if (preset === "30d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    applyRange(start, today);
    return;
  }

  if (preset === "month") {
    applyRange(startOfCurrentMonth(), endOfCurrentMonth());
    return;
  }

  if (preset === "prev-month") {
    applyRange(startOfPreviousMonth(), endOfPreviousMonth());
    return;
  }

  setPeriod("custom");
}

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfToday() {
  const value = new Date();
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfYesterday() {
  const value = startOfToday();
  value.setDate(value.getDate() - 1);
  return value;
}

function endOfYesterday() {
  const value = endOfToday();
  value.setDate(value.getDate() - 1);
  return value;
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function endOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfPreviousMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
}

function endOfPreviousMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
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
