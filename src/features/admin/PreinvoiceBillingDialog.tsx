import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  supabaseServices,
  type BillingReceipt,
  type LicensePlan,
  type Preinvoice,
} from "@/lib/services";
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
import { Textarea } from "@/components/ui/textarea";

const dt = (value: string) =>
  new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
const localDateTime = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export function PreparePreinvoiceDialog({
  open,
  projectId,
  clientId,
  clientName,
  plans,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  clientId: string;
  clientName: string;
  plans: LicensePlan[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [planCode, setPlanCode] = useState("");
  const [isTest, setIsTest] = useState(false);
  const [created, setCreated] = useState<Preinvoice | null>(null);
  const settings = useQuery({
    queryKey: ["p0a-settings", projectId],
    queryFn: () => supabaseServices.foundations.settings(projectId),
    enabled: open,
  });
  const plan = plans.find((item) => item.code === planCode);
  const amount =
    plan && settings.data ? Math.round(plan.price * settings.data.currentRate * 100) / 100 : 0;
  const create = useMutation({
    mutationFn: async () => {
      if (!plan || !settings.data) throw new Error("Selecciona un plan válido");
      const id = await supabaseServices.foundations.createPreinvoice({
        projectId,
        clientId,
        planCode: plan.code,
        chargeCurrency: settings.data.chargeCurrency,
        exchangeRate: settings.data.currentRate,
        rateSource: settings.data.rateSource,
        isTest,
      });
      const rows = await supabaseServices.foundations.listPreinvoices(projectId, true);
      const row = rows.find((item) => item.id === id);
      if (!row) throw new Error("La prefactura fue creada, pero no pudo recuperarse");
      return row;
    },
    onSuccess: (row) => {
      setCreated(row);
      onCreated();
      toast.success("Prefactura creada sin registrar ingreso ni modificar la licencia");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  useEffect(() => {
    if (!open) {
      setPlanCode("");
      setIsTest(false);
      setCreated(null);
    }
  }, [open]);
  const message = created
    ? `Prefactura #${created.number}\n${clientName}\n${String(created.planSnapshot.name ?? created.planCode)}\nImporte: ${created.chargeAmount} ${created.chargeCurrency}\nVálida hasta: ${dt(created.expiresAt)}`
    : "";
  const share = async () => {
    if (!created) return;
    if (created.status === "prepared") {
      await supabaseServices.foundations.setPreinvoiceStatus(projectId, created.id, "sent");
      setCreated({ ...created, status: "sent" });
      onCreated();
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Preparar cobro</DialogTitle>
          <DialogDescription>
            Genera una prefactura válida durante 48 horas. No registra ingresos ni cambia la
            licencia.
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 text-sm">
              <p className="font-semibold">Prefactura #{created.number}</p>
              <p>
                {clientName} · {String(created.planSnapshot.name ?? created.planCode)}
              </p>
              <p className="mt-2 text-lg font-bold">
                {created.chargeAmount} {created.chargeCurrency}
              </p>
              <p>Vence: {dt(created.expiresAt)}</p>
              {created.isTest ? <p className="text-amber-500">Operación de prueba</p> : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(message);
                  toast.success("Prefactura copiada");
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
              <Button onClick={() => void share()}>
                <MessageCircle className="mr-2 h-4 w-4" />
                Compartir y marcar enviada
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Input value={clientName} disabled />
            </div>
            <div>
              <Label>Plan</Label>
              <Select value={planCode} onValueChange={setPlanCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans
                    .filter(
                      (item) =>
                        item.isActive &&
                        !["trial", "admin"].includes(item.licenseType) &&
                        item.price > 0,
                    )
                    .map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {plan && settings.data ? (
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm">
                <span>Precio base</span>
                <strong>
                  {plan.price} {settings.data.baseCurrency}
                </strong>
                <span>Tasa aplicada</span>
                <strong>
                  {settings.data.currentRate} · {settings.data.rateSource}
                </strong>
                <span>Importe a pagar</span>
                <strong>
                  {amount} {settings.data.chargeCurrency}
                </strong>
                <span>Vigencia</span>
                <strong>48 horas</strong>
              </div>
            ) : null}
            {settings.data?.testModeEnabled ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={isTest} onCheckedChange={(value) => setIsTest(value === true)} />
                Operación de prueba
              </label>
            ) : null}
          </div>
        )}
        <DialogFooter>
          {created ? (
            <Button onClick={onClose}>Cerrar</Button>
          ) : (
            <Button disabled={!plan || create.isPending} onClick={() => create.mutate()}>
              Generar prefactura
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmPreinvoiceDialog({
  invoice,
  projectId,
  clientName,
  onClose,
  onConfirmed,
}: {
  invoice: Preinvoice | null;
  projectId: string;
  clientName: string;
  onClose: () => void;
  onConfirmed: (receipt: BillingReceipt) => void;
}) {
  const [chargedAt, setChargedAt] = useState(localDateTime());
  const [method, setMethod] = useState<"cash" | "transfer" | "other">("transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const iso = useMemo(() => (chargedAt ? new Date(chargedAt).toISOString() : ""), [chargedAt]);
  const preview = useQuery({
    queryKey: ["preinvoice-preview", invoice?.id, iso],
    queryFn: () =>
      supabaseServices.foundations.previewPreinvoiceConfirmation(projectId, invoice!.id, iso),
    enabled: Boolean(invoice && iso),
  });
  const confirm = useMutation({
    mutationFn: () =>
      supabaseServices.foundations.confirmPreinvoicePayment({
        projectId,
        preinvoiceId: invoice!.id,
        receivedAmount: invoice!.chargeAmount,
        currency: invoice!.chargeCurrency,
        method,
        reference,
        chargedAt: iso,
        notes,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (receipt) => {
      toast.success("Pago, licencia y recibo confirmados");
      onConfirmed(receipt);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  if (!invoice) return null;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Confirmar pago y activar/renovar</DialogTitle>
          <DialogDescription>
            La confirmación se ejecutará como una sola operación transaccional.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Info label="Cliente" value={clientName} />
          <Info label="Plan" value={String(invoice.planSnapshot.name ?? invoice.planCode)} />
          <Info
            label="Importe esperado"
            value={`${invoice.chargeAmount} ${invoice.chargeCurrency}`}
          />
          <Info
            label="Importe recibido"
            value={`${invoice.chargeAmount} ${invoice.chargeCurrency}`}
          />
          <Info
            label="Tasa aplicada"
            value={`${invoice.exchangeRate} · ${invoice.exchangeRateSource}`}
          />
          <Info
            label="Vencimiento actual"
            value={
              preview.data?.previousExpiresAt
                ? dt(preview.data.previousExpiresAt)
                : "Sin licencia/vencimiento"
            }
          />
          <Info
            label="Nuevo vencimiento"
            value={preview.data?.newExpiresAt ? dt(preview.data.newExpiresAt) : "Sin vencimiento"}
          />
          <Info label="Prefactura vence" value={dt(invoice.expiresAt)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Fecha real del pago</Label>
            <Input
              type="datetime-local"
              value={chargedAt}
              onChange={(event) => setChargedAt(event.target.value)}
            />
          </div>
          <div>
            <Label>Método</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Referencia</Label>
            <Input value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!preview.data || confirm.isPending} onClick={() => confirm.mutate()}>
            Confirmar pago y activar/renovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
