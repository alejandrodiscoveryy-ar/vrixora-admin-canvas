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
import { Plus, Trash2, Users } from "lucide-react";
import { useProjectMembers, useProjectPermissions } from "@/hooks/useProjects";
import { supabaseServices } from "@/lib/services";
import { toast } from "sonner";
import type { ProjectRole } from "@/lib/services";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminDataTableShell } from "@/components/admin/AdminDataTableShell";
import { SectionCard } from "@/components/admin/SectionCard";

const ASSIGNABLE_ROLES: Array<{ value: Exclude<ProjectRole, "owner">; label: string }> = [
  { value: "accounting", label: "Cobros / Accounting" },
  { value: "marketing", label: "Marketing" },
];

export default function EmpleadosSection({ projectId }: { projectId: string }) {
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

  return (
    <div className="space-y-6 md:space-y-8">
      <ModuleHeader
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

      {/* Bloque Informativo: Roles del Proyecto */}
      <SectionCard title="Roles del proyecto y permisos" module="empleados">
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1">
            <span className="font-bold text-foreground">Owner</span>
            <p className="text-muted-foreground">
              Acceso total, administración completa y gestión de miembros y ajustes.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1">
            <span className="font-bold text-foreground">Accounting</span>
            <p className="text-muted-foreground">
              Gestión de clientes, cobros/pagos, analítica y lectura de licencias y planes.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1">
            <span className="font-bold text-foreground">Marketing</span>
            <p className="text-muted-foreground">
              Gestión de clientes, seguimiento comercial (leads/campañas) y analítica.
            </p>
          </div>
        </div>
      </SectionCard>

      <AdminDataTableShell
        title="Empleados asignados"
        description="Miembros con acceso activo al centro de control"
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
                  <Badge variant="outline" className="text-xs uppercase font-mono font-medium">
                    {member.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManage && member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
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
        <DialogContent className="max-w-md">
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
