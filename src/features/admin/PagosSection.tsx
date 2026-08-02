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
} from "lucide-react";
import { toast } from "sonner";
import {
  supabaseServices,
  type LicensePlan,
  type ServiceLicense,
  type ServicePayment,
  type BillingReceipt,
} from "@/lib/services";
import { ReceiptDialog } from "@/features/admin/ChargePlanDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

export default function PagosSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [method, setMethod] = useState("all");
  const [date, setDate] = useState("");
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
  const loadReceipt = useMutation({
    mutationFn: (paymentId: string) => supabaseServices.payments.receipt(paymentId),
    onSuccess: setViewingReceipt,
    onError: () =>
      toast.error("No se encontró el recibo. El owner puede generarlo sin renovar nuevamente."),
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
          {canManage && (
            <Button onClick={() => setRegisterOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar pago
            </Button>
          )}
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
              values={["transfer", "cash", "other"]}
              label="Método"
            />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-3 md:hidden">
            {filtered.map((payment) => (
              <Card key={payment.id} className="border-border/70 bg-card/80">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">
                        {payment.amount} {payment.currency}
                      </div>
                      <div className="break-all text-xs text-muted-foreground">
                        {payment.userEmail}
                      </div>
                      <div className="break-all font-mono text-[11px] text-muted-foreground">
                        {payment.licenseKey}
                      </div>
                    </div>
                    <Badge
                      variant={
                        payment.status === "paid"
                          ? "default"
                          : payment.status === "pending"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {statusLabel(payment.status)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Plan</div>
                      <div className="mt-0.5 text-foreground">{planLabel(payment.plan)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Método</div>
                      <div className="mt-0.5 text-foreground">{methodLabel(payment.method)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Referencia</div>
                      <div className="mt-0.5 break-all text-foreground">{payment.reference}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Fecha</div>
                      <div className="mt-0.5 text-foreground">
                        {new Date(payment.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Recibo</div>
                      <div className="mt-0.5 text-foreground">
                        {payment.hasReceipt ? "Disponible" : "Pendiente"}
                      </div>
                    </div>
                  </div>
                  <Accordion type="single" collapsible>
                    <AccordionItem value={`payment-${payment.id}`}>
                      <AccordionTrigger className="py-2 text-sm">Ver más</AccordionTrigger>
                      <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                        <DetailRow
                          label="Precio normal"
                          value={`${payment.listPrice} ${payment.currency}`}
                        />
                        <DetailRow
                          label="Descuento"
                          value={`${payment.discount} ${payment.currency}`}
                        />
                        <DetailRow
                          label="Administrador"
                          value={payment.operatorLabel ?? payment.employeeId}
                        />
                        <DetailRow label="Notas" value={payment.notes || "—"} />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  <div className="flex flex-wrap gap-2">
                    {canManage && payment.status === "pending" && (
                      <Button
                        className="flex-1"
                        size="sm"
                        variant="outline"
                        disabled={markPaid.isPending}
                        onClick={() => markPaid.mutate(payment.id)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Pagado
                      </Button>
                    )}
                    {canManage &&
                      ["paid", "complimentary"].includes(payment.status) &&
                      payment.hasReceipt && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Ver y compartir recibo"
                          disabled={loadReceipt.isPending}
                          onClick={() => loadReceipt.mutate(payment.id)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                    {canManage &&
                      ["paid", "complimentary"].includes(payment.status) &&
                      !payment.hasReceipt &&
                      canCorrect && (
                        <Button
                          className="flex-1"
                          size="sm"
                          variant="outline"
                          disabled={repairReceipt.isPending}
                          onClick={() => repairReceipt.mutate(payment.id)}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Recibo
                        </Button>
                      )}
                    {canCorrect && (
                      <Button
                        size="icon"
                        variant="ghost"
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
                        className="text-destructive"
                        title="Eliminar pago"
                        onClick={() => setDeleting(payment)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidden min-w-0 overflow-hidden md:block md:overflow-x-auto">
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
                    <TableCell data-label="Fecha" className="whitespace-nowrap text-xs">
                      {new Date(p.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell data-label="Usuario" className="break-all">
                      {p.userEmail}
                    </TableCell>
                    <TableCell data-label="Licencia" className="break-all font-mono text-xs">
                      {p.licenseKey}
                    </TableCell>
                    <TableCell data-label="Plan">{planLabel(p.plan)}</TableCell>
                    <TableCell data-label="Precio">
                      {p.listPrice} {p.currency}
                    </TableCell>
                    <TableCell data-label="Descuento">
                      {p.discount} {p.currency}
                    </TableCell>
                    <TableCell data-label="Pagado" className="font-medium">
                      {p.amount} {p.currency}
                    </TableCell>
                    <TableCell data-label="Estado">
                      <Badge
                        variant={
                          p.status === "paid"
                            ? "default"
                            : p.status === "pending"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {statusLabel(p.status)}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Método">{methodLabel(p.method)}</TableCell>
                    <TableCell data-label="Referencia" className="break-all font-mono text-xs">
                      {p.reference}
                    </TableCell>
                    <TableCell data-label="Administrador" className="break-all text-xs">
                      {p.operatorLabel ?? p.employeeId}
                    </TableCell>
                    <TableCell data-label="Notas">{p.notes || "—"}</TableCell>
                    <TableCell data-label="Acciones">
                      {canManage && (
                        <div className="flex flex-wrap gap-2">
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
                          {["paid", "complimentary"].includes(p.status) && p.hasReceipt && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Ver y compartir recibo"
                              disabled={loadReceipt.isPending}
                              onClick={() => loadReceipt.mutate(p.id)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                          {["paid", "complimentary"].includes(p.status) &&
                            !p.hasReceipt &&
                            canCorrect && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={repairReceipt.isPending}
                                onClick={() => repairReceipt.mutate(p.id)}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Generar recibo faltante
                              </Button>
                            )}
                          {canCorrect && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Editar pago"
                              onClick={() => setEditing(p)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canCorrect && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              title="Eliminar pago"
                              onClick={() => setDeleting(p)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
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
      {editing && (
        <EditPaymentDialog payment={editing} onClose={() => setEditing(null)} onDone={refresh} />
      )}
      {deleting && (
        <DeletePaymentDialog
          payment={deleting}
          onClose={() => setDeleting(null)}
          onDone={refresh}
        />
      )}
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
  const [receipt, setReceipt] = useState<BillingReceipt | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const selectedPlan = plans.find((item) => item.code === planCode);
  const effectiveAmount = status === "complimentary" ? 0 : Number(amount || selectedPlan?.price);
  const adjusted = selectedPlan ? effectiveAmount !== selectedPlan.price : false;
  useEffect(() => {
    if (!open) return;
    setReceipt(null);
    setIdempotencyKey(crypto.randomUUID());
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
      <DialogContent className="max-w-2xl">
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
            disabled={mutation.isPending || !licenseId || !planCode || (adjusted && !reason.trim())}
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
      <DialogContent className="max-w-xl">
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
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => supabaseServices.payments.remove(payment.id, reason),
    onSuccess: () => {
      toast.success("Pago eliminado del historial.");
      onDone();
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar pago</DialogTitle>
          <DialogDescription>
            Se eliminará el pago {payment.reference} y dejará de contar en las estadísticas. Por
            seguridad, esto no reduce la vigencia ya otorgada a la licencia.
          </DialogDescription>
        </DialogHeader>
        <Field label="Motivo de eliminación">
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
            {mutation.isPending ? "Eliminando…" : "Eliminar pago"}
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
            {label === "Plan"
              ? planLabel(v)
              : label === "Estado"
                ? statusLabel(v)
                : label === "Método"
                  ? methodLabel(v)
                  : v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function planLabel(value: string) {
  return value === "standard" ? "Estándar" : value;
}

function statusLabel(value: string) {
  return (
    (
      {
        paid: "Pagado",
        pending: "Pendiente",
        cancelled: "Cancelado",
        refunded: "Reembolsado",
        complimentary: "Cortesía",
      } as Record<string, string>
    )[value] ?? value
  );
}

function methodLabel(value: string) {
  return (
    (
      {
        transfer: "Transferencia",
        cash: "Efectivo",
        other: "Otro",
        card: "Tarjeta",
        paypal: "PayPal",
      } as Record<string, string>
    )[value] ?? value
  );
}
