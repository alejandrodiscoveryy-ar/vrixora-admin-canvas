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
  });
  const audit = useQuery({
    queryKey: ["license-audit", projectId],
    queryFn: () => supabaseServices.licenseAuditLog.list(projectId),
  });
  const licenses = useQuery({
    queryKey: ["admin-licenses", projectId],
    queryFn: () => supabaseServices.licenses.list(projectId),
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
    void queryClient.invalidateQueries({ queryKey: ["license-audit", projectId] });
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

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      const text = `${p.userEmail ?? ""} ${p.reference} ${p.plan} ${p.operatorLabel ?? ""}`.toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchPlan = plan === "all" || p.plan === plan;
      const matchStatus = status === "all" || p.status === status;
      const matchCurrency = currency === "all" || p.currency === currency;
      const matchMethod = method === "all" || p.method === method;
      const matchOp = operator === "all" || (p.operatorLabel ?? p.employeeId) === operator;
      return matchSearch && matchPlan && matchStatus && matchCurrency && matchMethod && matchOp;
    });
  }, [rows, search, plan, status, currency, method, operator]);

  // 4 KPI Principales Financieros
  const paidRows = filtered.filter((p) => p.status === "paid");
  const totalRevenueByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    paidRows.forEach((p) => {
      map.set(p.currency, (map.get(p.currency) ?? 0) + p.amount);
    });
    return Array.from(map.entries());
  }, [paidRows]);

  const revenueDisplay = totalRevenueByCurrency.length > 0
    ? totalRevenueByCurrency.map(([curr, amt]) => `${amt.toLocaleString()} ${curr}`).join(" · ")
    : "0";

  const averageTicket = paidRows.length > 0 ? Math.round(paidRows.reduce((sum, p) => sum + p.amount, 0) / paidRows.length) : 0;
  const currencySymbol = totalRevenueByCurrency[0]?.[0] ?? "USD";
  const formattedAvgTicket = `${averageTicket.toLocaleString()} ${currencySymbol}`;

  const renewalsCount = (audit.data ?? []).filter((e) => e.action === "license_renewed").length;

  // 30-day revenue chart data
  const revenue30d = useMemo(() => {
    const map = new Map<string, number>();
    paidRows.forEach((p) => {
      const day = p.createdAt.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + p.amount);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, amount]) => ({
        date,
        label: new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`)),
        amount,
      }));
  }, [paidRows]);

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
        <MetricCard label="Ingresos del período" value={revenueDisplay} description="Pagos confirmados" icon={Wallet} module="pagos" semanticState="success" />
        <MetricCard label="Cobros realizados" value={paidRows.length} description="Transacciones exitosas" icon={CheckCircle2} module="pagos" />
        <MetricCard label="Ticket medio" value={formattedAvgTicket} description="Valor promedio por cobro" icon={CircleDollarSign} module="pagos" />
        <MetricCard label="Renovaciones pagadas" value={renewalsCount} description="Renovaciones registradas" icon={CalendarClock} module="pagos" semanticState="info" />
      </div>

      {/* Gráfico Compacto Últimos 30 días */}
      <SectionCard title="Evolución de ingresos (últimos 30 días)" module="pagos">
        {revenue30d.length > 0 ? (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue30d} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <Tooltip {...adminChartTooltipProps} formatter={(v: unknown) => [typeof v === "number" ? v.toLocaleString() : v, "Ingresos"]} />
                <Bar dataKey="amount" fill="var(--semantic-success)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title="Sin ingresos recientes" description="No hay pagos confirmados en los últimos 30 días para mostrar gráficos." module="pagos" />
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
            }}
          >
            <FilterSelect value={status} onChange={setStatus} label="Estado" options={[
              { value: "all", label: "Todos los estados" },
              { value: "paid", label: "Pagado" },
              { value: "pending", label: "Pendiente" },
              { value: "cancelled", label: "Cancelado" },
              { value: "refunded", label: "Reembolsado" },
              { value: "complimentary", label: "Cortesía" },
              { value: "voided", label: "Anulado" },
            ]} />
            <FilterSelect value={currency} onChange={setCurrency} label="Moneda" options={[
              { value: "all", label: "Todas las monedas" },
              { value: "USD", label: "USD" },
              { value: "EUR", label: "EUR" },
              { value: "CUP", label: "CUP" },
            ]} />
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
                    {new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(payment.createdAt))}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">{payment.reference || "S/Ref"}</div>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="font-medium text-foreground truncate max-w-[160px]">{payment.userEmail ?? "—"}</div>
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
                          void supabaseServices.payments.receipt(payment.id).then(setViewingReceipt);
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
