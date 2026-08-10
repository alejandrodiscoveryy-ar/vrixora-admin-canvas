import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollText, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { supabaseServices, type AuditEvent } from "@/lib/services";
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

function humanizeAction(action: string, entityType: string) {
  const entityName = ENTITY_LABELS[entityType] ?? entityType;
  if (action === "license_renewed") return "Licencia renovada";
  if (action === "license_created") return "Licencia creada";
  if (action === "payment_recorded" || action === "payment_created") return "Pago registrado";
  if (action === "insert") return `Creación de ${entityName.toLowerCase()}`;
  if (action === "update") return `Actualización de ${entityName.toLowerCase()}`;
  if (action === "delete") return `Eliminación de ${entityName.toLowerCase()}`;
  return `${action.replaceAll("_", " ")} (${entityName})`;
}

type GroupedAuditEvent = {
  id: string | number;
  actorEmail: string | null;
  actorName: string;
  entityType: string;
  entityName: string;
  action: string;
  actionName: string;
  entityId: string | null;
  createdAt: string;
  count: number;
  originalEvents: AuditEvent[];
};

function groupAuditEvents(events: AuditEvent[]): GroupedAuditEvent[] {
  const groups: GroupedAuditEvent[] = [];

  for (const event of events) {
    const lastGroup = groups[groups.length - 1];
    const eventTime = new Date(event.createdAt).getTime();

    const canGroup =
      lastGroup &&
      lastGroup.actorEmail === (event.actorEmail ?? null) &&
      lastGroup.entityType === event.entityType &&
      lastGroup.entityId === (event.entityId ?? null) &&
      lastGroup.action === event.action &&
      Math.abs(new Date(lastGroup.createdAt).getTime() - eventTime) <= 120_000;

    if (canGroup) {
      lastGroup.count += 1;
      lastGroup.originalEvents.push(event);
      if (eventTime > new Date(lastGroup.createdAt).getTime()) {
        lastGroup.createdAt = event.createdAt;
      }
    } else {
      const actorEmail = event.actorEmail ?? "Sistema";
      const actorName =
        actorEmail !== "Sistema"
          ? actorEmail.split("@")[0].replace(/[._-]/g, " ")
          : "Sistema";
      const capitalizedActorName = actorName.charAt(0).toUpperCase() + actorName.slice(1);
      const entityName = ENTITY_LABELS[event.entityType] ?? event.entityType;

      groups.push({
        id: event.id,
        actorEmail: event.actorEmail ?? null,
        actorName: capitalizedActorName,
        entityType: event.entityType,
        entityName,
        action: event.action,
        actionName: humanizeAction(event.action, event.entityType),
        entityId: event.entityId ?? null,
        createdAt: event.createdAt,
        count: 1,
        originalEvents: [event],
      });
    }
  }
  return groups;
}

export default function AuditoriaSection({ projectId }: { projectId: string }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const {
    data: rawEvents = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["audit-events", projectId],
    queryFn: () => supabaseServices.audit.list(projectId),
  });

  const filteredEvents = rawEvents.filter((event) => {
    const text = `${event.entityType} ${event.actorEmail ?? ""} ${event.action} ${event.entityId ?? ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const groupedEvents = groupAuditEvents(filteredEvents);

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
        isEmpty={groupedEvents.length === 0}
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
              <TableHead className="text-right">Detalles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedEvents.map((group) => {
              const isExpanded = expandedId === group.id;
              const displayTitle =
                group.count > 1
                  ? `${group.actionName} · ${group.count} cambios`
                  : group.actionName;

              return (
                <>
                  <TableRow key={group.id} className="group hover:bg-muted/40 transition-colors">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Intl.DateTimeFormat("es", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(group.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          group.action === "insert" || group.action === "license_created"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : group.action === "update" || group.action === "license_renewed"
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                              : "bg-red-500/15 text-red-400 border-red-500/30"
                        }`}
                      >
                        {displayTitle}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground text-sm">{group.entityName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">
                        ID: {group.entityId ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium text-foreground">{group.actorName}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                        {group.actorEmail ?? "Sistema"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setExpandedId(isExpanded ? null : group.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 mr-1" />
                        ) : (
                          <ChevronDown className="h-4 w-4 mr-1" />
                        )}
                        {isExpanded ? "Ocultar" : "Ver detalles"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5} className="p-4">
                        <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 text-xs">
                          <p className="font-semibold text-foreground">
                            Historial detallado ({group.originalEvents.length} eventos agrupados):
                          </p>
                          <div className="space-y-2">
                            {group.originalEvents.map((orig, idx) => (
                              <div
                                key={orig.id || idx}
                                className="rounded-lg border bg-muted/30 p-2.5 space-y-1.5 font-mono text-[11px]"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                                  <span>
                                    Fecha/Hora:{" "}
                                    <strong className="text-foreground">
                                      {new Date(orig.createdAt).toLocaleString()}
                                    </strong>
                                  </span>
                                  <span>
                                    ID Evento:{" "}
                                    <strong className="text-foreground">{orig.id}</strong>
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-muted-foreground">
                                  <div>
                                    Acción: <span className="text-foreground">{orig.action}</span>
                                  </div>
                                  <div>
                                    Entidad:{" "}
                                    <span className="text-foreground">
                                      {orig.entityType} ({orig.entityId ?? "S/ID"})
                                    </span>
                                  </div>
                                  <div>
                                    Responsable:{" "}
                                    <span className="text-foreground">
                                      {orig.actorEmail ?? "Sistema"}
                                    </span>
                                  </div>
                                  <div>
                                    IP:{" "}
                                    <span className="text-foreground">
                                      {orig.ipAddress ?? "No registrada"}
                                    </span>
                                  </div>
                                </div>
                                {orig.metadata != null && (
                                  <div className="mt-1 pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
                                    Metadata:{" "}
                                    <pre className="mt-0.5 whitespace-pre-wrap text-foreground/90">
                                      {JSON.stringify(orig.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
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
