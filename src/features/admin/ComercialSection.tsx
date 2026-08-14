import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History,
  Megaphone,
  Pencil,
  Plus,
  StickyNote,
  ArrowRight,
  Layers,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  supabaseServices,
  type CommercialCampaign,
  type CommercialLead,
  type CommercialLeadInput,
  type CommercialLeadStatus,
  type CommercialSource,
} from "@/lib/services";
import { useProjectPermissions } from "@/hooks/useProjects";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { FilterToolbar } from "@/components/admin/FilterToolbar";
import { EmptyState } from "@/components/admin/EmptyState";
import { AdminDataTableShell } from "@/components/admin/AdminDataTableShell";
import { SectionCard } from "@/components/admin/SectionCard";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { adminChartTooltipProps } from "@/lib/chart-theme";

const SOURCES: CommercialSource[] = [
  "whatsapp",
  "facebook",
  "instagram",
  "sms",
  "referral",
  "direct",
  "other",
];
const STATUSES: CommercialLeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "trial",
  "ready_to_charge",
  "customer",
  "not_interested",
];
const EMPTY: CommercialLeadInput = {
  name: "",
  phone: "",
  email: "",
  source: "whatsapp",
  medium: "",
  campaign: "",
  referralCode: "",
  status: "new",
  notes: "",
  nextActionAt: "",
};

export default function ComercialSection({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const { user } = useSupabaseAuth();
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("commercial.manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [responsible, setResponsible] = useState("all");
  const [editing, setEditing] = useState<CommercialLeadInput | null>(null);
  const [historyLead, setHistoryLead] = useState<CommercialLead | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CommercialCampaign | "new" | null>(null);

  const leads = useQuery({
    queryKey: ["commercial-leads", projectId],
    queryFn: () => supabaseServices.commercial.listLeads(projectId),
  });
  const campaigns = useQuery({
    queryKey: ["commercial-campaigns", projectId],
    queryFn: () => supabaseServices.commercial.listCampaigns(projectId),
  });
  const metrics = useQuery({
    queryKey: ["commercial-metrics", projectId],
    queryFn: () => supabaseServices.commercial.metrics(projectId),
  });
  const referrals = useQuery({
    queryKey: ["commercial-referrals", projectId],
    queryFn: () => supabaseServices.referrals.overview(projectId),
  });

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["commercial-leads", projectId] }),
      client.invalidateQueries({ queryKey: ["commercial-campaigns", projectId] }),
      client.invalidateQueries({ queryKey: ["commercial-metrics", projectId] }),
      client.invalidateQueries({ queryKey: ["commercial-referrals", projectId] }),
    ]);

  const rows = useMemo(
    () =>
      (leads.data ?? []).filter((lead) => {
        const text =
          `${lead.name} ${lead.phone} ${lead.email ?? ""} ${lead.campaign ?? ""}`.toLowerCase();
        return (
          text.includes(search.toLowerCase()) &&
          (status === "all" || lead.status === status) &&
          (source === "all" || lead.source === source) &&
          (campaign === "all" || lead.campaign === campaign) &&
          (responsible === "all" || (lead.responsibleName ?? "unassigned") === responsible)
        );
      }),
    [leads.data, search, status, source, campaign, responsible],
  );

  const campaignNames = [
    ...new Set((leads.data ?? []).map((lead) => lead.campaign).filter(Boolean)),
  ] as string[];
  const responsibleNames = [
    ...new Set((leads.data ?? []).map((lead) => lead.responsibleName ?? "unassigned")),
  ];

  const m = metrics.data;

  // Funnel data from leads
  const activeLeads = (leads.data ?? []).filter((l) => !l.archivedAt);
  const funnelSteps = [
    { label: "Leads", count: activeLeads.length, desc: "Total leads activos" },
    {
      label: "Contactados",
      count: activeLeads.filter(
        (l) =>
          l.status === "contacted" ||
          l.status === "trial" ||
          l.status === "customer" ||
          l.lastInteractionAt,
      ).length,
      desc: "Con interacción",
    },
    {
      label: "Prueba",
      count: activeLeads.filter((l) => l.trialStarted || l.status === "trial").length,
      desc: "En trial",
    },
    {
      label: "Pago",
      count: activeLeads.filter((l) => l.paid || l.status === "customer").length,
      desc: "Clientes pagados",
    },
    {
      label: "Renovación",
      count: activeLeads.reduce((total, lead) => total + lead.renewalCount, 0),
      desc: "Renovaciones",
    },
  ];

  // Source distribution
  const sourceDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    activeLeads.forEach((l) => {
      const src = l.source || "other";
      counts.set(src, (counts.get(src) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([source, count]) => ({
      source: sourceLabel(source as CommercialSource),
      count,
    }));
  }, [activeLeads]);

  // Campaign summary
  const campaignSummary = useMemo(() => {
    const map = new Map<string, { leads: number; trials: number; paid: number }>();
    activeLeads.forEach((l) => {
      const camp = l.campaign || "General";
      const entry = map.get(camp) ?? { leads: 0, trials: 0, paid: 0 };
      entry.leads += 1;
      if (l.trialStarted || l.status === "trial") entry.trials += 1;
      if (l.paid || l.status === "customer") entry.paid += 1;
      map.set(camp, entry);
    });
    return Array.from(map.entries()).map(([campaign, data]) => ({
      campaign,
      ...data,
      conversion: data.trials > 0 ? Math.round((data.paid / data.trials) * 100) : 0,
    }));
  }, [activeLeads]);

  return (
    <div className="space-y-6 md:space-y-8">
      <ModuleHeader
        title="Comercial"
        description="Seguimiento de embudo, canales de adquisición y gestión de leads."
        icon={Megaphone}
        module="comercial"
        actions={
          canManage ? (
            <div className="flex gap-2.5">
              <Button variant="outline" size="sm" onClick={() => setEditingCampaign("new")}>
                Nueva campaña
              </Button>
              <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo lead
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* 4 KPI Principales */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Leads"
          value={m?.totalLeads ?? activeLeads.length}
          description="Total canalizados"
          icon={Megaphone}
          module="comercial"
        />
        <MetricCard
          label="Pruebas"
          value={m?.trials ?? 0}
          description="En periodo trial"
          icon={Layers}
          module="comercial"
        />
        <MetricCard
          label="Clientes pagados"
          value={m?.paid ?? 0}
          description="Conversión confirmada"
          icon={History}
          semanticState="success"
        />
        <MetricCard
          label="Conversión"
          value={`${m?.conversionRate ?? 0}%`}
          description="Tasa global"
          icon={Megaphone}
          semanticState="info"
        />
      </div>

      {/* Embudo Comercial */}
      <SectionCard title="Embudo comercial" module="comercial">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {funnelSteps.map((step, idx) => {
            const firstCount = funnelSteps[0].count;
            const pct = firstCount > 0 ? Math.round((step.count / firstCount) * 100) : 0;
            return (
              <div
                key={step.label}
                className="relative rounded-2xl border border-border/70 bg-card/60 p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {step.label}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {pct}%
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold font-mono text-foreground">
                    {step.count}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{step.desc}</p>
                </div>
                {idx < funnelSteps.length - 1 ? (
                  <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm">
                    <ArrowRight className="h-3 w-3" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Origen / Fuentes & Campañas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Distribución por fuente" module="comercial">
          {sourceDistribution.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sourceDistribution}
                  margin={{ left: -15, right: 10, top: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis
                    dataKey="source"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip {...adminChartTooltipProps} />
                  <Bar dataKey="count" fill="var(--module-comercial)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={Megaphone}
              title="Sin datos de fuentes"
              description="No hay fuentes registradas para los leads actuales."
              module="comercial"
            />
          )}
        </SectionCard>

        <SectionCard title="Rendimiento de campañas" module="comercial">
          {campaignSummary.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaña</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Pruebas</TableHead>
                    <TableHead className="text-right">Pagados</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignSummary.map((c) => (
                    <TableRow key={c.campaign}>
                      <TableCell className="font-medium truncate max-w-[140px]">
                        {c.campaign}
                      </TableCell>
                      <TableCell className="text-right font-mono">{c.leads}</TableCell>
                      <TableCell className="text-right font-mono">{c.trials}</TableCell>
                      <TableCell className="text-right font-mono">{c.paid}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-400">
                        {c.conversion}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={Layers}
              title="Sin campañas activas"
              description="No se registran campañas asociadas a leads en este proyecto."
              module="comercial"
            />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Referidos"
        description="Relaciones y recompensas reales del proyecto"
        module="comercial"
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Relaciones"
            value={referrals.data?.relationships ?? 0}
            description="Clientes vinculados"
            icon={UsersRound}
            module="comercial"
          />
          <MetricCard
            label="Convertidos"
            value={referrals.data?.converted ?? 0}
            description="Con recompensa ganada"
            icon={History}
            semanticState="success"
          />
          <MetricCard
            label="Aplicadas"
            value={referrals.data?.appliedRewards ?? 0}
            description="Recompensas entregadas"
            icon={Layers}
            module="comercial"
          />
          <MetricCard
            label="Días entregados"
            value={referrals.data?.deliveredDays ?? 0}
            description="Extensión acumulada"
            icon={Megaphone}
            module="comercial"
          />
        </div>
        {(referrals.data?.rows.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referidor</TableHead>
                  <TableHead>Referido</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.data?.rows.map((row) => (
                  <TableRow key={row.relationshipId}>
                    <TableCell className="font-medium">{row.referrerName}</TableCell>
                    <TableCell>{row.referredName}</TableCell>
                    <TableCell className="font-mono text-xs">{row.code ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {row.status === "pending"
                          ? "Pendiente"
                          : row.status === "earned"
                            ? "Ganada"
                            : row.status === "applied"
                              ? "Aplicada"
                              : "Revertida"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{row.days ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleDateString("es")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="Sin referidos"
            description="Aún no hay relaciones reales de referidos."
            module="comercial"
          />
        )}
      </SectionCard>

      {/* Tabla de Leads con FilterToolbar & AdminDataTableShell */}
      <AdminDataTableShell
        title="Leads y conversiones"
        description="Listado completo y filtros de seguimiento comercial."
        actions={
          <FilterToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por nombre, teléfono o email..."
            showReset={true}
            onReset={() => {
              setSearch("");
              setStatus("all");
              setSource("all");
              setCampaign("all");
              setResponsible("all");
            }}
          >
            <Filter
              value={status}
              onChange={setStatus}
              values={STATUSES}
              label="Estado"
              format={(value) => labelStatus(value as CommercialLeadStatus)}
            />
            <Filter
              value={source}
              onChange={setSource}
              values={SOURCES}
              label="Fuente"
              format={(value) => sourceLabel(value as CommercialSource)}
            />
            <Filter
              value={campaign}
              onChange={setCampaign}
              values={campaignNames}
              label="Campaña"
            />
            <Filter
              value={responsible}
              onChange={setResponsible}
              values={responsibleNames}
              label="Responsable"
            />
          </FilterToolbar>
        }
        isEmpty={rows.length === 0}
        emptyState={
          <EmptyState
            icon={Megaphone}
            title="Todavía no tienes leads"
            description="Comienza creando tu primer lead comercial para realizar seguimiento y conversión."
            module="comercial"
            action={
              canManage ? (
                <Button onClick={() => setEditing({ ...EMPTY })}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear lead
                </Button>
              ) : undefined
            }
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fuente / Campaña</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lead) => (
              <TableRow key={lead.id} className="group hover:bg-muted/40 transition-colors">
                <TableCell className="font-medium text-foreground">
                  <div>{lead.name}</div>
                  {lead.referralCode ? (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Ref: {lead.referralCode}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>{lead.phone}</div>
                  <div className="truncate max-w-[160px]">{lead.email || "—"}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {labelStatus(lead.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <span>{sourceLabel(lead.source)}</span>
                  {lead.campaign ? (
                    <span className="block text-[10px]">Campaña: {lead.campaign}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {lead.responsibleName ?? "Sin asignar"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setHistoryLead(lead)}
                      title="Historial"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setEditing({
                            name: lead.name,
                            phone: lead.phone,
                            email: lead.email ?? "",
                            source: lead.source,
                            medium: lead.medium ?? "",
                            campaign: lead.campaign ?? "",
                            referralCode: lead.referralCode ?? "",
                            status: lead.status,
                            notes: lead.notes ?? "",
                            nextActionAt: lead.nextActionAt ? lead.nextActionAt.slice(0, 16) : "",
                          })
                        }
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminDataTableShell>

      {/* Existing modals for editing/history/campaigns */}
      {/* (Kept fully intact to preserve business logic and mutations) */}
      <LeadDialog
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        lead={editing}
        onChange={(next) => setEditing(next)}
        onSave={async () => {
          if (!editing) return;
          try {
            await supabaseServices.commercial.saveLead(projectId, editing);
            toast.success("Lead guardado correctamente");
            setEditing(null);
            refresh();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Error al guardar lead");
          }
        }}
      />

      <HistoryDialog
        lead={historyLead}
        onClose={() => setHistoryLead(null)}
        projectId={projectId}
        canManage={canManage}
        onRefresh={refresh}
      />

      <CampaignDialog
        isOpen={editingCampaign !== null}
        onClose={() => setEditingCampaign(null)}
        campaign={editingCampaign}
        projectId={projectId}
        onRefresh={refresh}
      />
    </div>
  );
}

function Filter({
  value,
  onChange,
  values,
  label,
  format = (item) => item,
}: {
  value: string;
  onChange: (v: string) => void;
  values: string[];
  label: string;
  format?: (value: string) => string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 text-xs bg-background/60 border-border/80">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: Todos</SelectItem>
        {values.map((v) => (
          <SelectItem key={v} value={v}>
            {format(v)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function labelStatus(status: CommercialLeadStatus) {
  const map: Record<CommercialLeadStatus, string> = {
    new: "Nuevo",
    contacted: "Contactado",
    interested: "Interesado",
    trial: "Prueba",
    ready_to_charge: "Listo para cobrar",
    customer: "Cliente",
    not_interested: "No interesado",
  };
  return map[status] ?? status;
}

function sourceLabel(source: CommercialSource) {
  const map: Record<CommercialSource, string> = {
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    instagram: "Instagram",
    sms: "SMS",
    referral: "Referido",
    direct: "Directo",
    other: "Otro",
  };
  return map[source] ?? source;
}

// Subcomponents for Modals (LeadDialog, HistoryDialog, CampaignDialog) kept intact
function LeadDialog({
  isOpen,
  onClose,
  lead,
  onChange,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  lead: CommercialLeadInput | null;
  onChange: (lead: CommercialLeadInput) => void;
  onSave: () => void;
}) {
  if (!lead) return null;
  const set = (key: keyof CommercialLeadInput, val: unknown) => onChange({ ...lead, [key]: val });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestionar Lead Comercial</DialogTitle>
          <DialogDescription>Completa los datos de seguimiento del lead.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nombre</Label>
            <Input value={lead.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Teléfono / WhatsApp</Label>
              <Input value={lead.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Correo electrónico</Label>
              <Input value={lead.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Fuente</Label>
              <Select
                value={lead.source}
                onValueChange={(v) => set("source", v as CommercialSource)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {sourceLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select
                value={lead.status}
                onValueChange={(v) => set("status", v as CommercialLeadStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {labelStatus(st)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Campaña</Label>
              <Input
                value={lead.campaign ?? ""}
                onChange={(e) => set("campaign", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Código de referido</Label>
              <Input
                value={lead.referralCode ?? ""}
                onChange={(e) => set("referralCode", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Notas</Label>
            <Textarea value={lead.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSave}>Guardar lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  lead,
  onClose,
  projectId,
  canManage,
  onRefresh,
}: {
  lead: CommercialLead | null;
  onClose: () => void;
  projectId: string;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [note, setNote] = useState("");
  const history = useQuery({
    queryKey: ["commercial-lead-history", projectId, lead?.id],
    queryFn: () =>
      lead ? supabaseServices.commercial.listLeadHistory(projectId, lead.id) : Promise.resolve([]),
    enabled: Boolean(lead),
  });
  const addNote = useMutation({
    mutationFn: async () => {
      if (!lead || !note.trim()) return;
      await supabaseServices.commercial.addNote(projectId, lead.id, note.trim());
    },
    onSuccess: () => {
      toast.success("Nota añadida");
      setNote("");
      onRefresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al añadir nota"),
  });

  if (!lead) return null;

  return (
    <Dialog open={Boolean(lead)} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial de seguimiento: {lead.name}</DialogTitle>
          <DialogDescription>Eventos, notas y cambios de estado del lead.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
          {canManage && (
            <div className="space-y-2 rounded-xl border border-border/70 bg-card p-3">
              <Label className="text-xs">Añadir nota de seguimiento</Label>
              <Textarea
                placeholder="Escribe una nota..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="text-xs"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => addNote.mutate()}
                  disabled={addNote.isPending || !note.trim()}
                >
                  <StickyNote className="mr-1.5 h-3.5 w-3.5" />
                  Registrar nota
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {(history.data ?? []).map((h) => (
              <div
                key={h.id}
                className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs"
              >
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-medium text-foreground">{h.actorEmail ?? "Sistema"}</span>
                  <span>{new Date(h.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-foreground font-medium">{h.eventTitle}</p>
                {h.detail ? <p className="mt-0.5 text-muted-foreground">{h.detail}</p> : null}
              </div>
            ))}
            {history.data?.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-6">
                Sin historial registrado.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDialog({
  isOpen,
  onClose,
  campaign,
  projectId,
  onRefresh,
}: {
  isOpen: boolean;
  onClose: () => void;
  campaign: CommercialCampaign | "new" | null;
  projectId: string;
  onRefresh: () => void;
}) {
  const [name, setName] = useState(typeof campaign === "object" && campaign ? campaign.name : "");
  const [source, setSource] = useState(
    typeof campaign === "object" && campaign ? campaign.source : "whatsapp",
  );
  const save = useMutation({
    mutationFn: () =>
      supabaseServices.commercial.saveCampaign(projectId, {
        id: typeof campaign === "object" && campaign ? campaign.id : undefined,
        name,
        source,
        medium: "social",
        status: "active",
      }),
    onSuccess: () => {
      toast.success("Campaña guardada");
      onClose();
      onRefresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Error al guardar campaña"),
  });

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gestionar Campaña Comercial</DialogTitle>
          <DialogDescription>Configura los canales y nombres de campaña.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nombre de campaña</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Lanzamiento Verano"
            />
          </div>
          <div className="grid gap-2">
            <Label>Fuente principal</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {sourceLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
            Guardar campaña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
