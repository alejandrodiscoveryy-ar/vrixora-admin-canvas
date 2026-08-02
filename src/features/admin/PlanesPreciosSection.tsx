import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CreditCard, Pencil, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import {
  supabaseServices,
  type Currency,
  type LicensePlan,
  type LicenseStatus,
  type ServicePayment,
} from "@/lib/services";
import { Badge } from "@/components/ui/badge";
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
import { MobileLoadMore, MobileSectionHeader } from "@/components/admin/MobileAdminSystem";

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
  const [assignOpen, setAssignOpen] = useState(false);
  const [mobileVisible, setMobileVisible] = useState(10);
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
  const visiblePlans = (plans.data ?? []).slice(0, mobileVisible);

  return (
    <div className="space-y-6">
      <MobileSectionHeader
        title="Planes y precios"
        subtitle="Gestion comercial de planes, precios y asignaciones."
        badge={<Badge variant="outline">{plans.data?.length ?? 0}</Badge>}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {canManagePlans && (
              <Button
                variant="outline"
                className="h-10"
                onClick={() => setEditing({ ...emptyPlan })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Crear plan
              </Button>
            )}
            {canAssign && (
              <Button className="h-10" onClick={() => setAssignOpen(true)}>
                <BadgeCheck className="mr-2 h-4 w-4" />
                Asignar licencia
              </Button>
            )}
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visiblePlans.map((plan) => (
          <Card key={plan.code} className={plan.isFeatured ? "border-primary" : ""}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {plan.name}
                  {plan.isFeatured && <Star className="h-4 w-4 fill-primary text-primary" />}
                </CardTitle>
                <p className="font-mono text-xs text-muted-foreground">{plan.code}</p>
              </div>
              <Badge variant={plan.isActive ? "default" : "secondary"}>
                {plan.isActive ? "Activo" : "Inactivo"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-2xl font-semibold">
                {plan.price.toLocaleString()}{" "}
                <span className="text-sm font-normal">{plan.currency}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {plan.description || "Sin descripción"}
              </p>
              <div className="text-sm">
                {plan.durationDays ? `${plan.durationDays} días` : "Sin vencimiento"} ·{" "}
                {plan.maxDevices} dispositivo(s)
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(plan.features)
                  .filter(([, enabled]) => enabled)
                  .map(([feature]) => (
                    <Badge key={feature} variant="outline">
                      {feature}
                    </Badge>
                  ))}
              </div>
              {canManagePlans && (
                <Button className="w-full" variant="outline" onClick={() => setEditing(plan)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {isMobile ? (
        <MobileLoadMore
          total={plans.data?.length ?? 0}
          visible={visiblePlans.length}
          canLoadMore={(plans.data?.length ?? 0) > visiblePlans.length}
          onLoadMore={() => setMobileVisible((value) => value + 10)}
        />
      ) : null}

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
        plans={(plans.data ?? []).filter((plan) => plan.isActive)}
        onDone={() => {
          refresh();
          client.invalidateQueries({ queryKey: ["admin-licenses", projectId] });
        }}
      />
    </div>
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
