import { useMemo, useState } from "react";
import { CLIENTS } from "@/lib/mock-data";
import { useDemoStore } from "@/lib/demo-store";
import { useDemoAuth } from "@/lib/demo-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyRound, Search, Zap, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function LicenciasSection({ projectId }: { projectId: string }) {
  const { licenses, activateLicense } = useDemoStore();
  const { user } = useDemoAuth();

  const projLicenses = licenses.filter((l) => l.projectId === projectId);
  const [openActivate, setOpenActivate] = useState(false);

  return (
    <div className="space-y-6">
      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" />
            Licencias
            <Badge variant="outline" className="ml-2">{projLicenses.length}</Badge>
          </CardTitle>
          <Button onClick={() => setOpenActivate(true)}>
            <Zap className="h-4 w-4 mr-2" />
            Activar / renovar licencia
          </Button>
        </CardHeader>
        <CardContent>
          {projLicenses.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Aún no hay licencias en este proyecto.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clave</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Activada</TableHead>
                  <TableHead className="text-right">Vence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projLicenses.map((l) => {
                  const client = CLIENTS.find((c) => c.id === l.clientId);
                  const days = Math.round((new Date(l.expiresAt).getTime() - Date.now()) / 86400000);
                  const soon = days > 0 && days < 30;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.key}</TableCell>
                      <TableCell>{client?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={l.status === "active" ? "default" : "destructive"}>
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.activatedAt}</TableCell>
                      <TableCell className="text-right">
                        <span className={soon ? "text-destructive" : "text-muted-foreground"}>
                          {l.expiresAt}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ActivateDialog
        open={openActivate}
        onOpenChange={setOpenActivate}
        projectId={projectId}
        onActivate={(data) => {
          const newDate = activateLicense({ ...data, actor: user?.name ?? "Empleado" });
          if (newDate) toast.success(`Licencia activada. Nueva fecha: ${newDate}`);
        }}
      />
    </div>
  );
}

function ActivateDialog({
  open,
  onOpenChange,
  projectId,
  onActivate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  onActivate: (data: {
    licenseId: string;
    days: 30 | 90 | 365;
    payment: {
      projectId: string;
      clientId: string;
      amount: number;
      currency: "EUR" | "USD";
      method: "card" | "transfer" | "cash" | "paypal";
      reference: string;
      employeeId: string;
    };
  }) => void;
}) {
  const { licenses } = useDemoStore();
  const { user } = useDemoAuth();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("99");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [method, setMethod] = useState<"card" | "transfer" | "cash" | "paypal">("card");
  const [reference, setReference] = useState("");
  const [days, setDays] = useState<30 | 90 | 365>(365);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const client = useMemo(
    () => CLIENTS.find((c) => c.projectId === projectId && c.email.toLowerCase() === email.toLowerCase()),
    [projectId, email],
  );
  const license = client ? licenses.find((l) => l.clientId === client.id) : undefined;

  const reset = () => {
    setEmail("");
    setAmount("99");
    setCurrency("EUR");
    setMethod("card");
    setReference("");
    setDays(365);
  };

  const canSubmit = client && license && Number(amount) > 0 && reference.trim().length > 0;

  const projectedDate = (() => {
    if (!license) return null;
    const base = new Date(license.status === "expired" ? Date.now() : new Date(license.expiresAt).getTime());
    base.setDate(base.getDate() + days);
    return base.toISOString().slice(0, 10);
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Activar / renovar licencia</DialogTitle>
            <DialogDescription>
              Busca al cliente, registra el pago y elige la duración. Todo son datos de demostración.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Correo del cliente</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@ejemplo.demo"
                  className="pl-8"
                />
              </div>
              {email && !client && (
                <p className="text-xs text-destructive mt-1">No se encontró cliente en este proyecto.</p>
              )}
              {client && license && (
                <div className="mt-2 rounded-lg border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{client.name}</span>
                    <Badge variant={license.status === "active" ? "default" : "destructive"}>
                      {license.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {license.key} · vence {license.expiresAt}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="amount">Importe</Label>
                <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "EUR" | "USD")}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Método</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="cash">Efectivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ref">Referencia</Label>
                <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="REF-2026-…" className="mt-1" />
              </div>
            </div>

            <div>
              <Label>Duración</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {([30, 90, 365] as const).map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant={days === d ? "default" : "outline"}
                    onClick={() => setDays(d)}
                  >
                    {d} días
                  </Button>
                ))}
              </div>
              {projectedDate && (
                <p className="text-xs text-muted-foreground mt-2">
                  Nueva fecha de vencimiento simulada: <span className="text-foreground font-medium">{projectedDate}</span>
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
              <Zap className="h-4 w-4 mr-2" />
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Confirmar activación
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se registrará el pago de {amount} {currency} ({method}, {reference}) y se ampliará la
              licencia {license?.key} durante {days} días. Esta acción quedará en el historial de
              demostración.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!client || !license || !user) return;
                onActivate({
                  licenseId: license.id,
                  days,
                  payment: {
                    projectId,
                    clientId: client.id,
                    amount: Number(amount),
                    currency,
                    method,
                    reference,
                    employeeId: user.id,
                  },
                });
                setConfirmOpen(false);
                onOpenChange(false);
                reset();
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
