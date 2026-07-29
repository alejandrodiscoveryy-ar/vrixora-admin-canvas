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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { useProjectMembers } from "@/hooks/useProjects";
import { supabaseServices } from "@/lib/services";
import { toast } from "sonner";

export default function EmpleadosSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, error } = useProjectMembers(projectId);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
  const addMember = useMutation({
    mutationFn: () => supabaseServices.projectMembers.add(projectId, email, "employee"),
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
    <Card className="glass-panel">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Empleados asignados
          <Badge variant="outline" className="ml-2">
            {rows.length}
          </Badge>
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Asignar empleado
            </Button>
          </DialogTrigger>
          <DialogContent>
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
                  <TableCell>
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
                  <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                  <TableCell>
                    <Badge variant={employee.role === "owner" ? "default" : "secondary"}>
                      {employee.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {employee.role !== "owner" && (
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
        )}
      </CardContent>
    </Card>
  );
}
