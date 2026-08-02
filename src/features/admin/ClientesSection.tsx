import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, Search, ShieldCheck, Users } from "lucide-react";
import { supabaseServices, type LicenseStatus, type ServiceClient } from "@/lib/services";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { toast } from "sonner";
import { useProjectPermissions } from "@/hooks/useProjects";
import { ChargePlanDialog } from "@/features/admin/ChargePlanDialog";

const statuses: { value: LicenseStatus; label: string }[] = [
  { value: "active", label: "Activa" },
  { value: "pending", label: "Pendiente" },
  { value: "expired", label: "Vencida" },
  { value: "suspended", label: "Suspendida" },
  { value: "revoked", label: "Revocada" },
];

export default function ClientesSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ServiceClient | null>(null);
  const [chargeClient, setChargeClient] = useState<ServiceClient | null>(null);
  const query = useQuery({
    queryKey: ["admin-clients", projectId],
    queryFn: () => supabaseServices.licenses.listClients(projectId),
  });
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("customers.manage") && permissions.includes("licenses.manage");
  const canCharge = permissions.includes("payments.manage") && permissions.includes("licenses.manage");
  const licenses = useQuery({ queryKey: ["admin-licenses", projectId], queryFn: () => supabaseServices.licenses.list(projectId) });
  const plans = useQuery({ queryKey: ["admin-license-plans", projectId], queryFn: () => supabaseServices.licenses.listAdminPlans(projectId) });
  const clients = useMemo(
    () =>
      (query.data ?? []).filter((client) =>
        `${client.displayName} ${client.email} ${client.phone ?? ""} ${client.licenseKey ?? ""} ${client.plan}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [query.data, search],
  );

  return (
    <Card className="glass-panel">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Todos los clientes
          <Badge variant="outline">{clients.length}</Badge>
        </CardTitle>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, correo, teléfono o licencia"
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : query.isError ? (
          <p className="py-12 text-center text-sm text-destructive">{query.error.message}</p>
        ) : clients.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No hay clientes que coincidan.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Clave</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Primer registro</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.userId}>
                  <TableCell data-label="Cliente">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border border-border">
                        <AvatarImage
                          src={client.avatarUrl ?? undefined}
                          alt={client.displayName}
                          referrerPolicy="no-referrer"
                        />
                        <AvatarFallback className="bg-primary/10 text-xs font-semibold uppercase text-primary">
                          {client.displayName.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{client.displayName}</span>
                    </div>
                  </TableCell>
                  <TableCell data-label="Correo" className="break-all"><div>{client.email}</div>{client.phone && <div className="mt-1 text-xs text-muted-foreground">{client.phone}</div>}</TableCell>
                  <TableCell data-label="Clave" className="break-all font-mono text-xs">
                    {client.licenseKey ?? "Prueba inicial"}
                  </TableCell>
                  <TableCell data-label="Plan">{client.plan}</TableCell>
                  <TableCell data-label="Estado">
                    <Badge variant={client.status === "active" ? "default" : "secondary"}>
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell data-label="Registro">{new Date(client.registeredAt).toLocaleDateString()}</TableCell>
                  <TableCell data-label="Vencimiento"><div>{new Date(client.expiresAt).toLocaleDateString()}</div><div className="mt-1 text-xs text-muted-foreground">{remainingTime(client.expiresAt)}</div></TableCell>
                  <TableCell data-label="Acciones" className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                    {canCharge && client.licenseId && <Button size="sm" onClick={() => setChargeClient(client)}><CreditCard className="mr-2 h-4 w-4" />Cobrar y asignar plan</Button>}
                    {canManage && <Button variant="outline" size="sm" onClick={() => setSelected(client)}>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Gestionar
                      </Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <StatusDialog projectId={projectId} client={selected} onClose={() => setSelected(null)} />
      <ChargePlanDialog
        client={chargeClient}
        license={(licenses.data ?? []).find((item) => item.id === chargeClient?.licenseId) ?? null}
        plans={plans.data ?? []}
        onClose={() => setChargeClient(null)}
        onDone={() => {
          void query.refetch(); void licenses.refetch();
          void queryClient.invalidateQueries({ queryKey: ["admin-payments", projectId] });
          void queryClient.invalidateQueries({ queryKey: ["license-audit", projectId] });
          void queryClient.invalidateQueries({ queryKey: ["summary-usage-analytics", projectId] });
        }}
      />
    </Card>
  );
}

function remainingTime(value: string) {
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days === 1) return "Vence mañana";
  if (days === 0) return "Vence hoy";
  if (days < 0) return `Vencida hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`;
  if (days < 30) return `Quedan ${days} días`;
  const months = Math.floor(days / 30);
  const remainder = days % 30;
  return remainder
    ? `Quedan ${months} ${months === 1 ? "mes" : "meses"} y ${remainder} días`
    : `Quedan ${months} ${months === 1 ? "mes" : "meses"}`;
}

function StatusDialog({
  projectId,
  client,
  onClose,
}: {
  projectId: string;
  client: ServiceClient | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LicenseStatus>("active");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!client) return;
    setStatus(client.status);
    setReason("");
  }, [client]);
  const requiresReason = status === "suspended" || status === "revoked";
  const mutation = useMutation({
    mutationFn: () => {
      if (!client) throw new Error("Selecciona un cliente.");
      return supabaseServices.licenses.setClientStatus(projectId, client.userId, status, reason);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-clients", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-licenses", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["license-audit", projectId] }),
      ]);
      toast.success("Estado de licencia actualizado.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={!!client}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gestionar acceso del cliente</DialogTitle>
          <DialogDescription>
            {client?.email}. Si todavía usa la prueba inicial, se creará su licencia automáticamente
            al guardar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as LicenseStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{requiresReason ? "Motivo obligatorio" : "Nota opcional"}</Label>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Con estado pendiente, vencida, suspendida o revocada, el cliente podrá consultar sus
            registros existentes, pero Supabase rechazará cualquier alta, modificación o
            eliminación.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={requiresReason ? "destructive" : "default"}
            disabled={mutation.isPending || (requiresReason && !reason.trim())}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Guardando…" : "Guardar estado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
