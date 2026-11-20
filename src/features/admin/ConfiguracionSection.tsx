import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Coins, Gift, Loader2, MessageSquareText, Palette, Plus, Save, Settings2, Smartphone, Upload, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { useProject } from "@/hooks/useProjects";
import { readImageDimensions } from "@/lib/image-file";
import { projectIconVariantUrl } from "@/lib/project-icon-variants";
import {
  supabaseServices,
  type P0ASettings,
  type ProjectSettings,
  type ReferralQualificationMode,
  type WhatsAppSettings,
} from "@/lib/services";

import { SectionCard } from "@/components/admin/SectionCard";
import { premiumColumnHeaderSurface, premiumControlSurface } from "@/components/admin/density";
import PremiumSettingsSnapshot, { type PremiumSettingsMetric } from "./PremiumSettingsSnapshot";

import AppReleaseSettingsCard from "./AppReleaseSettingsCard";
import { PageAlert } from "@/components/admin/PageAlert";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";


type SectionKey =
  | "general"
  | "billing"
  | "referrals"
  | "communication"
  | "application";

const sections: Array<{
  key: SectionKey;
  label: string;
  number: string;
  eyebrow: string;
  description: string;
  icon: LucideIcon;
}> = [
  { key: "general", number: "01", label: "Identidad y marca", eyebrow: "INFORMACIÓN E IDENTIDAD", description: "Nombre, enlaces, logotipo, icono y colores del proyecto.", icon: Palette },
  { key: "billing", number: "02", label: "Monedas y cambio", eyebrow: "PARÁMETROS ECONÓMICOS", description: "Monedas, tipo de cambio, fuente y actualización de la tasa.", icon: Coins },
  { key: "referrals", number: "03", label: "Referidos", eyebrow: "RECOMPENSAS MARKETPLACE", description: "Control de la recompensa de referidos en la billetera.", icon: Gift },
  { key: "communication", number: "04", label: "Comunicación y contacto", eyebrow: "CANALES DE ATENCIÓN", description: "WhatsApp institucional, soporte, pagos y plantillas.", icon: MessageSquareText },
  { key: "application", number: "05", label: "Aplicación y versiones", eyebrow: "EXPERIENCIA Y PUBLICACIÓN", description: "Actualizaciones de Android, mantenimiento y mensaje de bienvenida.", icon: Smartphone },
];

const CONFIG_CONTROL_CLASS = `min-h-11 rounded-[var(--radius-control)] border-border-default bg-surface-3/70 text-text-primary shadow-[var(--shadow-xs)] focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20 ${premiumControlSurface}`;
const CONFIG_SELECT_CLASS = CONFIG_CONTROL_CLASS;
const CONFIG_TEXTAREA_CLASS = `min-h-[88px] rounded-[var(--radius-control)] border-border-default bg-surface-3/70 text-text-primary shadow-[var(--shadow-xs)] focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20 ${premiumControlSurface}`;

const ACTIVE_CAMPAIGN_BADGE_CLASS =
  "border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] text-[var(--semantic-success-foreground)]";

const CLOSED_CAMPAIGN_BADGE_CLASS = "border-border-default bg-surface-2 text-text-secondary";

export default function ConfiguracionSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: project } = useProject(projectId);

  const settingsQuery = useQuery({
    queryKey: ["project-settings", projectId],
    queryFn: () => supabaseServices.projects.settings(projectId),
  });

  const foundationQuery = useQuery({
    queryKey: ["project-foundation-settings", projectId],
    queryFn: () => supabaseServices.foundations.settings(projectId),
  });

  const canManage = foundationQuery.data?.canManageSettings ?? false;
  const canManageWhatsApp = foundationQuery.data?.canManageWhatsapp ?? false;
  const canSave = canManage || canManageWhatsApp;

  const whatsappQuery = useQuery({
    queryKey: ["project-whatsapp-settings", projectId],
    queryFn: () => supabaseServices.projects.whatsappSettings(projectId),
    enabled: canManageWhatsApp,
  });

  const [activeSection, setActiveSection] = useState<SectionKey>("general");
  const [showExtraAppSettings, setShowExtraAppSettings] = useState(false);
  const isMarketplaceReferralProgram = project?.slug === "tuktuk-control";
  const visibleSection = activeSection;
  const currentSection = sections.find((section) => section.key === visibleSection);
  const CurrentSectionIcon = currentSection?.icon ?? Settings2;

  const referralCampaignsQuery = useQuery({
    queryKey: ["referral-campaigns", projectId],
    queryFn: () => supabaseServices.referrals.listCampaigns(projectId),
    enabled: visibleSection === "referrals" && !isMarketplaceReferralProgram,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [form, setForm] = useState<ProjectSettings | null>(null);
  const [foundationForm, setFoundationForm] = useState<P0ASettings | null>(null);
  const [whatsappForm, setWhatsAppForm] = useState<WhatsAppSettings | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignQualificationMode, setCampaignQualificationMode] =
    useState<ReferralQualificationMode>("registration");
  const [campaignRewardDays, setCampaignRewardDays] = useState(15);
  const [marketplaceRewardAmount, setMarketplaceRewardAmount] = useState(100);
  const [marketplaceRewardEnabled, setMarketplaceRewardEnabled] = useState(true);

  const [projectDirty, setProjectDirty] = useState(false);
  const [foundationDirty, setFoundationDirty] = useState(false);
  const [whatsappDirty, setWhatsAppDirty] = useState(false);

  const marketplaceReferralSettingsQuery = useQuery({
    queryKey: ["marketplace-referral-settings", projectId],
    queryFn: () => supabaseServices.foundations.marketplaceReferralRewardSettings(projectId),
    enabled: visibleSection === "referrals" && isMarketplaceReferralProgram,
  });

  useEffect(() => {
    if (marketplaceReferralSettingsQuery.data) {
      setMarketplaceRewardAmount(marketplaceReferralSettingsQuery.data.rewardAmount);
      setMarketplaceRewardEnabled(marketplaceReferralSettingsQuery.data.rewardEnabled);
    }
  }, [marketplaceReferralSettingsQuery.data]);

  const saveMarketplaceReferralReward = useMutation({
    mutationFn: () => supabaseServices.foundations.setMarketplaceReferralRewardSettings(projectId, {
      rewardEnabled: marketplaceRewardEnabled,
      rewardAmount: marketplaceRewardAmount,
      rewardCurrency: "CUP",
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marketplace-referral-settings", projectId] }),
  });

  const isDirty = projectDirty || foundationDirty || whatsappDirty;

  useEffect(() => {
    if (!project || !settingsQuery.data || projectDirty) {
      return;
    }

    setName(project.name);
    setDescription(project.description);
    setForm(settingsQuery.data);
  }, [project, settingsQuery.data, projectDirty]);

  useEffect(() => {
    if (!foundationQuery.data || foundationDirty) return;
    setFoundationForm(foundationQuery.data);
  }, [foundationQuery.data, foundationDirty]);

  useEffect(() => {
    if (!whatsappQuery.data || whatsappDirty) {
      return;
    }

    setWhatsAppForm(whatsappQuery.data);
  }, [whatsappQuery.data, whatsappDirty]);

  const save = useMutation({
    mutationFn: async () => {
      if (projectDirty) {
        if (!canManage || !form) {
          throw new Error("No tienes permisos para modificar la configuración del proyecto.");
        }

        if (!name.trim()) {
          throw new Error("El nombre del proyecto no puede quedar vacío.");
        }

        await supabaseServices.projects.update(projectId, {
          ...form,
          name: name.trim(),
          description: description.trim(),
        });
      }

      if (foundationDirty) {
        if (!canManage || !foundationForm || !foundationQuery.data) {
          throw new Error("No tienes permisos para modificar la configuración operativa.");
        }

        if (foundationForm.currentRate <= 0 || !foundationForm.rateSource.trim()) {
          throw new Error("La tasa debe ser mayor que cero y tener una fuente.");
        }

        if (!isMarketplaceReferralProgram && (foundationForm.referralRewardDays < 1 || foundationForm.referralRewardDays > 365)) {
          throw new Error("La recompensa por referido debe estar entre 1 y 365 días.");
        }

        const original = foundationQuery.data;

        const exchangeChanged =
          original.baseCurrency !== foundationForm.baseCurrency ||
          original.chargeCurrency !== foundationForm.chargeCurrency ||
          original.rateMode !== foundationForm.rateMode ||
          original.currentRate !== foundationForm.currentRate ||
          original.rateSource !== foundationForm.rateSource;

        if (exchangeChanged) {
          await supabaseServices.foundations.updateExchangeSettings(projectId, {
            baseCurrency: foundationForm.baseCurrency,
            chargeCurrency: foundationForm.chargeCurrency,
            rateMode: foundationForm.rateMode,
            currentRate: foundationForm.currentRate,
            rateSource: foundationForm.rateSource.trim(),
          });
        }

        if (!isMarketplaceReferralProgram && original.referralRewardDays !== foundationForm.referralRewardDays) {
          await supabaseServices.foundations.setReferralRewardDays(
            projectId,
            foundationForm.referralRewardDays,
          );
        }

        if (original.testModeEnabled !== foundationForm.testModeEnabled) {
          await supabaseServices.foundations.setTestMode(projectId, foundationForm.testModeEnabled);
        }
      }

      if (whatsappDirty) {
        if (!canManageWhatsApp || !whatsappForm) {
          throw new Error("No tienes permisos para modificar WhatsApp.");
        }

        await supabaseServices.projects.updateWhatsAppSettings(projectId, whatsappForm);
      }
    },

    onSuccess: async () => {
      setProjectDirty(false);
      setFoundationDirty(false);
      setWhatsAppDirty(false);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["project", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["project-settings", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["project-foundation-settings", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["project-whatsapp-settings", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["user-projects"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-audit", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["business-audit-events", projectId],
        }),
      ]);

      toast.success("Configuración guardada correctamente.");
    },

    onError: (error: Error) => toast.error(error.message),
  });

  const uploadBrandAsset = useMutation({
    mutationFn: ({ kind, file }: { kind: "logo" | "favicon"; file: File }) =>
      supabaseServices.projects.uploadBrandAsset(projectId, kind, file, {
        iconBackgroundColor: form?.secondaryColor,
      }),

    onSuccess: (url, variables) => {
      const key = variables.kind === "logo" ? "logoUrl" : "iconUrl";

      setForm((current) =>
        current
          ? {
              ...current,
              [key]: url,
            }
          : current,
      );

      setProjectDirty(true);

      toast.success(
        variables.kind === "logo"
          ? "Logo subido. Guarda los cambios para aplicarlo."
          : "Icono maestro y variantes generados. Guarda los cambios para aplicarlos.",
      );
    },

    onError: (error: Error) => toast.error(error.message),
  });

  const selectBrandAsset = async (kind: "logo" | "favicon", file: File) => {
    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("El archivo no puede superar 2 MB.");
      }

      if (kind === "logo") {
        if (file.type !== "image/png" && file.type !== "image/webp") {
          throw new Error("El logo completo debe ser un archivo PNG o WEBP.");
        }

        const { width, height } = await readImageDimensions(file);
        const ratio = width / height;

        if (ratio < 2 || ratio > 3) {
          throw new Error("El logo completo debe tener una proporción horizontal entre 2:1 y 3:1.");
        }
      } else {
        if (file.type !== "image/png") {
          throw new Error("El icono maestro debe ser un archivo PNG de 1024 × 1024 px.");
        }

        const { width, height } = await readImageDimensions(file);

        if (width !== 1024 || height !== 1024) {
          throw new Error("El icono maestro debe medir exactamente 1024 × 1024 px.");
        }
      }

      uploadBrandAsset.mutate({ kind, file });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo validar la imagen.");
    }
  };

  const startReferralCampaign = useMutation({
    mutationFn: async () => {
      if (!canManage) {
        throw new Error("No tienes permisos para administrar campañas de referidos.");
      }

      if (!campaignName.trim()) {
        throw new Error("Indica el nombre de la campaña.");
      }

      if (
        !Number.isInteger(campaignRewardDays) ||
        campaignRewardDays < 1 ||
        campaignRewardDays > 365
      ) {
        throw new Error("La recompensa debe estar entre 1 y 365 días.");
      }

      return supabaseServices.referrals.startCampaign(projectId, {
        name: campaignName.trim(),
        qualificationMode: campaignQualificationMode,
        rewardDays: campaignRewardDays,
      });
    },
    onSuccess: async () => {
      setCampaignName("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["referral-campaigns", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-foundation-settings", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["business-audit-events", projectId] }),
      ]);
      toast.success("Nueva campaña de referidos iniciada correctamente.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => {
    setProjectDirty(true);
    setForm((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  };

  const updateFoundation = <K extends keyof P0ASettings>(key: K, value: P0ASettings[K]) => {
    setFoundationDirty(true);
    setFoundationForm((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  };

  const updateWhatsApp = <K extends keyof WhatsAppSettings>(key: K, value: WhatsAppSettings[K]) => {
    setWhatsAppDirty(true);
    setWhatsAppForm((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  };

  const handleBaseCurrencyChange = (value: P0ASettings["baseCurrency"]) => {
    updateFoundation("baseCurrency", value);
    update("currency", value);
  };

  if (
    settingsQuery.isLoading ||
    foundationQuery.isLoading ||
    !project ||
    !form ||
    !foundationForm
  ) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (settingsQuery.isError || foundationQuery.isError) {
    const message =
      settingsQuery.error?.message ??
      foundationQuery.error?.message ??
      "No se pudo cargar la configuración.";

    return (
      <PageAlert tone="error" title="No se pudo cargar la configuración">
        {message}
      </PageAlert>
    );
  }

  const premiumMetrics: PremiumSettingsMetric[] = visibleSection === "general"
    ? [
        { label: "Proyecto", value: name.trim() || "Sin nombre", hint: "Identidad administrativa" },
        { label: "Logotipo", value: form.logoUrl ? "Configurado" : "Pendiente", hint: "Marca principal", tone: form.logoUrl ? "success" : "default" },
        { label: "Icono", value: form.iconUrl ? "Configurado" : "Pendiente", hint: "Aplicación y avisos", tone: form.iconUrl ? "success" : "default" },
      ]
    : visibleSection === "billing"
      ? [
          { label: "Moneda base", value: foundationForm.baseCurrency, hint: "Referencia de cálculo" },
          { label: "Moneda de cobro", value: foundationForm.chargeCurrency, hint: "Operaciones" },
          { label: "Tipo de cambio", value: Number.isFinite(foundationForm.currentRate) ? foundationForm.currentRate.toLocaleString("es-CU") : "No disponible", hint: foundationForm.rateMode === "automatic" ? "Fuente automática" : "Gestión manual" },
        ]
      : visibleSection === "referrals"
        ? isMarketplaceReferralProgram ? [
            { label: "Programa", value: marketplaceReferralSettingsQuery.isLoading ? "Consultando" : marketplaceReferralSettingsQuery.isError ? "No disponible" : marketplaceRewardEnabled ? "Activo" : "Pausado", hint: "Recompensa por primer servicio", tone: marketplaceReferralSettingsQuery.isError ? "default" : marketplaceRewardEnabled ? "success" : "default" },
            { label: "Recompensa", value: marketplaceReferralSettingsQuery.isLoading ? "Consultando" : marketplaceReferralSettingsQuery.isError ? "No disponible" : marketplaceRewardAmount.toLocaleString("es-CU") + " CUP", hint: "Por referido válido" },
            { label: "Liquidación", value: "Billetera", hint: "Sin alterar historial" },
          ] : [
            { label: "Programa", value: "Campañas", hint: "Gestión por períodos" },
            { label: "Campaña activa", value: referralCampaignsQuery.isLoading ? "Consultando" : referralCampaignsQuery.isError ? "No disponible" : referralCampaignsQuery.data?.some((campaign) => campaign.status === "active") ? "Activa" : "Sin campaña", hint: "Estado del programa" },
            { label: "Historial", value: referralCampaignsQuery.isLoading ? "Consultando" : referralCampaignsQuery.isError ? "No disponible" : String(referralCampaignsQuery.data?.length ?? 0), hint: "Campañas registradas" },
          ]
        : visibleSection === "communication"
          ? [
              { label: "WhatsApp institucional", value: form.whatsapp.trim() ? "Configurado" : "Pendiente", hint: "Identidad del proyecto" },
              { label: "Soporte", value: canManageWhatsApp && whatsappForm ? whatsappForm.supportEnabled ? "Activo" : "Inactivo" : "Acceso limitado", hint: "Canal de atención", tone: whatsappForm?.supportEnabled ? "success" : "default" },
              { label: "Pagos", value: canManageWhatsApp && whatsappForm ? whatsappForm.paymentEnabled ? "Activo" : "Inactivo" : "Acceso limitado", hint: "Canal de cobros", tone: whatsappForm?.paymentEnabled ? "success" : "default" },
            ]
          : [
              { label: "Mantenimiento", value: form.maintenanceMode ? "Activado" : "Desactivado", hint: form.maintenanceMode ? "Revisar impacto en usuarios" : "Acceso general disponible", tone: form.maintenanceMode ? "warning" : "success" },
              { label: "Bienvenida", value: form.welcomeMessage.trim() ? "Configurada" : "Pendiente", hint: "Mensaje de entrada" },
              { label: "Versiones Android", value: "Gestionar", hint: "Publicación y seguimiento" },
            ];

  return (
    <div data-admin-module="configuracion" className="min-w-0 space-y-3">
      <section aria-label="Categorías de ajustes del proyecto" className={`min-w-0 rounded-[var(--radius-card)] border border-border-default p-2 shadow-[var(--shadow-xs)] ${premiumColumnHeaderSurface}`}>
        <div className="hidden items-center justify-between gap-3 px-2 pb-2 pt-1 md:flex">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">Ajustes del proyecto</p>
          {isDirty && <Badge variant="outline" className="border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] text-[var(--semantic-warning-foreground)]">Cambios sin guardar</Badge>}
        </div>
        {/* En móvil un selector sustituye las tres filas de botones. APK queda a un toque. */}
        <nav aria-label="Cambiar módulo de configuración" className="flex min-w-0 items-center gap-2 md:hidden">
          <Select value={visibleSection} onValueChange={(value) => setActiveSection(value as SectionKey)}>
            <SelectTrigger aria-label="Elegir categoría de configuración" className={`min-h-11 min-w-0 flex-1 ${CONFIG_SELECT_CLASS}`}>
              <SelectValue placeholder="Elegir categoría" />
            </SelectTrigger>
            <SelectContent>
              {sections.map(section => (
                <SelectItem key={section.key} value={section.key}>{section.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {visibleSection !== "application" && (
            <Button type="button" variant="outline" size="sm"
              className="min-h-11 shrink-0 gap-1.5 px-3"
              onClick={() => setActiveSection("application")}
              aria-label="Abrir aplicación y versiones APK Android">
              <Smartphone className="size-4" aria-hidden="true" /> APK
            </Button>
          )}
          {isDirty && <span className="size-2 shrink-0 rounded-full bg-[var(--semantic-warning)]" role="status" aria-label="Cambios sin guardar" />}
        </nav>
        <nav aria-label="Categorías de configuración en escritorio" className="hidden min-w-0 grid-cols-5 gap-1.5 md:grid">
          {sections.map(section => {
            const Icon = section.icon;
            const selected = visibleSection === section.key;
            return (
              <button type="button" key={section.key}
                aria-current={selected ? "page" : undefined}
                onClick={() => setActiveSection(section.key)}
                className={"flex min-h-11 min-w-0 items-center gap-2 rounded-[var(--radius-control)] border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 " +
                  (selected
                    ? "border-[var(--module-border)] bg-[var(--module-surface)] text-text-primary shadow-[inset_0_-2px_var(--module-accent)]"
                    : "border-transparent text-text-secondary hover:border-border-default hover:bg-surface-3/70 hover:text-text-primary")}
              >
                <span className={"grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] border " +
                  (selected ? "border-[var(--module-border)] bg-[var(--module-surface)] text-[var(--module-accent)]" : "border-border-default bg-surface-3/65 text-text-secondary")}
                  aria-hidden="true"><Icon className="size-4" /></span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold leading-tight">{section.label}</span>
                  {section.key === "application" && <span className="block text-[11px] text-text-secondary">APK Android</span>}
                </span>
              </button>
            );
          })}
        </nav>
        {canSave && isDirty && (
          <div className="pt-2 md:hidden">
            <Button type="button" size="sm" className="min-h-11 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Guardar cambios
            </Button>
          </div>
        )}
        {canSave && isDirty && (
          <div className="hidden justify-end pt-2 md:flex">
            <Button type="button" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Guardar cambios
            </Button>
          </div>
        )}
      </section>
      {isMarketplaceReferralProgram && visibleSection !== "application" && (
        <div className="hidden md:block">
          <PremiumSettingsSnapshot
          number={currentSection?.number ?? "01"}
          eyebrow={currentSection?.eyebrow ?? "AJUSTES"}
          title={currentSection?.label ?? "Ajustes"}
          description={currentSection?.description ?? ""}
          icon={CurrentSectionIcon}
          metrics={premiumMetrics}
        />
        </div>
      )}
      {visibleSection === "general" ? (
        <div className="space-y-3">
          <SectionCard density="compact" appearance="premium"
            title="Datos principales"
            description="Información de la agencia y contacto institucional."
            module="configuracion"
          >
            <div className="grid gap-x-3 gap-y-2.5 md:grid-cols-2 xl:grid-cols-6">
              <div className="order-1 space-y-1.5 md:col-span-2 xl:col-span-2">
                <Label>Nombre del proyecto</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setProjectDirty(true);
                  }}
                  disabled={!canManage}
                />
              </div>

              <div className="order-4 space-y-1.5 md:col-span-2 xl:col-span-6">
                <Label>Descripción</Label>
                <Textarea
                  className={CONFIG_TEXTAREA_CLASS}
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setProjectDirty(true);
                  }}
                  disabled={!canManage}
                />
              </div>

              <div className="order-2 space-y-1.5 xl:col-span-2">
                <Label>Correo de soporte</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  type="email"
                  value={form.supportEmail}
                  onChange={(event) => update("supportEmail", event.target.value)}
                  disabled={!canManage}
                />
              </div>

              <div className="order-3 space-y-1.5 xl:col-span-2">
                <Label>Sitio web oficial</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  value={form.websiteUrl}
                  onChange={(event) => update("websiteUrl", event.target.value)}
                  disabled={!canManage}
                />
              </div>

              <details className="group order-5 min-w-0 rounded-[var(--radius-compact)] border border-border-default bg-surface-2/55 md:col-span-2 xl:col-span-6">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-text-primary marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>Enlaces legales</span>
                  <ChevronDown className="size-4 text-text-secondary transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="grid grid-cols-1 gap-3 border-t border-border-subtle p-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Política de privacidad</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  value={form.privacyUrl}
                  onChange={(event) => update("privacyUrl", event.target.value)}
                  disabled={!canManage}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Términos y condiciones</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  value={form.termsUrl}
                  onChange={(event) => update("termsUrl", event.target.value)}
                  disabled={!canManage}
                />
              </div>
                </div>
              </details>
            </div>
          </SectionCard>

          <SectionCard density="compact" appearance="premium"
            title="Marca e identidad visual"
            description="Recursos visuales utilizados por el proyecto."
            module="configuracion"
          >
            <div className="grid gap-x-3 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="grid gap-2 md:col-span-2 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-end xl:col-span-2">
                <div className="space-y-1.5">
                  <Label>Logo completo</Label>
                  <Input
                    id="project-logo"
                    type="file"
                    accept="image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        void selectBrandAsset("logo", file);
                      }

                      event.target.value = "";
                    }}
                    disabled={!canManage || uploadBrandAsset.isPending}
                  />

                  <Button
                    asChild
                    type="button"
                    variant="outline"
                    size="sm"
                    className={
                      !canManage || uploadBrandAsset.isPending
                        ? "pointer-events-none w-full opacity-50"
                        : "w-full"
                    }
                  >
                    <label htmlFor="project-logo">
                      {uploadBrandAsset.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Upload />
                      )}
                      {form.logoUrl ? "Reemplazar logo completo" : "Subir logo completo"}
                    </label>
                  </Button>

                  <p className="text-xs leading-relaxed text-text-tertiary">
                    Se utiliza en pantallas, documentos y comunicaciones. PNG o WEBP · máximo 2 MB ·
                    proporción horizontal entre 2:1 y 3:1 · lienzo recomendado 1600 × 600.
                  </p>
                </div>

                <div className="flex h-24 w-full items-center justify-center rounded-[var(--radius-compact)] border border-border-default bg-surface-2 p-2 sm:w-[120px]">
                  {form.logoUrl ? (
                    <img
                      src={form.logoUrl}
                      alt="Vista previa del logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-text-tertiary">Sin logo</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 xl:col-span-2">
                <div className="space-y-1.5">
                  <Label>Icono maestro</Label>
                  <Input
                    id="project-favicon"
                    type="file"
                    accept="image/png"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        void selectBrandAsset("favicon", file);
                      }

                      event.target.value = "";
                    }}
                    disabled={!canManage || uploadBrandAsset.isPending}
                  />

                  <Button
                    asChild
                    type="button"
                    variant="outline"
                    size="sm"
                    className={
                      !canManage || uploadBrandAsset.isPending
                        ? "pointer-events-none w-full opacity-50"
                        : "w-full"
                    }
                  >
                    <label htmlFor="project-favicon">
                      {uploadBrandAsset.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Upload />
                      )}
                      {form.iconUrl ? "Reemplazar icono maestro" : "Subir icono maestro"}
                    </label>
                  </Button>

                  <p className="text-xs leading-relaxed text-text-tertiary">
                    PNG 1024 × 1024 · fondo transparente obligatorio · mantén el símbolo dentro de
                    la zona segura · máximo 2 MB. Al subirlo se generan automáticamente las
                    variantes de favicon, PWA, Windows, Android, shortcuts y notificaciones sin
                    alterar la identidad.
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <IconMasterPreview label="Cuadrado" shape="square" url={form.iconUrl} />
                  <IconMasterPreview label="Círculo" shape="circle" url={form.iconUrl} />
                  <IconMasterPreview label="Redondeado" shape="rounded" url={form.iconUrl} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Color primario</Label>
                <div className="flex items-center gap-2">
                  <div
                    className="h-10 w-10 shrink-0 rounded-[var(--radius-control)] border border-border-default"
                    style={{
                      backgroundColor: form.primaryColor,
                    }}
                  />
                  <Input
                    className={CONFIG_CONTROL_CLASS}
                    value={form.primaryColor}
                    onChange={(event) => update("primaryColor", event.target.value)}
                    disabled={!canManage}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Color secundario</Label>
                <div className="flex items-center gap-2">
                  <div
                    className="h-10 w-10 shrink-0 rounded-[var(--radius-control)] border border-border-default"
                    style={{
                      backgroundColor: form.secondaryColor,
                    }}
                  />
                  <Input
                    className={CONFIG_CONTROL_CLASS}
                    value={form.secondaryColor}
                    onChange={(event) => update("secondaryColor", event.target.value)}
                    disabled={!canManage}
                  />
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {visibleSection === "billing" ? (
        <div className="space-y-3">
          <SectionCard density="compact" appearance="premium"
            title="Monedas y tipo de cambio"
            description="Define las monedas y el tipo de cambio utilizados por Marketplace."
            module="configuracion"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Moneda base</Label>
                <Select
                  value={foundationForm.baseCurrency}
                  onValueChange={(value) =>
                    handleBaseCurrencyChange(value as P0ASettings["baseCurrency"])
                  }
                  disabled={!canManage}
                >
                  <SelectTrigger className={CONFIG_SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUP">CUP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Moneda de cobro</Label>
                <Select
                  value={foundationForm.chargeCurrency}
                  onValueChange={(value) =>
                    updateFoundation("chargeCurrency", value as P0ASettings["chargeCurrency"])
                  }
                  disabled={!canManage}
                >
                  <SelectTrigger className={CONFIG_SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUP">CUP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Modo de tasa</Label>
                <Select
                  value={foundationForm.rateMode}
                  onValueChange={(value) =>
                    updateFoundation("rateMode", value as P0ASettings["rateMode"])
                  }
                  disabled={!canManage}
                >
                  <SelectTrigger className={CONFIG_SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem
                      value="automatic"
                      disabled={foundationForm.rateMode !== "automatic"}
                    >
                      Automática — elTOQUE
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Tasa actual</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  type="number"
                  min={0.000001}
                  step="any"
                  value={foundationForm.currentRate}
                  onChange={(event) => updateFoundation("currentRate", Number(event.target.value))}
                  disabled={!canManage || foundationForm.rateMode === "automatic"}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Fuente de la tasa</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  value={foundationForm.rateSource}
                  onChange={(event) => updateFoundation("rateSource", event.target.value)}
                  placeholder="Ej. Tasa manual administrativa"
                  disabled={!canManage || foundationForm.rateMode === "automatic"}
                />
              </div>

              <p className="flex items-center gap-2 rounded-xl border border-cyan-400/15 bg-cyan-300/[0.035] px-3.5 py-3 text-xs text-text-secondary md:col-span-2">
                Última actualización: {formatDateTime(foundationForm.rateUpdatedAt)}
              </p>

              {foundationForm.rateMode === "automatic" ? (
                <PageAlert
                  tone="success"
                  title="Tasa administrada automáticamente"
                  className="md:col-span-2"
                >
                  La tasa y su fuente se actualizan desde Integraciones → elTOQUE. Para modificarlas
                  manualmente, cambia primero el modo de tasa a Manual.
                </PageAlert>
              ) : null}
            </div>
          </SectionCard>

        </div>
      ) : null}

      {visibleSection === "referrals" ? (
        <div className="space-y-3">
          {isMarketplaceReferralProgram ? (
            <SectionCard density="compact" appearance="premium" title="Recompensa Marketplace" description="El importe se acredita en la billetera Marketplace cuando el referido completa su primer trabajo válido." module="configuracion">
              {marketplaceReferralSettingsQuery.isError ? <PageAlert tone="error">No se pudo cargar la configuración vigente de recompensas Marketplace.</PageAlert> : null}
              <div className="grid gap-4 lg:grid-cols-[minmax(250px,1.2fr)_minmax(220px,1fr)_auto] lg:items-center">
                <SettingToggle title="Programa de referidos" description="Activa o desactiva la recompensa vigente." checked={marketplaceRewardEnabled} onCheckedChange={setMarketplaceRewardEnabled} disabled={!canManage} />
                <div className="space-y-1.5"><Label>Recompensa por referido (CUP)</Label><Input className={CONFIG_CONTROL_CLASS} type="number" min={0.01} step="0.01" value={marketplaceRewardAmount} onChange={(event) => setMarketplaceRewardAmount(Number(event.target.value))} disabled={!canManage} /></div>
                <Button disabled={!canManage || marketplaceReferralSettingsQuery.isLoading || marketplaceReferralSettingsQuery.isError || marketplaceRewardAmount <= 0 || saveMarketplaceReferralReward.isPending} onClick={() => saveMarketplaceReferralReward.mutate()}>Guardar recompensa</Button>
              </div>
              <p className="mt-3 text-xs text-text-tertiary">Los días y campañas anteriores se conservan solo como histórico y no pueden iniciar nuevas recompensas para TukTuk.</p>
            </SectionCard>
          ) : null}
          {!isMarketplaceReferralProgram ? (
          <SectionCard density="compact" appearance="premium"
            title="Programa de referidos"
            description="Cada campaña conserva su condición y recompensa para no alterar relaciones ni beneficios históricos."
            module="configuracion"
          >
            {referralCampaignsQuery.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : referralCampaignsQuery.isError ? (
              <PageAlert tone="error" title="No se pudieron cargar las campañas">
                {referralCampaignsQuery.error.message}
              </PageAlert>
            ) : (
              (() => {
                const campaigns = referralCampaignsQuery.data ?? [];
                const activeCampaign = campaigns.find((campaign) => campaign.status === "active");

                return activeCampaign ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-text-primary">Campaña activa</p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <ReferralCampaignDetail label="Nombre" value={activeCampaign.name} />
                      <ReferralCampaignDetail
                        label="Condición"
                        value={formatReferralQualificationMode(activeCampaign.qualificationMode)}
                      />
                      <ReferralCampaignDetail
                        label="Recompensa"
                        value={`${activeCampaign.rewardDays} días`}
                      />
                      <ReferralCampaignDetail
                        label="Inicio"
                        value={formatDateTime(activeCampaign.startsAt)}
                      />
                      <ReferralCampaignDetail label="Estado" value="Activa" tone="success" />
                    </div>
                  </div>
                ) : (
                  <PageAlert tone="info" title="Sin campaña activa">
                    Inicia una campaña para definir cuándo se califican las nuevas recompensas.
                  </PageAlert>
                );
              })()
            )}
          </SectionCard>
          ) : null}
          {canManage && !isMarketplaceReferralProgram ? (
            <SectionCard density="compact" appearance="premium"
              title="Iniciar nueva campaña"
              description="La campaña activa se cerrará al crear la nueva. Las reglas históricas no se modificarán."
              module="configuracion"
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_160px_auto] xl:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="referral-campaign-name">Nombre de campaña</Label>
                  <Input
                    id="referral-campaign-name"
                    className={CONFIG_CONTROL_CLASS}
                    value={campaignName}
                    onChange={(event) => setCampaignName(event.target.value)}
                    placeholder="Ej. Lanzamiento TukTuk Control"
                    disabled={isMarketplaceReferralProgram || startReferralCampaign.isPending}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Condición</Label>
                  <Select
                    value={campaignQualificationMode}
                    onValueChange={(value) =>
                      setCampaignQualificationMode(value as ReferralQualificationMode)
                    }
                    disabled={isMarketplaceReferralProgram || startReferralCampaign.isPending}
                  >
                    <SelectTrigger className={CONFIG_SELECT_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="registration">Al registrarse en la aplicación</SelectItem>
                      <SelectItem value="first_payment">Al realizar su primer pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="referral-campaign-days">Días de recompensa</Label>
                  <Input
                    id="referral-campaign-days"
                    className={CONFIG_CONTROL_CLASS}
                    type="number"
                    min={1}
                    max={365}
                    value={campaignRewardDays}
                    onChange={(event) => setCampaignRewardDays(Number(event.target.value))}
                    disabled={isMarketplaceReferralProgram || startReferralCampaign.isPending}
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => startReferralCampaign.mutate()}
                  disabled={isMarketplaceReferralProgram || startReferralCampaign.isPending}
                >
                  {startReferralCampaign.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Iniciar campaña
                </Button>
              </div>
            </SectionCard>
          ) : !isMarketplaceReferralProgram ? (
            <PageAlert tone="info" title="Acceso restringido">
              Puedes consultar las campañas, pero no tienes permiso para iniciar o cerrar campañas.
            </PageAlert>
          ) : null}

          {!isMarketplaceReferralProgram ? (
          <SectionCard density="compact" appearance="premium"
            title="Historial de campañas"
            description="Las campañas cerradas conservan las condiciones con las que se emitieron las recompensas."
            module="configuracion"
          >
            {referralCampaignsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : referralCampaignsQuery.isError ? (
              <PageAlert tone="error">No se pudo cargar el historial de campañas.</PageAlert>
            ) : referralCampaignsQuery.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border-default text-xs font-medium uppercase tracking-wide text-text-tertiary">
                    <tr>
                      <th className="px-3 py-2">Campaña</th>
                      <th className="px-3 py-2">Condición</th>
                      <th className="px-3 py-2">Días</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Inicio</th>
                      <th className="px-3 py-2">Cierre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referralCampaignsQuery.data.map((campaign) => (
                      <tr
                        key={campaign.id}
                        className="border-b border-border-default/70 last:border-0"
                      >
                        <td className="px-3 py-3 font-medium text-text-primary">{campaign.name}</td>
                        <td className="px-3 py-3 text-text-secondary">
                          {formatReferralQualificationMode(campaign.qualificationMode)}
                        </td>
                        <td className="px-3 py-3 text-text-secondary">
                          {campaign.rewardDays} días
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            variant="outline"
                            className={
                              campaign.status === "active"
                                ? ACTIVE_CAMPAIGN_BADGE_CLASS
                                : CLOSED_CAMPAIGN_BADGE_CLASS
                            }
                          >
                            {campaign.status === "active" ? "Activa" : "Cerrada"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-text-secondary">
                          {formatDateTime(campaign.startsAt)}
                        </td>
                        <td className="px-3 py-3 text-text-secondary">
                          {campaign.endsAt ? formatDateTime(campaign.endsAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <PageAlert tone="info" title="Sin campañas registradas">
                Cuando inicies una campaña aparecerá aquí su historial completo.
              </PageAlert>
            )}
          </SectionCard>
          ) : null}
        </div>
      ) : null}

      {visibleSection === "communication" ? (
        <div className="space-y-3">
          <SectionCard density="compact" appearance="premium"
            title="Contacto institucional"
            description="Datos utilizados por la identidad del proyecto y sus documentos."
            module="configuracion"
          >
            <div className="max-w-xl space-y-1.5">
              <Label>WhatsApp institucional</Label>
              <Input
                className={CONFIG_CONTROL_CLASS}
                value={form.whatsapp}
                onChange={(event) => update("whatsapp", event.target.value)}
                placeholder="+53..."
                disabled={!canManage}
              />
            </div>
          </SectionCard>

          <SectionCard density="compact" appearance="premium"
            title="Canales operativos de WhatsApp"
            description="Configura soporte y cobros de forma independiente."
            module="configuracion"
          >
            {!canManageWhatsApp ? (
              <PageAlert tone="info" title="Acceso restringido">
                No tienes permiso para modificar la configuración operativa de WhatsApp.
              </PageAlert>
            ) : whatsappQuery.isLoading || !whatsappForm ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="mb-1 text-sm font-semibold text-foreground">Números operativos</p>
                  <p className="mb-3 text-xs text-text-secondary">Cada número cumple una función distinta en la atención del Marketplace.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Número general</Label>
                    <Input
                      className={CONFIG_CONTROL_CLASS}
                      value={whatsappForm.fallbackNumber}
                      onChange={(event) => updateWhatsApp("fallbackNumber", event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Número de soporte</Label>
                    <Input
                      className={CONFIG_CONTROL_CLASS}
                      value={whatsappForm.supportNumber}
                      onChange={(event) => updateWhatsApp("supportNumber", event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Número para pagos</Label>
                    <Input
                      className={CONFIG_CONTROL_CLASS}
                      value={whatsappForm.paymentNumber}
                      onChange={(event) => updateWhatsApp("paymentNumber", event.target.value)}
                    />
                  </div>
                </div>

                <div className="border-t border-cyan-400/10 pt-4">
                  <p className="mb-3 text-sm font-semibold text-foreground">Canales habilitados</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <SettingToggle
                    title="Soporte por WhatsApp"
                    description="Muestra el canal de soporte cuando corresponda."
                    checked={whatsappForm.supportEnabled}
                    onCheckedChange={(checked) => updateWhatsApp("supportEnabled", checked)}
                  />

                  <SettingToggle
                    title="Pagos por WhatsApp"
                    description="Habilita el canal de contacto asociado a pagos."
                    checked={whatsappForm.paymentEnabled}
                    onCheckedChange={(checked) => updateWhatsApp("paymentEnabled", checked)}
                  />
                </div>

                <div className="border-t border-cyan-400/10 pt-4">
                  <p className="mb-1 text-sm font-semibold text-foreground">Botones y mensajes</p>
                  <p className="mb-3 text-xs text-text-secondary">Textos visibles y plantillas de contacto para soporte y pagos.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Texto del botón de soporte</Label>
                    <Input
                      className={CONFIG_CONTROL_CLASS}
                      value={whatsappForm.supportButtonText}
                      onChange={(event) => updateWhatsApp("supportButtonText", event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Texto del botón de pagos</Label>
                    <Input
                      className={CONFIG_CONTROL_CLASS}
                      value={whatsappForm.paymentButtonText}
                      onChange={(event) => updateWhatsApp("paymentButtonText", event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Plantilla de soporte</Label>
                    <Textarea
                      className={CONFIG_TEXTAREA_CLASS}
                      value={whatsappForm.supportTemplate}
                      onChange={(event) => updateWhatsApp("supportTemplate", event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Plantilla de pago</Label>
                    <Textarea
                      className={CONFIG_TEXTAREA_CLASS}
                      value={whatsappForm.paymentTemplate}
                      onChange={(event) => updateWhatsApp("paymentTemplate", event.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {visibleSection === "application" ? (
        <div className="space-y-3">
          <AppReleaseSettingsCard projectId={projectId} canManage={canManage} hasUnsavedProjectChanges={projectDirty} />
          <button type="button" aria-expanded={showExtraAppSettings}
            aria-controls="app-extra-settings"
            onClick={() => setShowExtraAppSettings((prev) => !prev)}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border-default bg-surface-1 px-3 py-2 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="min-w-0">
              <strong className="block text-sm font-semibold text-text-primary">Otros ajustes de la aplicación</strong>
              <span className="block text-xs text-text-secondary">
                {form.maintenanceMode ? "Atención: mantenimiento activo · " : ""}Modo mantenimiento y mensaje de bienvenida
              </span>
            </span>
            {showExtraAppSettings
              ? <ChevronUp className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              : <ChevronDown className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
          </button>
          {showExtraAppSettings ? (
          <div id="app-extra-settings">
        <SectionCard density="compact" appearance="premium"
          title="Acceso y bienvenida"
          module="configuracion"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {form.maintenanceMode ? (
              <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.08] p-4 text-sm text-amber-100 md:col-span-2">
                <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-300" />
                El modo mantenimiento está seleccionado. Verifica su impacto antes de guardar los cambios.
              </div>
            ) : null}

            <SettingToggle
              title="Modo mantenimiento"
              description="Bloquea temporalmente el acceso general mientras se realizan trabajos administrativos."
              checked={form.maintenanceMode}
              onCheckedChange={(checked) => update("maintenanceMode", checked)}
              disabled={!canManage}
            />

            <div className="space-y-1.5 md:col-span-2">
              <Label>Mensaje de bienvenida</Label>
              <Textarea
                className={CONFIG_TEXTAREA_CLASS}
                value={form.welcomeMessage}
                onChange={(event) => update("welcomeMessage", event.target.value)}
                disabled={!canManage}
              />
            </div>
          </div>
        </SectionCard>
          </div>
          ) : null}
        </div>
      ) : null}



    </div>
  );
}

function SettingToggle({
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border-default bg-surface-2/65 px-3 py-3 sm:px-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">{description}</p>
      </div>

      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="shrink-0"
      />
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No disponible";
  }

  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatReferralQualificationMode(mode: ReferralQualificationMode) {
  return mode === "first_payment"
    ? "Al realizar su primer pago"
    : "Al registrarse en la aplicación";
}

function ReferralCampaignDetail({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-compact)] border border-border-default bg-surface-2/65 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      {tone === "success" ? (
        <Badge variant="outline" className={`mt-1.5 ${ACTIVE_CAMPAIGN_BADGE_CLASS}`}>
          {value}
        </Badge>
      ) : (
        <p className="mt-1.5 text-sm font-medium text-text-primary">{value}</p>
      )}
    </div>
  );
}

function IconMasterPreview({
  label,
  shape,
  url,
}: {
  label: string;
  shape: "square" | "circle" | "rounded";
  url: string;
}) {
  const shapeClass =
    shape === "circle" ? "rounded-full" : shape === "rounded" ? "rounded-xl" : "rounded-none";
  const variantUrl = url
    ? projectIconVariantUrl(
        url,
        shape === "circle"
          ? "round-192.png"
          : shape === "rounded"
            ? "maskable-192.png"
            : "pwa-192.png",
      )
    : "";

  return (
    <div className="space-y-1.5 text-center">
      <div
        className={`mx-auto flex h-16 w-16 items-center justify-center overflow-hidden border border-border-default bg-surface-2 ${shapeClass}`}
      >
        {variantUrl ? (
          <img
            src={variantUrl}
            alt={`Vista previa ${label.toLowerCase()} del icono maestro`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-[10px] text-text-tertiary">Sin icono</span>
        )}
      </div>
      <p className="text-xs text-text-tertiary">{label}</p>
    </div>
  );
}
