import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Eye, Loader2, ShieldCheck, Users, KeyRound } from "lucide-react";
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
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminDataTableShell } from "@/components/admin/AdminDataTableShell";
import { DataToolbar } from "@/components/admin/DataToolbar";
import { DetailList } from "@/components/admin/DetailList";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { MobileActionsMenu } from "@/components/admin/MobileAdminSystem";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminStatus } from "@/components/admin/types";
import { LicenseKeyDisplay } from "@/components/admin/LicenseKeyDisplay";

const statuses: { value: LicenseStatus; label: string }[] = [
  { value: "active", label: "Activa" },
  { value: "pending", label: "Pendiente" },
  { value: "expired", label: "Vencida" },
  { value: "suspended", label: "Suspendida" },
  { value: "revoked", label: "Revocada" },
];

function statusVisual(status: LicenseStatus | null): AdminStatus {
  if (!status) return "inactive";
  if (status === "active") return "active";
  if (status === "pending" || status === "suspended") return "pending";
  if (status === "expired" || status === "revoked") return "expired";
  return "inactive";
}

function statusLabel(status: LicenseStatus | null) {
  if (!status) return "Sin licencia";
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function formatClientExpiry(value: string | null) {
  if (!value) return "Sin vencimiento";
  return new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(value));
}

export default function ClientesSection({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ServiceClient | null>(null);

  const query = useQuery({
    queryKey: ["admin-clients", projectId],
    queryFn: () => supabaseServices.licenses.listClients(projectId),
  });
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage =
    permissions.includes("customers.manage") && permissions.includes("licenses.manage");

  const licenses = useQuery({
    queryKey: ["admin-licenses", projectId],
    queryFn: () => supabaseServices.licenses.list(projectId),
  });
  const plans = useQuery({
    queryKey: ["admin-license-plans", projectId],
    queryFn: () => supabaseServices.licenses.listAdminPlans(projectId),
  });

  const allClients = useMemo(() => query.data ?? [], [query.data]);
  const licenseById = useMemo(
    () => new Map((licenses.data ?? []).map((license) => [license.id, license])),
    [licenses.data],
  );
  const planByCode = useMemo(
    () => new Map((plans.data ?? []).map((plan) => [plan.code.toLowerCase(), plan])),
    [plans.data],
  );

  const clients = useMemo(
    () =>
      allClients.filter((client) =>
        `${client.displayName} ${client.email} ${client.phone ?? ""} ${client.licenseKey ?? ""} ${client.plan}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [allClients, search],
  );

  const { activeClients, trialClients, expiringSoon } = useMemo(() => {
    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 86_400_000;

    const hasActiveLicense = (client: ServiceClient) => {
      if (!client.licenseId || client.status !== "active") return false;
      const license = licenseById.get(client.licenseId);
      const expiresAt = license?.expiresAt ?? client.expiresAt;
      return !expiresAt || new Date(expiresAt).getTime() >= now;
    };

    const isTrialLicense = (client: ServiceClient) => {
      if (!hasActiveLicense(client)) return false;
      const license = client.licenseId ? licenseById.get(client.licenseId) : undefined;
      const planCode = (license?.plan ?? client.plan ?? "").toLowerCase();
      const plan = planByCode.get(planCode);
      return (
        planCode === "trial" ||
        license?.licenseType.toLowerCase() === "trial" ||
        plan?.licenseType.toLowerCase() === "trial"
      );
    };

    return {
      activeClients: allClients.filter(hasActiveLicense).length,
      trialClients: allClients.filter(isTrialLicense).length,
      expiringSoon: allClients.filter((client) => {
        if (!hasActiveLicense(client) || !client.licenseId) return false;
        const license = licenseById.get(client.licenseId);
        const expiresAt = license?.expiresAt ?? client.expiresAt;
        if (!expiresAt) return false;
        const expiration = new Date(expiresAt).getTime();
        return expiration >= now && expiration <= sevenDaysFromNow;
      }).length,
    };
  }, [allClients, licenseById, planByCode]);

  const updateStatusMutation = useMutation({
    mutationFn: ({
      userId,
      status,
      reason,
    }: {
      userId: string;
      status: LicenseStatus;
      reason: string;
    }) => supabaseServices.licenses.setClientStatus(projectId, userId, status, reason),
    onSuccess: () => {
      toast.success("Estado del cliente actualizado");
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-clients", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-licenses", projectId] });
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
    <div className="space-y-4 md:space-y-8">
      <ModuleHeader
        title="Clientes"
        description="Directorio de clientes, usuarios registrados y estado de sus licencias."
        icon={Users}
        module="clientes"
      />

      <KpiGrid columns={4} density="compact">
        <MetricCard
          label="Total clientes"
          value={allClients.length}
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
      </KpiGrid>

      {/* Tabla con FilterToolbar & AdminDataTableShell */}
      <AdminDataTableShell
        title="Todos los clientes"
        description="Gestión detallada de cuentas y accesos"
        actions={
          <DataToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Nombre, correo, teléfono o licencia..."
            resultCount={clients.length}
            activeFilterCount={search ? 1 : 0}
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
        <div className="space-y-3 md:hidden">
          {clients.map((client) => (
            <Card
              key={client.userId}
              data-admin-module="clientes"
              className="rounded-[var(--radius-card)] border-border-subtle bg-surface-1 shadow-[var(--shadow-xs)]"
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0 border border-[var(--module-border)]">
                    <AvatarImage src={client.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-[var(--module-surface)] text-xs font-semibold text-[var(--module-foreground)]">
                      {client.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {client.displayName}
                    </p>
                    <p className="truncate text-xs text-text-secondary">{client.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info" className="rounded-full capitalize">
                    {client.plan ?? "Sin licencia"}
                  </Badge>
                  <StatusBadge
                    status={statusVisual(client.status)}
                    label={statusLabel(client.status)}
                  />
                </div>

                <DetailList
                  className="gap-y-2 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-3 [&>div]:pb-2 [&_dd]:mt-0 [&_dd]:text-right [&_dt]:text-xs"
                  items={[
                    {
                      label: "Vence",
                      value: formatClientExpiry(client.expiresAt),
                    },
                    {
                      label: "Licencia",
                      value: <LicenseKeyDisplay value={client.licenseKey} />,
                    },
                  ]}
                />

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void navigate({
                        to: "/admin/proyectos/$id/clientes/$clientId",
                        params: { id: projectId, clientId: client.userId },
                      })
                    }
                  >
                    <Eye className="h-4 w-4" /> Ver ficha
                  </Button>
                  {canManage && client.licenseId ? (
                    <MobileActionsMenu
                      items={[{ label: "Gestionar", onSelect: () => setSelected(client) }]}
                    />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="hidden min-w-0 overflow-hidden md:block md:overflow-x-auto">
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
                const expiresAt = client.expiresAt
                  ? new Date(client.expiresAt).getTime()
                  : Number.NaN;
                const diffDays = Math.ceil((expiresAt - Date.now()) / 86_400_000);
                const isExpiring = diffDays >= 0 && diffDays <= 7;

                return (
                  <TableRow
                    key={client.userId}
                    className="group hover:bg-muted/40 transition-colors"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border/70">
                          <AvatarImage src={client.avatarUrl ?? undefined} />
                          <AvatarFallback className="bg-blue-500/10 text-blue-400 text-xs font-semibold">
                            {client.displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">
                            {client.displayName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{client.phone || "Sin teléfono"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge
                          variant="info"
                          className="rounded-full text-xs capitalize font-medium"
                        >
                          {client.plan ?? "Sin licencia"}
                        </Badge>
                        <LicenseKeyDisplay value={client.licenseKey} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={statusVisual(client.status)}
                        label={statusLabel(client.status)}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={
                          isExpiring ? "text-amber-400 font-semibold" : "text-muted-foreground"
                        }
                      >
                        {formatClientExpiry(client.expiresAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() =>
                            void navigate({
                              to: "/admin/proyectos/$id/clientes/$clientId",
                              params: { id: projectId, clientId: client.userId },
                            })
                          }
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver ficha
                        </Button>
                        {canManage && client.licenseId && (
                          <MobileActionsMenu
                            items={[{ label: "Gestionar", onSelect: () => setSelected(client) }]}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </AdminDataTableShell>

      {/* Client management remains available; billing starts in Cliente 360. */}
      <ClientManageDialog
        client={selected}
        onClose={() => setSelected(null)}
        onSave={(status, reason) => {
          if (!selected) return;
          updateStatusMutation.mutate({ userId: selected.userId, status, reason });
        }}
        isPending={updateStatusMutation.isPending}
      />
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
      if (client.status) setStatus(client.status);
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
          <DialogDescription>
            Actualiza el estado de la licencia y cuenta asociada.
          </DialogDescription>
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
