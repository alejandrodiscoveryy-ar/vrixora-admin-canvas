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
import { Card, CardContent } from "@/components/ui/card";
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
import { useProjectPermissions } from "@/hooks/useProjects";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { FilterToolbar } from "@/components/admin/FilterToolbar";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminDataTableShell } from "@/components/admin/AdminDataTableShell";
import { SectionCard } from "@/components/admin/SectionCard";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { adminChartTooltipProps } from "@/lib/chart-theme";
import { MobileActionsMenu, MobileLoadMore } from "@/components/admin/MobileAdminSystem";

const statuses: LicenseStatus[] = ["active", "pending", "expired", "suspended", "revoked"];
const changeableStatuses: LicenseStatus[] = ["active", "pending", "suspended", "revoked"];
const labels: Record<string, string> = {
  active: "Activa",
  pending: "Pendiente",
  expired: "Vencida",
  suspended: "Suspendida",
  revoked: "Revocada",
};

const methodLabels: Record<string, string> = {
  card: "Tarjeta",
  transfer: "Transferencia",
  cash: "Efectivo",
  paypal: "PayPal",
  other: "Otro",
};

const paymentStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  complimentary: "Cortesía",
};

function planLabel(code: string, plans?: { code: string; name: string }[]) {
  const found = plans?.find((p) => p.code === code);
  if (found) return found.name;
  const fallback: Record<string, string> = {
    trial: "Prueba inicial",
    standard: "Estándar",
    admin: "Administrador",
  };
  return fallback[code] ?? code;
}

function maskKey(key: string) {
  if (!key || key.length <= 8) return "VRX-••••-••••";
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}-••••-${suffix}`;
}

function formatExpiryDate(value: string | null) {
  if (!value) return "Sin vencimiento";
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

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

  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("licenses.manage");

  const licensesQuery = useQuery({
    queryKey: ["admin-licenses", projectId],
    queryFn: () => supabaseServices.licenses.list(projectId),
  });
  const plansQuery = useQuery({
    queryKey: ["admin-license-plans", projectId],
    queryFn: () => supabaseServices.licenses.listAdminPlans(projectId),
  });
  const typesQuery = useQuery({
    queryKey: ["license-types"],
    queryFn: () => supabaseServices.licenses.listTypes(),
  });
  const paymentsQuery = useQuery({
    queryKey: ["admin-payments", projectId],
    queryFn: () => supabaseServices.payments.listAdmin(projectId),
  });

  const licenses = useMemo(() => licensesQuery.data ?? [], [licensesQuery.data]);
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const payments = useMemo(() => paymentsQuery.data ?? [], [paymentsQuery.data]);

  const filteredLicenses = useMemo(() => {
    const now = Date.now();
    return licenses.filter((license) => {
      const text =
        `${license.key} ${license.userEmail} ${license.licenseType} ${license.plan}`.toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchStatus = status === "all" || license.status === status;
      const matchPlan = plan === "all" || license.plan === plan;
      const matchType = type === "all" || license.licenseType === type;

      let matchExpiry = true;
      if (expiry !== "all" && license.expiresAt) {
        const deltaDays = Math.ceil((new Date(license.expiresAt).getTime() - now) / 86_400_000);
        if (expiry === "expired" || expiry === "expiring-expired") matchExpiry = deltaDays < 0;
        else if (expiry === "7d" || expiry === "7") matchExpiry = deltaDays >= 0 && deltaDays <= 7;
        else if (expiry === "30d" || expiry === "30")
          matchExpiry = deltaDays >= 0 && deltaDays <= 30;
      } else if ((expiry === "expired" || expiry === "expiring-expired") && !license.expiresAt) {
        matchExpiry = false;
      }

      return matchSearch && matchStatus && matchPlan && matchType && matchExpiry;
    });
  }, [licenses, search, status, plan, type, expiry]);

  // 5 KPI Principales
  const { activeCount, trialCount, paidCount, expiring7Count, expiredCount } = useMemo(() => {
    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 86_400_000;
    const planByCode = new Map(plans.map((item) => [item.code.toLowerCase(), item]));

    const isActive = (license: (typeof licenses)[number]) => {
      if (license.status !== "active") return false;
      return !license.expiresAt || new Date(license.expiresAt).getTime() >= now;
    };

    const hasLicenseType = (license: (typeof licenses)[number], type: string) => {
      const planCode = license.plan.toLowerCase();
      const plan = planByCode.get(planCode);
      return (
        license.licenseType.toLowerCase() === type ||
        plan?.licenseType.toLowerCase() === type ||
        planCode === type
      );
    };

    const isTrial = (license: (typeof licenses)[number]) => hasLicenseType(license, "trial");
    const isAdmin = (license: (typeof licenses)[number]) => hasLicenseType(license, "admin");

    return {
      activeCount: licenses.filter(isActive).length,
      trialCount: licenses.filter((license) => isActive(license) && isTrial(license)).length,
      paidCount: licenses.filter((license) => {
        if (!isActive(license) || isTrial(license) || isAdmin(license)) return false;
        return payments.some(
          (payment) =>
            payment.status === "paid" &&
            (payment.licenseId === license.id || payment.userId === license.userId),
        );
      }).length,
      expiring7Count: licenses.filter((license) => {
        if (!isActive(license) || !license.expiresAt) return false;
        const expiration = new Date(license.expiresAt).getTime();
        return expiration >= now && expiration <= sevenDaysFromNow;
      }).length,
      expiredCount: licenses.filter((license) => {
        if (!license.expiresAt || !["active", "expired"].includes(license.status)) return false;
        return new Date(license.expiresAt).getTime() < now;
      }).length,
    };
  }, [licenses, payments, plans]);

  // Plan distribution for chart
  const planDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    licenses.forEach((l) => {
      const p = l.plan || "general";
      counts.set(p, (counts.get(p) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([code, count]) => ({
      plan: planLabel(code, plans).toUpperCase(),
      count,
    }));
  }, [licenses, plans]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-licenses", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-payments", projectId] });
  };

  const visibleMobileRows = filteredLicenses.slice(0, mobileVisible);

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
    <div className="space-y-6 md:space-y-8">
      <ModuleHeader
        title="Licencias"
        description="Emisión, control de dispositivos, vigencias y planes de licenciamiento."
        icon={KeyRound}
        module="licencias"
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear licencia
            </Button>
          ) : undefined
        }
      />

      {/* 5 KPI Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Activas"
          value={activeCount}
          description="Total vigentes"
          icon={KeyRound}
          module="licencias"
          semanticState="success"
        />
        <MetricCard
          label="En prueba"
          value={trialCount}
          description="Plan trial"
          icon={Activity}
          module="licencias"
        />
        <MetricCard
          label="Pagadas"
          value={paidCount}
          description="Con pago confirmado"
          icon={Users}
          module="licencias"
          semanticState="success"
        />
        <MetricCard
          label="Vencen en 7 días"
          value={expiring7Count}
          description="Próximas a expirar"
          icon={CalendarClock}
          semanticState="warning"
        />
        <MetricCard
          label="Vencidas"
          value={expiredCount}
          description="Requieren renovación"
          icon={ShieldAlert}
          semanticState="danger"
        />
      </div>

      {/* Distribución por plan */}
      <SectionCard title="Distribución de licencias por plan" module="licencias">
        {planDistribution.length > 0 ? (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={planDistribution}
                layout="vertical"
                margin={{ left: 20, right: 20, top: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.15} />
                <XAxis
                  type="number"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  dataKey="plan"
                  type="category"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  width={90}
                />
                <Tooltip {...adminChartTooltipProps} />
                <Bar dataKey="count" fill="var(--module-licencias)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            title="Sin distribución"
            description="No hay licencias registradas para mostrar distribución."
            module="licencias"
          />
        )}
      </SectionCard>

      {/* Tabla con FilterToolbar & AdminDataTableShell */}
      <AdminDataTableShell
        title="Listado de licencias"
        description="Control y acciones de licenciamiento"
        actions={
          <FilterToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por clave, correo o plan..."
            showReset={true}
            onReset={() => {
              setSearch("");
              setStatus("all");
              setPlan("all");
              setType("all");
              setExpiry("all");
            }}
          >
            <FilterSelect
              value={status}
              onChange={setStatus}
              label="Estado"
              options={[
                { value: "all", label: "Todos los estados" },
                ...statuses.map((s) => ({ value: s, label: labels[s] })),
              ]}
            />
            <FilterSelect
              value={plan}
              onChange={setPlan}
              label="Plan"
              options={[
                { value: "all", label: "Todos los planes" },
                ...plans.map((p) => ({ value: p.code, label: p.name })),
              ]}
            />
            <FilterSelect
              value={expiry}
              onChange={setExpiry}
              label="Vencimiento"
              options={[
                { value: "all", label: "Todos los vencimientos" },
                { value: "7d", label: "Vencen en 7 días" },
                { value: "30d", label: "Vencen en 30 días" },
                { value: "expired", label: "Vencidas" },
              ]}
            />
          </FilterToolbar>
        }
        isEmpty={filteredLicenses.length === 0}
        emptyState={
          <EmptyState
            icon={KeyRound}
            title="Sin licencias encontradas"
            description="No hay licencias que coincidan con los filtros aplicados."
            module="licencias"
          />
        }
      >
        <div className="space-y-3 md:hidden">
          {visibleMobileRows.map((license) => {
            const diffDays = license.expiresAt
              ? Math.ceil((new Date(license.expiresAt).getTime() - Date.now()) / 86_400_000)
              : null;
            const isExpired = diffDays !== null && diffDays < 0;
            const isSoon7 = diffDays !== null && diffDays >= 0 && diffDays <= 7;

            return (
              <Card key={license.id} className="border-border/70 bg-card/80">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">{license.userEmail}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {maskKey(license.key)}
                      </div>
                    </div>
                    <Badge variant={license.status === "active" ? "default" : "secondary"}>
                      {labels[license.status] ?? license.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Plan</div>
                      <div className="mt-0.5 text-foreground">{planLabel(license.plan, plans)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Tipo</div>
                      <div className="mt-0.5 text-foreground capitalize">{license.licenseType}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Vencimiento</div>
                      <div
                        className={`mt-0.5 ${isExpired ? "text-red-400 font-semibold" : isSoon7 ? "text-amber-400 font-semibold" : "text-foreground"}`}
                      >
                        {license.expiresAt
                          ? new Date(license.expiresAt).toLocaleDateString()
                          : "Sin vencimiento"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide">Dispositivos</div>
                      <div className="mt-0.5 font-mono text-foreground">
                        {license.activeDevices} / {license.maxDevices}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <MobileActionsMenu
                      items={[
                        ...(canManage
                          ? [
                              {
                                label: "Gestionar / Renovar",
                                onSelect: () => {
                                  setSelected(license);
                                  setAction(null);
                                },
                              },
                            ]
                          : []),
                        {
                          label: "Ver historial y dispositivos",
                          onSelect: () => setDetails(license),
                        },
                      ]}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isMobile ? (
          <MobileLoadMore
            total={filteredLicenses.length}
            visible={visibleMobileRows.length}
            canLoadMore={filteredLicenses.length > visibleMobileRows.length}
            onLoadMore={() => setMobileVisible((value) => value + 10)}
          />
        ) : null}

        <div className="hidden min-w-0 overflow-hidden md:block md:overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario / Clave</TableHead>
                <TableHead>Plan / Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Dispositivos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLicenses.map((license) => {
                const diffDays = license.expiresAt
                  ? Math.ceil((new Date(license.expiresAt).getTime() - Date.now()) / 86_400_000)
                  : null;
                const isExpired = diffDays !== null && diffDays < 0;
                const isSoon7 = diffDays !== null && diffDays >= 0 && diffDays <= 7;
                const isSoon30 = diffDays !== null && diffDays > 7 && diffDays <= 30;

                return (
                  <TableRow key={license.id} className="group hover:bg-muted/40 transition-colors">
                    <TableCell>
                      <div className="font-medium text-foreground text-sm">{license.userEmail}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {maskKey(license.key)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{planLabel(license.plan, plans)}</div>
                      <div className="text-muted-foreground capitalize">{license.licenseType}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={license.status === "active" ? "default" : "secondary"}
                        className={`text-xs ${
                          license.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : ""
                        }`}
                      >
                        {labels[license.status] ?? license.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span
                        className={
                          isExpired
                            ? "text-red-400 font-semibold"
                            : isSoon7
                              ? "text-amber-400 font-semibold"
                              : isSoon30
                                ? "text-amber-300"
                                : "text-muted-foreground"
                        }
                      >
                        {license.expiresAt
                          ? new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(
                              new Date(license.expiresAt),
                            )
                          : "Sin vencimiento"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {license.activeDevices} / {license.maxDevices}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canManage && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs bg-card/60"
                            onClick={() => {
                              setSelected(license);
                              setAction(null);
                            }}
                          >
                            Gestionar
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Ver historial y dispositivos"
                          onClick={() => setDetails(license)}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </AdminDataTableShell>

      {canManage && (
        <>
          <CreateDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            projectId={projectId}
            types={typesQuery.data ?? []}
            plans={plansQuery.data ?? []}
            onDone={refresh}
          />
          <ManageLicenseDialog
            license={selected}
            action={action}
            plans={plansQuery.data ?? []}
            types={typesQuery.data ?? []}
            onClose={() => {
              setSelected(null);
              setAction(null);
            }}
            onAction={(next) => setAction(next)}
            onDetails={() => {
              setDetails(selected);
              setSelected(null);
              setAction(null);
            }}
            onDone={refresh}
          />
        </>
      )}
      <DetailsDialog
        license={details}
        canManage={canManage}
        onClose={() => setDetails(null)}
        onDone={refresh}
      />
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
            <Select value={status} onValueChange={(v) => setStatus(v as LicenseStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {changeableStatuses.map((code) => (
                  <SelectItem key={code} value={code}>
                    {labels[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tipo">
            <FilterSelect
              value={licenseType}
              onChange={setLicenseType}
              label="Tipo"
              options={types.map((t) => ({ value: t.code, label: t.name }))}
            />
          </Field>
          <Field label="Plan">
            <FilterSelect
              value={plan}
              onChange={setPlan}
              label="Plan"
              options={plans.map((p) => ({ value: p.code, label: p.name }))}
            />
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

function ManageLicenseDialog({
  license,
  action,
  plans,
  types,
  onClose,
  onAction,
  onDetails,
  onDone,
}: {
  license: ServiceLicense | null;
  action: "renew" | "status" | "extend" | "plan" | null;
  plans: LicensePlan[];
  types: LicenseType[];
  onClose: () => void;
  onAction: (action: "renew" | "status" | "extend" | "plan" | null) => void;
  onDetails: () => void;
  onDone: () => void;
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
    if (!license) return;
    const currentPlan = plans.find((item) => item.code === license.plan);
    setPlan(license.plan);
    setType(currentPlan?.licenseType ?? license.licenseType);
    setReason("");
    setDays("");
    setCustomPrice("");
    setReference("");
  }, [license, action, plans]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!license || !action) throw new Error("Selecciona una operación.");
      if (action === "renew") {
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
      return supabaseServices.licenses.update(license.id, action, {
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

  const sensitive = action === "status" && ["suspended", "revoked"].includes(status);
  const isRevoke = action === "status" && status === "revoked";

  return (
    <Dialog open={!!license} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {!action
              ? "Gestionar licencia"
              : action === "renew"
                ? "Registrar pago y renovar"
                : action === "extend"
                  ? "Ajustar vigencia"
                  : action === "plan"
                    ? "Cambiar plan"
                    : "Cambiar estado"}
          </DialogTitle>
          <DialogDescription>
            {license && !action ? (
              <span className="block mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground">
                <span className="font-medium">
                  {planLabel(license.plan, plans)} · {labels[license.status]}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {license.expiresAt
                    ? `Vence el ${formatExpiryDate(license.expiresAt)}`
                    : "Sin vencimiento"}{" "}
                  · {remainingLicenseTime(license.expiresAt)}
                </span>
              </span>
            ) : (
              "La licencia conservará su usuario, clave e historial."
            )}
          </DialogDescription>
        </DialogHeader>

        {!action ? (
          <div className="space-y-3">
            <Button className="h-11 w-full" onClick={() => onAction("renew")}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Registrar pago y renovar
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" onClick={() => onAction("plan")}>
                <KeyRound className="mr-2 h-4 w-4" />
                Cambiar plan
              </Button>
              <Button variant="outline" className="h-11" onClick={() => onAction("status")}>
                <ShieldAlert className="mr-2 h-4 w-4" />
                Cambiar estado
              </Button>
            </div>
            <Accordion type="single" collapsible>
              <AccordionItem value="more" className="border-none">
                <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:no-underline">
                  Más opciones
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pb-0 pt-1">
                  <Button
                    variant="ghost"
                    className="h-11 w-full justify-start"
                    onClick={() => onAction("extend")}
                  >
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Ajustar vigencia
                  </Button>
                  <Button variant="ghost" className="h-11 w-full justify-start" onClick={onDetails}>
                    <History className="mr-2 h-4 w-4" />
                    Ver historial
                  </Button>
                  <Button variant="ghost" className="h-11 w-full justify-start" onClick={onDetails}>
                    <Laptop className="mr-2 h-4 w-4" />
                    Gestionar dispositivos
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ) : (
          <div className="space-y-4">
            {action === "status" && (
              <>
                <Field label="Nuevo estado">
                  <Select value={status} onValueChange={(v) => setStatus(v as LicenseStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {changeableStatuses.map((code) => (
                        <SelectItem key={code} value={code}>
                          {labels[code]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {status === "revoked" && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Revocar es una medida administrativa grave. El cliente perderá el acceso
                    inmediatamente. El historial, pagos y recibos se conservarán.
                  </div>
                )}
              </>
            )}
            {action === "extend" && (
              <>
                <div className="rounded-md border border-amber-500/40 bg-amber-50/60 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  Este ajuste modifica manualmente la vigencia y no representa un pago.
                </div>
                {license?.expiresAt && (
                  <Field label="Vencimiento actual">
                    <Input readOnly value={formatExpiryDate(license.expiresAt)} />
                  </Field>
                )}
                <Field label="Días a agregar (negativo para reducir)">
                  <Input
                    type="number"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    placeholder="Ej. 30 o -7"
                  />
                </Field>
                {license?.expiresAt && days && (
                  <Field label="Nueva fecha de vencimiento (vista previa)">
                    <Input
                      readOnly
                      value={formatExpiryDate(
                        new Date(
                          new Date(license.expiresAt).getTime() + Number(days) * 86_400_000,
                        ).toISOString(),
                      )}
                    />
                  </Field>
                )}
              </>
            )}
            {(action === "renew" || action === "plan") && (
              <>
                <Field label="Plan">
                  <FilterSelect
                    value={plan || "all"}
                    onChange={(v) => {
                      const nextPlan = v === "all" ? "" : v;
                      setPlan(nextPlan);
                      setType(plans.find((item) => item.code === nextPlan)?.licenseType ?? "");
                    }}
                    label="Plan"
                    options={plans.map((p) => ({ value: p.code, label: p.name }))}
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
            {action === "renew" && (
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
                      {Object.entries(methodLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
                      {Object.entries(paymentStatusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {action ? (
            <Button variant="outline" onClick={() => onAction(null)}>
              Volver
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {action ? (
            <Button
              variant={sensitive ? "destructive" : "default"}
              disabled={
                mutation.isPending ||
                (sensitive && !reason) ||
                (action === "extend" && (!days || !reason)) ||
                (action === "plan" && !plan) ||
                (action === "renew" && (!plan || !reference || (!!customPrice && !reason)))
              }
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending
                ? "Procesando…"
                : isRevoke
                  ? "Revocar licencia"
                  : sensitive
                    ? "Confirmar operación"
                    : action === "extend"
                      ? "Aplicar ajuste"
                      : action === "renew"
                        ? "Registrar pago y renovar"
                        : "Guardar"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsDialog({
  license,
  canManage,
  onClose,
  onDone,
}: {
  license: ServiceLicense | null;
  canManage: boolean;
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
      void devices.refetch();
      void history.refetch();
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
        <div className="space-y-4">
          <section className="space-y-2 text-sm">
            <h3 className="font-medium text-foreground">Información</h3>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <DetailRow label="Clave" value={license?.key ?? ""} />
              <DetailRow label="Plan" value={planLabel(license?.plan ?? "", undefined)} />
              <DetailRow label="Estado" value={labels[license?.status ?? ""] ?? ""} />
              <DetailRow label="Activación" value={displayDate(license?.activatedAt ?? null)} />
              <DetailRow label="Vencimiento" value={formatExpiryDate(license?.expiresAt ?? null)} />
              <DetailRow label="Creación" value={displayDate(license?.createdAt ?? null)} />
              <DetailRow
                label="Última validación"
                value={displayDate(license?.lastValidation ?? null)}
              />
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">
                <Laptop className="mr-2 inline h-4 w-4" />
                Dispositivos ({devices.data?.length ?? 0} / {license?.maxDevices})
              </h3>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ kind: "reset" })}
                >
                  Reiniciar contador
                </Button>
              )}
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
                    ) : canManage ? (
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
                    ) : null}
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
              {!history.isLoading && !history.data?.length && (
                <p className="text-sm text-muted-foreground">Sin entradas en el historial.</p>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
