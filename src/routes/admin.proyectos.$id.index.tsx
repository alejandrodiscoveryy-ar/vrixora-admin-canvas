import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarDays,
  CreditCard,
  FileKey2,
  RefreshCw,
  Search,
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

export const Route = createFileRoute("/admin/proyectos/$id/")({
  component: ResumenPage,
});

const REFRESH_INTERVAL = 30_000;
const DAY = 86_400_000;

type QuickAction = {
  label: string;
  to: string;
  icon: typeof CreditCard;
};

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
  const analyticsFrom = dateRange.from;
  const analyticsTo = dateRange.to;

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
  const audit = useQuery({
    queryKey: ["admin-audit", id],
    queryFn: () => supabaseServices.audit.list(id, 12),
    enabled: !permissionsLoading && canViewAudit,
    refetchInterval: REFRESH_INTERVAL,
  });
  const analytics = useQuery({
    queryKey: ["summary-usage-analytics", id, analyticsFrom, analyticsTo],
    queryFn: () =>
      supabaseServices.usageAnalytics.series(id, {
        from: analyticsFrom,
        to: analyticsTo,
      }),
    enabled: !permissionsLoading && canViewAnalytics,
    refetchInterval: REFRESH_INTERVAL,
  });

  const licenseRows = useMemo(() => licenses.data ?? [], [licenses.data]);
  const clientRows = useMemo(() => clients.data ?? [], [clients.data]);
  const paymentRows = useMemo(() => payments.data ?? [], [payments.data]);
  const paidPayments = useMemo(
    () => paymentRows.filter((payment) => payment.status === "paid"),
    [paymentRows],
  );

  const now = Date.now();
  const active = licenseRows.filter((license) => license.status === "active").length;
  const expiring = licenseRows.filter((license) => {
    if (!license.expiresAt || license.status !== "active") return false;
    const remaining = new Date(license.expiresAt).getTime() - now;
    return remaining >= 0 && remaining <= 30 * DAY;
  }).length;
  const suspended = licenseRows.filter((license) => license.status === "suspended").length;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const startOfMonth = useMemo(() => {
    const [year, month] = currentMonthKey.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }, [currentMonthKey]);

  const selectedStart = new Date(`${analyticsFrom}T00:00:00`);
  const selectedEnd = new Date(`${analyticsTo}T00:00:00`);
  selectedEnd.setDate(selectedEnd.getDate() + 1);

  const selectedRevenue = formatRevenue(
    paidPayments.filter((payment) => {
      const created = new Date(payment.createdAt);
      return created >= selectedStart && created < selectedEnd;
    }),
  );

  const pendingPayments = paymentRows.filter((payment) => payment.status === "pending").length;
  const newRegistrations = clientRows.filter((client) => {
    const registeredAt = new Date(client.registeredAt);
    return registeredAt >= selectedStart && registeredAt < selectedEnd;
  }).length;

  const analyticsRows = analytics.data ?? [];
  const todayAnalytics = analyticsRows.at(-1);
  const yesterdayAnalytics = analyticsRows.at(-2);
  const lastSevenAnalytics = analyticsTotals(analyticsRows.slice(-7));
  const previousSevenAnalytics = analyticsTotals(analyticsRows.slice(-14, -7));
  const acquisitionVariation = percentageVariation(
    lastSevenAnalytics.newUsers,
    previousSevenAnalytics.newUsers,
  );

  const chartRows = analyticsRows.map((row) => ({
    ...row,
    label: new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(
      new Date(`${row.date}T12:00:00`),
    ),
  }));

  const queryError = [clients, licenses, payments, audit, analytics].find(
    (query) => query.isError,
  )?.error;

  const activityItems = (audit.data ?? []).map((event) => ({
    id: event.id,
    title: mapAuditAction(event.action),
    time: new Date(event.createdAt).toLocaleString(),
    actor: event.actorEmail ?? "Sistema",
  }));
  const activityMobile = activityItems.slice(0, 5);
  const activityDesktop = activityItems.slice(0, 8);

  const rangeLabel = `${formatDateShort(analyticsFrom)} - ${formatDateShort(analyticsTo)}`;
  const periodDays = rangeDays(analyticsFrom, analyticsTo);
  const setPeriodDays = (days: number) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    setDateRange({
      from: toIsoDate(start),
      to: toIsoDate(end),
    });
  };

  const quickActions: QuickAction[] = [];
  if (canViewPayments) {
    quickActions.push({
      label: "Registrar pago",
      to: `/admin/proyectos/${id}/pagos`,
      icon: CreditCard,
    });
  }
  if (canViewLicenses) {
    quickActions.push({
      label: "Crear licencia",
      to: `/admin/proyectos/${id}/licencias`,
      icon: FileKey2,
    });
    quickActions.push({
      label: "Ver vencimientos",
      to: `/admin/proyectos/${id}/licencias`,
      icon: CalendarDays,
    });
  }
  if (canViewClients) {
    quickActions.push({
      label: "Buscar cliente",
      to: `/admin/proyectos/${id}/clientes`,
      icon: Search,
    });
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="md:hidden">
        <Card className="glass-panel border-border/70">
          <CardContent className="space-y-3 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">Hola, equipo</p>
                <p className="text-[11px] text-muted-foreground">{rangeLabel}</p>
              </div>
              <Badge variant={project?.status === "active" ? "default" : "secondary"}>
                {project?.status === "active" ? "Activo" : (project?.status ?? "—")}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              Actualización automática
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="hidden items-center justify-between gap-3 md:flex">
        <div>
          <h2 className="text-lg font-semibold">Resumen operativo</h2>
          <p className="text-sm text-muted-foreground">Periodo actual: {rangeLabel}</p>
        </div>
        <Badge variant="outline" className="gap-2">
          <RefreshCw className="h-3 w-3" /> Actualización automática
        </Badge>
      </section>

      <section className="space-y-2 md:hidden">
        <div className="flex gap-2">
          <PeriodButton active={periodDays <= 7} onClick={() => setPeriodDays(7)}>
            7 días
          </PeriodButton>
          <PeriodButton
            active={periodDays > 7 && periodDays <= 30}
            onClick={() => setPeriodDays(30)}
          >
            30 días
          </PeriodButton>
          <PeriodButton active={periodDays > 30} onClick={() => setPeriodDays(90)}>
            90 días
          </PeriodButton>
        </div>
      </section>

      <section className="hidden md:block">
        <AnalyticsDateRangePicker range={dateRange} onChange={setDateRange} />
      </section>

      {queryError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Algunos indicadores no pudieron actualizarse: {queryError.message}
        </div>
      )}

      {quickActions.length > 0 ? (
        <section className="space-y-2">
          <SectionTitle title="Acciones rápidas" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

      <section className="space-y-2">
        <SectionTitle title="Métricas principales" />
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 xl:grid-cols-4">
          {canViewClients && (
            <Kpi
              icon={Users}
              label="Clientes"
              value={clientRows.length}
              sublabel={`${newRegistrations} nuevos en el periodo`}
            />
          )}
          {canViewLicenses && (
            <Kpi
              icon={FileKey2}
              label="Licencias activas"
              value={active}
              sublabel={`${expiring} vencen pronto`}
              tone="success"
            />
          )}
          {canViewPayments && (
            <Kpi
              icon={TrendingUp}
              label="Ingresos del periodo"
              value={selectedRevenue}
              sublabel={`${pendingPayments} pagos pendientes`}
              tone="success"
            />
          )}
          {canViewAnalytics && (
            <Kpi
              icon={UserPlus}
              label="Clientes nuevos"
              value={todayAnalytics?.newUsers ?? 0}
              sublabel={`${acquisitionVariation >= 0 ? "+" : ""}${acquisitionVariation.toFixed(1)}% vs 7 días previos`}
            />
          )}
        </div>
      </section>

      {canViewAnalytics && (
        <section className="space-y-2">
          <SectionTitle title="Actividad comercial" />
          <Card className="glass-panel">
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2 text-xs min-[412px]:grid-cols-4">
                <MiniStat label="Nuevos hoy" value={todayAnalytics?.newUsers ?? 0} />
                <MiniStat label="Pruebas hoy" value={todayAnalytics?.trials ?? 0} />
                <MiniStat label="Pagadas hoy" value={todayAnalytics?.paidLicenses ?? 0} />
                <MiniStat label="Activos hoy" value={todayAnalytics?.activeUsers ?? 0} />
              </div>
              <div className="h-48 md:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ left: -16, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis
                      dataKey="label"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={14}
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
      )}

      <section className="grid gap-3 lg:grid-cols-2">
        {canViewLicenses && (
          <Card className="glass-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Licencias</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <CompactRow label="Activas" value={String(active)} />
              <CompactRow label="Vencen en 30 días" value={String(expiring)} />
              <CompactRow label="Suspendidas" value={String(suspended)} />
              <CompactRow
                label="Estado crítico"
                value={String(licenseRows.filter((item) => item.status === "expired").length)}
              />
              <div className="pt-1">
                <Button asChild variant="ghost" size="sm" className="h-9 px-2">
                  <Link to="/admin/proyectos/$id/$section" params={{ id, section: "licencias" }}>
                    Ver más
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {canViewPayments && (
          <Card className="glass-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ingresos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <CompactRow label="Hoy" value={formatRevenueSince(paidPayments, startOfDay)} />
              <CompactRow label="Semana" value={formatRevenueSince(paidPayments, startOfWeek)} />
              <CompactRow label="Mes" value={formatRevenueSince(paidPayments, startOfMonth)} />
              <CompactRow label="Pendientes" value={String(pendingPayments)} />
              <div className="pt-1">
                <Button asChild variant="ghost" size="sm" className="h-9 px-2">
                  <Link to="/admin/proyectos/$id/$section" params={{ id, section: "pagos" }}>
                    Ver más
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {canViewAudit && (
        <section className="space-y-2">
          <SectionTitle title="Actividad reciente" />
          <Card className="glass-panel">
            <CardContent className="space-y-2 p-3 sm:p-4">
              <div className="space-y-2 md:hidden">
                {activityMobile.length ? (
                  activityMobile.map((event) => (
                    <RecentItem
                      key={event.id}
                      title={event.title}
                      actor={event.actor}
                      time={event.time}
                    />
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Sin actividad reciente.
                  </p>
                )}
              </div>
              <div className="hidden space-y-2 md:block">
                {activityDesktop.length ? (
                  activityDesktop.map((event) => (
                    <RecentItem
                      key={event.id}
                      title={event.title}
                      actor={event.actor}
                      time={event.time}
                    />
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Sin actividad reciente.
                  </p>
                )}
              </div>

              <div className="pt-1">
                <Button asChild variant="ghost" size="sm" className="h-9 px-2">
                  <Link to="/admin/proyectos/$id/$section" params={{ id, section: "auditoria" }}>
                    Ver historial completo
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="hidden md:block">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-sm">Salud comercial</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <CompactRow
              label="Conversión a pago"
              value={`${clientRows.length ? Math.round((new Set(paidPayments.map((p) => p.userId)).size / clientRows.length) * 100) : 0}%`}
            />
            <CompactRow label="Pagos pendientes" value={String(pendingPayments)} />
            <CompactRow label="Licencias gestionadas" value={String(licenseRows.length)} />
            <CompactRow
              label="Estado"
              value={project?.status === "active" ? "Activo" : (project?.status ?? "—")}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function PeriodButton({
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
      onClick={onClick}
      className="h-9 flex-1 rounded-xl"
    >
      {children}
    </Button>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = "primary",
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sublabel: string;
  tone?: "primary" | "success";
}) {
  const toneStyles = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
  };

  return (
    <Card className="glass-panel border-border/70">
      <CardContent className="flex min-h-[88px] items-center gap-2.5 p-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneStyles[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="truncate text-lg font-semibold text-foreground">{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{sublabel}</p>
        </div>
      </CardContent>
    </Card>
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

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}

function RecentItem({ title, actor, time }: { title: string; actor: string; time: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/10 p-2.5">
      <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{actor}</p>
        <p className="text-[11px] text-muted-foreground">{time}</p>
      </div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>;
}

function mapAuditAction(action: string) {
  const labels: Record<string, string> = {
    license_renewed: "Licencia renovada",
    payment_recorded: "Pago registrado",
    customer_created: "Cliente creado",
    receipt_repaired: "Recibo generado",
    license_created: "Licencia creada",
    license_status_changed: "Estado de licencia actualizado",
    plan_changed: "Plan actualizado",
  };
  return (
    labels[action] ?? action.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
  );
}

function analyticsTotals(rows: Awaited<ReturnType<typeof supabaseServices.usageAnalytics.series>>) {
  return rows.reduce(
    (totals, row) => ({
      newUsers: totals.newUsers + row.newUsers,
      trials: totals.trials + row.trials,
      paidLicenses: totals.paidLicenses + row.paidLicenses,
    }),
    { newUsers: 0, trials: 0, paidLicenses: 0 },
  );
}

function percentageVariation(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function rangeDays(from: string, to: string) {
  const fromDate = new Date(`${from}T12:00:00`).getTime();
  const toDate = new Date(`${to}T12:00:00`).getTime();
  return Math.max(1, Math.round((toDate - fromDate) / DAY) + 1);
}

function formatDateShort(value: string) {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatRevenueSince(
  payments: Awaited<ReturnType<typeof supabaseServices.payments.listAdmin>>,
  fromDate: Date,
) {
  return formatRevenue(payments.filter((payment) => new Date(payment.createdAt) >= fromDate));
}

function formatRevenue(payments: Awaited<ReturnType<typeof supabaseServices.payments.listAdmin>>) {
  const totals = new Map<string, number>();
  payments.forEach((payment) => {
    totals.set(payment.currency, (totals.get(payment.currency) ?? 0) + payment.amount);
  });

  if (!totals.size) return "0";

  return [...totals]
    .map(([currency, total]) => `${total.toLocaleString()} ${currency}`)
    .join(" · ");
}
