import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, Search, ShieldCheck, Users, KeyRound, MoreHorizontal, FileText } from "lucide-react";
import { supabaseServices, type LicenseStatus, type ServiceClient } from "@/lib/services";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { FilterToolbar } from "@/components/admin/FilterToolbar";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminDataTableShell } from "@/components/admin/AdminDataTableShell";

const statuses: { value: LicenseStatus; label: string }[] = [
  { value: "active", label: "Activa" },
  { value: "pending", label: "Pendiente" },
  { value: "expired", label: "Vencida" },
  { value: "suspended", label: "Suspendida" },
  { value: "revoked", label: "Revocada" },
];

function maskKey(key: string | null) {
  if (!key) return "Sin licencia";
  if (key.length <= 8) return "VRX-••••-••••";
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}-••••-${suffix}`;
}

export default function ClientesSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ServiceClient | null>(null);
  const [chargeClient, setChargeClient] = useState<ServiceClient | null>(null);

  const query = useQuery({
    queryKey: ["admin-clients", projectId],
    queryFn: () => supabaseServices.licenses.listClients(projectId),
  });
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage =
    permissions.includes("customers.manage") && permissions.includes("licenses.manage");
  const canCharge = permissions.includes("payments.manage");

  const licenses = useQuery({
    queryKey: ["admin-licenses", projectId],
    queryFn: () => supabaseServices.licenses.list(projectId),
  });
  const plans = useQuery({
    queryKey: ["admin-license-plans", projectId],
    queryFn: () => supabaseServices.licenses.listAdminPlans(projectId),
  });

  const clients = useMemo(
    () =>
      (query.data ?? []).filter((client) =>
        `${client.displayName} ${client.email} ${client.phone ?? ""} ${client.licenseKey ?? ""} ${client.plan}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [query.data, search],
  );

  const activeClients = clients.filter((client) => client.status === "active").length;
  const trialClients = clients.filter(
    (client) => client.licenseKey?.includes("trial") ?? false,
  ).length;
  const expiringSoon = clients.filter((client) => {
    const expiresAt = new Date(client.expiresAt).getTime();
    const diffDays = Math.ceil((expiresAt - Date.now()) / 86_400_000);
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  const updateStatusMutation = useMutation({
    mutationFn: ({ userId, status, reason }: { userId: string; status: LicenseStatus; reason: string }) =>
      supabaseServices.licenses.setClientStatus(projectId, userId, status, reason),
    onSuccess: () => {
      toast.success("Estado del cliente actualizado");
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-clients", projectId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <ModuleHeader
        title="Clientes"
        description="Directorio de clientes, usuarios registrados y estado de sus licencias."
        icon={Users}
        module="clientes"
      />

      {/* KPI Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Total clientes"
          value={clients.length}
          description="Registrados en sistema"
          icon={Users}
          module="clientes"
        />
        <MetricCard
          label="Activos"
          value={activeClients}
          description="Con licencia vigente"
          icon={ShieldCheck}
          semanticState="success"
        />
        <MetricCard
          label="En prueba"
          value={trialClients}
          description="Plan trial activo"
          icon={KeyRound}
          module="clientes"
        />
        <MetricCard
          label="Vencen en 7 días"
          value={expiringSoon}
          description="Requieren renovación"
          icon={CreditCard}
          semanticState="warning"
        />
      </div>

      {/* Tabla con FilterToolbar & AdminDataTableShell */}
      <AdminDataTableShell
        title="Todos los clientes"
        description="Gestión detallada de cuentas y accesos"
        actions={
          <FilterToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Nombre, correo, teléfono o licencia..."
            showReset={true}
            onReset={() => setSearch("")}
          />
        }
        isEmpty={clients.length === 0}
        emptyState={
          <EmptyState
            icon={Users}
            title="Sin clientes encontrados"
            description="No hay clientes que coincidan con los criterios de búsqueda actuales."
            module="clientes"
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Licencia / Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => {
              const expiresAt = new Date(client.expiresAt).getTime();
              const diffDays = Math.ceil((expiresAt - Date.now()) / 86_400_000);
              const isExpiring = diffDays >= 0 && diffDays <= 7;

              return (
                <TableRow key={client.userId} className="group hover:bg-muted/40 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border border-border/70">
                        <AvatarImage src={client.avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-blue-500/10 text-blue-400 text-xs font-semibold">
                          {client.displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{client.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div>{client.phone || "Sin teléfono"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="outline" className="text-xs capitalize font-medium">
                        {client.plan}
                      </Badge>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {maskKey(client.licenseKey)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={client.status === "active" ? "default" : "secondary"}
                      className={`text-xs ${
                        client.status === "active"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : ""
                      }`}
                    >
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className={isExpiring ? "text-amber-400 font-semibold" : "text-muted-foreground"}>
                      {new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(client.expiresAt))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {canCharge && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs bg-card/60"
                          onClick={() => setChargeClient(client)}
                        >
                          Cobrar
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setSelected(client)}
                        >
                          Gestionar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </AdminDataTableShell>

      {/* Modals for Client management & Charging kept fully intact */}
      <ClientManageDialog
        client={selected}
        onClose={() => setSelected(null)}
        onSave={(status, reason) => {
          if (!selected) return;
          updateStatusMutation.mutate({ userId: selected.userId, status, reason });
        }}
        isPending={updateStatusMutation.isPending}
      />

      {chargeClient && (
        <ChargePlanDialog
          isOpen={Boolean(chargeClient)}
          onClose={() => setChargeClient(null)}
          projectId={projectId}
          client={chargeClient}
          licenses={licenses.data ?? []}
          plans={plans.data ?? []}
          onSuccess={() => {
            setChargeClient(null);
            void queryClient.invalidateQueries({ queryKey: ["admin-clients", projectId] });
            void queryClient.invalidateQueries({ queryKey: ["admin-licenses", projectId] });
          }}
        />
      )}
    </div>
  );
}

function ClientManageDialog({
  client,
  onClose,
  onSave,
  isPending,
}: {
  client: ServiceClient | null;
  onClose: () => void;
  onSave: (status: LicenseStatus, reason: string) => void;
  isPending: boolean;
}) {
  const [status, setStatus] = useState<LicenseStatus>("active");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (client) {
      setStatus(client.status);
      setReason("");
    }
  }, [client]);

  if (!client) return null;

  const requiresReason = status === "suspended" || status === "revoked";

  return (
    <Dialog open={Boolean(client)} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gestionar cliente: {client.displayName}</DialogTitle>
          <DialogDescription>Actualiza el estado de la licencia y cuenta asociada.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Estado de la licencia</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LicenseStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {requiresReason && (
            <div className="grid gap-2">
              <Label>Motivo (requerido)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Indica el motivo de la suspensión o revocación..."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSave(status, reason)}
            disabled={isPending || (requiresReason && !reason.trim())}
          >
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
