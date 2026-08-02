import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  History,
  KeyRound,
  Laptop,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  supabaseServices,
  type LicensePlan,
  type ServiceClient,
  type LicenseStatus,
  type LicenseType,
  type ServiceLicense,
  type ServicePayment,
} from "@/lib/services";
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
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileActionsMenu,
  MobileFiltersPanel,
  MobileLoadMore,
  MobileMetricsGrid,
  type MobileMetric,
} from "@/components/admin/MobileAdminSystem";

const statuses: LicenseStatus[] = ["active", "pending", "expired", "suspended", "revoked"];
const labels: Record<string, string> = {
  active: "Activa",
  pending: "Pendiente",
  expired: "Vencida",
  suspended: "Suspendida",
  revoked: "Revocada",
};

function displayDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Sin vencimiento";
}

function remainingLicenseTime(value: string | null) {
  if (!value) return "Sin vencimiento";
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Vencida hace ${Math.abs(days)} d`;
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days < 30) return `${days} días restantes`;
  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? "mes" : "meses"} restantes`;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("USER_NOT_FOUND")) return "El usuario no existe en Supabase.";
  if (message.includes("LICENSE_ALREADY_EXISTS") || message.includes("duplicate"))
    return "El usuario ya tiene una licencia en este proyecto.";
  if (message.includes("ADMIN_REQUIRED"))
    return "Solo un administrador puede realizar esta operación.";
  if (message.includes("REASON_REQUIRED")) return "Debes indicar un motivo.";
  if (message.includes("PLAN_LICENSE_TYPE_MISMATCH"))
    return "El tipo de licencia no coincide con el plan seleccionado. Vuelve a elegir el plan.";
  return message;
}

export default function LicenciasSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [type, setType] = useState("all");
  const [expiry, setExpiry] = useState("all");
  const [mobileVisible, setMobileVisible] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceLicense | null>(null);
  const [action, setAction] = useState<"renew" | "status" | "extend" | "plan" | null>(null);
  const [details, setDetails] = useState<ServiceLicense | null>(null);

  const licensesQuery = useQuery({
    queryKey: ["admin-licenses", projectId],
    queryFn: () => supabaseServices.licenses.list(projectId),
  });
  const typesQuery = useQuery({
    queryKey: ["license-types"],
    queryFn: () => supabaseServices.licenses.listTypes(),
  });
  const clientsQuery = useQuery({
    queryKey: ["admin-clients", projectId],
    queryFn: () => supabaseServices.licenses.listClients(projectId),
  });
  const plansQuery = useQuery({
    queryKey: ["license-plans"],
    queryFn: () => supabaseServices.licenses.listPlans(projectId),
  });
  const licenses = useMemo(() => licensesQuery.data ?? [], [licensesQuery.data]);
  const clientByUserId = useMemo(
    () => new Map((clientsQuery.data ?? []).map((client) => [client.userId, client] as const)),
    [clientsQuery.data],
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-licenses", projectId] });

  const filtered = useMemo(() => {
    const now = Date.now();
    return licenses.filter((license) => {
      const text =
        `${license.userEmail} ${license.key} ${license.plan} ${license.licenseType}`.toLowerCase();
      const days = license.expiresAt
        ? (new Date(license.expiresAt).getTime() - now) / 86400000
        : Infinity;
      return (
        text.includes(search.toLowerCase()) &&
        (status === "all" || license.status === status) &&
        (plan === "all" || license.plan === plan) &&
        (type === "all" || license.licenseType === type) &&
        (expiry === "all" ||
          (expiry === "expired" && days < 0) ||
          (expiry === "7" && days >= 0 && days <= 7) ||
          (expiry === "30" && days >= 0 && days <= 30))
      );
    });
  }, [licenses, search, status, plan, type, expiry]);

  const count = (value: LicenseStatus) => licenses.filter((item) => item.status === value).length;
  const expiring = (days: number) =>
    licenses.filter(
      (item) =>
        item.expiresAt &&
        item.status === "active" &&
        new Date(item.expiresAt).getTime() >= Date.now() &&
        new Date(item.expiresAt).getTime() <= Date.now() + days * 86400000,
    ).length;
  const activeFilterCount = [status, plan, type, expiry].filter((value) => value !== "all").length;
  const visibleMobileRows = filtered.slice(0, mobileVisible);
  const metrics: MobileMetric[] = [
    {
      key: "active",
      label: "Activas",
      value: licensesQuery.isLoading ? "Cargando..." : String(count("active")),
      icon: Activity,
    },
    {
      key: "pending",
      label: "Pendientes",
      value: licensesQuery.isLoading ? "Cargando..." : String(count("pending")),
      icon: CalendarClock,
    },
    {
      key: "at-risk",
      label: "Vencidas / suspendidas",
      value: licensesQuery.isLoading ? "Cargando..." : String(count("expired") + count("suspended")),
      icon: ShieldAlert,
    },
    {
      key: "trial",
      label: "En prueba",
      value: licensesQuery.isLoading
        ? "Cargando..."
        : String(licenses.filter((item) => item.licenseType === "trial").length),
      icon: Users,
    },
    {
      key: "expiring-7",
      label: "Vencen en 7 días",
      value: licensesQuery.isLoading ? "Cargando..." : String(expiring(7)),
      icon: CalendarClock,
    },
    {
      key: "expiring-30",
      label: "Vencen en 30 días",
      value: licensesQuery.isLoading ? "Cargando..." : String(expiring(30)),
      icon: CalendarClock,
    },
    {
      key: "total",
      label: "Total licencias",
      value: licensesQuery.isLoading ? "Cargando..." : String(licenses.length),
      icon: KeyRound,
    },
    {
      key: "visible",
      label: "Visibles con filtros",
      value: licensesQuery.isLoading ? "Cargando..." : String(filtered.length),
      icon: Search,
    },
    ...((plansQuery.data ?? []).map((item) => ({
      key: `plan-${item.code}`,
      label: `Plan ${item.name}`,
      value: licensesQuery.isLoading
        ? "Cargando..."
        : String(licenses.filter((l) => l.plan === item.code).length),
      icon: KeyRound,
    })) as MobileMetric[]),
  ];

  useEffect(() => {
    setMobileVisible(10);
  }, [search, status, plan, type, expiry]);

  if (licensesQuery.isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-destructive">
          {errorMessage(licensesQuery.error)}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card/80 p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Resumen estadístico</p>
            <p className="text-xs text-muted-foreground">Información rápida de licencias</p>
          </div>
          <Badge variant="secondary">{licenses.length} total</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          <Metric
            icon={Activity}
            label="Activas"
            value={licensesQuery.isLoading ? "Cargando..." : String(count("active"))}
          />
          <Metric
            icon={CalendarClock}
            label="Pendientes"
            value={licensesQuery.isLoading ? "Cargando..." : String(count("pending"))}
          />
          <Metric
            icon={ShieldAlert}
            label="Vencidas / suspendidas"
            value={
              licensesQuery.isLoading ? "Cargando..." : String(count("expired") + count("suspended"))
            }
          />
          <Metric
            icon={Users}
            label="En prueba"
            value={
              licensesQuery.isLoading
                ? "Cargando..."
                : String(licenses.filter((item) => item.licenseType === "trial").length)
            }
          />
          <Metric
            icon={CalendarClock}
            label="Vencen en 7 días"
            value={licensesQuery.isLoading ? "Cargando..." : String(expiring(7))}
          />
          <Metric
            icon={CalendarClock}
            label="Vencen en 30 días"
            value={licensesQuery.isLoading ? "Cargando..." : String(expiring(30))}
          />
          <Metric
            icon={KeyRound}
            label="Total licencias"
            value={licensesQuery.isLoading ? "Cargando..." : String(licenses.length)}
          />
          <Metric
            icon={Search}
            label="Visibles con filtros"
            value={licensesQuery.isLoading ? "Cargando..." : String(filtered.length)}
          />
          {plansQuery.data?.map((item) => (
            <Metric
              key={item.code}
              icon={KeyRound}
              label={`Plan ${item.name}`}
              value={
                licensesQuery.isLoading
                  ? "Cargando..."
                  : String(licenses.filter((l) => l.plan === item.code).length)
              }
            />
          ))}
        </div>
      </div>

      <Card className="glass-panel">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" /> Licencias
            <Badge variant="outline">{licenses.length}</Badge>
          </CardTitle>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Crear licencia
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Correo, clave, plan o tipo"
              className="pl-9"
            />
          </div>

          <MobileFiltersPanel
            activeFilters={activeFilterCount}
            onClear={() => {
              setStatus("all");
              setPlan("all");
              setType("all");
              setExpiry("all");
            }}
          >
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <Filter
                value={status}
                onChange={setStatus}
                placeholder="Estado"
                items={statuses.map((code) => ({ code, name: labels[code] }))}
              />
              <Filter
                value={plan}
                onChange={setPlan}
                placeholder="Plan"
                items={plansQuery.data ?? []}
              />
              <Filter
                value={type}
                onChange={setType}
                placeholder="Tipo"
                items={typesQuery.data ?? []}
              />
              <Filter
                value={expiry}
                onChange={setExpiry}
                placeholder="Vencimiento"
                items={[
                  { code: "expired", name: "Vencidas" },
                  { code: "7", name: "Próximas 7 días" },
                  { code: "30", name: "Próximas 30 días" },
                ]}
              />
            </div>
          </MobileFiltersPanel>

          <div className="space-y-3 md:hidden">
            {visibleMobileRows.map((license) => (
              <Card key={license.id} className="border-border/70 bg-card/80">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-all text-sm font-medium">{license.userEmail}</div>
                      <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                        {license.key}
                      </div>
                    </div>
                    <Badge
                      variant={
                        license.status === "active"
                          ? "default"
                          : license.status === "pending"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {labels[license.status]}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Plan</div>
                      <div className="mt-0.5 text-foreground">{license.plan}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Tipo</div>
                      <div className="mt-0.5 text-foreground">{license.licenseType}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Vence</div>
                      <div className="mt-0.5 text-foreground">{displayDate(license.expiresAt)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Tiempo restante</div>
                      <div className="mt-0.5 text-foreground">
                        {remainingLicenseTime(license.expiresAt)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Dispositivos</div>
                      <div className="mt-0.5 text-foreground">
                        {license.activeDevices} / {license.maxDevices}
                      </div>
                    </div>
                  </div>
                  <Accordion type="single" collapsible>
                    <AccordionItem value={`license-${license.id}`}>
                      <AccordionTrigger className="py-2 text-sm">Ver detalles</AccordionTrigger>
                      <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                        <DetailRow
                          label="Último pago"
                          value={lastPaymentLabel(clientByUserId.get(license.userId))}
                        />
                        <DetailRow
                          label="Última renovación"
                          value={displayDate(
                            clientByUserId.get(license.userId)?.lastRenewedAt ?? null,
                          )}
                        />
                        <DetailRow label="Activación" value={displayDate(license.activatedAt)} />
                        <DetailRow
                          label="Última validación"
                          value={displayDate(license.lastValidation)}
                        />
                        <DetailRow label="Creación" value={displayDate(license.createdAt)} />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  <div className="flex justify-end">
                    <MobileActionsMenu
                      items={[
                        {
                          label: "Gestionar licencia",
                          onSelect: () => setSelected(license),
                        },
                        {
                          label: "Historial y dispositivos",
                          onSelect: () => setDetails(license),
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
              total={filtered.length}
              visible={visibleMobileRows.length}
              canLoadMore={filtered.length > visibleMobileRows.length}
              onLoadMore={() => setMobileVisible((value) => value + 10)}
            />
          ) : null}

          <div className="hidden min-w-0 overflow-hidden md:block md:overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Clave</TableHead>
                  <TableHead>Plan / tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Activación</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Dispositivos</TableHead>
                  <TableHead>Última validación</TableHead>
                  <TableHead>Creación</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((license) => (
                  <TableRow key={license.id}>
                    <TableCell data-label="Usuario" className="break-all">
                      {license.userEmail}
                    </TableCell>
                    <TableCell data-label="Clave" className="break-all font-mono text-xs">
                      {license.key}
                    </TableCell>
                    <TableCell data-label="Plan">
                      <div>{license.plan}</div>
                      <div className="text-xs text-muted-foreground">{license.licenseType}</div>
                    </TableCell>
                    <TableCell data-label="Estado">
                      <Badge
                        variant={
                          license.status === "active"
                            ? "default"
                            : license.status === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {labels[license.status]}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Inicio" className="whitespace-nowrap text-xs">
                      {displayDate(license.activatedAt)}
                    </TableCell>
                    <TableCell data-label="Vencimiento" className="whitespace-nowrap text-xs">
                      <div>{displayDate(license.expiresAt)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {remainingLicenseTime(license.expiresAt)}
                      </div>
                    </TableCell>
                    <TableCell data-label="Dispositivos">
                      {license.activeDevices} / {license.maxDevices}
                    </TableCell>
                    <TableCell data-label="Validación" className="whitespace-nowrap text-xs">
                      {displayDate(license.lastValidation)}
                    </TableCell>
                    <TableCell data-label="Creación" className="whitespace-nowrap text-xs">
                      {displayDate(license.createdAt)}
                    </TableCell>
                    <TableCell data-label="Acciones">
                      <Button variant="ghost" size="icon" onClick={() => setSelected(license)}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!licensesQuery.isLoading && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay licencias con esos filtros.
            </p>
          )}
        </CardContent>
      </Card>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        types={typesQuery.data ?? []}
        plans={plansQuery.data ?? []}
        onDone={refresh}
      />
      <ActionsDialog
        license={action ? null : selected}
        onClose={() => setSelected(null)}
        onAction={(next: "renew" | "status" | "extend" | "plan") => {
          setAction(next);
        }}
        onDetails={() => {
          setDetails(selected);
          setSelected(null);
        }}
      />
      <OperationDialog
        license={selected}
        operation={action}
        types={typesQuery.data ?? []}
        plans={plansQuery.data ?? []}
        onClose={() => {
          setAction(null);
          setSelected(null);
        }}
        onDone={refresh}
      />
      <DetailsDialog license={details} onClose={() => setDetails(null)} onDone={refresh} />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex items-center gap-2 p-3">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
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

function Filter({
  value,
  onChange,
  placeholder,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  items: { code: string; name: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}: todos</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.code} value={item.code}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type DialogCommon = {
  types: LicenseType[];
  plans: LicensePlan[];
  onDone: () => void;
};

function CreateDialog({
  open,
  onOpenChange,
  projectId,
  types,
  plans,
  onDone,
}: DialogCommon & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  const [email, setEmail] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState<LicenseStatus>("active");
  const [duration, setDuration] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [maxDevices, setMaxDevices] = useState("");
  const [features, setFeatures] = useState("{}");
  const [notes, setNotes] = useState("");
  const [key, setKey] = useState("");
  const selectedType = types.find((item) => item.code === licenseType);
  const selectedPlan = plans.find((item) => item.code === plan);
  const effectiveDays = selectedType?.allowsCustomDuration
    ? Number(duration)
    : selectedType?.defaultDurationDays;
  const expiry = selectedType?.neverExpires
    ? null
    : effectiveDays
      ? new Date(new Date(start).getTime() + effectiveDays * 86400000)
      : null;
  const mutation = useMutation({
    mutationFn: () =>
      supabaseServices.licenses.create({
        projectId,
        email,
        licenseType,
        plan,
        status,
        durationDays: selectedType?.allowsCustomDuration ? Number(duration) : undefined,
        activatedAt: new Date(`${start}T00:00:00`).toISOString(),
        maxDevices: maxDevices ? Number(maxDevices) : undefined,
        features: JSON.parse(features || "{}"),
        notes,
        licenseKey: key,
      }),
    onSuccess: () => {
      toast.success("Licencia creada correctamente.");
      onDone();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear licencia</DialogTitle>
          <DialogDescription>
            La duración, funciones y dispositivos se calculan desde la configuración de Supabase.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Correo">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Estado">
            <Filter
              value={status}
              onChange={(v) => setStatus(v as LicenseStatus)}
              placeholder="Estado"
              items={statuses.map((code) => ({ code, name: labels[code] }))}
            />
          </Field>
          <Field label="Tipo">
            <Filter
              value={licenseType}
              onChange={setLicenseType}
              placeholder="Tipo"
              items={types}
            />
          </Field>
          <Field label="Plan">
            <Filter value={plan} onChange={setPlan} placeholder="Plan" items={plans} />
          </Field>
          <Field label="Fecha de inicio">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Duración">
            {selectedType?.allowsCustomDuration ? (
              <Input
                type="number"
                min="1"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Días"
              />
            ) : (
              <Input
                readOnly
                value={
                  selectedType?.neverExpires
                    ? "Sin vencimiento"
                    : `${selectedType?.defaultDurationDays ?? "—"} días`
                }
              />
            )}
          </Field>
          <Field label="Fecha de vencimiento">
            <Input
              readOnly
              value={expiry ? expiry.toISOString().slice(0, 10) : "Sin vencimiento"}
            />
          </Field>
          <Field label="Máximo de dispositivos">
            <Input
              type="number"
              min="1"
              value={maxDevices}
              onChange={(e) => setMaxDevices(e.target.value)}
              placeholder={String(
                selectedPlan?.maxDevices ?? selectedType?.defaultMaxDevices ?? "",
              )}
            />
          </Field>
          <Field label="Clave personalizada (opcional)">
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Automática si queda vacío"
            />
          </Field>
          <Field label="Funciones JSON">
            <Textarea value={features} onChange={(e) => setFeatures(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notas">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={mutation.isPending || !email || !licenseType || !plan}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Creando…" : "Crear licencia"}
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

function lastPaymentLabel(client: ServiceClient | undefined) {
  if (!client?.lastPaymentAt || client.lastPaymentAmount == null || !client.lastPaymentCurrency) {
    return "Sin pago registrado";
  }
  return `${client.lastPaymentAmount} ${client.lastPaymentCurrency} · ${displayDate(client.lastPaymentAt)}`;
}

function ActionsDialog({
  license,
  onClose,
  onAction,
  onDetails,
}: {
  license: ServiceLicense | null;
  onClose: () => void;
  onAction: (operation: "renew" | "status" | "extend" | "plan") => void;
  onDetails: () => void;
}) {
  return (
    <Dialog open={!!license} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestionar licencia</DialogTitle>
          <DialogDescription>
            {license?.userEmail} · {license?.key}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => onAction("renew")}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Renovar
          </Button>
          <Button variant="outline" onClick={() => onAction("extend")}>
            <CalendarClock className="mr-2 h-4 w-4" />
            Extender días
          </Button>
          <Button variant="outline" onClick={() => onAction("plan")}>
            <KeyRound className="mr-2 h-4 w-4" />
            Cambiar plan
          </Button>
          <Button variant="outline" onClick={() => onAction("status")}>
            <ShieldAlert className="mr-2 h-4 w-4" />
            Cambiar estado
          </Button>
          <Button variant="outline" className="sm:col-span-2" onClick={onDetails}>
            <History className="mr-2 h-4 w-4" />
            Historial y dispositivos
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OperationDialog({
  license,
  operation,
  types,
  plans,
  onClose,
  onDone,
}: DialogCommon & {
  license: ServiceLicense | null;
  operation: "renew" | "status" | "extend" | "plan" | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<LicenseStatus>("active");
  const [days, setDays] = useState("");
  const [plan, setPlan] = useState("");
  const [type, setType] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<ServicePayment["method"]>("transfer");
  const [reference, setReference] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<ServicePayment["status"]>("paid");
  const [customPrice, setCustomPrice] = useState("");
  const selectedPlan = plans.find((item) => item.code === plan);
  const selectedType = types.find((item) => item.code === type);
  useEffect(() => {
    if (!license || !operation) return;
    const currentPlan = plans.find((item) => item.code === license.plan);
    setPlan(license.plan);
    setType(currentPlan?.licenseType ?? license.licenseType);
    setReason("");
  }, [license, operation, plans]);
  const mutation = useMutation({
    mutationFn: () => {
      if (!license || !operation) throw new Error("Selecciona una licencia y una operación.");
      if (operation === "renew") {
        return supabaseServices.licenses.renewWithPayment({
          licenseId: license.id,
          plan,
          method,
          reference,
          notes: reason,
          overrideAmount: customPrice ? Number(customPrice) : undefined,
          adjustmentReason: customPrice ? reason : undefined,
          paymentStatus,
        });
      }
      return supabaseServices.licenses.update(license.id, operation, {
        status,
        days: Number(days),
        duration_days: days ? Number(days) : undefined,
        plan: plan || undefined,
        license_type: type || undefined,
        reason,
      });
    },
    onSuccess: () => {
      toast.success("Operación completada.");
      onDone();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const sensitive = operation === "status" && ["suspended", "revoked"].includes(status);
  return (
    <Dialog open={!!license && !!operation} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {operation === "renew"
              ? "Renovar licencia"
              : operation === "extend"
                ? "Extender días"
                : operation === "plan"
                  ? "Cambiar plan"
                  : "Cambiar estado"}
          </DialogTitle>
          <DialogDescription>
            La licencia conservará su usuario, clave e historial.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {operation === "status" && (
            <Field label="Nuevo estado">
              <Filter
                value={status}
                onChange={(v) => setStatus(v as LicenseStatus)}
                placeholder="Estado"
                items={statuses.map((code) => ({ code, name: labels[code] }))}
              />
            </Field>
          )}
          {operation === "extend" && (
            <Field
              label={
                operation === "extend" ? "Días adicionales" : "Duración personalizada (opcional)"
              }
            >
              <Input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
          )}
          {(operation === "renew" || operation === "plan") && (
            <>
              <Field label="Plan">
                <Filter
                  value={plan || "all"}
                  onChange={(v) => {
                    const nextPlan = v === "all" ? "" : v;
                    setPlan(nextPlan);
                    setType(plans.find((item) => item.code === nextPlan)?.licenseType ?? "");
                  }}
                  placeholder="Plan"
                  items={plans}
                />
              </Field>
              <Field label="Tipo">
                <Input readOnly value={selectedType?.name ?? type} />
                <p className="text-xs text-muted-foreground">
                  Definido automáticamente por el plan.
                </p>
              </Field>
            </>
          )}
          {operation === "renew" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Precio del plan">
                <Input
                  readOnly
                  value={selectedPlan ? `${selectedPlan.price} ${selectedPlan.currency}` : ""}
                />
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
                    {["card", "transfer", "cash", "paypal"].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Referencia">
                <Input value={reference} onChange={(event) => setReference(event.target.value)} />
              </Field>
              <Field label="Estado del pago">
                <Select
                  value={paymentStatus}
                  onValueChange={(value) => setPaymentStatus(value as ServicePayment["status"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["pending", "paid", "cancelled", "refunded", "complimentary"].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Precio personalizado (opcional)">
                <Input
                  type="number"
                  min="0"
                  max={selectedPlan?.price}
                  value={customPrice}
                  onChange={(event) => setCustomPrice(event.target.value)}
                />
              </Field>
            </div>
          )}
          <Field label={sensitive ? "Motivo obligatorio" : "Motivo / nota"}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={sensitive ? "destructive" : "default"}
            disabled={
              mutation.isPending ||
              (sensitive && !reason) ||
              (operation === "extend" && (!days || !reason)) ||
              (operation === "plan" && !plan) ||
              (operation === "renew" && (!plan || !reference || (!!customPrice && !reason)))
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Procesando…" : sensitive ? "Confirmar operación" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsDialog({
  license,
  onClose,
  onDone,
}: {
  license: ServiceLicense | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const devices = useQuery({
    queryKey: ["license-devices", license?.id],
    queryFn: () => {
      if (!license) throw new Error("Selecciona una licencia.");
      return supabaseServices.licenses.listDevices(license.id);
    },
    enabled: !!license,
  });
  const history = useQuery({
    queryKey: ["license-history", license?.id],
    queryFn: () => {
      if (!license) throw new Error("Selecciona una licencia.");
      return supabaseServices.licenses.listHistory(license.id);
    },
    enabled: !!license,
  });
  const mutation = useMutation({
    mutationFn: async ({ kind, id }: { kind: "block" | "remove" | "reset"; id?: string }) => {
      if (!license) throw new Error("Selecciona una licencia.");
      if (kind === "reset")
        await supabaseServices.licenses.resetDevices(
          license.id,
          "Reinicio solicitado desde el panel",
        );
      else
        await supabaseServices.licenses.manageDevice(
          id!,
          kind,
          `Dispositivo ${kind} desde el panel`,
        );
    },
    onSuccess: () => {
      toast.success("Dispositivos actualizados.");
      devices.refetch();
      history.refetch();
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Dialog open={!!license} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial y dispositivos</DialogTitle>
          <DialogDescription>
            {license?.userEmail} · {license?.key}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">
                <Laptop className="mr-2 inline h-4 w-4" />
                Dispositivos
              </h3>
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ kind: "reset" })}
              >
                Reiniciar contador
              </Button>
            </div>
            <div className="space-y-2">
              {devices.data?.map((device) => (
                <div
                  key={device.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-mono text-xs">{device.id}</div>
                    <div className="text-xs text-muted-foreground">
                      Primera: {displayDate(device.firstSeenAt)} · Última:{" "}
                      {displayDate(device.lastSeenAt)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {device.revokedAt ? (
                      <Badge variant="destructive">Bloqueado</Badge>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => mutation.mutate({ kind: "block", id: device.id })}
                        >
                          Bloquear
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => mutation.mutate({ kind: "remove", id: device.id })}
                        >
                          Eliminar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!devices.isLoading && !devices.data?.length && (
                <p className="text-sm text-muted-foreground">No hay dispositivos registrados.</p>
              )}
            </div>
          </section>
          <section>
            <h3 className="mb-2 font-medium">
              <History className="mr-2 inline h-4 w-4" />
              Historial
            </h3>
            <div className="space-y-2">
              {history.data?.map((entry) => (
                <div key={entry.id} className="rounded-md border p-3">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {displayDate(entry.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{entry.detail}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Administrador: {entry.actorEmail ?? entry.actorId}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
