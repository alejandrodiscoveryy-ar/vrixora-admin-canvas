import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BadgeDollarSign,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

  const queryError = [clients, licenses, payments, audit].find((query) => query.isError)?.error;

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canViewClients && <Kpi icon={Users} label="Clientes registrados" value={clientRows.length} />}
        {canViewLicenses && <Kpi icon={KeyRound} label="Licencias activas" value={active} tone="success" />}
        {canViewLicenses && <Kpi icon={Sparkles} label="Clientes en prueba" value={trial} />}
        {canViewLicenses && <Kpi icon={CalendarClock} label="Por vencer (30 días)" value={expiring} tone="warning" />}
        {canViewLicenses && <Kpi icon={ShieldAlert} label="Suspendidas" value={suspended} tone="danger" />}
        {canViewLicenses && <Kpi icon={Clock3} label="Vencidas" value={expired} tone="danger" />}
        {canViewClients && <Kpi icon={UserPlus} label="Registros del mes" value={newRegistrations} />}
        {canViewAudit && <Kpi icon={BadgeDollarSign} label="Renovaciones del mes" value={renewals} />}
        {canViewPayments && <Kpi icon={CircleDollarSign} label="Ingresos de hoy" value={revenueSince(startOfDay)} tone="success" />}
        {canViewPayments && <Kpi icon={Wallet} label="Ingresos semanales" value={revenueSince(startOfWeek)} tone="success" />}
        {canViewPayments && <Kpi icon={TrendingUp} label="Ingresos mensuales" value={revenueSince(startOfMonth)} tone="success" />}
        {canViewPayments && <Kpi icon={Activity} label="Ingresos anuales" value={revenueSince(startOfYear)} tone="success" />}
      </div>

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
                  <Tooltip formatter={(value, name) => [`${Number(value).toLocaleString()} ${String(name)}`, "Ingresos"]} />
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
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyMessage text="Aún no hay licencias para mostrar." />}
            </CardContent>
          </Card>
        )}
      </div>

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

function HealthRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>;
}

function EmptyMessage({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">{text}</div>;
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
