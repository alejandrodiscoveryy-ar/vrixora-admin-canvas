import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import {
  supabaseServices,
  type LicensePlan,
  type ServiceLicense,
  type ServicePayment,
  type BillingReceipt,
  type ServiceClient,
} from "@/lib/services";
import { ReceiptDialog } from "@/features/admin/ChargePlanDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useProjectPermissions } from "@/hooks/useProjects";
import { useIsMobile } from "@/hooks/use-mobile";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { FilterToolbar } from "@/components/admin/FilterToolbar";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminDataTableShell } from "@/components/admin/AdminDataTableShell";
import { SectionCard } from "@/components/admin/SectionCard";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { adminChartTooltipProps } from "@/lib/chart-theme";

export default function PagosSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [method, setMethod] = useState("all");
  const [operator, setOperator] = useState("all");
  const [period, setPeriod] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editing, setEditing] = useState<ServicePayment | null>(null);
  const [deleting, setDeleting] = useState<ServicePayment | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<BillingReceipt | null>(null);

  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("payments.manage");
  const canCorrect = permissions.includes("payments.correct");

  const query = useQuery({
    queryKey: ["admin-payments", projectId],
    queryFn: () => supabaseServices.payments.listAdmin(projectId),
    refetchInterval: 30_000,
  });
  const licenses = useQuery({
    queryKey: ["admin-licenses", projectId],
    queryFn: () => supabaseServices.licenses.list(projectId),
    refetchInterval: 30_000,
  });
  const renewalLicenseIds = useMemo(
    () => [
      ...new Set(
        (query.data ?? [])
          .filter((payment) => payment.status === "paid" && payment.licenseId)
          .map((payment) => payment.licenseId as string),
      ),
    ],
    [query.data],
  );
  const renewalAudit = useQuery({
    queryKey: ["payment-renewal-audit", projectId, renewalLicenseIds],
    queryFn: async () =>
      (
        await Promise.all(
          renewalLicenseIds.map((licenseId) => supabaseServices.licenses.listHistory(licenseId)),
        )
      ).flat(),
    enabled: query.data !== undefined,
    refetchInterval: 30_000,
  });
  const clients = useQuery({
    queryKey: ["admin-clients", projectId],
    queryFn: () => supabaseServices.licenses.listClients(projectId),
  });
  const availablePlans = useQuery({
    queryKey: ["admin-license-plans", projectId],
    queryFn: () => supabaseServices.licenses.listAdminPlans(projectId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-payments", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["payment-renewal-audit", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-licenses", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-clients", projectId] });
  };

  const markPaid = useMutation({
    mutationFn: (paymentId: string) =>
      supabaseServices.payments.updateStatus(paymentId, "paid", "Pago confirmado desde el panel"),
    onSuccess: async (payment) => {
      const receipt = await supabaseServices.payments.receipt(payment.id);
      setViewingReceipt(receipt);
      toast.success("Pago registrado y licencia actualizada");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const operators = useMemo(
    () => [...new Set(rows.map((p) => p.operatorLabel ?? p.employeeId).filter(Boolean))].sort(),
    [rows],
  );

  const metricBaseRows = useMemo(() => {
    return rows.filter((p) => {
      const matchPlan = plan === "all" || p.plan === plan;
      const matchStatus = status === "all" || p.status === status;
      const matchCurrency = currency === "all" || p.currency === currency;
      const matchMethod = method === "all" || p.method === method;
      const matchOp = operator === "all" || (p.operatorLabel ?? p.employeeId) === operator;
      return matchPlan && matchStatus && matchCurrency && matchMethod && matchOp;
    });
  }, [rows, plan, status, currency, method, operator]);

  const metricRows = useMemo(
    () =>
      metricBaseRows.filter((payment) =>
        isPaymentInPeriod(payment.createdAt, period, fromDate, toDate),
      ),
    [metricBaseRows, period, fromDate, toDate],
  );

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return metricRows.filter((payment) => {
      if (!normalizedSearch) return true;
      const text =
        `${payment.userEmail ?? ""} ${payment.reference} ${payment.plan} ${payment.operatorLabel ?? ""}`.toLowerCase();
      return text.includes(normalizedSearch);
    });
  }, [metricRows, search]);

  // 4 KPI Principales Financieros
  const paidRows = useMemo(
    () => metricRows.filter((payment) => payment.status === "paid"),
    [metricRows],
  );
  const financialsByCurrency = useMemo(() => {
    const map = new Map<string, { revenue: number; charges: number }>();
    paidRows.forEach((payment) => {
      const current = map.get(payment.currency) ?? { revenue: 0, charges: 0 };
      current.revenue += payment.amount;
      current.charges += 1;
      map.set(payment.currency, current);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [paidRows]);

  const revenueDisplay =
    financialsByCurrency.length > 0
      ? financialsByCurrency
          .map(([curr, totals]) => `${formatAmount(totals.revenue)} ${curr}`)
          .join(" · ")
      : "0";

  const formattedAvgTicket =
    financialsByCurrency.length > 0
      ? financialsByCurrency
          .map(([curr, totals]) => `${formatAmount(totals.revenue / totals.charges)} ${curr}`)
          .join(" · ")
      : "0";

  const renewalsCount = useMemo(() => {
    const paidById = new Map(paidRows.map((payment) => [payment.id, payment]));
    const confirmedRenewalPayments = new Set<string>();
    (renewalAudit.data ?? []).forEach((entry) => {
      if (entry.action !== "license_renewed") return;
      const paymentId = String(entry.metadata.payment_id ?? "");
      const payment = paidById.get(paymentId);
      if (!payment || payment.licenseId !== entry.licenseId) return;
      confirmedRenewalPayments.add(paymentId);
    });
    return confirmedRenewalPayments.size;
  }, [renewalAudit.data, paidRows]);

  // 30-day revenue chart data
  const revenue30d = useMemo(() => {
    const end = chartEndDate(period, toDate);
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const currencies = [
      ...new Set(
        metricRows
          .filter((payment) => payment.status === "paid")
          .map((payment) => payment.currency),
      ),
    ].sort();
    const byDay = new Map<string, Record<string, number>>();

    metricRows.forEach((payment) => {
      if (payment.status !== "paid") return;
      const paymentDate = new Date(payment.createdAt);
      if (paymentDate < start || paymentDate > end) return;
      const day = localIsoDate(paymentDate);
      const totals = byDay.get(day) ?? {};
      totals[payment.currency] = (totals[payment.currency] ?? 0) + payment.amount;
      byDay.set(day, totals);
    });

    const days = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const iso = localIsoDate(date);
      return {
        date: iso,
        label: new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(date),
        ...Object.fromEntries(currencies.map((curr) => [curr, byDay.get(iso)?.[curr] ?? 0])),
      };
    });

    return { days, currencies, hasRevenue: byDay.size > 0 };
  }, [metricRows, period, toDate]);

  return (
    <div className="space-y-6 md:space-y-8">
      <ModuleHeader
        title="Pagos"
        description="Gestión financiera, registro de cobros, verificación de recibos y auditoría."
        icon={CreditCard}
        module="pagos"
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setRegisterOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar pago
            </Button>
          ) : undefined
        }
      />

      {/* 4 KPI Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Ingresos del período"
          value={revenueDisplay}
          description="Pagos confirmados"
          icon={Wallet}
          module="pagos"
          semanticState="success"
        />
        <MetricCard
          label="Cobros realizados"
          value={paidRows.length}
          description="Transacciones exitosas"
          icon={CheckCircle2}
          module="pagos"
        />
        <MetricCard
          label="Ticket medio"
          value={formattedAvgTicket}
          description="Valor promedio por cobro"
          icon={CircleDollarSign}
          module="pagos"
        />
        <MetricCard
          label="Renovaciones pagadas"
          value={renewalsCount}
          description="Renovaciones registradas"
          icon={CalendarClock}
          module="pagos"
          semanticState="info"
        />
      </div>

      {/* Gráfico Compacto Últimos 30 días */}
      <SectionCard title="Evolución de ingresos (últimos 30 días)" module="pagos">
        {revenue30d.hasRevenue ? (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={revenue30d.days}
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
                  formatter={(v: unknown, name: string) => [
                    typeof v === "number" ? v.toLocaleString() : v,
                    name,
                  ]}
                />
                {revenue30d.currencies.map((curr, index) => (
                  <Bar
                    key={curr}
                    dataKey={curr}
                    fill={chartCurrencyColor(index)}
                    radius={[6, 6, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            title="Sin ingresos recientes"
            description="No hay pagos confirmados en los últimos 30 días para mostrar gráficos."
            module="pagos"
          />
        )}
      </SectionCard>

      {/* Tabla de Pagos con FilterToolbar & AdminDataTableShell */}
      <AdminDataTableShell
        title="Historial de transacciones"
        description="Filtros y control de cobros"
        actions={
          <FilterToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por correo, referencia o plan..."
            showReset={true}
            onReset={() => {
              setSearch("");
              setPlan("all");
              setStatus("all");
              setCurrency("all");
              setMethod("all");
              setOperator("all");
              setPeriod("all");
              setFromDate("");
              setToDate("");
            }}
          >
            <FilterSelect
              value={period}
              onChange={setPeriod}
              label="Período"
              options={[
                { value: "all", label: "Todo el período" },
                { value: "today", label: "Hoy" },
                { value: "7d", label: "Últimos 7 días" },
                { value: "30d", label: "Últimos 30 días" },
                { value: "custom", label: "Personalizado" },
              ]}
            />
            <FilterSelect
              value={plan}
              onChange={setPlan}
              label="Plan"
              options={[
                { value: "all", label: "Todos los planes" },
                ...(availablePlans.data ?? []).map((item) => ({
                  value: item.code,
                  label: item.name,
                })),
              ]}
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              label="Estado"
              options={[
                { value: "all", label: "Todos los estados" },
                { value: "paid", label: "Pagado" },
                { value: "pending", label: "Pendiente" },
                { value: "cancelled", label: "Cancelado" },
                { value: "refunded", label: "Reembolsado" },
                { value: "complimentary", label: "Cortesía" },
                { value: "voided", label: "Anulado" },
              ]}
            />
            <FilterSelect
              value={currency}
              onChange={setCurrency}
              label="Moneda"
              options={[
                { value: "all", label: "Todas las monedas" },
                { value: "USD", label: "USD" },
                { value: "EUR", label: "EUR" },
                { value: "CUP", label: "CUP" },
              ]}
            />
            <FilterSelect
              value={method}
              onChange={setMethod}
              label="Método"
              options={[
                { value: "all", label: "Todos los métodos" },
                { value: "cash", label: "Efectivo" },
                { value: "transfer", label: "Transferencia" },
                { value: "card", label: "Tarjeta" },
                { value: "paypal", label: "PayPal" },
                { value: "other", label: "Otro" },
              ]}
            />
            <FilterSelect
              value={operator}
              onChange={setOperator}
              label="Operador"
              options={[
                { value: "all", label: "Todos los operadores" },
                ...operators.map((item) => ({ value: item, label: item })),
              ]}
            />
            {period === "custom" ? (
              <>
                <Input
                  type="date"
                  aria-label="Desde"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
                <Input
                  type="date"
                  aria-label="Hasta"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </>
            ) : null}
          </FilterToolbar>
        }
        isEmpty={filtered.length === 0}
        emptyState={
          <EmptyState
            icon={CreditCard}
            title="Sin pagos encontrados"
            description="No hay transacciones que coincidan con los filtros aplicados."
            module="pagos"
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha / Ref</TableHead>
              <TableHead>Usuario / Plan</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((payment) => (
              <TableRow key={payment.id} className="group hover:bg-muted/40 transition-colors">
                <TableCell className="text-xs">
                  <div className="font-medium text-foreground">
                    {new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(
                      new Date(payment.createdAt),
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {payment.reference || "S/Ref"}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="font-medium text-foreground truncate max-w-[160px]">
                    {payment.userEmail ?? "—"}
                  </div>
                  <div className="text-muted-foreground capitalize">{payment.plan}</div>
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-sm">
                  {payment.amount.toLocaleString()} {payment.currency}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={payment.status === "paid" ? "default" : "secondary"}
                    className={`text-xs ${
                      payment.status === "paid"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : payment.status === "pending"
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                    }`}
                  >
                    {payment.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground capitalize">
                  {payment.method}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {payment.status === "pending" && canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs bg-card/60 text-emerald-400 border-emerald-500/30"
                        onClick={() => markPaid.mutate(payment.id)}
                      >
                        Confirmar
                      </Button>
                    )}
                    {["paid", "complimentary"].includes(payment.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          void supabaseServices.payments
                            .receipt(payment.id)
                            .then(setViewingReceipt);
                        }}
                      >
                        Recibo
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminDataTableShell>

      {/* Existing receipt and registration dialogs kept fully intact */}
      {viewingReceipt && (
        <ReceiptDialog receipt={viewingReceipt} onClose={() => setViewingReceipt(null)} />
      )}
    </div>
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
  options: { value: string; label: string }[];
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

function isPaymentInPeriod(createdAt: string, period: string, fromDate: string, toDate: string) {
  if (period === "all") return true;
  const paymentDate = new Date(createdAt);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  if (period === "custom") {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;
    return (!from || paymentDate >= from) && (!to || paymentDate <= to);
  }

  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  if (period === "7d") start.setDate(start.getDate() - 6);
  if (period === "30d") start.setDate(start.getDate() - 29);
  return paymentDate >= start && paymentDate <= end;
}

function chartEndDate(period: string, toDate: string) {
  const end = period === "custom" && toDate ? new Date(`${toDate}T23:59:59.999`) : new Date();
  end.setHours(23, 59, 59, 999);
  return end;
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAmount(value: number) {
  return value.toLocaleString("es", { maximumFractionDigits: 2 });
}

function chartCurrencyColor(index: number) {
  return ["var(--semantic-success)", "var(--primary)", "var(--module-comercial)"][index % 3];
}
