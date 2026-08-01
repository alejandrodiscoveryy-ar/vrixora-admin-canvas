import { useQuery } from "@tanstack/react-query";
import { ScrollText, Loader2 } from "lucide-react";
import { supabaseServices } from "@/lib/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ACTION_LABELS: Record<string, string> = {
  insert: "Creación",
  update: "Actualización",
  delete: "Eliminación",
};

export default function AuditoriaSection({ projectId }: { projectId: string }) {
  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["audit-events", projectId],
    queryFn: () => supabaseServices.audit.list(projectId),
  });

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="h-4 w-4 text-primary" />
          Auditoría del proyecto
          <Badge variant="outline">{events.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-sm text-destructive">
            No se pudo cargar la auditoría.
          </p>
        ) : events.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Todavía no hay acciones registradas.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{new Date(event.createdAt).toLocaleString("es")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ACTION_LABELS[event.action] ?? event.action}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{event.entityType}</div>
                    <div className="max-w-52 truncate font-mono text-xs text-muted-foreground">
                      {event.entityId ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>{event.actorEmail ?? "Sistema"}</TableCell>
                  <TableCell className="font-mono text-xs">{event.ipAddress ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
