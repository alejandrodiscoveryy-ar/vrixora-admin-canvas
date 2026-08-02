import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLoadMore, MobileSectionHeader } from "@/components/admin/MobileAdminSystem";

const ACTION_LABELS: Record<string, string> = {
  insert: "Creación",
  update: "Actualización",
  delete: "Eliminación",
};

export default function AuditoriaSection({ projectId }: { projectId: string }) {
  const isMobile = useIsMobile();
  const [mobileVisible, setMobileVisible] = useState(10);
  const {
    data: events = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["audit-events", projectId],
    queryFn: () => supabaseServices.audit.list(projectId),
  });
  const visibleMobileRows = events.slice(0, mobileVisible);

  return (
    <div className="space-y-4">
      <MobileSectionHeader
        title="Auditoria"
        subtitle="Registro de acciones sobre datos y configuraciones del proyecto."
        badge={<Badge variant="outline">{events.length}</Badge>}
      />

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
            <>
              <div className="space-y-3 md:hidden">
                {visibleMobileRows.map((event) => (
                  <Card key={event.id} className="border-border/70 bg-card/80">
                    <CardContent className="space-y-2 p-3.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">
                          {ACTION_LABELS[event.action] ?? event.action}
                        </Badge>
                        <span className="text-muted-foreground">
                          {new Date(event.createdAt).toLocaleDateString("es")}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-foreground">{event.entityType}</div>
                      <div className="break-all text-muted-foreground">
                        {event.actorEmail ?? "Sistema"}
                      </div>
                      <details className="rounded-md border border-border/70 p-2">
                        <summary className="cursor-pointer text-foreground">Ver detalles</summary>
                        <div className="mt-2 space-y-1 text-muted-foreground">
                          <p>ID: {event.entityId ?? "—"}</p>
                          <p>IP: {event.ipAddress ?? "—"}</p>
                          <p>UUID: {event.id}</p>
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {isMobile ? (
                <MobileLoadMore
                  total={events.length}
                  visible={visibleMobileRows.length}
                  canLoadMore={events.length > visibleMobileRows.length}
                  onLoadMore={() => setMobileVisible((value) => value + 10)}
                />
              ) : null}

              <div className="hidden md:block">
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
                        <TableCell data-label="Fecha">
                          {new Date(event.createdAt).toLocaleString("es")}
                        </TableCell>
                        <TableCell data-label="Acción">
                          <Badge variant="secondary">
                            {ACTION_LABELS[event.action] ?? event.action}
                          </Badge>
                        </TableCell>
                        <TableCell data-label="Entidad">
                          <div className="font-medium">{event.entityType}</div>
                          <div className="max-w-52 truncate font-mono text-xs text-muted-foreground">
                            {event.entityId ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell data-label="Responsable">
                          {event.actorEmail ?? "Sistema"}
                        </TableCell>
                        <TableCell data-label="IP" className="font-mono text-xs">
                          {event.ipAddress ?? "—"}
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
