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
import { MobileActionsMenu, MobileLoadMore } from "@/components/admin/MobileAdminSystem";
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
  const [mobileVisible, setMobileVisible] = useState(10);
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
    void queryClient.invalidateQueries({ queryKey: ["summary-usage-analytics", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["usage-analytics", projectId] });
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
  const loadReceipt = useMutation({
    mutationFn: (paymentId: string) => supabaseServices.payments.receipt(paymentId),
    onSuccess: setViewingReceipt,
    onError: () =>
      toast.error("No se encontrÃ³ el recibo. El owner puede generarlo sin renovar nuevamente."),
  });
  const repairReceipt = useMutation({
    mutationFn: (paymentId: string) => supabaseServices.payments.repairReceipt(paymentId),
    onSuccess: (receipt) => {
      setViewingReceipt(receipt);
      toast.success("Recibo generado sin modificar la vigencia.");
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
        `${payment.userEmail ?? ""} ${payment.licenseKey ?? ""} ${payment.reference} ${payment.plan} ${payment.operatorLabel ?? ""}`.toLowerCase();
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

  const pendingCount = rows.filter((payment) => payment.status === "pending").length;
  const missingReceiptCount = rows.filter(
    (payment) => ["paid", "complimentary"].includes(payment.status) && !payment.hasReceipt,
  ).length;
  const visibleMobileRows = filtered.slice(0, mobileVisible);

  useEffect(() => {
    setMobileVisible(10);
  }, [search, plan, status, currency, method, operator, period, fromDate, toDate]);

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

      {(pendingCount > 0 || missingReceiptCount > 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p className="font-semibold">Alertas de coherencia</p>
          <p className="mt-1 text-xs">
            {pendingCount > 0 ? `${pendingCount} pagos pendientes por confirmar.` : ""}
            {pendingCount > 0 && missingReceiptCount > 0 ? " " : ""}
            {missingReceiptCount > 0 ? `${missingReceiptCount} pagos sin recibo disponible.` : ""}
          </p>
        </div>
      )}

      {/* Tabla de Pagos con FilterToolbar & AdminDataTableShell */}
      <AdminDataTableShell
        title="Historial de transacciones"
        description="Filtros y control de cobros"
        actions={
          <FilterToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por correo, licencia, referencia o plan..."
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
                { value: "month", label: "Mes actual" },
                { value: "prev-month", label: "Mes anterior" },
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
        <div className="space-y-3 md:hidden">
          {visibleMobileRows.map((payment) => (
            <div key={payment.id} className="rounded-2xl border border-border/70 bg-card/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold font-mono">
                    {payment.amount.toLocaleString()} {payment.currency}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{payment.userEmail}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {payment.licenseKey ?? "Sin licencia"}
                  </p>
                </div>
                <Badge variant={payment.status === "paid" ? "default" : "secondary"}>
                  {paymentStatusLabel(payment.status)}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <PaymentDetail label="Plan" value={payment.plan} />
                <PaymentDetail label="Método" value={paymentMethodLabel(payment.method)} />
                <PaymentDetail label="Referencia" value={payment.reference || "Sin referencia"} />
                <PaymentDetail
                  label="Fecha"
                  value={new Date(payment.createdAt).toLocaleDateString()}
                />
                <PaymentDetail
                  label="Precio normal"
                  value={`${payment.listPrice} ${payment.currency}`}
                />
                <PaymentDetail
                  label="Descuento"
                  value={`${payment.discount} ${payment.currency}`}
                />
                <PaymentDetail
                  label="Operador"
                  value={payment.operatorLabel ?? payment.employeeId}
                />
                <PaymentDetail label="Notas" value={payment.notes || "Sin notas"} />
              </div>
              <div className="mt-3 flex justify-end">
                <MobileActionsMenu
                  items={paymentActions({
                    payment,
                    canManage,
                    canCorrect,
                    markPaidPending: markPaid.isPending,
                    loadReceiptPending: loadReceipt.isPending,
                    repairReceiptPending: repairReceipt.isPending,
                    onMarkPaid: () => markPaid.mutate(payment.id),
                    onLoadReceipt: () => loadReceipt.mutate(payment.id),
                    onRepairReceipt: () => repairReceipt.mutate(payment.id),
                    onEdit: () => setEditing(payment),
                    onDelete: () => setDeleting(payment),
                  })}
                />
              </div>
            </div>
          ))}
        </div>

        {isMobile ? (
          <MobileLoadMore
            total={filtered.length}
            visible={visibleMobileRows.length}
            canLoadMore={filtered.length > visibleMobileRows.length}
            onLoadMore={() => setMobileVisible((value) => value + 10)}
          />
        ) : null}

        <div className="hidden overflow-x-auto md:block">
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
                      {canManage &&
                        ["paid", "complimentary"].includes(payment.status) &&
                        payment.hasReceipt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            disabled={loadReceipt.isPending}
                            onClick={() => loadReceipt.mutate(payment.id)}
                          >
                            Recibo
                          </Button>
                        )}
                      {canCorrect &&
                        ["paid", "complimentary"].includes(payment.status) &&
                        !payment.hasReceipt && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={repairReceipt.isPending}
                            onClick={() => repairReceipt.mutate(payment.id)}
                          >
                            Reparar recibo
                          </Button>
                        )}
                      {canCorrect && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Editar pago"
                          onClick={() => setEditing(payment)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canCorrect && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          title={payment.status === "pending" ? "Eliminar pago" : "Anular pago"}
                          onClick={() => setDeleting(payment)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AdminDataTableShell>

      <RegisterPaymentDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        licenses={licenses.data ?? []}
        clients={clients.data ?? []}
        plans={availablePlans.data ?? []}
        onDone={refresh}
      />
      {editing ? (
        <EditPaymentDialog payment={editing} onClose={() => setEditing(null)} onDone={refresh} />
      ) : null}
      {deleting ? (
        <DeletePaymentDialog
          payment={deleting}
          onClose={() => setDeleting(null)}
          onDone={refresh}
        />
      ) : null}
      {viewingReceipt && (
        <ReceiptDialog receipt={viewingReceipt} onClose={() => setViewingReceipt(null)} />
      )}
    </div>
  );
}

function RegisterPaymentDialog({
  open,
  onClose,
  licenses,
  clients,
  plans,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  licenses: ServiceLicense[];
  clients: ServiceClient[];
  plans: LicensePlan[];
  onDone: () => void;
}) {
  const [licenseId, setLicenseId] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [method, setMethod] = useState<ServicePayment["method"]>("transfer");
  const [status, setStatus] = useState<ServicePayment["status"]>("paid");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<BillingReceipt | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [clientWhatsapp, setClientWhatsapp] = useState("");
  const [confirmWhatsappChange, setConfirmWhatsappChange] = useState(false);
  const selectedPlan = plans.find((item) => item.code === planCode);
  const selectedLicense = licenses.find((item) => item.id === licenseId);
  const selectedClient = clients.find((item) => item.userId === selectedLicense?.userId);
  const whatsappChanged =
    !!clientWhatsapp.trim() && clientWhatsapp.trim() !== (selectedClient?.phone ?? "");
  const effectiveAmount = status === "complimentary" ? 0 : Number(amount || selectedPlan?.price);
  const adjusted = selectedPlan ? effectiveAmount !== selectedPlan.price : false;
  useEffect(() => {
    if (!open) return;
    setReceipt(null);
    setIdempotencyKey(crypto.randomUUID());
    setClientWhatsapp("");
    setConfirmWhatsappChange(false);
  }, [open]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (status === "paid") {
        return supabaseServices.payments.chargeAndAssign({
          licenseId,
          plan: planCode,
          amount: effectiveAmount,
          method: method as "cash" | "transfer" | "other",
          reference,
          chargedAt: new Date().toISOString(),
          notes: [notes, adjusted ? reason : ""].filter(Boolean).join(" · "),
          applicationRule: "after_expiry",
          idempotencyKey,
          clientWhatsapp,
          confirmClientWhatsappChange: confirmWhatsappChange,
        });
      }
      const payment = await supabaseServices.payments.record({
        licenseId,
        plan: planCode,
        method,
        reference,
        paymentStatus: status,
        notes,
        overrideAmount: effectiveAmount,
        adjustmentReason: adjusted ? reason : undefined,
      });
      return status === "complimentary" ? supabaseServices.payments.receipt(payment.id) : payment;
    },
    onSuccess: (result) => {
      onDone();
      if ("receiptNumber" in result) {
        setReceipt(result);
        toast.success("Pago registrado y licencia actualizada");
      } else {
        toast.success("Pago pendiente registrado correctamente.");
        onClose();
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  if (receipt) {
    return (
      <ReceiptDialog
        receipt={receipt}
        onClose={() => {
          setReceipt(null);
          onClose();
        }}
      />
    );
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Un pago confirmado activa la licencia y extiende su vigencia según el plan seleccionado.
            La clave se conserva.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente y licencia">
            <Select
              value={licenseId}
              onValueChange={(value) => {
                setLicenseId(value);
                const selected = licenses.find((item) => item.id === value);
                if (selected) setPlanCode(selected.plan);
                const client = clients.find((item) => item.userId === selected?.userId);
                setClientWhatsapp(client?.phone ?? "");
                setConfirmWhatsappChange(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {licenses.map((license) => (
                  <SelectItem key={license.id} value={license.id}>
                    {license.userEmail} · {license.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {status === "paid" && licenseId && (
            <Field label="WhatsApp del cliente">
              <Input
                value={clientWhatsapp}
                onChange={(event) => {
                  setClientWhatsapp(event.target.value);
                  setConfirmWhatsappChange(false);
                }}
                placeholder="+5350000000"
              />
            </Field>
          )}
          {status === "paid" && whatsappChanged && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 sm:col-span-2">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Número anterior</div>
                  <div className="font-medium">{selectedClient?.phone ?? "Sin número"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Número nuevo</div>
                  <div className="font-medium">{clientWhatsapp.trim()}</div>
                </div>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={confirmWhatsappChange}
                  onCheckedChange={(checked) => setConfirmWhatsappChange(checked === true)}
                />
                Confirmo manualmente que el operador verificó este cambio
              </label>
            </div>
          )}
          <Field label="Plan cobrado">
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar plan" />
              </SelectTrigger>
              <SelectContent>
                {plans
                  .filter((item) => item.isActive)
                  .map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.name} · {item.price} {item.currency}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Importe pagado">
            <Input
              type="number"
              min="0"
              max={selectedPlan?.price}
              value={status === "complimentary" ? "0" : amount}
              placeholder={selectedPlan ? String(selectedPlan.price) : ""}
              disabled={status === "complimentary"}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Estado">
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as ServicePayment["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
                <SelectItem value="refunded">Reembolsado</SelectItem>
                <SelectItem value="complimentary">Cortesía</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Método de pago">
            <Select
              value={method}
              onValueChange={(value) => setMethod(value as ServicePayment["method"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Referencia (opcional)">
            <Input
              value={reference}
              placeholder="Se genera automáticamente si queda vacía"
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
          {adjusted && (
            <div className="sm:col-span-2">
              <Field label="Motivo del descuento, promoción o cortesía">
                <Input value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label="Notas">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              !licenseId ||
              !planCode ||
              (adjusted && !reason.trim()) ||
              (status === "paid" && whatsappChanged && !confirmWhatsappChange)
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Registrando…" : "Registrar pago y generar recibo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPaymentDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: ServicePayment;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [currency, setCurrency] = useState(payment.currency);
  const [method, setMethod] = useState(payment.method);
  const [status, setStatus] = useState(payment.status);
  const [reference, setReference] = useState(payment.reference);
  const [notes, setNotes] = useState(payment.notes ?? "");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      supabaseServices.payments.update({
        paymentId: payment.id,
        amount: Number(amount),
        currency,
        method,
        reference,
        status,
        notes,
        adjustmentReason: reason,
      }),
    onSuccess: () => {
      toast.success("Pago actualizado correctamente.");
      onDone();
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar pago</DialogTitle>
          <DialogDescription>
            Corrige los datos del cobro. La vigencia ya concedida no se reduce al editar un pago
            confirmado.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Importe pagado">
            <Input
              type="number"
              min="0"
              max={payment.listPrice}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Moneda">
            <Select
              value={currency}
              onValueChange={(v) => setCurrency(v as ServicePayment["currency"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["CUP", "USD", "EUR"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={status} onValueChange={(v) => setStatus(v as ServicePayment["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
                <SelectItem value="refunded">Reembolsado</SelectItem>
                <SelectItem value="complimentary">Cortesía</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Método">
            <Select value={method} onValueChange={(v) => setMethod(v as ServicePayment["method"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="card">Tarjeta</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Referencia">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notas">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Motivo de la corrección">
              <Input
                value={reason}
                placeholder="Obligatorio para la auditoría"
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              !reason.trim() ||
              !reference.trim() ||
              Number(amount) < 0 ||
              Number(amount) > payment.listPrice
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletePaymentDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: ServicePayment;
  onClose: () => void;
  onDone: () => void;
}) {
  const isConfirmed = payment.status !== "pending";
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      isConfirmed
        ? supabaseServices.payments.void(payment.id, reason)
        : supabaseServices.payments.remove(payment.id, reason),
    onSuccess: () => {
      toast.success(isConfirmed ? "Pago anulado correctamente." : "Pago eliminado del historial.");
      onDone();
      onClose();
    },
    onError: () =>
      toast.error(
        isConfirmed
          ? "No se pudo anular el pago. Inténtalo de nuevo."
          : "No se pudo eliminar el pago. Inténtalo de nuevo.",
      ),
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isConfirmed ? "Anular pago" : "Eliminar pago"}</DialogTitle>
          <DialogDescription>
            {isConfirmed ? (
              <>
                Este pago será anulado y dejará de contar en ingresos y estadísticas. El recibo y el
                historial se conservarán. La vigencia otorgada a la licencia no será modificada.
              </>
            ) : (
              <>Se eliminará el pago pendiente {payment.reference}. Esta acción es irreversible.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <Field label={isConfirmed ? "Motivo de anulación" : "Motivo de eliminación"}>
          <Textarea
            value={reason}
            placeholder="Obligatorio para conservar la trazabilidad"
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending || !reason.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? isConfirmed
                ? "Anulando…"
                : "Eliminando…"
              : isConfirmed
                ? "Confirmar anulación"
                : "Eliminar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function PaymentDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/20 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-foreground">{value}</p>
    </div>
  );
}

function paymentActions({
  payment,
  canManage,
  canCorrect,
  markPaidPending,
  loadReceiptPending,
  repairReceiptPending,
  onMarkPaid,
  onLoadReceipt,
  onRepairReceipt,
  onEdit,
  onDelete,
}: {
  payment: ServicePayment;
  canManage: boolean;
  canCorrect: boolean;
  markPaidPending: boolean;
  loadReceiptPending: boolean;
  repairReceiptPending: boolean;
  onMarkPaid: () => void;
  onLoadReceipt: () => void;
  onRepairReceipt: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): Array<{ label: string; onSelect: () => void; destructive?: boolean; disabled?: boolean }> {
  const actions: Array<{
    label: string;
    onSelect: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }> = [];

  if (canManage && payment.status === "pending") {
    actions.push({ label: "Marcar pagado", onSelect: onMarkPaid, disabled: markPaidPending });
  }
  if (canManage && ["paid", "complimentary"].includes(payment.status) && payment.hasReceipt) {
    actions.push({ label: "Ver recibo", onSelect: onLoadReceipt, disabled: loadReceiptPending });
  }
  if (canCorrect && ["paid", "complimentary"].includes(payment.status) && !payment.hasReceipt) {
    actions.push({
      label: "Generar recibo faltante",
      onSelect: onRepairReceipt,
      disabled: repairReceiptPending,
    });
  }
  if (canCorrect) {
    actions.push({ label: "Editar pago", onSelect: onEdit });
    actions.push({
      label: payment.status === "pending" ? "Eliminar pago" : "Anular pago",
      onSelect: onDelete,
      destructive: true,
    });
  }
  return actions;
}

function paymentStatusLabel(value: string) {
  return (
    (
      {
        paid: "Pagado",
        pending: "Pendiente",
        cancelled: "Cancelado",
        refunded: "Reembolsado",
        complimentary: "Cortesía",
        voided: "Anulado",
      } as Record<string, string>
    )[value] ?? value
  );
}

function paymentMethodLabel(value: string) {
  return (
    (
      {
        transfer: "Transferencia",
        cash: "Efectivo",
        card: "Tarjeta",
        paypal: "PayPal",
        other: "Otro",
      } as Record<string, string>
    )[value] ?? value
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

  if (period === "month") {
    const start = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);
    return paymentDate >= start && paymentDate <= end;
  }

  if (period === "prev-month") {
    const start = new Date(end.getFullYear(), end.getMonth() - 1, 1, 0, 0, 0, 0);
    const previousEnd = new Date(end.getFullYear(), end.getMonth(), 0, 23, 59, 59, 999);
    return paymentDate >= start && paymentDate <= previousEnd;
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
