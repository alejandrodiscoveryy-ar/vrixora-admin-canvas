import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Gift,
  History,
  Megaphone,
  Pencil,
  Plus,
  StickyNote,
  Layers,
  UsersRound,
  TrendingUp,
  Rocket,
  Handshake,
  Target,
  SlidersHorizontal,
  GitFork,
  UserPlus,
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
import { getSupabaseClient } from "@/lib/supabase";
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

import MarketplaceOffersPanel from "@/features/admin/MarketplaceOffersPanel";
import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { CommercialPageHeader } from "@/features/admin/CommercialPageHeader";
import { CommercialSettingsPanel } from "@/features/admin/CommercialSettingsPanel";
import MarketplaceWelcomePolicyPanel from "@/features/admin/MarketplaceWelcomePolicyPanel";
import MarketplaceImpulsaPolicyPanel from "@/features/admin/MarketplaceImpulsaPolicyPanel";
import MarketplaceImpulsaCommunicationAnalytics from "@/features/admin/MarketplaceImpulsaCommunicationAnalytics";
import MarketplaceTuktukOfficialAnalytics from "@/features/admin/MarketplaceTuktukOfficialAnalytics";
import MarketplaceCustomerCampaignDrafts from "@/features/admin/MarketplaceCustomerCampaignDrafts";
import MarketplaceAlliesPanel from "@/features/admin/MarketplaceAlliesPanel";
import ComercialSourceOverview from "@/features/admin/ComercialSourceOverview";
import MarketplaceImpulsaTransitionPanel from "@/features/admin/MarketplaceImpulsaTransitionPanel";
import CommercialReferralsPanel from "@/features/admin/CommercialReferralsPanel";
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
  const [commercialView, setCommercialView] = useState<"campanas" | "resultados" | "captacion" | "ofertas" | "referidos" | "configuracion" | "impulsa" | "aliados">("campanas");
  const managementNavIcons = {
    configuracion: SlidersHorizontal,
    referidos: GitFork,
    ofertas: Gift,
    captacion: UserPlus,
  } as const;
  const projectIdentity = useQuery({
    queryKey: ["commercial-project-identity", projectId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("projects")
        .select("slug, owner_id")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(projectId),
  });
  const isTuktukProject = projectIdentity.data?.slug === "tuktuk-control";
  const showOffers = isTuktukProject && commercialView === "ofertas";
  const showReferrals = isTuktukProject && commercialView === "referidos";
  const showImpulsa = isTuktukProject && commercialView === "impulsa";
  const showAllies = isTuktukProject && commercialView === "aliados";
  const showManagement = isTuktukProject && ["captacion","ofertas","referidos","configuracion"].includes(commercialView);
  const canViewImpulsa = permissions.includes("settings.view");
  const canEditImpulsa = canViewImpulsa && permissions.includes("settings.manage") && canManage && permissions.includes("payments.manage");
  const adminMembership = useQuery({
    queryKey: ["commercial-admin-membership", projectId, user?.id],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("project_members")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data?.role === "admin";
    },
    enabled: Boolean(user?.id && isTuktukProject),
  });
  const canEditOffers =
    canManage &&
    isTuktukProject &&
    (projectIdentity.data?.owner_id === user?.id || adminMembership.data === true);
  const canPlanCustomerBenefits = canManage && isTuktukProject && projectIdentity.data?.owner_id === user?.id;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [responsible, setResponsible] = useState("all");
  const [editing, setEditing] = useState<CommercialLeadInput | null>(null);
  const [historyLead, setHistoryLead] = useState<CommercialLead | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CommercialCampaign | "new" | null>(null);
  const [showLeadAnalytics, setShowLeadAnalytics] = useState(false);

  const leads = useQuery({
    queryKey: ["commercial-leads", projectId],
    queryFn: () => supabaseServices.commercial.listLeads(projectId),
  });
  const campaigns = useQuery({
    queryKey: ["commercial-campaigns", projectId],
    queryFn: () => supabaseServices.commercial.listCampaigns(projectId),
  });

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["commercial-leads", projectId] }),
      client.invalidateQueries({ queryKey: ["commercial-campaigns", projectId] }),
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

  const activeLeads = (leads.data ?? []).filter((lead) => !lead.archivedAt);

  const contactedLeads = activeLeads.filter(
    (lead) =>
      Boolean(lead.lastInteractionAt) ||
      ["contacted", "interested", "trial", "ready_to_charge", "customer"].includes(lead.status),
  ).length;

  const interestedLeads = activeLeads.filter((lead) =>
    ["interested", "trial", "ready_to_charge", "customer"].includes(lead.status),
  ).length;

  const registeredLeads = activeLeads.filter(
    (lead) => lead.registered || lead.status === "customer",
  ).length;

  const registrationConversionRate =
    activeLeads.length > 0 ? Math.round((registeredLeads / activeLeads.length) * 100) : 0;

  const funnelSteps = [
    {
      label: "Leads",
      count: activeLeads.length,
      desc: "Personas captadas",
    },
    {
      label: "Contactados",
      count: contactedLeads,
      desc: "Con interacción comercial",
    },
    {
      label: "Interesados",
      count: interestedLeads,
      desc: "Con interés identificado",
    },
    {
      label: "Registrados",
      count: registeredLeads,
      desc: "Convertidos en usuarios",
    },
  ];

  const sourceDistribution = useMemo(() => {
    const counts = new Map<string, number>();

    activeLeads.forEach((lead) => {
      const currentSource = lead.source || "other";
      counts.set(currentSource, (counts.get(currentSource) ?? 0) + 1);
    });

    return Array.from(counts.entries()).map(([sourceName, count]) => ({
      source: sourceLabel(sourceName as CommercialSource),
      count,
    }));
  }, [activeLeads]);

  const campaignSummary = useMemo(() => {
    const map = new Map<string, { leads: number; registered: number }>();

    activeLeads.forEach((lead) => {
      const campaignName = lead.campaign || "General";
      const entry = map.get(campaignName) ?? {
        leads: 0,
        registered: 0,
      };

      entry.leads += 1;

      if (lead.registered || lead.status === "customer") {
        entry.registered += 1;
      }

      map.set(campaignName, entry);
    });

    return Array.from(map.entries()).map(([campaignName, data]) => ({
      campaign: campaignName,
      ...data,
      conversion: data.leads > 0 ? Math.round((data.registered / data.leads) * 100) : 0,
    }));
  }, [activeLeads]);
  return (
    <div data-admin-module="comercial" className={cp.workspace}>
      <div className="min-w-0 space-y-3 sm:space-y-4">
      <nav
        aria-label="Áreas de Comercial"
        className={cp.header}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-violet-400/75 via-cyan-400/30 to-transparent" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {isTuktukProject ? (
              <>
                <Button type="button" variant={commercialView === "campanas" ? "default" : "outline"}
                  onClick={() => setCommercialView("campanas")} className="admin-subnav-tab"
                  data-nav-tone="comercial" aria-pressed={commercialView === "campanas"}>
                  <span className="admin-nav-icon" aria-hidden="true"><Target /></span>
                  Campañas
                </Button>
                <Button type="button" variant={commercialView === "resultados" ? "default" : "outline"}
                  onClick={() => setCommercialView("resultados")} className="admin-subnav-tab"
                  data-nav-tone="usuarios" aria-pressed={commercialView === "resultados"}>
                  <span className="admin-nav-icon" aria-hidden="true"><TrendingUp /></span>
                  Resultados
                </Button>
                <Button type="button" variant={showImpulsa ? "default" : "outline"}
                  onClick={() => setCommercialView("impulsa")} className="admin-subnav-tab"
                  data-nav-tone="finanzas" aria-pressed={showImpulsa}>
                  <span className="admin-nav-icon" aria-hidden="true"><Rocket /></span>
                  Impulsa
                </Button>
                <Button type="button" variant={showAllies ? "default" : "outline"}
                  onClick={() => setCommercialView("aliados")} className="admin-subnav-tab"
                  data-nav-tone="comercial" aria-pressed={showAllies}>
                  <span className="admin-nav-icon" aria-hidden="true"><Handshake /></span>
                  Aliados
                </Button>
                <Button type="button" variant={showManagement ? "default" : "outline"}
                  onClick={() => setCommercialView("configuracion")} className="admin-subnav-tab"
                  data-nav-tone="tarifas" aria-pressed={showManagement}>
                  <span className="admin-nav-icon" aria-hidden="true"><Layers /></span>
                  Gestión
                </Button>
              </>
            ) : (
              <Button type="button" variant="default"
                onClick={() => setCommercialView("captacion")} className="admin-subnav-tab"
                data-nav-tone="comercial" aria-pressed={true}>
                <span className="admin-nav-icon" aria-hidden="true"><Megaphone /></span>
                Captación y campañas
              </Button>
            )}
          </div>
        </div>

      </nav>
      {showManagement && (
        <nav aria-label="Herramientas de gestión comercial" className="min-w-0">
          <div className={cp.managementNav}>
            {([
              ["configuracion","Configuración general"],
              ["referidos","Referidos y red"],
              ["ofertas","Beneficios de conductores"],
              ["captacion","Captación y contactos"],
            ] as const).map(([value, label]) => {
              const ChildIcon = managementNavIcons[value];
              return (
              <button
                type="button"
                key={value}
                aria-pressed={commercialView === value}
                onClick={() => setCommercialView(value)}
                className={cp.managementNavItem + " " + (commercialView === value ? cp.managementNavSelected : cp.managementNavUnselected)}
              >
                <ChildIcon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{label}</span>
              </button>
              );
            })}
          </div>
        </nav>
      )}

      {isTuktukProject && commercialView === "campanas" ? (
        <div className="space-y-3">
          <CommercialPageHeader title="Campañas de TukTuk" description="Crea enlaces para atraer pasajeros y consulta sus resultados." icon={Megaphone} />
          <MarketplaceTuktukOfficialAnalytics projectId={projectId} canManage={canManage} mode="generator" />
          <details className={cp.accordion}>
            <summary className={cp.accordionTitle}>
              Promociones con descuentos · En preparación
              <span className="ml-2 text-xs font-normal text-muted-foreground">Solo borradores, no se aplican al pasajero</span>
            </summary>
            <div className={cp.accordionBody}>
              <MarketplaceCustomerCampaignDrafts projectId={projectId} canEdit={canPlanCustomerBenefits} />
            </div>
          </details>
        </div>
      ) : isTuktukProject && commercialView === "resultados" ? (
        <div className="space-y-3">
          <CommercialPageHeader title="Resultados de campañas oficiales" description="Compara cómo llegan los pasajeros y qué acciones terminan en solicitudes. Los informes detallados están debajo." icon={TrendingUp} />
          <ComercialSourceOverview projectId={projectId} />
          <MarketplaceTuktukOfficialAnalytics projectId={projectId} canManage={canManage} mode="analytics" />
        </div>
      ) : showAllies ? (
        <MarketplaceAlliesPanel projectId={projectId} canManage={canManage} />
      ) : showOffers ? (
        <MarketplaceOffersPanel projectId={projectId} canEdit={canEditOffers} />
      ) : showImpulsa ? (
        <section className="space-y-4" aria-label="Impulsa" data-admin-module="comercial">
          <CommercialPageHeader title="Impulsa" description="Resultados de los conductores que promocionan TukTuk: difusión, solicitudes y viajes reales." icon={UsersRound} />
          <MarketplaceImpulsaCommunicationAnalytics projectId={projectId} />
        </section>
      ) : commercialView === "configuracion" && isTuktukProject ? (
        <section className="space-y-3" aria-label="Configuración comercial" data-admin-module="comercial">
          <CommercialPageHeader title="Configuración comercial" description="Políticas vigentes de bienvenida, comisiones y billeteras. Selecciona el bloque que necesites administrar." icon={Layers} />
          {canViewImpulsa ? (
            <div className="space-y-2">
              <CommercialSettingsPanel icon={Gift} title="Bienvenida y cobro general" description="Días gratuitos, comisión general y estado del cobro">
                <MarketplaceWelcomePolicyPanel projectId={projectId} canView={permissions.includes("settings.view")} canEdit={permissions.includes("settings.manage")} embedded />
              </CommercialSettingsPanel>
              <CommercialSettingsPanel icon={TrendingUp} title="Reglas y comisiones de Impulsa" description="Viaje normal, servicio propio y aportación comercial">
                <MarketplaceImpulsaPolicyPanel projectId={projectId} canView={canViewImpulsa} canEdit={canEditImpulsa} embedded />
              </CommercialSettingsPanel>
              <CommercialSettingsPanel icon={Layers} title="Créditos, deuda y retiradas" description="Crédito inicial, retiros y obligaciones pendientes">
                <MarketplaceImpulsaTransitionPanel projectId={projectId} canEdit={canEditImpulsa} embedded />
              </CommercialSettingsPanel>
            </div>
          ) : (
            <div className={cp.inset + " text-sm text-text-secondary"} role="status">Necesitas permiso de configuración para consultar y modificar estas políticas.</div>
          )}
        </section>
      ) : showReferrals ? (
        <CommercialReferralsPanel projectId={projectId} />
      ) : (
        <section className="min-w-0 space-y-3" aria-label="Captación y contactos">
          <CommercialPageHeader
            title="Captación y contactos"
            description="Registra contactos comerciales y sigue su avance hasta convertirse en clientes."
            icon={UsersRound}
            actions={canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="max-sm:min-h-11" onClick={() => setEditingCampaign("new")}>
                  Nueva campaña de contactos
                </Button>
                {Boolean(leads.data?.length) && (
                  <Button size="sm" className="max-sm:min-h-11" onClick={() => setEditing({ ...EMPTY })}>
                    <Plus className="mr-1.5 size-4" aria-hidden="true" /> Nuevo contacto
                  </Button>
                )}
              </div>
            ) : undefined}
          />
          {leads.isPending ? (
            <div role="status" className={cp.inset + " py-6 text-sm text-text-secondary"}>Cargando contactos comerciales…</div>
          ) : leads.isError ? (
            <div role="alert" className={cp.inset + " flex flex-wrap items-center justify-between gap-3"}>
              <p className="text-sm text-text-secondary">No se pudieron consultar los contactos. No se mostrarán cifras hasta recuperar los datos.</p>
              <Button variant="outline" size="sm" className="max-sm:min-h-11" onClick={() => void leads.refetch()}>Reintentar</Button>
            </div>
          ) : (leads.data?.length ?? 0) === 0 ? (
            <div className={cp.inset + " flex flex-col items-start gap-3 px-4 py-6 sm:px-6 sm:py-7"}>
              <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl border border-border-default bg-surface-3 text-[var(--module-accent)]">
                <UsersRound className="size-5" />
              </span>
              <div className="max-w-xl space-y-1">
                <h3 className="text-base font-semibold text-text-primary">Todavía no hay contactos registrados</h3>
                <p className="text-sm leading-relaxed text-text-secondary">
                  Registra el primer contacto para llevar su seguimiento. Las visitas y solicitudes de enlaces se consultan en Resultados.
                </p>
              </div>
              {canManage && <Button className="max-sm:min-h-11" onClick={() => setEditing({ ...EMPTY })}>
                <Plus className="mr-1.5 size-4" aria-hidden="true" /> Registrar primer contacto
              </Button>}
            </div>
          ) : (
            <div className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard density="compact" appearance="premium"
              label="Leads"
              value={activeLeads.length}
              description="Personas captadas"
              icon={Megaphone}
              module="comercial"
            />
            <MetricCard density="compact" appearance="premium"
              label="Contactados"
              value={contactedLeads}
              description="Con interacción comercial"
              icon={History}
              module="comercial"
            />
            <MetricCard density="compact" appearance="premium"
              label="Registrados"
              value={registeredLeads}
              description="Convertidos en usuarios"
              icon={UsersRound}
              semanticState="success"
            />
            <MetricCard density="compact" appearance="premium"
              label="Conversión"
              value={`${registrationConversionRate}%`}
              description="Lead a usuario registrado"
              icon={Layers}
              semanticState="info"
            />
          </div>

          <section aria-label="Embudo comercial" className={cp.inset + " space-y-3"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-primary">Embudo comercial</h3>
              <span className="text-xs text-text-secondary">Proporción de contactos por etapa</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {funnelSteps.map(step => {
                const pct = activeLeads.length > 0 ? Math.round((step.count / activeLeads.length) * 100) : 0;
                return (
                  <div key={step.label} className="min-w-0 space-y-1.5">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="font-medium text-text-primary">{step.label}</span>
                      <span className="tabular-nums text-text-secondary">{pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                      <div className="h-full rounded-full bg-[var(--module-accent)]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <AdminDataTableShell density="compact" appearance="premium"
            title="Leads y seguimiento"
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
              <EmptyState density="compact" appearance="premium"
                icon={Megaphone}
                title="Sin contactos coincidentes"
                description="No hay contactos que coincidan con los filtros actuales."
                module="comercial"
                action={
                  <Button variant="outline" onClick={() => {
                    setSearch(""); setStatus("all"); setSource("all"); setCampaign("all"); setResponsible("all");
                  }}>Limpiar filtros</Button>
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
                                nextActionAt: lead.nextActionAt
                                  ? lead.nextActionAt.slice(0, 16)
                                  : "",
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
              <div className={cp.inset + " flex flex-wrap items-center justify-between gap-3"}>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Análisis de captación</h3>
                  <p className="mt-1 text-xs text-text-secondary">Fuentes y rendimiento de los contactos registrados</p>
                </div>
                <Button variant="outline" size="sm" className="max-sm:min-h-11" aria-expanded={showLeadAnalytics}
                  onClick={() => setShowLeadAnalytics(value => !value)}>
                  {showLeadAnalytics ? "Ocultar análisis" : "Ver análisis"}
                </Button>
              </div>
              {showLeadAnalytics && (
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard density="compact" appearance="premium" title="Distribución por fuente" module="comercial">
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
                <EmptyState density="compact" appearance="premium"
                  icon={Megaphone}
                  title="Sin datos de fuentes"
                  description="No hay fuentes registradas para los leads actuales."
                  module="comercial"
                />
              )}
            </SectionCard>

            <SectionCard density="compact" appearance="premium" title="Rendimiento de campañas" module="comercial">
              {campaignSummary.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaña</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Registrados</TableHead>
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
                          <TableCell className="text-right font-mono">{c.registered}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-400">
                            {c.conversion}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState density="compact" appearance="premium"
                  icon={Layers}
                  title="Sin campañas activas"
                  description="No se registran campañas asociadas a leads en este proyecto."
                  module="comercial"
                />
              )}
            </SectionCard>
          </div>


              )}
            </div>
          )}
        </section>
      )}

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
      <SelectTrigger className={"h-10 text-xs " + cp.control}>
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
    trial: "Prueba (legado)",
    ready_to_charge: "Cobro (legado)",
    customer: "Registrado",
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
      <DialogContent className="max-w-lg admin-graphite-dialog">
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
      <DialogContent className="max-w-lg admin-graphite-dialog">
        <DialogHeader>
          <DialogTitle>Historial de seguimiento: {lead.name}</DialogTitle>
          <DialogDescription>Eventos, notas y cambios de estado del lead.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto py-2">
          {canManage && (
            <div className={cp.inset + " space-y-2"}>
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
      <DialogContent className="max-w-md admin-graphite-dialog">
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
