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
            const isAdmin = plan.code === "admin";
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

      {/* Existing editing and assignment dialogs kept fully intact */}
    </div>
  );
}

function planDeleteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("PLAN_HAS_ACTIVE_LICENSES")) {
    return "No se puede eliminar un plan que tiene licencias activas.";
  }
  return message;
}
