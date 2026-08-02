import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { useProjectMembers, useProjectPermissions } from "@/hooks/useProjects";
import { supabaseServices } from "@/lib/services";
import { toast } from "sonner";
import type { ProjectRole } from "@/lib/services";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileActionsMenu,
  MobileLoadMore,
  MobileSectionHeader,
} from "@/components/admin/MobileAdminSystem";

const ASSIGNABLE_ROLES: Array<{ value: Exclude<ProjectRole, "owner">; label: string }> = [
  { value: "admin", label: "Administrador" },
  { value: "support", label: "Soporte" },
  { value: "accounting", label: "Contabilidad" },
  { value: "marketing", label: "Marketing" },
];

export default function EmpleadosSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { data: rows = [], isLoading, error } = useProjectMembers(projectId);
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("members.manage");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<ProjectRole, "owner">>("support");
  const [mobileVisible, setMobileVisible] = useState(10);

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
  const visibleMobileRows = rows.slice(0, mobileVisible);

  return (
    <div className="space-y-4">
      <MobileSectionHeader
        title="Empleados"
        subtitle="Gestiona accesos del equipo por rol y permisos."
        badge={<Badge variant="outline">{rows.length}</Badge>}
        action={
          canManage ? (
            <Button size="sm" className="h-10" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Anadir empleado
            </Button>
          ) : null
        }
      />

      <Card className="glass-panel">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Empleados asignados
            <Badge variant="outline" className="ml-2">
              {rows.length}
            </Badge>
          </CardTitle>
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Asignar empleado
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[92dvh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Asignar empleado</DialogTitle>
                  <DialogDescription>
                    El correo debe pertenecer a un usuario registrado en Supabase.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="employee-email">Correo</Label>
                  <Input
                    id="employee-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="empleado@correo.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-role">Rol</Label>
                  <Select
                    value={role}
                    onValueChange={(value) => setRole(value as Exclude<ProjectRole, "owner">)}
                  >
                    <SelectTrigger id="employee-role">
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
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={addMember.isPending || !email.trim()}
                    onClick={() => addMember.mutate()}
                  >
                    {addMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Asignar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-destructive">
              No se pudieron cargar los empleados.
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Sin empleados asignados.
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {visibleMobileRows.map((employee) => (
                  <Card key={employee.id} className="border-border/70 bg-card/80">
                    <CardContent className="space-y-3 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="h-9 w-9 border border-border">
                            <AvatarImage
                              src={employee.avatarUrl ?? undefined}
                              alt={employee.name}
                              referrerPolicy="no-referrer"
                            />
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold uppercase text-primary">
                              {employee.name.slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{employee.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {employee.email}
                            </p>
                          </div>
                        </div>
                        <Badge variant={employee.role === "owner" ? "default" : "secondary"}>
                          {employee.role}
                        </Badge>
                      </div>
                      <div className="flex justify-end">
                        <MobileActionsMenu
                          items={[
                            {
                              label: "Retirar empleado",
                              destructive: true,
                              disabled:
                                !canManage || employee.role === "owner" || removeMember.isPending,
                              onSelect: () => removeMember.mutate(employee.id),
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
                  total={rows.length}
                  visible={visibleMobileRows.length}
                  canLoadMore={rows.length > visibleMobileRows.length}
                  onLoadMore={() => setMobileVisible((value) => value + 10)}
                />
              ) : null}

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell data-label="Empleado">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border border-border">
                              <AvatarImage
                                src={employee.avatarUrl ?? undefined}
                                alt={employee.name}
                                referrerPolicy="no-referrer"
                              />
                              <AvatarFallback className="bg-primary/10 text-xs font-semibold uppercase text-primary">
                                {employee.name.slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{employee.name}</span>
                          </div>
                        </TableCell>
                        <TableCell data-label="Correo" className="break-all text-muted-foreground">
                          {employee.email}
                        </TableCell>
                        <TableCell data-label="Rol">
                          <Badge variant={employee.role === "owner" ? "default" : "secondary"}>
                            {employee.role}
                          </Badge>
                        </TableCell>
                        <TableCell data-label="Acciones" className="text-right">
                          {canManage && employee.role !== "owner" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Retirar a ${employee.email}`}
                              disabled={removeMember.isPending}
                              onClick={() => removeMember.mutate(employee.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
