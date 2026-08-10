import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollText, Loader2, ShieldCheck, History, ChevronDown, ChevronUp } from "lucide-react";
import { supabaseServices } from "@/lib/services";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminDataTableShell } from "@/components/admin/AdminDataTableShell";
import { FilterToolbar } from "@/components/admin/FilterToolbar";

const ENTITY_LABELS: Record<string, string> = {
  projects: "Proyecto",
  license_plans: "Plan",
  licenses: "Licencia",
  payments: "Pago",
  billing_receipts: "Recibo",
  project_members: "Empleado / Miembro",
  commercial_leads: "Lead",
  commercial_campaigns: "Campaña",
  project_whatsapp_settings: "WhatsApp",
};

const ACTION_LABELS: Record<string, string> = {
  insert: "Creación",
  update: "Actualización",
  delete: "Eliminación",
};

export default function AuditoriaSection({ projectId }: { projectId: string }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: events = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["audit-events", projectId],
    queryFn: () => supabaseServices.audit.list(projectId),
  });

  const filteredEvents = events.filter((event) => {
    const text = `${event.entityType} ${event.actorEmail ?? ""} ${event.action} ${event.entityId ?? ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudo cargar la auditoría del proyecto.
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <ModuleHeader
        title="Auditoría"
        description="Registro histórico de acciones, cambios de configuración, operaciones y seguridad del proyecto."
        icon={ScrollText}
        module="auditoria"
      />

      <AdminDataTableShell
        title="Historial de eventos"
        description="Trazabilidad completa de operaciones"
        actions={
          <FilterToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por entidad, usuario o acción..."
            showReset={true}
            onReset={() => setSearch("")}
          />
        }
        isEmpty={filteredEvents.length === 0}
        emptyState={
          <EmptyState
            icon={ScrollText}
            title="Sin eventos registrados"
            description="No hay registros de auditoría que coincidan con los criterios de búsqueda."
            module="auditoria"
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha / Hora</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Entidad</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead className="text-right">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEvents.map((event) => {
              const isExpanded = expandedId === event.id;
              const entityName = ENTITY_LABELS[event.entityType] ?? event.entityType;
              const actionName = ACTION_LABELS[event.action] ?? event.action;

              return (
                <>
                  <TableRow key={event.id} className="group hover:bg-muted/40 transition-colors">
                    <TableCell className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          event.action === "insert"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : event.action === "update"
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                              : "bg-red-500/15 text-red-400 border-red-500/30"
                        }`}
                      >
                        {actionName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground text-sm">{entityName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">
                        ID: {event.entityId ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.actorEmail ?? "Sistema"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setExpandedId(isExpanded ? null : event.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                        {isExpanded ? "Ocultar" : "Expandir"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5} className="p-4">
                        <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2 text-xs">
                          <p className="font-semibold text-foreground">Metadatos y detalles técnicos</p>
                          <div className="grid grid-cols-2 gap-2 text-muted-foreground font-mono">
                            <div>UUID de evento: <span className="text-foreground">{event.id}</span></div>
                            <div>Dirección IP: <span className="text-foreground">{event.ipAddress ?? "No registrada"}</span></div>
                            <div className="col-span-2">Entidad técnica: <span className="text-foreground">{event.entityType}</span></div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </AdminDataTableShell>
    </div>
  );
}
