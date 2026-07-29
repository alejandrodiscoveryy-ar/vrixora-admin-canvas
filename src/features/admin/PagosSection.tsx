import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, CircleDollarSign, Plus, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  supabaseServices,
  type LicensePlan,
  type ServiceLicense,
  type ServicePayment,
} from "@/lib/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function PagosSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [method, setMethod] = useState("all");
  const [date, setDate] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
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
  const availablePlans = useQuery({
    queryKey: ["admin-license-plans", projectId],
    queryFn: () => supabaseServices.licenses.listAdminPlans(projectId),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-payments", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["license-audit", projectId] });
  };
  const markPaid = useMutation({
    mutationFn: (paymentId: string) =>
      supabaseServices.payments.updateStatus(paymentId, "paid", "Pago confirmado desde el panel"),
    onSuccess: () => {
      toast.success("Pago marcado como pagado.");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const filtered = useMemo(
    () =>
      rows.filter((p) => {
        const text = `${p.userEmail} ${p.licenseKey} ${p.reference}`.toLowerCase();
        return (
          text.includes(search.toLowerCase()) &&
          (plan === "all" || p.plan === plan) &&
          (status === "all" || p.status === status) &&
          (currency === "all" || p.currency === currency) &&
          (method === "all" || p.method === method) &&
          (!date || p.createdAt.slice(0, 10) === date)
        );
      }),
    [rows, search, plan, status, currency, method, date],
  );
  const paid = rows.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const pending = rows.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);
  const plans = [...new Set(rows.map((p) => p.plan))];
  const month = new Date().toISOString().slice(0, 7);
  const renewals = (audit.data ?? []).filter(
    (entry) => entry.action === "license_renewed" && entry.createdAt.startsWith(month),
  ).length;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CircleDollarSign}
          label="Ingresos por licencias"
          value={paid.toLocaleString()}
        />
        <Metric icon={CalendarClock} label="Pagos pendientes" value={pending.toLocaleString()} />
        <Metric icon={Wallet} label="Registros de pago" value={String(rows.length)} />
        <Metric icon={CalendarClock} label="Renovaciones del mes" value={String(renewals)} />
      </div>
      <Card className="glass-panel">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            Historial de pagos<Badge variant="outline">{filtered.length}</Badge>
          </CardTitle>
          <Button onClick={() => setRegisterOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar pago
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Usuario, clave o referencia"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Filter value={plan} onChange={setPlan} values={plans} label="Plan" />
            <Filter
              value={status}
              onChange={setStatus}
              values={["pending", "paid", "cancelled", "refunded", "complimentary"]}
              label="Estado"
            />
            <Filter
              value={currency}
              onChange={setCurrency}
              values={["CUP", "USD", "EUR"]}
              label="Moneda"
            />
            <Filter
              value={method}
              onChange={setMethod}
              values={["card", "transfer", "cash", "paypal"]}
              label="Método"
            />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Licencia</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Precio normal</TableHead>
                  <TableHead>Descuento</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Administrador</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(p.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{p.userEmail}</TableCell>
                    <TableCell className="font-mono text-xs">{p.licenseKey}</TableCell>
                    <TableCell>{p.plan}</TableCell>
                    <TableCell>
                      {p.listPrice} {p.currency}
                    </TableCell>
                    <TableCell>
                      {p.discount} {p.currency}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.amount} {p.currency}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === "paid"
                            ? "default"
                            : p.status === "pending"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                    <TableCell className="font-mono text-xs">{p.employeeId}</TableCell>
                    <TableCell>{p.notes || "—"}</TableCell>
                    <TableCell>
                      {p.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={markPaid.isPending}
                          onClick={() => markPaid.mutate(p.id)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Marcar pagado
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!query.isLoading && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay pagos registrados. Usa “Registrar pago” para añadir el primero.
            </p>
          )}
        </CardContent>
      </Card>
      <RegisterPaymentDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        licenses={licenses.data ?? []}
        plans={availablePlans.data ?? []}
        onDone={refresh}
      />
    </div>
  );
}

function RegisterPaymentDialog({
  open,
  onClose,
  licenses,
  plans,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  licenses: ServiceLicense[];
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
  const selectedPlan = plans.find((item) => item.code === planCode);
  const effectiveAmount = status === "complimentary" ? 0 : Number(amount || selectedPlan?.price);
  const adjusted = selectedPlan ? effectiveAmount !== selectedPlan.price : false;
  const mutation = useMutation({
    mutationFn: () =>
      supabaseServices.payments.record({
        licenseId,
        plan: planCode,
        method,
        reference,
        paymentStatus: status,
        notes,
        overrideAmount: effectiveAmount,
        adjustmentReason: adjusted ? reason : undefined,
      }),
    onSuccess: () => {
      toast.success("Pago registrado correctamente.");
      onDone();
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Registra el cobro en el historial sin cambiar la vigencia ni la clave de la licencia.
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
              }}
            >
              <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
              <SelectContent>
                {licenses.map((license) => (
                  <SelectItem key={license.id} value={license.id}>
                    {license.userEmail} · {license.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Plan cobrado">
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
              <SelectContent>
                {plans.filter((item) => item.isActive).map((item) => (
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
            <Select value={status} onValueChange={(value) => setStatus(value as ServicePayment["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Select value={method} onValueChange={(value) => setMethod(value as ServicePayment["method"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="card">Tarjeta</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Referencia">
            <Input value={reference} onChange={(event) => setReference(event.target.value)} />
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
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={
              mutation.isPending ||
              !licenseId ||
              !planCode ||
              !reference.trim() ||
              (adjusted && !reason.trim())
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Registrando…" : "Registrar pago"}
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
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
function Filter({
  value,
  onChange,
  values,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  values: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: todos</SelectItem>
        {values.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
