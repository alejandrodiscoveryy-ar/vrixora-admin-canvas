import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  CircleAlert,
  Filter,
  Loader2,
  Search,
  ScrollText,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";

import { supabaseServices } from "@/lib/services";
import type { AuditArea, AuditImportance, BusinessAuditEvent } from "@/lib/services/types";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { SectionCard } from "@/components/admin/SectionCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageAlert } from "@/components/admin/PageAlert";
import { AdminPeriodSelector } from "@/components/admin/AdminPeriodSelector";
import {
  periodRange,
  type AdminDateRange,
  type AdminPeriodKey,
  type AdminPeriodOption,
} from "@/components/admin/admin-period";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AUDIT_PERIOD_OPTIONS: AdminPeriodOption[] = [
  { value: "today", label: "Hoy" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "month", label: "Este mes" },
  { value: "custom", label: "Personalizado" },
];

const AREA_LABELS: Record<AuditArea, string> = {
  clientes: "Clientes",
  comercial: "Comercial",
  cobros: "Cobros",
  licencias: "Licencias",
  administracion: "Administración",
  otros: "Otros",
};

const IMPORTANCE_LABELS: Record<AuditImportance, string> = {
  normal: "Normal",
  important: "Importante",
  critical: "Crítico",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  support: "Soporte",
  accounting: "Contabilidad",
  marketing: "Marketing",
  external: "Cliente / usuario externo",
  system: "Sistema",
};

const FIELD_LABELS: Record<string, string> = {
  status: "Estado",
  plan: "Plan",
  license_type: "Tipo de licencia",
  duration_days: "Duración",
  max_devices: "Dispositivos permitidos",
  amount: "Importe",
  list_price: "Precio",
  discount: "Descuento",
  currency: "Moneda",
  method: "Método de pago",
  reference: "Referencia",
  notes: "Notas",
  expires_at: "Vencimiento",
  activated_at: "Activación",
  charged_at: "Fecha de cobro",
  active: "Activo",
  is_featured: "Destacado",
  name: "Nombre",
  description: "Descripción",
  role: "Rol",
  phone: "Teléfono",
  whatsapp: "WhatsApp",
  support_email: "Correo de soporte",
  current_rate: "Tipo de cambio",
  rate_mode: "Modo de tasa",
  rate_source: "Fuente de tasa",
  test_mode_enabled: "Modo de pruebas",
  referral_reward_days: "Días de recompensa",
  source: "Origen",
  medium: "Medio",
  campaign: "Campaña",
};

const HIDDEN_CHANGE_FIELDS = new Set([
  "id",
  "project_id",
  "user_id",
  "license_id",
  "payment_id",
  "preinvoice_id",
  "paid_payment_id",
  "recorded_by",
  "created_by",
  "created_at",
  "updated_at",
  "last_validation",
  "license_key",
  "billing_snapshot",
  "features",
]);

type AuditView = "summary" | "users" | "areas";
type SeverityFilter = "all" | AuditImportance;
type AreaFilter = "all" | AuditArea;

type AuditGroup = {
  key: string;
  label: string;
  subtitle?: string;
  events: BusinessAuditEvent[];
};

type ChangedField = {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
};

export default function AuditoriaSection({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<AdminPeriodKey>("today");
  const [range, setRange] = useState<AdminDateRange>(() => periodRange("today"));
  const [view, setView] = useState<AuditView>("summary");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  const auditWindow = useMemo(() => toAuditWindow(range), [range]);

  const {
    data: events = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["business-audit-events", projectId, auditWindow.from, auditWindow.to],
    queryFn: () => supabaseServices.audit.listBusiness(projectId, auditWindow.from, auditWindow.to),
  });

  const normalizedSearch = search.trim().toLocaleLowerCase("es");

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const matchesSeverity = severityFilter === "all" || event.importance === severityFilter;
        const matchesArea = areaFilter === "all" || event.area === areaFilter;

        if (!matchesSeverity || !matchesArea) return false;
        if (!normalizedSearch) return true;

        const searchable = [
          event.actorName,
          event.actorEmail ?? "",
          event.actionLabel,
          event.entityLabel,
          event.reason ?? "",
          AREA_LABELS[event.area],
        ]
          .join(" ")
          .toLocaleLowerCase("es");

        return searchable.includes(normalizedSearch);
      }),
    [areaFilter, events, normalizedSearch, severityFilter],
  );

  const activeUsers = useMemo(() => {
    const users = new Set<string>();

    for (const event of events) {
      if (event.actorRole === "system") continue;

      users.add(event.actorId ?? event.actorEmail ?? event.actorName);
    }

    return users.size;
  }, [events]);

  const importantCount = events.filter((event) => event.importance === "important").length;
  const criticalCount = events.filter((event) => event.importance === "critical").length;

  const attentionEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.importance === "critical" || event.metadata.license_requires_review === true,
      ),
    [events],
  );

  const userGroups = useMemo(() => groupByUser(filteredEvents), [filteredEvents]);
  const areaGroups = useMemo(() => groupByArea(filteredEvents), [filteredEvents]);

  const reportedTotal = events[0]?.totalCount ?? events.length;
  const truncated = reportedTotal > events.length;

  const hasFilters = Boolean(search.trim()) || severityFilter !== "all" || areaFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setSeverityFilter("all");
    setAreaFilter("all");
  };

  const handlePeriodChange = (nextPeriod: AdminPeriodKey, nextRange: AdminDateRange) => {
    setPeriod(nextPeriod);
    setRange(nextRange);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <ModuleHeader
        title="Auditoría"
        description="Control y trazabilidad de las operaciones importantes del proyecto."
        icon={ScrollText}
        module="auditoria"
        actions={
          <AdminPeriodSelector
            value={period}
            range={range}
            onChange={handlePeriodChange}
            options={AUDIT_PERIOD_OPTIONS}
          />
        }
      />

      {error ? (
        <PageAlert tone="error" title="No se pudo cargar la Auditoría">
          Intenta actualizar la página. Si el problema continúa, revisa la conexión con el servicio.
        </PageAlert>
      ) : null}

      {truncated ? (
        <PageAlert tone="warning" title="El período contiene más operaciones de las mostradas">
          Se encontraron {reportedTotal} operaciones. Reduce el período para revisar el historial
          completo.
        </PageAlert>
      ) : null}

      <KpiGrid columns={4} density="compact">
        <MetricCard
          label="Operaciones"
          value={events.length}
          icon={ScrollText}
          module="auditoria"
          description="En el período"
          isLoading={isLoading}
        />
        <MetricCard
          label="Usuarios"
          value={activeUsers}
          icon={Users}
          module="auditoria"
          description="Con actividad"
          isLoading={isLoading}
        />
        <MetricCard
          label="Importantes"
          value={importantCount}
          icon={AlertTriangle}
          semanticState="warning"
          description="Requieren seguimiento"
          isLoading={isLoading}
        />
        <MetricCard
          label="Críticas"
          value={criticalCount}
          icon={ShieldAlert}
          semanticState="danger"
          description="Prioridad máxima"
          isLoading={isLoading}
        />
      </KpiGrid>

      {!isLoading ? (
        attentionEvents.length > 0 ? (
          <SectionCard
            title="Requiere atención"
            description="Operaciones críticas o con revisión pendiente"
            module="auditoria"
            contentClassName="space-y-3"
          >
            {attentionEvents.slice(0, 8).map((event) => (
              <AuditEventCard key={event.id} event={event} emphasize />
            ))}

            {attentionEvents.length > 8 ? (
              <p className="text-xs text-text-tertiary">
                Hay {attentionEvents.length - 8} operaciones adicionales que requieren atención. Usa
                el filtro Crítico para revisarlas.
              </p>
            ) : null}
          </SectionCard>
        ) : (
          <PageAlert tone="success" title="Sin incidencias críticas en el período">
            No hay operaciones críticas ni revisiones pendientes.
          </PageAlert>
        )
      ) : null}

      <SectionCard
        title="Explorar Auditoría"
        description="Busca una operación o aplica filtros cuando sea necesario"
        module="auditoria"
        contentClassName="space-y-3"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por usuario, operación o área..."
              className="pl-9"
            />
          </div>

          <Button
            type="button"
            variant={showFilters ? "secondary" : "outline"}
            onClick={() => setShowFilters((current) => !current)}
            className="shrink-0"
          >
            <Filter className="mr-2 h-4 w-4" />
            Más filtros
          </Button>

          {hasFilters ? (
            <Button type="button" variant="ghost" onClick={resetFilters} className="shrink-0">
              <X className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          ) : null}
        </div>

        {showFilters ? (
          <div className="grid gap-3 rounded-[var(--radius-compact)] border border-border-subtle bg-surface-2 p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Importancia</label>
              <Select
                value={severityFilter}
                onValueChange={(value) => setSeverityFilter(value as SeverityFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="critical">Críticas</SelectItem>
                  <SelectItem value="important">Importantes</SelectItem>
                  <SelectItem value="normal">Normales</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Área</label>
              <Select
                value={areaFilter}
                onValueChange={(value) => setAreaFilter(value as AreaFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(AREA_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <Tabs value={view} onValueChange={(value) => setView(value as AuditView)}>
        <TabsList className="grid h-auto w-full grid-cols-3 sm:w-auto">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="users">Por usuario</TabsTrigger>
          <TabsTrigger value="areas">Por área</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <AuditSummary events={filteredEvents} isLoading={isLoading} hasFilters={hasFilters} />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          {isLoading ? (
            <AuditLoader />
          ) : userGroups.length === 0 ? (
            <AuditEmpty hasFilters={hasFilters} />
          ) : (
            <div className="space-y-4">
              {userGroups.map((group) => (
                <UserAuditGroup key={group.key} group={group} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="areas" className="mt-4">
          {isLoading ? (
            <AuditLoader />
          ) : areaGroups.length === 0 ? (
            <AuditEmpty hasFilters={hasFilters} />
          ) : (
            <div className="space-y-4">
              {areaGroups.map((group) => (
                <AreaAuditGroup key={group.key} group={group} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AuditSummary({
  events,
  isLoading,
  hasFilters,
}: {
  events: BusinessAuditEvent[];
  isLoading: boolean;
  hasFilters: boolean;
}) {
  if (isLoading) return <AuditLoader />;
  if (events.length === 0) {
    return <AuditEmpty hasFilters={hasFilters} />;
  }

  return (
    <SectionCard
      title="Actividad reciente"
      description="Operaciones del período, priorizadas por relevancia"
      module="auditoria"
      contentClassName="space-y-3"
    >
      {events.slice(0, 20).map((event) => (
        <AuditEventCard key={event.id} event={event} />
      ))}

      {events.length > 20 ? (
        <p className="pt-1 text-xs text-text-tertiary">
          Se muestran las 20 operaciones más recientes. Usa Por usuario o Por área para profundizar.
        </p>
      ) : null}
    </SectionCard>
  );
}

function UserAuditGroup({ group }: { group: AuditGroup }) {
  const operationGroups = groupByUserCategory(group.events);

  return (
    <SectionCard
      title={group.label}
      description={`${group.subtitle ?? "Usuario"} · ${group.events.length} ${
        group.events.length === 1 ? "operación" : "operaciones"
      }`}
      module="auditoria"
      contentClassName="space-y-2"
    >
      {operationGroups.map((operationGroup) => (
        <OperationGroup
          key={operationGroup.key}
          label={operationGroup.label}
          events={operationGroup.events}
        />
      ))}
    </SectionCard>
  );
}

function AreaAuditGroup({ group }: { group: AuditGroup }) {
  const operationGroups = groupByOperationType(group.events);

  return (
    <SectionCard
      title={group.label}
      description={`${group.events.length} ${
        group.events.length === 1 ? "operación" : "operaciones"
      }`}
      module="auditoria"
      contentClassName="space-y-2"
    >
      {operationGroups.map((operationGroup) => (
        <OperationGroup
          key={operationGroup.key}
          label={operationGroup.label}
          events={operationGroup.events}
        />
      ))}
    </SectionCard>
  );
}

function OperationGroup({ label, events }: { label: string; events: BusinessAuditEvent[] }) {
  const critical = events.filter((event) => event.importance === "critical").length;

  return (
    <details className="group rounded-[var(--radius-compact)] border border-border-subtle bg-surface-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">{label}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {events.length} {events.length === 1 ? "operación" : "operaciones"}
            {critical > 0 ? ` · ${critical} ${critical === 1 ? "crítica" : "críticas"}` : ""}
          </p>
        </div>

        <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
      </summary>

      <div className="space-y-2 border-t border-border-subtle p-2 sm:p-3">
        {events.map((event) => (
          <AuditEventCard key={event.id} event={event} />
        ))}
      </div>
    </details>
  );
}

function AuditEventCard({
  event,
  emphasize = false,
}: {
  event: BusinessAuditEvent;
  emphasize?: boolean;
}) {
  const changedFields = getChangedFields(event);
  const consequences = getConsequences(event);

  return (
    <details
      className={`group rounded-[var(--radius-compact)] border bg-surface-1 ${
        emphasize || event.importance === "critical"
          ? "border-[var(--semantic-danger-border)]"
          : "border-border-subtle"
      }`}
    >
      <summary className="cursor-pointer list-none p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge importance={event.importance} />
              <Badge variant="secondary">{AREA_LABELS[event.area]}</Badge>
            </div>

            <p className="mt-2 text-sm font-semibold leading-snug text-text-primary">
              {eventSentence(event)}
            </p>

            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-tertiary">
              <span>{formatDateTime(event.createdAt)}</span>
              <span>{event.entityLabel}</span>
            </div>
          </div>

          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-text-tertiary" />
        </div>
      </summary>

      <div className="space-y-4 border-t border-border-subtle px-3 py-4 sm:px-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <DetailItem label="Responsable">{event.actorName}</DetailItem>
          <DetailItem label="Rol">{roleLabel(event.actorRole)}</DetailItem>
        </div>

        {event.reason ? (
          <div className="rounded-[var(--radius-compact)] border border-border-subtle bg-surface-2 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Motivo
            </p>
            <p className="mt-1 text-sm text-text-primary">{event.reason}</p>
          </div>
        ) : null}

        {changedFields.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Cambios realizados
            </p>
            <div className="space-y-2">
              {changedFields.map((field) => (
                <div
                  key={field.key}
                  className="grid gap-2 rounded-[var(--radius-compact)] border border-border-subtle bg-surface-2 p-3 text-sm sm:grid-cols-[minmax(130px,0.7fr)_1fr_1fr]"
                >
                  <span className="font-medium text-text-primary">{field.label}</span>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-text-tertiary">
                      Antes
                    </span>
                    <span className="text-text-secondary">
                      {formatBusinessValue(field.before, field.key)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-text-tertiary">
                      Después
                    </span>
                    <span className="text-text-primary">
                      {formatBusinessValue(field.after, field.key)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {consequences.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Consecuencias
            </p>
            <div className="space-y-2">
              {consequences.map((consequence) => (
                <div
                  key={consequence}
                  className="flex items-start gap-2 rounded-[var(--radius-compact)] border border-border-subtle bg-surface-2 p-3 text-sm text-text-secondary"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{consequence}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <details className="rounded-[var(--radius-compact)] border border-border-subtle bg-surface-2">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-medium text-text-secondary">
            Ver información técnica
          </summary>
          <div className="grid gap-2 border-t border-border-subtle px-3 py-3 text-xs sm:grid-cols-2">
            <TechnicalItem label="ID del evento" value={String(event.id)} />
            <TechnicalItem label="ID de entidad" value={event.entityId ?? "No disponible"} />
            <TechnicalItem label="Tipo interno" value={event.entityType} />
            <TechnicalItem label="Acción interna" value={event.action} />
            <TechnicalItem label="ID del responsable" value={event.actorId ?? "Sistema"} />
            <TechnicalItem label="IP" value={event.ipAddress ?? "No registrada"} />
            <TechnicalItem
              label="Agente de usuario"
              value={event.userAgent ?? "No registrado"}
              wide
            />
          </div>
        </details>
      </div>
    </details>
  );
}

function SeverityBadge({ importance }: { importance: AuditImportance }) {
  const classes: Record<AuditImportance, string> = {
    normal: "border-border-subtle bg-surface-2 text-text-secondary",
    important:
      "border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] text-[var(--semantic-warning-foreground)]",
    critical:
      "border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-surface)] text-[var(--semantic-danger-foreground)]",
  };

  return (
    <Badge variant="outline" className={classes[importance]}>
      {IMPORTANCE_LABELS[importance]}
    </Badge>
  );
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="mt-0.5 font-medium text-text-primary">{children}</p>
    </div>
  );
}

function TechnicalItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="text-text-tertiary">{label}</p>
      <p className="mt-0.5 break-all font-mono text-text-secondary">{value}</p>
    </div>
  );
}

function AuditLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function AuditEmpty({ hasFilters }: { hasFilters: boolean }) {
  return (
    <EmptyState
      icon={ScrollText}
      title={hasFilters ? "Sin resultados" : "Sin operaciones en el período"}
      description={
        hasFilters
          ? "No hay operaciones que coincidan con los filtros aplicados."
          : "No se registraron operaciones empresariales en este período."
      }
      module="auditoria"
    />
  );
}

function groupByUser(events: BusinessAuditEvent[]): AuditGroup[] {
  const map = new Map<string, AuditGroup>();

  for (const event of events) {
    const key = event.actorId ?? event.actorEmail ?? `${event.actorRole}:${event.actorName}`;

    const existing = map.get(key);

    if (existing) {
      existing.events.push(event);
      continue;
    }

    map.set(key, {
      key,
      label: event.actorName,
      subtitle: roleLabel(event.actorRole),
      events: [event],
    });
  }

  return [...map.values()].sort((a, b) => b.events.length - a.events.length);
}

function groupByArea(events: BusinessAuditEvent[]): AuditGroup[] {
  const map = new Map<AuditArea, BusinessAuditEvent[]>();

  for (const event of events) {
    const current = map.get(event.area) ?? [];
    current.push(event);
    map.set(event.area, current);
  }

  return [...map.entries()]
    .map(([area, areaEvents]) => ({
      key: area,
      label: AREA_LABELS[area],
      events: areaEvents,
    }))
    .sort((a, b) => b.events.length - a.events.length);
}

function groupByUserCategory(events: BusinessAuditEvent[]): AuditGroup[] {
  const map = new Map<string, BusinessAuditEvent[]>();

  for (const event of events) {
    const label = userCategory(event);
    const current = map.get(label) ?? [];
    current.push(event);
    map.set(label, current);
  }

  return [...map.entries()].map(([label, groupEvents]) => ({
    key: label,
    label,
    events: groupEvents,
  }));
}

function groupByOperationType(events: BusinessAuditEvent[]): AuditGroup[] {
  const map = new Map<string, BusinessAuditEvent[]>();

  for (const event of events) {
    const current = map.get(event.actionLabel) ?? [];
    current.push(event);
    map.set(event.actionLabel, current);
  }

  return [...map.entries()]
    .map(([label, groupEvents]) => ({
      key: label,
      label,
      events: groupEvents,
    }))
    .sort((a, b) => b.events.length - a.events.length);
}

function userCategory(event: BusinessAuditEvent) {
  if (event.action === "payment_cancelled_safe" || event.action.includes("cancel")) {
    return "Anulaciones";
  }

  if (event.area === "administracion") {
    return "Configuración";
  }

  return AREA_LABELS[event.area];
}

function eventSentence(event: BusinessAuditEvent) {
  const actor = event.actorRole === "system" ? "Sistema" : event.actorName;

  if (event.action === "payment_cancelled_safe") {
    return `${actor} anuló un pago`;
  }

  if (event.actionLabel === "Pago confirmado") {
    return `${actor} confirmó un pago`;
  }

  if (event.actionLabel === "Pago registrado") {
    return `${actor} registró un pago`;
  }

  if (event.action === "delete_inactive_plan") {
    return `${actor} eliminó un plan inactivo`;
  }

  if (event.action === "insert") {
    return `${actor} creó ${entityWithArticle(event.entityLabel)}`;
  }

  if (event.action === "update") {
    return `${actor} actualizó ${entityWithArticle(event.entityLabel)}`;
  }

  if (event.action === "delete") {
    return `${actor} eliminó ${entityWithArticle(event.entityLabel)}`;
  }

  return `${actor}: ${lowercaseFirst(event.actionLabel)}`;
}

function entityWithArticle(entityLabel: string) {
  const feminine = new Set([
    "Prefactura",
    "Licencia",
    "Campaña",
    "Tasa de cambio",
    "Configuración de referidos",
  ]);

  return `${feminine.has(entityLabel) ? "una" : "un"} ${entityLabel.toLocaleLowerCase("es")}`;
}

function getChangedFields(event: BusinessAuditEvent): ChangedField[] {
  const oldValue = asRecord(event.metadata.old);
  const newValue = asRecord(event.metadata.new);

  if (!oldValue || !newValue) return [];

  const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

  const changes: ChangedField[] = [];

  for (const key of keys) {
    if (HIDDEN_CHANGE_FIELDS.has(key)) continue;

    const before = oldValue[key];
    const after = newValue[key];

    if (valuesEqual(before, after)) continue;

    changes.push({
      key,
      label: FIELD_LABELS[key] ?? humanizeCode(key),
      before,
      after,
    });
  }

  return changes;
}

function getConsequences(event: BusinessAuditEvent) {
  const consequences: string[] = [];

  const licenseAction = event.metadata.license_action;
  if (typeof licenseAction === "string" && licenseAction.trim()) {
    consequences.push(`Licencia: ${humanizeCode(licenseAction)}.`);
  }

  if (event.metadata.license_requires_review === true) {
    consequences.push("La licencia requiere revisión manual.");
  }

  const reassignedTrials = event.metadata.reassigned_trials;
  if (typeof reassignedTrials === "number" && reassignedTrials > 0) {
    consequences.push(
      `${reassignedTrials} ${
        reassignedTrials === 1
          ? "licencia de prueba fue reasignada"
          : "licencias de prueba fueron reasignadas"
      }.`,
    );
  }

  return consequences;
}

function formatBusinessValue(value: unknown, key: string) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Sí" : "No";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("es").format(value);
  }

  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? "elemento" : "elementos"}`;
  }

  if (typeof value === "object") {
    return "Información actualizada";
  }

  const text = String(value);

  if (key.endsWith("_at")) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return formatDateTime(text);
    }
  }

  if (key === "status") {
    return humanizeStatus(text);
  }

  if (key === "rate_mode" || key === "method" || key === "source") {
    return humanizeCode(text);
  }

  return text;
}

function humanizeStatus(value: string) {
  const statuses: Record<string, string> = {
    active: "Activa",
    inactive: "Inactiva",
    paid: "Pagado",
    pending: "Pendiente",
    cancelled: "Anulado",
    expired: "Vencida",
    revoked: "Revocada",
    sent: "Enviada",
    draft: "Borrador",
    complimentary: "Cortesía",
  };

  return statuses[value] ?? humanizeCode(value);
}

function humanizeCode(value: string) {
  const normalized = value.replaceAll("_", " ").replaceAll("-", " ").trim();

  if (!normalized) return "—";

  return normalized.charAt(0).toLocaleUpperCase("es") + normalized.slice(1);
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? humanizeCode(role);
}

function lowercaseFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleLowerCase("es") + value.slice(1);
}

function valuesEqual(first: unknown, second: unknown) {
  if (Object.is(first, second)) return true;

  if (
    typeof first === "object" &&
    first !== null &&
    typeof second === "object" &&
    second !== null
  ) {
    return JSON.stringify(first) === JSON.stringify(second);
  }

  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toAuditWindow(range: AdminDateRange) {
  const from = parseLocalDate(range.from);
  const to = parseLocalDate(range.to);

  to.setDate(to.getDate() + 1);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
