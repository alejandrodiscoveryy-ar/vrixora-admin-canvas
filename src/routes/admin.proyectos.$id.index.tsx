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
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
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
} from "recharts";

import { supabaseServices } from "@/lib/services";
import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export const Route = createFileRoute("/admin/proyectos/$id/")({
  component: ResumenPage,
});

const REFRESH_INTERVAL = 30_000;
const DAY = 86_400_000;

type PeriodKey = "today" | "7d" | "30d" | "month" | "prev-month" | "custom";

function ResumenPage() {
  const { id } = Route.useParams();
  const { data: project } = useProject(id);
  const { data: permissions = [], isLoading: permissionsLoading } = useProjectPermissions(id);

  const canViewClients = permissions.includes("customers.view");
  const canViewLicenses = permissions.includes("licenses.view");
  const canViewPayments = permissions.includes("payments.view");
  const canViewAudit = permissions.includes("audit.view");
  const canViewAnalytics = permissions.includes("analytics.view");

  const [dateRange, setDateRange] = usePersistentAnalyticsDateRange(
    `vrixora:analytics-range:${id}`,
  );
  const [period, setPeriod] = useState<PeriodKey>("custom");
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

  const now = Date.now();
  const licensesRows = useMemo(() => licenses.data ?? [], [licenses.data]);
  const clientsRows = useMemo(() => clients.data ?? [], [clients.data]);
  const paymentRows = useMemo(() => payments.data ?? [], [payments.data]);

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

  const activeLicenses = selectedLicenseRows.filter(
    (license) => license.status === "active",
  ).length;
  const expiring7 = selectedLicenseRows.filter((license) => {
    if (!license.expiresAt || license.status !== "active") return false;
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

  const trialClients = clientsRows.filter((client) => client.plan === "trial").length;
  const paidUniqueUsers = new Set(paidPeriod.map((payment) => payment.userId).filter(Boolean)).size;
  const conversionRate =
    trialClients > 0 ? Math.round((paidUniqueUsers / trialClients) * 100) : null;

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
  const revenuePeriod = totalByStatus(paidPeriod);
  const revenuePrevious = totalByStatus(paidPrevious);
  const revenueMonthCurrent = totalByStatus(
    byDateRange(filteredPayments, startOfCurrentMonth(), endOfCurrentMonth()).filter(
      (payment) => payment.status === "paid",
    ),
  );
  const revenueMonthPrevious = totalByStatus(
    byDateRange(filteredPayments, startOfPreviousMonth(), endOfPreviousMonth()).filter(
      (payment) => payment.status === "paid",
    ),
  );

  const analyticsRows = analytics.data ?? [];
  const chartRows = analyticsRows.map((row) => ({
    ...row,
    label: new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(
      new Date(`${row.date}T12:00:00`),
    ),
  }));
  const chartCompact = chartRows.slice(-14);

  const queryError = [clients, licenses, payments, plans, audit, analytics].find(
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
    },
  ].filter((item) => item.value > 0);

  const recentEvents = (audit.data ?? []).slice(0, 8).map((entry) => {
    const metadata = entry.metadata as Record<string, unknown>;
    return {
      id: entry.id,
      title: eventLabel(entry.action),
      who: entry.actorEmail ?? "Sistema",
      when: new Date(entry.createdAt).toLocaleString(),
      change: describeChange(metadata),
      reference:
        stringValue(metadata.paymentId) ||
        stringValue(metadata.payment_id) ||
        stringValue(metadata.receiptId) ||
        stringValue(metadata.receipt_id) ||
        "",
    };
  });

  const quickActions = [
    {
      label: "Registrar pago",
      to: `/admin/proyectos/${id}/pagos`,
      show: canViewPayments,
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
      show: canViewLicenses,
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

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="md:hidden">
        <Card className="glass-panel border-border/70">
          <CardContent className="space-y-2.5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{project?.name ?? "Centro de Control"}</p>
                <p className="text-[11px] text-muted-foreground">{rangeLabel}</p>
              </div>
              <Badge variant={project?.status === "active" ? "default" : "secondary"}>
                {project?.status === "active" ? "Activo" : (project?.status ?? "—")}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {allLoading
                ? "Cargando datos..."
                : `Datos actualizados hace ${minutesAgo(dataUpdatedAt)} min`}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="hidden items-center justify-between gap-3 md:flex">
        <div>
          <h2 className="text-lg font-semibold">Resumen ejecutivo</h2>
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        </div>
        <Badge variant="outline" className="gap-2">
          <RefreshCw className="h-3 w-3" />
          {allLoading ? "Cargando..." : `Actualizado hace ${minutesAgo(dataUpdatedAt)} min`}
        </Badge>
      </section>

      <section className="space-y-2">
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
            options={["all", "paid", "pending", "cancelled", "refunded", "complimentary"]}
            renderOption={statusLabel}
          />
          <Filter
            label="Método"
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
      </section>

      {queryError ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="p-3 text-sm text-destructive">
            Error al cargar datos: {queryError.message}
          </CardContent>
        </Card>
      ) : null}

      {alertItems.length ? (
        <section className="space-y-2">
          <SectionTitle title="Alertas operativas" />
          <div className="grid gap-2 md:grid-cols-2">
            {alertItems.map((alert) => (
              <Button
                key={alert.label}
                asChild
                variant="outline"
                className="h-11 justify-between rounded-xl border-amber-400/30 bg-amber-500/5 text-left"
              >
                <Link to={alert.to}>
                  <span className="truncate text-xs">{alert.label}</span>
                  <span className="ml-2 shrink-0 text-sm font-semibold">{alert.value}</span>
                </Link>
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <SectionTitle title="Métricas críticas" />
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Ingresos hoy"
            value={allLoading ? "Cargando..." : revenueToday || "0"}
            comparison={renderComparison(revenueToday, revenueYesterday, "vs ayer")}
            to={`/admin/proyectos/${id}/pagos`}
            icon={TrendingUp}
          />
          <MetricCard
            label="Ingresos del periodo"
            value={allLoading ? "Cargando..." : revenuePeriod || "0"}
            comparison={renderComparison(revenuePeriod, revenuePrevious, "vs periodo anterior")}
            to={`/admin/proyectos/${id}/pagos`}
            icon={CreditCard}
          />
          <MetricCard
            label="Ingresos mes actual"
            value={allLoading ? "Cargando..." : revenueMonthCurrent || "0"}
            comparison={renderComparison(
              revenueMonthCurrent,
              revenueMonthPrevious,
              "vs mes anterior",
            )}
            to={`/admin/proyectos/${id}/pagos`}
            icon={CalendarClock}
          />
          <MetricCard
            label="Pagos pendientes"
            value={allLoading ? "Cargando..." : String(pendingPeriod.length)}
            comparison={`${cancelledPeriod.length} anulados`}
            to={`/admin/proyectos/${id}/pagos`}
            icon={AlertTriangle}
          />
          <MetricCard
            label="Renovaciones"
            value={allLoading ? "Cargando..." : String(renewalsPeriod)}
            comparison={renderComparisonCount(renewalsPeriod, renewalsPrevious)}
            to={`/admin/proyectos/${id}/auditoria`}
            icon={RefreshCw}
          />
          <MetricCard
            label="Licencias activas"
            value={allLoading ? "Cargando..." : String(activeLicenses)}
            comparison={`${expiring7} vencen en 7 días`}
            to={`/admin/proyectos/${id}/licencias`}
            icon={FileKey2}
          />
          <MetricCard
            label="Vencen en 30 días"
            value={allLoading ? "Cargando..." : String(expiring30)}
            comparison={`${expiring7} vencen en 7 días`}
            to={`/admin/proyectos/${id}/licencias`}
            icon={ShieldAlert}
          />
          <MetricCard
            label="Clientes nuevos"
            value={allLoading ? "Cargando..." : String(newClientsPeriod)}
            comparison={`${clientsWithoutLicense} sin licencia`}
            to={`/admin/proyectos/${id}/clientes`}
            icon={UserPlus}
          />
          <MetricCard
            label="Conversión prueba→pago"
            value={
              allLoading
                ? "Cargando..."
                : conversionRate === null
                  ? "Sin base"
                  : `${conversionRate}%`
            }
            comparison={
              conversionRate === null
                ? "No hay clientes en prueba"
                : `${paidUniqueUsers} pagos confirmados en prueba`
            }
            to={`/admin/proyectos/${id}/clientes`}
            icon={Users}
          />
        </div>
      </section>

      {quickActions.length ? (
        <section className="space-y-2">
          <SectionTitle title="Accesos rápidos" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  asChild
                  variant="outline"
                  className="h-11 justify-start rounded-xl px-3"
                >
                  <Link to={action.to}>
                    <Icon className="h-4 w-4" />
                    <span className="truncate text-xs">{action.label}</span>
                  </Link>
                </Button>
              );
            })}
          </div>
        </section>
      ) : null}

      {canViewAnalytics ? (
        <section className="space-y-2">
          <SectionTitle title="Actividad comercial" />
          <Card className="glass-panel">
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2 text-xs min-[412px]:grid-cols-4">
                <MiniStat label="Nuevos hoy" value={chartCompact.at(-1)?.newUsers ?? 0} />
                <MiniStat label="Pruebas hoy" value={chartCompact.at(-1)?.trials ?? 0} />
                <MiniStat label="Pagadas hoy" value={chartCompact.at(-1)?.paidLicenses ?? 0} />
                <MiniStat label="Activos hoy" value={chartCompact.at(-1)?.activeUsers ?? 0} />
              </div>
              <div className="h-48 md:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartCompact} margin={{ left: -14, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis
                      dataKey="label"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={10}
                    />
                    <YAxis allowDecimals={false} fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip {...adminChartTooltipProps} />
                    <Bar dataKey="newUsers" name="Nuevos" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                    <Bar
                      dataKey="paidLicenses"
                      name="Pagadas"
                      fill="#34d399"
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="activeUsers"
                      name="Activos"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {canViewAudit ? (
        <section className="space-y-2">
          <SectionTitle title="Actividad reciente" />
          <Card className="glass-panel">
            <CardContent className="space-y-2 p-3 sm:p-4">
              {(recentEvents.length ? recentEvents.slice(0, 5) : []).map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-border/60 bg-muted/10 p-2.5"
                >
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-[11px] text-muted-foreground">{event.change}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{event.who}</span>
                    <span>•</span>
                    <span>{event.when}</span>
                    {event.reference ? (
                      <>
                        <span>•</span>
                        <span>{event.reference}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {recentEvents.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin actividad reciente.
                </p>
              ) : null}
              <Button asChild variant="ghost" size="sm" className="h-9 px-2">
                <Link to="/admin/proyectos/$id/$section" params={{ id, section: "auditoria" }}>
                  Ver historial completo
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
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

function MetricCard({
  label,
  value,
  comparison,
  to,
  icon: Icon,
}: {
  label: string;
  value: string;
  comparison: string;
  to: string;
  icon: typeof TrendingUp;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      className="h-auto rounded-xl border border-border/60 bg-card/70 p-0 text-left"
    >
      <Link to={to}>
        <div className="flex w-full items-center gap-2.5 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="truncate text-lg font-semibold text-foreground">{value}</p>
            <p className="truncate text-[11px] text-muted-foreground">{comparison}</p>
          </div>
        </div>
      </Link>
    </Button>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 p-2">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>;
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

function eventLabel(action: string) {
  const map: Record<string, string> = {
    license_renewed: "Licencia renovada",
    payment_recorded: "Pago registrado",
    payment_voided: "Pago anulado",
    receipt_repaired: "Recibo generado",
    customer_created: "Cliente creado",
    license_created: "Licencia creada",
  };
  return map[action] ?? action.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function describeChange(metadata: Record<string, unknown>) {
  const keys = ["status", "plan", "amount", "currency", "expiresAt", "durationDays"];
  const pieces = keys
    .map((key) => {
      const value = metadata[key];
      if (value === undefined || value === null || value === "") return null;
      return `${key}: ${String(value)}`;
    })
    .filter(Boolean);

  return pieces.length ? pieces.join(" · ") : "Sin detalle adicional";
}

function minutesAgo(timestamp: number) {
  if (!timestamp) return "—";
  const delta = Date.now() - timestamp;
  return Math.max(0, Math.floor(delta / 60_000));
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
  const currentTotal = parseMoneySum(current);
  const previousTotal = parseMoneySum(previous);

  if (previousTotal === 0) {
    return currentTotal === 0 ? `${suffix}: sin cambio` : `${suffix}: sin base comparativa`;
  }

  const delta = ((currentTotal - previousTotal) / previousTotal) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% ${suffix}`;
}

function renderComparisonCount(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? "Sin cambios" : "Sin base comparativa";
  }
  const delta = ((current - previous) / previous) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs periodo anterior`;
}

function parseMoneySum(value: string) {
  if (value === "0") return 0;
  return value
    .split(" · ")
    .map((part) => Number(part.split(" ")[0].replaceAll(",", "")) || 0)
    .reduce((sum, amount) => sum + amount, 0);
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
    cancelled: "Anulado",
    refunded: "Reembolsado",
    complimentary: "Cortesía",
  };
  return labels[value] ?? value;
}
