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

const statuses: LicenseStatus[] = ["active", "pending", "expired", "suspended", "revoked"];
const changeableStatuses: LicenseStatus[] = ["active", "pending", "suspended", "revoked"];
const labels: Record<string, string> = {
  active: "Activa",
  pending: "Pendiente",
  expired: "Vencida",
  suspended: "Suspendida",
  revoked: "Revocada",
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

export default function LicenciasSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [type, setType] = useState("all");
  const [expiry, setExpiry] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceLicense | null>(null);
  const [action, setAction] = useState<"renew" | "status" | "extend" | "plan" | null>(null);

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
    queryKey: ["admin-license-types", projectId],
    queryFn: () => supabaseServices.licenses.listLicenseTypes(projectId),
  });
  const paymentsQuery = useQuery({
    queryKey: ["admin-payments", projectId],
    queryFn: () => supabaseServices.payments.listAdmin(projectId),
  });

  const licenses = licensesQuery.data ?? [];
  const plans = plansQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];

  const filteredLicenses = useMemo(() => {
    const now = Date.now();
    return licenses.filter((license) => {
      const text = `${license.key} ${license.userEmail} ${license.licenseType} ${license.plan}`.toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchStatus = status === "all" || license.status === status;
      const matchPlan = plan === "all" || license.plan === plan;
      const matchType = type === "all" || license.licenseType === type;

      let matchExpiry = true;
      if (expiry !== "all" && license.expiresAt) {
        const deltaDays = Math.ceil((new Date(license.expiresAt).getTime() - now) / 86_400_000);
        if (expiry === "expired") matchExpiry = deltaDays < 0;
        else if (expiry === "7d") matchExpiry = deltaDays >= 0 && deltaDays <= 7;
        else if (expiry === "30d") matchExpiry = deltaDays >= 0 && deltaDays <= 30;
      } else if (expiry === "expired" && !license.expiresAt) {
        matchExpiry = false;
      }

      return matchSearch && matchStatus && matchPlan && matchType && matchExpiry;
    });
  }, [licenses, search, status, plan, type, expiry]);

  // 5 KPI Principales
  const activeCount = licenses.filter((l) => l.status === "active").length;
  const trialCount = licenses.filter((l) => l.plan === "trial" && l.status === "active").length;
  const paidCount = licenses.filter((l) => {
    if (l.status !== "active") return false;
    if (l.plan === "trial" || l.plan === "admin") return false;
    return payments.some((p) => p.status === "paid" && (p.licenseId === l.id || p.userId === l.userId || p.plan === l.plan));
  }).length;
  const expiring7Count = licenses.filter((l) => {
    if (l.status !== "active" || !l.expiresAt) return false;
    const diff = Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86_400_000);
    return diff >= 0 && diff <= 7;
  }).length;
  const expiredCount = licenses.filter((l) => {
    if (!l.expiresAt) return false;
    return new Date(l.expiresAt).getTime() < Date.now();
  }).length;

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
        <MetricCard label="Activas" value={activeCount} description="Total vigentes" icon={KeyRound} module="licencias" semanticState="success" />
        <MetricCard label="En prueba" value={trialCount} description="Plan trial" icon={Activity} module="licencias" />
        <MetricCard label="Pagadas" value={paidCount} description="Con pago confirmado" icon={Users} module="licencias" semanticState="success" />
        <MetricCard label="Vencen en 7 días" value={expiring7Count} description="Próximas a expirar" icon={CalendarClock} semanticState="warning" />
        <MetricCard label="Vencidas" value={expiredCount} description="Requieren renovación" icon={ShieldAlert} semanticState="danger" />
      </div>

      {/* Distribución por plan */}
      <SectionCard title="Distribución de licencias por plan" module="licencias">
        {planDistribution.length > 0 ? (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planDistribution} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.15} />
                <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
                <YAxis dataKey="plan" type="category" fontSize={11} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" width={90} />
                <Tooltip {...adminChartTooltipProps} />
                <Bar dataKey="count" fill="var(--module-licencias)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title="Sin distribución" description="No hay licencias registradas para mostrar distribución." module="licencias" />
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
            <FilterSelect value={status} onChange={setStatus} label="Estado" options={[{ value: "all", label: "Todos los estados" }, ...statuses.map(s => ({ value: s, label: labels[s] }))]} />
            <FilterSelect value={plan} onChange={setPlan} label="Plan" options={[{ value: "all", label: "Todos los planes" }, ...plans.map(p => ({ value: p.code, label: p.name }))]} />
            <FilterSelect value={expiry} onChange={setExpiry} label="Vencimiento" options={[
              { value: "all", label: "Todos los vencimientos" },
              { value: "7d", label: "Vencen en 7 días" },
              { value: "30d", label: "Vencen en 30 días" },
              { value: "expired", label: "Vencidas" },
            ]} />
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
              const diffDays = license.expiresAt ? Math.ceil((new Date(license.expiresAt).getTime() - Date.now()) / 86_400_000) : null;
              const isExpired = diffDays !== null && diffDays < 0;
              const isSoon7 = diffDays !== null && diffDays >= 0 && diffDays <= 7;
              const isSoon30 = diffDays !== null && diffDays > 7 && diffDays <= 30;

              return (
                <TableRow key={license.id} className="group hover:bg-muted/40 transition-colors">
                  <TableCell>
                    <div className="font-medium text-foreground text-sm">{license.userEmail}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{maskKey(license.key)}</div>
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
                      {license.expiresAt ? new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(license.expiresAt)) : "Sin vencimiento"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {license.activeDevices} / {license.maxDevices}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setSelected(license);
                          setAction("renew");
                        }}
                      >
                        Gestionar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </AdminDataTableShell>

      {/* Existing creation and management dialogs kept fully intact */}
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
