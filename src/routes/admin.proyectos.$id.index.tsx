import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BadgeDollarSign,
  KeyRound,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabaseServices } from "@/lib/services";
import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminChartTooltipProps } from "@/lib/chart-theme";

export const Route = createFileRoute("/admin/proyectos/$id/")({
  component: ResumenPage,
});

const REFRESH_INTERVAL = 30_000;
const DAY = 86_400_000;
const chartColors = ["hsl(var(--primary))", "hsl(var(--accent))", "#38bdf8", "#a78bfa", "#fb7185"];

function ResumenPage() {
  const { id } = Route.useParams();
  const { data: project } = useProject(id);
  const { data: permissions = [], isLoading: permissionsLoading } = useProjectPermissions(id);
  const canViewClients = permissions.includes("customers.view");
  const canViewLicenses = permissions.includes("licenses.view");
  const canViewPayments = permissions.includes("payments.view");
  const canViewAudit = permissions.includes("audit.view");
  const canViewAnalytics = permissions.includes("analytics.view");

  const analyticsTo = new Date().toISOString().slice(0, 10);
  const analyticsFromDate = new Date();
  analyticsFromDate.setDate(analyticsFromDate.getDate() - 29);
  const analyticsFrom = analyticsFromDate.toISOString().slice(0, 10);

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
    queryFn: () => supabaseServices.audit.list(id, 8),
    enabled: !permissionsLoading && canViewAudit,
    refetchInterval: REFRESH_INTERVAL,
  });
  const analytics = useQuery({
    queryKey: ["summary-usage-analytics", id, analyticsFrom, analyticsTo],
    queryFn: () => supabaseServices.usageAnalytics.series(id, {
      from: analyticsFrom,
      to: analyticsTo,
    }),
    enabled: !permissionsLoading && canViewAnalytics,
    refetchInterval: REFRESH_INTERVAL,
  });

  const now = Date.now();
  const licenseRows = useMemo(() => licenses.data ?? [], [licenses.data]);
  const clientRows = useMemo(() => clients.data ?? [], [clients.data]);
  const paymentRows = useMemo(() => payments.data ?? [], [payments.data]);
  const paidPayments = useMemo(
    () => paymentRows.filter((payment) => payment.status === "paid"),
    [paymentRows],
  );
  const active = licenseRows.filter((license) => license.status === "active").length;
  const trial = licenseRows.filter((license) => license.licenseType === "trial" && license.status === "active").length;
  const suspended = licenseRows.filter((license) => license.status === "suspended").length;
  const expired = licenseRows.filter(
    (license) => license.status === "expired" || (!!license.expiresAt && new Date(license.expiresAt).getTime() < now),
  ).length;
  const expiring = licenseRows.filter((license) => {
    if (!license.expiresAt || license.status !== "active") return false;
    const remaining = new Date(license.expiresAt).getTime() - now;
    return remaining >= 0 && remaining <= 30 * DAY;
  }).length;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const startOfMonth = useMemo(
    () => {
      const [year, month] = currentMonthKey.split("-").map(Number);
      return new Date(year, month - 1, 1);
    },
    [currentMonthKey],
  );
  const startOfYear = new Date(startOfDay.getFullYear(), 0, 1);
  const revenueSince = (date: Date) => formatRevenue(
    paidPayments.filter((payment) => new Date(payment.createdAt) >= date),
  );
  const newRegistrations = clientRows.filter(
    (client) => new Date(client.registeredAt) >= startOfMonth,
  ).length;
  const renewals = (audit.data ?? []).filter(
    (event) => event.action === "license_renewed" && new Date(event.createdAt) >= startOfMonth,
  ).length;
  const convertedUsers = new Set(
    paidPayments.flatMap((payment) => payment.amount > 0 && payment.userEmail ? [payment.userEmail] : []),
  ).size;
  const conversion = clientRows.length ? Math.round((convertedUsers / clientRows.length) * 100) : 0;
  const analyticsRows = analytics.data ?? [];
  const todayAnalytics = analyticsRows.at(-1);
  const yesterdayAnalytics = analyticsRows.at(-2);
  const lastSevenAnalytics = analyticsTotals(analyticsRows.slice(-7));
  const previousSevenAnalytics = analyticsTotals(analyticsRows.slice(-14, -7));
  const acquisitionVariation = percentageVariation(
    lastSevenAnalytics.newUsers,
    previousSevenAnalytics.newUsers,
  );
  const dailyAcquisition = analyticsRows.slice(-14).map((row) => ({
    ...row,
    label: new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" })
      .format(new Date(`${row.date}T12:00:00`)),
  }));

  const monthlyRevenue = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("es", { month: "short" });
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 5 + index, 1);
      const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      const monthPayments = paidPayments.filter((payment) => {
        const created = new Date(payment.createdAt);
        return created >= date && created < next;
      });
      return {
        month: formatter.format(date),
        CUP: monthPayments.filter((payment) => payment.currency === "CUP").reduce((sum, payment) => sum + payment.amount, 0),
        USD: monthPayments.filter((payment) => payment.currency === "USD").reduce((sum, payment) => sum + payment.amount, 0),
        EUR: monthPayments.filter((payment) => payment.currency === "EUR").reduce((sum, payment) => sum + payment.amount, 0),
      };
    });
  }, [paidPayments, startOfMonth]);

  const licensesByPlan = useMemo(() => {
    const totals = new Map<string, number>();
    licenseRows.forEach((license) => totals.set(license.plan, (totals.get(license.plan) ?? 0) + 1));
    return [...totals].map(([name, value]) => ({ name, value }));
  }, [licenseRows]);

  const queryError = [clients, licenses, payments, audit, analytics].find((query) => query.isError)?.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Resumen operativo</h2>
          <p className="text-sm text-muted-foreground">Datos reales actualizados cada 30 segundos.</p>
        </div>
        <Badge variant="outline" className="gap-2">
          <RefreshCw className="h-3 w-3" /> Actualización automática
        </Badge>
      </div>

      {queryError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Algunos indicadores no pudieron actualizarse: {queryError.message}
        </div>
      )}

      <section className="space-y-3">
        <SectionHeading
          title="Vista general"
          description="Los cuatro indicadores principales para entender el estado del negocio."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {canViewClients && <Kpi icon={Users} label="Clientes totales" value={clientRows.length} />}
          {canViewAnalytics && <Kpi icon={UserPlus} label="Clientes nuevos hoy" value={todayAnalytics?.newUsers ?? 0} />}
          {canViewLicenses && <Kpi icon={KeyRound} label="Licencias activas" value={active} tone="success" />}
          {canViewPayments && <Kpi icon={TrendingUp} label="Ingresos este mes" value={revenueSince(startOfMonth)} tone="success" />}
        </div>
      </section>

      {canViewAnalytics && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Captación diaria de clientes</h3>
              <p className="text-sm text-muted-foreground">
                Registros, pruebas y ventas reales. Las aperturas de la aplicación se muestran por separado.
              </p>
            </div>
            <TrendBadge value={acquisitionVariation} label="últimos 7 días" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={UserPlus} label="Clientes nuevos hoy" value={todayAnalytics?.newUsers ?? 0} />
            <Kpi icon={Sparkles} label="Pruebas iniciadas hoy" value={todayAnalytics?.trials ?? 0} />
            <Kpi icon={BadgeDollarSign} label="Licencias pagadas hoy" value={todayAnalytics?.paidLicenses ?? 0} tone="success" />
            <Kpi icon={Activity} label="Usuarios activos hoy" value={todayAnalytics?.activeUsers ?? 0} tone="success" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="glass-panel xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Evolución diaria · últimos 14 días</CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 space-y-5">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <ChartLegend color="#38bdf8" label="Clientes nuevos" description="Primer registro" />
                  <ChartLegend color="#fbbf24" label="Pruebas iniciadas" description="Licencia trial" />
                  <ChartLegend color="#34d399" label="Licencias pagadas" description="Nueva venta" />
                  <ChartLegend color="hsl(var(--primary))" label="Usuarios activos" description="Uso real de la app" line />
                </div>
                <div className="h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyAcquisition} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                      <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip {...adminChartTooltipProps} />
                      <Bar dataKey="newUsers" name="Clientes nuevos" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="trials" name="Pruebas iniciadas" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="paidLicenses" name="Licencias pagadas" fill="#34d399" radius={[3, 3, 0, 0]} />
                      <Line type="monotone" dataKey="activeUsers" name="Usuarios activos" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel">
              <CardHeader><CardTitle className="text-base">Pulso de captación</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <HealthRow label="Nuevos hoy" value={String(todayAnalytics?.newUsers ?? 0)} />
                <HealthRow label="Nuevos ayer" value={String(yesterdayAnalytics?.newUsers ?? 0)} />
                <HealthRow label="Nuevos últimos 7 días" value={String(lastSevenAnalytics.newUsers)} />
                <HealthRow label="7 días anteriores" value={String(previousSevenAnalytics.newUsers)} />
                <HealthRow label="Pruebas últimos 7 días" value={String(lastSevenAnalytics.trials)} />
                <HealthRow label="Pagadas últimos 7 días" value={String(lastSevenAnalytics.paidLicenses)} />
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading
          title="Licencias y facturación"
          description="Alertas operativas y resultados comerciales sin mezclar monedas."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          {canViewLicenses && (
            <Card className="glass-panel">
              <CardHeader><CardTitle className="text-base">Estado de las licencias</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <StatusTile label="En prueba" value={trial} tone="primary" />
                <StatusTile label="Vencen en 30 días" value={expiring} tone="warning" />
                <StatusTile label="Suspendidas" value={suspended} tone="danger" />
                <StatusTile label="Vencidas" value={expired} tone="danger" />
                {canViewAudit && <StatusTile label="Renovaciones del mes" value={renewals} tone="success" />}
                <StatusTile label="Registros del mes" value={newRegistrations} tone="primary" />
              </CardContent>
            </Card>
          )}
          {canViewPayments && (
            <Card className="glass-panel">
              <CardHeader><CardTitle className="text-base">Facturación</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <HealthRow label="Ingresos de hoy" value={revenueSince(startOfDay)} />
                <HealthRow label="Ingresos de esta semana" value={revenueSince(startOfWeek)} />
                <HealthRow label="Ingresos de este mes" value={revenueSince(startOfMonth)} />
                <HealthRow label="Ingresos de este año" value={revenueSince(startOfYear)} />
                <div className="border-t pt-4">
                  <HealthRow label="Pagos pendientes" value={String(paymentRows.filter((payment) => payment.status === "pending").length)} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Distribución comercial"
          description="Ingresos confirmados por moneda y composición de licencias por plan."
        />
        <div className="grid gap-6 xl:grid-cols-3">
        {canViewPayments && (
          <Card className="glass-panel xl:col-span-2">
            <CardHeader><CardTitle className="text-base">Ingresos confirmados · últimos 6 meses</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevenue} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                  <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip {...adminChartTooltipProps} formatter={(value, name) => [`${Number(value).toLocaleString()} ${String(name)}`, "Ingresos"]} />
                  <Bar dataKey="CUP" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="USD" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="EUR" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {canViewLicenses && (
          <Card className="glass-panel">
            <CardHeader><CardTitle className="text-base">Licencias por plan</CardTitle></CardHeader>
            <CardContent className="h-72">
              {licensesByPlan.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={licensesByPlan} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={3}>
                      {licensesByPlan.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
                    </Pie>
                    <Tooltip {...adminChartTooltipProps} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyMessage text="Aún no hay licencias para mostrar." />}
            </CardContent>
          </Card>
        )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {canViewAudit && (
          <Card className="glass-panel lg:col-span-2">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" />Actividad reciente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(audit.data ?? []).length ? audit.data?.map((event) => (
                <div key={event.id} className="flex flex-col justify-between gap-1 border-b border-border/50 pb-3 last:border-0 sm:flex-row sm:gap-4">
                  <div><div className="text-sm font-medium">{humanize(event.action)}</div><div className="text-xs text-muted-foreground">{event.entityType}</div></div>
                  <div className="text-xs text-muted-foreground sm:text-right"><div>{event.actorEmail ?? "Sistema"}</div><div>{new Date(event.createdAt).toLocaleString()}</div></div>
                </div>
              )) : <EmptyMessage text="Sin actividad reciente." />}
            </CardContent>
          </Card>
        )}
        <Card className="glass-panel">
          <CardHeader><CardTitle className="text-base">Salud comercial</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <HealthRow label="Conversión a pago" value={`${conversion}%`} />
            <HealthRow label="Pagos pendientes" value={String(paymentRows.filter((payment) => payment.status === "pending").length)} />
            <HealthRow label="Licencias gestionadas" value={String(licenseRows.length)} />
            <div className="border-t pt-4">
              <p className="text-muted-foreground">{project?.description}</p>
              <div className="mt-3 flex items-center justify-between"><span>Proyecto</span><Badge variant={project?.status === "active" ? "default" : "secondary"}>{project?.status ?? "—"}</Badge></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone = "primary" }: { icon: typeof Users; label: string; value: string | number; tone?: "primary" | "success" | "warning" | "danger" }) {
  const colors = { primary: "text-primary bg-primary/10", success: "text-emerald-500 bg-emerald-500/10", warning: "text-amber-500 bg-amber-500/10", danger: "text-destructive bg-destructive/10" };
  return <Card className="glass-panel"><CardContent className="flex items-center gap-3 p-4"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors[tone]}`}><Icon className="h-5 w-5" /></div><div className="min-w-0"><div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-0.5 break-words text-xl font-semibold">{value}</div></div></CardContent></Card>;
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: number; tone: "primary" | "success" | "warning" | "danger" }) {
  const colors = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/5 text-amber-400",
    danger: "border-destructive/20 bg-destructive/5 text-destructive",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[tone]}`}>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ChartLegend({ color, label, description, line = false }: { color: string; label: string; description: string; line?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <span
        className={line ? "h-0.5 w-5 shrink-0 rounded-full" : "h-2.5 w-2.5 shrink-0 rounded-sm"}
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>;
}

function EmptyMessage({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">{text}</div>;
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

function TrendBadge({ value, label }: { value: number; label: string }) {
  const stable = value === 0;
  const positive = value > 0;
  return (
    <Badge
      variant="outline"
      className={stable
        ? "text-muted-foreground"
        : positive
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-destructive/30 bg-destructive/10 text-destructive"}
    >
      {positive ? "+" : ""}{value.toFixed(1)}% {label}
    </Badge>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatRevenue(payments: Awaited<ReturnType<typeof supabaseServices.payments.listAdmin>>) {
  const totals = new Map<string, number>();
  payments.forEach((payment) => totals.set(payment.currency, (totals.get(payment.currency) ?? 0) + payment.amount));
  if (!totals.size) return "0";
  return [...totals].map(([currency, total]) => `${total.toLocaleString()} ${currency}`).join(" · ");
}
