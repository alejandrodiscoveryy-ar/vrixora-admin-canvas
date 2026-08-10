import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CreditCard, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  supabaseServices,
  type Currency,
  type LicensePlan,
  type LicenseStatus,
  type ServicePayment,
} from "@/lib/services";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useProjectPermissions } from "@/hooks/useProjects";
import { useIsMobile } from "@/hooks/use-mobile";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { SectionCard } from "@/components/admin/SectionCard";

const emptyPlan: LicensePlan = {
  code: "",
  name: "",
  licenseType: "monthly",
  durationDays: 30,
  price: 0,
  currency: "CUP",
  maxDevices: 1,
  features: {},
  description: null,
  isActive: true,
  isFeatured: false,
};

export default function PlanesPreciosSection({ projectId }: { projectId: string }) {
  const isMobile = useIsMobile();
  const client = useQueryClient();
  const [editing, setEditing] = useState<LicensePlan | null>(null);
  const [deleting, setDeleting] = useState<LicensePlan | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManagePlans = permissions.includes("plans.manage");
  const canAssign =
    permissions.includes("licenses.manage") && permissions.includes("payments.manage");

  const plans = useQuery({
    queryKey: ["admin-license-plans", projectId],
    queryFn: () => supabaseServices.licenses.listAdminPlans(projectId),
  });
  const types = useQuery({
    queryKey: ["license-types"],
    queryFn: () => supabaseServices.licenses.listTypes(),
  });

  const refresh = () => client.invalidateQueries({ queryKey: ["admin-license-plans", projectId] });
  const deletePlan = useMutation({
    mutationFn: (plan: LicensePlan) =>
      supabaseServices.licenses.deleteInactivePlan(projectId, plan.code),
    onSuccess: ({ reassignedLicenses }) => {
      toast.success(
        reassignedLicenses > 0
          ? `Plan eliminado. ${reassignedLicenses} licencia(s) trial reasignada(s).`
          : "Plan eliminado.",
      );
      setDeleting(null);
      refresh();
      client.invalidateQueries({ queryKey: ["admin-licenses", projectId] });
      client.invalidateQueries({ queryKey: ["admin-clients", projectId] });
    },
    onError: (error) => toast.error(planDeleteError(error)),
  });

  const planList = plans.data ?? [];

  return (
    <div className="space-y-6 md:space-y-8">
      <ModuleHeader
        title="Planes y precios"
        description="Gestión comercial de planes, tarifas, duraciones y asignación de licencias."
        icon={CreditCard}
        module="planes"
        actions={
          <div className="flex gap-2.5">
            {canManagePlans && (
              <Button variant="outline" size="sm" onClick={() => setEditing({ ...emptyPlan })}>
                <Plus className="mr-2 h-4 w-4" />
                Crear plan
              </Button>
            )}
            {canAssign && (
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <BadgeCheck className="mr-2 h-4 w-4" />
                Asignar licencia
              </Button>
            )}
          </div>
        }
      />

      {planList.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Sin planes configurados"
          description="Crea planes comerciales para empezar a emitir licencias y cobros."
          module="planes"
          action={
            canManagePlans ? (
              <Button onClick={() => setEditing({ ...emptyPlan })}>
                <Plus className="mr-2 h-4 w-4" />
                Crear plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {planList.map((plan) => {
            const isFeatured = plan.isFeatured;

            return (
              <SectionCard
                key={plan.code}
                module="planes"
                className={isFeatured ? "border-amber-500/40 bg-card/95 shadow-md" : ""}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                        {isFeatured && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground mt-0.5">{plan.code}</p>
                    </div>
                    <Badge variant={plan.isActive ? "default" : "secondary"} className={plan.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : ""}>
                      {plan.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/60 p-3.5">
                    <div className="text-3xl font-extrabold font-mono tracking-tight text-foreground">
                      {plan.price.toLocaleString()}{" "}
                      <span className="text-sm font-normal text-muted-foreground">{plan.currency}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Duración: <strong className="text-foreground">{plan.durationDays ?? "Indefinida"} días</strong></span>
                      <span>•</span>
                      <span>Dispositivos: <strong className="text-foreground">{plan.maxDevices}</strong></span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {plan.description || "Sin descripción detallada para este plan."}
                  </p>

                  {plan.features && Object.keys(plan.features).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {Object.entries(plan.features)
                        .filter(([, enabled]) => enabled)
                        .map(([feature]) => (
                          <Badge key={feature} variant="outline" className="text-[10px] py-0 px-2">
                            {feature}
                          </Badge>
                        ))}
                    </div>
                  )}

                  {canManagePlans && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs bg-card/60"
                        onClick={() => setEditing({ ...plan })}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Editar
                      </Button>
                      {!plan.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleting(plan)}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Eliminar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      <PlanDialog
        key={editing ? editing.code || "new-plan" : "closed-plan-dialog"}
        projectId={projectId}
        plan={editing}
        types={types.data ?? []}
        onClose={() => setEditing(null)}
        onDone={refresh}
      />
      <AssignDialog
        projectId={projectId}
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        plans={(planList).filter((plan) => plan.isActive)}
        onDone={() => {
          refresh();
          client.invalidateQueries({ queryKey: ["admin-licenses", projectId] });
        }}
      />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar plan definitivamente</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el plan inactivo “{deleting?.name}”. Las licencias trial sin pagos se
              reasignarán al plan trial predeterminado. Los pagos, recibos y licencias pagadas nunca
              serán eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePlan.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePlan.isPending || !deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (deleting) deletePlan.mutate(deleting);
              }}
            >
              {deletePlan.isPending ? "Eliminando…" : "Eliminar plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function planDeleteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("PLAN_HAS_FINANCIAL_DEPENDENCIES")) {
    return "Este plan no puede eliminarse porque tiene pagos, recibos o licencias pagadas asociadas.";
  }
  if (message.includes("PLAN_MUST_BE_INACTIVE")) return "Primero debes desactivar el plan.";
  if (message.includes("DEFAULT_TRIAL_PLAN_REQUIRED")) {
    return "Configura otro plan trial activo como predeterminado antes de eliminar este plan.";
  }
  if (message.includes("PLAN_HAS_NON_TRIAL_LICENSES")) {
    return "Este plan tiene licencias que no son de prueba y no puede eliminarse.";
  }
  if (message.includes("PLAN_HAS_ACTIVE_LICENSES")) {
    return "No se puede eliminar un plan que tiene licencias activas.";
  }
  return message;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PlanDialog({
  projectId,
  plan,
  types,
  onClose,
  onDone,
}: {
  projectId: string;
  plan: LicensePlan | null;
  types: { code: string; name: string; neverExpires: boolean }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<LicensePlan | null>(
    plan ? { ...plan, features: { ...plan.features } } : null,
  );
  const value = draft;
  const set = <K extends keyof LicensePlan>(key: K, next: LicensePlan[K]) =>
    setDraft({ ...(value ?? emptyPlan), [key]: next });
  const mutation = useMutation({
    mutationFn: () => supabaseServices.licenses.savePlan(projectId, value!),
    onSuccess: () => {
      toast.success("Plan guardado.");
      onDone();
      setDraft(null);
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  const selectedType = types.find((type) => type.code === value?.licenseType);
  return (
    <Dialog open={!!plan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan?.code ? "Editar plan" : "Crear plan"}</DialogTitle>
          <DialogDescription>
            Los precios y prestaciones se usarán al asignar y renovar licencias.
          </DialogDescription>
        </DialogHeader>
        {value && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre comercial">
              <Input value={value.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Código">
              <Input
                value={value.code}
                onChange={(e) => set("code", normalizePlanCode(e.target.value))}
                placeholder="ejemplo_plan"
              />
            </Field>
            <Field label="Tipo de licencia">
              <Select
                value={value.licenseType}
                onValueChange={(v) => {
                  set("licenseType", v);
                  const item = types.find((t) => t.code === v);
                  if (item?.neverExpires) set("durationDays", null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Duración en días">
              <Input
                type="number"
                min="1"
                disabled={selectedType?.neverExpires}
                value={value.durationDays ?? ""}
                onChange={(e) =>
                  set("durationDays", e.target.value ? Number(e.target.value) : null)
                }
                placeholder={selectedType?.neverExpires ? "Sin vencimiento" : "30"}
              />
            </Field>
            <Field label="Precio">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={value.price}
                onChange={(e) => set("price", Number(e.target.value))}
              />
            </Field>
            <Field label="Moneda">
              <Select value={value.currency} onValueChange={(v) => set("currency", v as Currency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["CUP", "USD", "EUR"].map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Límite de dispositivos">
              <Input
                type="number"
                min="1"
                value={value.maxDevices}
                onChange={(e) => set("maxDevices", Number(e.target.value))}
              />
            </Field>
            <Field label="Funciones (JSON)">
              <Textarea
                value={JSON.stringify(value.features)}
                onChange={(e) => {
                  try {
                    set("features", JSON.parse(e.target.value));
                  } catch {
                    /* keep valid value */
                  }
                }}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Descripción">
                <Textarea
                  value={value.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
            </div>
            <label className="flex items-center justify-between rounded-md border p-3">
              <span>Plan activo</span>
              <Switch checked={value.isActive} onCheckedChange={(v) => set("isActive", v)} />
            </label>
            <label className="flex items-center justify-between rounded-md border p-3">
              <span>Plan recomendado</span>
              <Switch checked={value.isFeatured} onCheckedChange={(v) => set("isFeatured", v)} />
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              !value?.name.trim() ||
              !value?.code ||
              !/^[a-z][a-z0-9_]*$/.test(value.code)
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Guardando…" : "Guardar plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function normalizePlanCode(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^([^a-z])+/, "")
    .replace(/_+/g, "_");
}

function AssignDialog({
  projectId,
  open,
  onClose,
  plans,
  onDone,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  plans: LicensePlan[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<LicenseStatus>("active");
  const [method, setMethod] = useState<ServicePayment["method"]>("transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<ServicePayment["status"]>("paid");
  const plan = plans.find((item) => item.code === planCode);
  const mutation = useMutation({
    mutationFn: () =>
      supabaseServices.licenses.assignWithPayment({
        projectId,
        email,
        plan: planCode,
        startedAt: new Date(`${start}T00:00:00`).toISOString(),
        licenseStatus: status,
        method,
        reference,
        notes,
        overrideAmount: custom ? Number(amount) : undefined,
        adjustmentReason: custom ? reason : undefined,
        paymentStatus,
      }),
    onSuccess: () => {
      toast.success("Licencia y pago registrados.");
      onDone();
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Asignar licencia</DialogTitle>
          <DialogDescription>
            La vigencia y el precio se obtienen del plan seleccionado.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usuario o correo">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Plan">
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.name} · {item.price} {item.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Precio del plan">
            <Input readOnly value={plan ? `${plan.price} ${plan.currency}` : ""} />
          </Field>
          <Field label="Fecha de inicio">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Estado">
            <Select value={status} onValueChange={(v) => setStatus(v as LicenseStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["active", "pending"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Método de pago">
            <Select value={method} onValueChange={(v) => setMethod(v as ServicePayment["method"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["card", "transfer", "cash", "paypal"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Referencia">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Estado del pago">
            <Select
              value={paymentStatus}
              onValueChange={(v) => setPaymentStatus(v as ServicePayment["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["pending", "paid", "cancelled", "refunded", "complimentary"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
            <span>Aplicar descuento, promoción, cortesía o precio personalizado</span>
            <Switch checked={custom} onCheckedChange={setCustom} />
          </label>
          {custom && (
            <>
              <Field label="Importe final">
                <Input
                  type="number"
                  min="0"
                  max={plan?.price}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Motivo obligatorio">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </>
          )}
          <div className="sm:col-span-2">
            <Field label="Notas">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              !email ||
              !planCode ||
              !reference ||
              (custom && (!amount || !reason))
            }
            onClick={() => mutation.mutate()}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {mutation.isPending ? "Asignando…" : "Asignar y registrar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
