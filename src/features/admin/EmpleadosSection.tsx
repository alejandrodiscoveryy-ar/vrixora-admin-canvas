import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Users, ShieldCheck, Wallet, Megaphone } from "lucide-react";
import { useProjectMembers, useProjectPermissions } from "@/hooks/useProjects";
import { supabaseServices } from "@/lib/services";
import { toast } from "sonner";
import type { ProjectRole } from "@/lib/services";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminDataTableShell } from "@/components/admin/AdminDataTableShell";
import { SectionCard } from "@/components/admin/SectionCard";

const ASSIGNABLE_ROLES: Array<{ value: Exclude<ProjectRole, "owner">; label: string }> = [
  { value: "admin", label: "Administrador" },
  { value: "support", label: "Soporte" },
  { value: "accounting", label: "Contabilidad" },
  { value: "marketing", label: "Marketing" },
];

export default function EmpleadosSection({ projectId, premium = false }: { projectId: string; premium?: boolean }) {
  const queryClient = useQueryClient();
  const { data: rows = [] } = useProjectMembers(projectId);
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("members.manage");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<ProjectRole, "owner">>("accounting");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
  const addMember = useMutation({
    mutationFn: () => supabaseServices.projectMembers.add(projectId, email, role),
    onSuccess: async () => {
      await refresh();
      setEmail("");
      setOpen(false);
      toast.success("Empleado asignado");
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => supabaseServices.projectMembers.remove(projectId, userId),
    onSuccess: async () => {
      await refresh();
      toast.success("Empleado retirado");
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });
  const changeRole = useMutation({
    mutationFn: ({ email, role }: { email: string; role: Exclude<ProjectRole, "owner"> }) =>
      supabaseServices.projectMembers.add(projectId, email, role),
    onSuccess: async () => {
      await refresh();
      toast.success("Rol actualizado");
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  return (
    <div className="min-w-0 space-y-3">
      {premium ? (
        <div className="flex flex-wrap justify-end">
          {canManage ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Añadir empleado
            </Button>
          ) : null}
        </div>
      ) : (
      <ModuleHeader density="compact" appearance="premium"
        title="Empleados"
        description="Gestión de miembros del equipo, roles y permisos operativos en el proyecto."
        icon={Users}
        module="empleados"
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Añadir empleado
            </Button>
          ) : undefined
        }
      />
      )}

      {/* Bloque Informativo: Roles del Proyecto */}
      <SectionCard density="compact" appearance="premium" title="Roles del proyecto y permisos" module="empleados">
        
        <div className="grid min-w-0 gap-3 text-xs sm:grid-cols-3">
          {([
            { label: "Owner", description: "Acceso total, administración completa y gestión de miembros y ajustes.", icon: ShieldCheck, color: "var(--module-empleados)" },
            { label: "Accounting", description: "Gestión de clientes, cobros/pagos, analítica y lectura de licencias y planes.", icon: Wallet, color: "var(--module-pagos)" },
            { label: "Marketing", description: "Gestión de clientes, seguimiento comercial (leads/campañas) y analítica.", icon: Megaphone, color: "var(--module-comercial)" },
          ] as const).map(role => {
            const RoleIcon = role.icon;
            return (
              <div key={role.label} className="relative min-w-0 overflow-hidden rounded-[var(--radius-compact)] border border-border-default bg-surface-2/75 p-3">
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ backgroundColor: role.color }} />
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border-default bg-surface-3/80" style={{ color: role.color }}>
                    <RoleIcon className="size-4" />
                  </span>
                  <span className="text-sm font-semibold text-text-primary">{role.label}</span>
                </div>
                <p className="text-xs leading-relaxed text-text-secondary">{role.description}</p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <AdminDataTableShell density="compact" appearance="premium"
        title="Empleados asignados"
        description={premium ? undefined : "Miembros con acceso activo al centro de control"}
       
        isEmpty={rows.length === 0}
        emptyState={
          <EmptyState
            icon={Users}
            title="Sin empleados adicionales"
            description="Actualmente no hay miembros adicionales asignados a este proyecto."
            module="empleados"
          />
        }
      >
        
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Miembro</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((member) => (
              <TableRow key={member.id} className="group hover:bg-muted/40 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-border/70">
                      <AvatarImage src={member.avatarUrl ?? undefined} />
                      <AvatarFallback className="bg-indigo-500/10 text-indigo-400 text-xs font-semibold">
                        {member.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">
                        {member.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {canManage && member.role !== "owner" ? (
                    <Select
                      value={member.role}
                      disabled={changeRole.isPending}
                      onValueChange={(value) =>
                        changeRole.mutate({
                          email: member.email,
                          role: value as Exclude<ProjectRole, "owner">,
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-full min-w-44"
                        aria-label={`Rol de ${member.email}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="text-xs uppercase font-mono font-medium">
                      {member.role}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canManage && member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-10 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeMember.mutate(member.id)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Retirar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminDataTableShell>

      {/* Dialog for adding employee kept intact */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md admin-graphite-dialog">
          <DialogHeader>
            <DialogTitle>Asignar empleado</DialogTitle>
            <DialogDescription>
              El correo debe pertenecer a un usuario registrado en Supabase.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Correo electrónico</Label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="empleado@correo.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as Exclude<ProjectRole, "owner">)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => addMember.mutate()}
              disabled={addMember.isPending || !email.trim()}
            >
              Asignar empleado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
