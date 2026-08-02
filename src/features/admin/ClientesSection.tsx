import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, Search, ShieldCheck, Users } from "lucide-react";
import { supabaseServices, type LicenseStatus, type ServiceClient } from "@/lib/services";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { toast } from "sonner";
import { useProjectPermissions } from "@/hooks/useProjects";
import { ChargePlanDialog } from "@/features/admin/ChargePlanDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileActionsMenu,
  MobileLoadMore,
  MobileSectionHeader,
} from "@/components/admin/MobileAdminSystem";

const statuses: { value: LicenseStatus; label: string }[] = [
  { value: "active", label: "Activa" },
  { value: "pending", label: "Pendiente" },
  { value: "expired", label: "Vencida" },
  { value: "suspended", label: "Suspendida" },
  { value: "revoked", label: "Revocada" },
];

export default function ClientesSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [mobileVisible, setMobileVisible] = useState(10);
  const [selected, setSelected] = useState<ServiceClient | null>(null);
  const [chargeClient, setChargeClient] = useState<ServiceClient | null>(null);
  const query = useQuery({
    queryKey: ["admin-clients", projectId],
    queryFn: () => supabaseServices.licenses.listClients(projectId),
  });
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage =
    permissions.includes("customers.manage") && permissions.includes("licenses.manage");
  const canCharge =
    permissions.includes("payments.manage") && permissions.includes("licenses.manage");
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
  const visibleMobileRows = clients.slice(0, mobileVisible);
  const activeClients = clients.filter((client) => client.status === "active").length;
  const pendingClients = clients.filter((client) => client.status === "pending").length;
  const trialClients = clients.filter((client) => client.licenseKey?.includes("trial") ?? false).length;
  const expiringSoon = clients.filter((client) => {
    const expiresAt = new Date(client.expiresAt).getTime();
    const diffDays = Math.ceil((expiresAt - Date.now()) / 86_400_000);
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  useEffect(() => {
    setMobileVisible(10);
  }, [search]);

  return (
    <div className="space-y-4">
      <MobileSectionHeader
        title="Clientes"
        subtitle="Busca clientes y gestiona su licencia de forma compacta."
        badge={<Badge variant="outline">{clients.length}</Badge>}
      />

      <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/15 via-violet-500/7 to-background p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Resumen estadístico</p>
            <p className="text-xs text-muted-foreground">Información rápida de clientes</p>
          </div>
          <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" variant="secondary">
            {clients.length} clientes
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          <Metric label="Activos" value={String(activeClients)} icon={ShieldCheck} />
          <Metric label="Pendientes" value={String(pendingClients)} icon={CreditCard} />
          <Metric label="En prueba" value={String(trialClients)} icon={Users} />
          <Metric label="Vence en 7 días" value={String(expiringSoon)} icon={CreditCard} />
        </div>
      </div>

      <Card className="glass-panel">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            Todos los clientes
            <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" variant="outline">
              {clients.length}
            </Badge>
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
            <div className="space-y-3">
              <div className="space-y-3 md:hidden">
                {visibleMobileRows.map((client) => (
                  <Card key={client.userId} className="border-border/70 bg-card/80">
                    <CardContent className="space-y-3 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
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
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{client.displayName}</p>
                            <p className="truncate text-xs text-muted-foreground">{client.email}</p>
                          </div>
                        </div>
                        <Badge variant={client.status === "active" ? "default" : "secondary"}>
                          {statusLabel(client.status)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <MobileField label="Plan" value={client.plan} />
                        <MobileField
                          label="Licencia"
                          value={client.licenseKey ?? "Prueba inicial"}
                          mono
                        />
                        <MobileField
                          label="Vence"
                          value={new Date(client.expiresAt).toLocaleDateString()}
                        />
                        <MobileField
                          label="Tiempo restante"
                          value={remainingTime(client.expiresAt)}
                        />
                      </div>

                      <Accordion type="single" collapsible>
                        <AccordionItem value={`client-${client.userId}`}>
                          <AccordionTrigger className="py-1.5 text-sm">
                            Ver detalles
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                            <MobileDetail
                              label="Teléfono"
                              value={client.phone ?? "No registrado"}
                            />
                            <MobileDetail
                              label="Registro"
                              value={new Date(client.registeredAt).toLocaleDateString()}
                            />
                            <MobileDetail
                              label="Última actividad"
                              value={
                                client.lastPaymentAt
                                  ? new Date(client.lastPaymentAt).toLocaleString()
                                  : client.lastRenewedAt
                                    ? new Date(client.lastRenewedAt).toLocaleString()
                                    : "Sin actividad reciente"
                              }
                            />
                            <MobileDetail
                              label="Dispositivos"
                              value={`${client.activeDevices} / ${client.maxDevices}`}
                            />
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>

                      <div className="flex justify-end">
                        <MobileActionsMenu
                          items={[
                            {
                              label: "Cobrar",
                              disabled: !canCharge || !client.licenseId,
                              onSelect: () => setChargeClient(client),
                            },
                            {
                              label: "Gestionar",
                              disabled: !canManage,
                              onSelect: () => setSelected(client),
                            },
                          ]}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {isMobile ? (
                <MobileLoadMore
                  total={clients.length}
                  visible={visibleMobileRows.length}
                  canLoadMore={clients.length > visibleMobileRows.length}
                  onLoadMore={() => setMobileVisible((value) => value + 10)}
                />
              ) : null}

              <div className="hidden md:block">
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
                        <TableCell data-label="Correo" className="break-all">
                          <div>{client.email}</div>
                          {client.phone && (
                            <div className="mt-1 text-xs text-muted-foreground">{client.phone}</div>
                          )}
                        </TableCell>
                        <TableCell data-label="Clave" className="break-all font-mono text-xs">
                          {client.licenseKey ?? "Prueba inicial"}
                        </TableCell>
                        <TableCell data-label="Plan">{client.plan}</TableCell>
                        <TableCell data-label="Estado">
                          <Badge variant={client.status === "active" ? "default" : "secondary"}>
                            {client.status}
                          </Badge>
                        </TableCell>
                        <TableCell data-label="Registro">
                          {new Date(client.registeredAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell data-label="Vencimiento">
                          <div>{new Date(client.expiresAt).toLocaleDateString()}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {remainingTime(client.expiresAt)}
                          </div>
                        </TableCell>
                        <TableCell data-label="Acciones" className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {canCharge && client.licenseId && (
                              <Button size="sm" onClick={() => setChargeClient(client)}>
                                <CreditCard className="mr-2 h-4 w-4" />
                                Cobrar y asignar plan
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelected(client)}
                              >
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Gestionar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
        <StatusDialog projectId={projectId} client={selected} onClose={() => setSelected(null)} />
        <ChargePlanDialog
          client={chargeClient}
          license={
            (licenses.data ?? []).find((item) => item.id === chargeClient?.licenseId) ?? null
          }
          plans={plans.data ?? []}
          onClose={() => setChargeClient(null)}
          onDone={() => {
            void query.refetch();
            void licenses.refetch();
            void queryClient.invalidateQueries({ queryKey: ["admin-payments", projectId] });
            void queryClient.invalidateQueries({ queryKey: ["license-audit", projectId] });
            void queryClient.invalidateQueries({
              queryKey: ["summary-usage-analytics", projectId],
            });
          }}
        />
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex items-center gap-2 p-3">
        <Icon className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <div className="min-w-0">
          <div className="text-base font-semibold leading-none">{value}</div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
            {label}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function statusLabel(value: LicenseStatus) {
  const map: Record<LicenseStatus, string> = {
    active: "Activa",
    pending: "Pendiente",
    expired: "Vencida",
    suspended: "Suspendida",
    revoked: "Revocada",
  };
  return map[value];
}

function MobileField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide">{label}</p>
      <p
        className={`mt-0.5 text-foreground ${mono ? "break-all font-mono text-[11px]" : "truncate"}`}
      >
        {value}
      </p>
    </div>
  );
}

function MobileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
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
