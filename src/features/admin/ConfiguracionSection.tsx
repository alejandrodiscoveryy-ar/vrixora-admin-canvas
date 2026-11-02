import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Coins, Gift, Loader2, MessageSquareText, Palette, Plus, Save, Settings2, Smartphone, Upload, type LucideIcon } from "lucide-react";
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

const LEGACY_SECTION_LABELS: Record<SectionKey, string> = {
  general: "General e identidad",
  billing: "Moneda y cambio",
  referrals: "Referidos",
  communication: "Comunicación",
  application: "Aplicación",
};

const CONFIG_CARD_CLASS = "border-border-default bg-surface-1 shadow-[var(--shadow-card)]";
const PREMIUM_CONFIG_CARD_CLASS = "relative overflow-hidden rounded-[25px] border border-cyan-400/20 bg-gradient-to-br from-[#0b171c] via-[#080f15] to-[#061a20]/90 shadow-[0_26px_70px_-42px_rgba(0,0,0,0.94)]";

const CONFIG_HEADER_CLASS = "border-b border-cyan-400/[0.12] bg-cyan-300/[0.025] px-4 py-4 sm:px-6 sm:py-4";

const CONFIG_CONTENT_CLASS = "px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5";

const CONFIG_CONTROL_CLASS =
  "h-10 rounded-xl border-cyan-400/20 bg-[#08141a]/80 shadow-inner shadow-black/10 transition-colors hover:border-cyan-300/45 focus-visible:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300/20";

const CONFIG_SELECT_CLASS =
  "h-10 rounded-xl border-cyan-400/20 bg-[#08141a]/80 hover:border-cyan-300/45 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20";

const CONFIG_TEXTAREA_CLASS =
  "min-h-[88px] rounded-xl border-cyan-400/20 bg-[#08141a]/80 shadow-inner shadow-black/10 hover:border-cyan-300/45 focus-visible:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300/20";

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

  const [activeSection, setActiveSection] = useState<SectionKey | "inicio">("inicio");
  const isMarketplaceReferralProgram = project?.slug === "tuktuk-control";
  const visibleSection = isMarketplaceReferralProgram
    ? activeSection
    : activeSection === "inicio" ? "general" : activeSection;
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
              { label: "Versión Android", value: "Panel independiente", hint: "Actualizaciones y descargas" },
            ];

  return (
    <div className="space-y-3">
      {isMarketplaceReferralProgram ? (
        <>
          {visibleSection !== "inicio" ? (
          <div className="flex min-h-9 flex-wrap items-center justify-end gap-2">
            {visibleSection !== "inicio" ? (
              <button
                type="button"
                onClick={() => setActiveSection("inicio")}
                className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Volver
              </button>
            ) : null}
            {isDirty ? (
              <Badge variant="outline" className="border-amber-400/35 bg-amber-400/[0.07] text-amber-300">
                Cambios sin guardar
              </Badge>
            ) : null}
            {canSave ? (
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !isDirty}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar cambios
              </Button>
            ) : null}
          </div>
          ) : null}
          {visibleSection === "inicio" ? (
            <section aria-label="Categorías de configuración" className="grid gap-4 sm:grid-cols-2">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setActiveSection(section.key)}
                    className="group relative isolate flex min-h-[156px] min-w-0 items-center gap-5 overflow-hidden rounded-[23px] border border-cyan-400/[0.14] bg-gradient-to-br from-card/95 via-card/90 to-cyan-950/[0.10] px-5 py-6 text-left shadow-[0_22px_58px_-43px_rgba(0,0,0,0.85)] transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/45 hover:shadow-[0_26px_58px_-38px_rgba(34,211,238,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:px-6"
                  >
                    <Icon aria-hidden="true" className="pointer-events-none absolute -right-9 -top-11 z-0 h-40 w-40 -rotate-12 text-cyan-300 opacity-[0.055] transition-opacity group-hover:opacity-[0.10]" />
                    <span className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] border border-cyan-400/25 bg-cyan-400/[0.09] text-cyan-300 shadow-inner">
                      <Icon aria-hidden="true" className="h-8 w-8" />
                    </span>
                    <span className="relative z-10 min-w-0 flex-1 space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300/75">{section.eyebrow}</span>
                      <span className="block text-lg font-semibold leading-snug tracking-tight text-foreground">{section.label}</span>
                      <span className="block max-w-sm text-xs leading-relaxed text-slate-400">{section.description}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="relative z-10 h-5 w-5 shrink-0 text-cyan-300/75 transition-transform group-hover:translate-x-1 group-hover:text-cyan-300" />
                  </button>
                );
              })}
            </section>
          ) : currentSection ? (
            <div className="space-y-3">
              <PremiumSettingsSnapshot
                number={currentSection.number}
                eyebrow={currentSection.eyebrow}
                title={currentSection.label}
                description={currentSection.description}
                icon={CurrentSectionIcon}
                metrics={premiumMetrics}
              />
              <nav aria-label="Cambiar módulo de configuración" className="flex gap-2 overflow-x-auto pb-1">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      type="button"
                      key={section.key}
                      aria-current={visibleSection === section.key ? "page" : undefined}
                      onClick={() => setActiveSection(section.key)}
                      className={"inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 " + (visibleSection === section.key ? "border-cyan-300/45 bg-cyan-300/12 text-cyan-100" : "border-cyan-400/15 bg-[#09161b]/70 text-slate-400 hover:border-cyan-400/35 hover:text-white")}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />{section.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          ) : null}
        </>
      ) : (
      <div className="rounded-[20px] border border-white/10 bg-gradient-to-br from-background/70 via-background/50 to-cyan-500/[0.025] p-2.5 shadow-[0_18px_52px_-38px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {sections.map((section) => (
              <Button
                key={section.key}
                type="button"
                variant={visibleSection === section.key ? "default" : "outline"}
                onClick={() => setActiveSection(section.key)}
                className="h-auto min-h-9 whitespace-normal px-3 py-1.5 text-xs leading-tight"
              >
                {LEGACY_SECTION_LABELS[section.key]}
              </Button>
            ))}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {isDirty ? (
              <Badge
                variant="outline"
                className="border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] text-[var(--semantic-warning-foreground)]"
              >
                Cambios sin guardar
              </Badge>
            ) : null}

            {canSave ? (
              <Button
                size="sm"
                onClick={() => save.mutate()}
                disabled={save.isPending || !isDirty}
              >
                {save.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Guardar cambios
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      )}
      {visibleSection === "general" ? (
        <div className="space-y-3">
          <SectionCard
            title="Identidad del proyecto"
            description="Información principal utilizada en la administración y en los documentos."
            module="configuracion"
            className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
          >
            <div className="grid gap-x-3 gap-y-2.5 md:grid-cols-2 xl:grid-cols-6">
              <div className="space-y-1.5 md:col-span-2 xl:order-1 xl:col-span-2">
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

              <div className="space-y-1.5 md:col-span-2 xl:order-4 xl:col-span-6">
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

              <div className="space-y-1.5 xl:order-2 xl:col-span-2">
                <Label>Correo de soporte</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  type="email"
                  value={form.supportEmail}
                  onChange={(event) => update("supportEmail", event.target.value)}
                  disabled={!canManage}
                />
              </div>

              <div className="space-y-1.5 xl:order-3 xl:col-span-2">
                <Label>Sitio web oficial</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  value={form.websiteUrl}
                  onChange={(event) => update("websiteUrl", event.target.value)}
                  disabled={!canManage}
                />
              </div>

              <div className="space-y-1.5 xl:order-5 xl:col-span-3">
                <Label>Política de privacidad</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  value={form.privacyUrl}
                  onChange={(event) => update("privacyUrl", event.target.value)}
                  disabled={!canManage}
                />
              </div>

              <div className="space-y-1.5 xl:order-6 xl:col-span-3">
                <Label>Términos y condiciones</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  value={form.termsUrl}
                  onChange={(event) => update("termsUrl", event.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Marca e identidad visual"
            description="Recursos visuales utilizados por el proyecto."
            module="configuracion"
            className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
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

                <div className="flex h-24 w-full items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.035] p-2 shadow-inner shadow-black/20 sm:w-[120px]">
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
                    className="h-10 w-10 shrink-0 rounded-xl border border-cyan-400/30 shadow-inner shadow-black/20"
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
                    className="h-10 w-10 shrink-0 rounded-xl border border-cyan-400/30 shadow-inner shadow-black/20"
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
          <SectionCard
            title="Monedas y tipo de cambio"
            description="Define las monedas y el tipo de cambio utilizados por Marketplace."
            module="configuracion"
            className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
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

              <p className="flex items-center gap-2 rounded-xl border border-cyan-400/15 bg-cyan-300/[0.035] px-3.5 py-3 text-xs text-slate-300 md:col-span-2">
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
            <SectionCard title="Recompensa Marketplace" description="El importe se acredita en la billetera Marketplace cuando el referido completa su primer trabajo válido." module="configuracion" className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS} headerClassName={CONFIG_HEADER_CLASS} contentClassName={CONFIG_CONTENT_CLASS}>
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
          <SectionCard
            title="Programa de referidos"
            description="Cada campaña conserva su condición y recompensa para no alterar relaciones ni beneficios históricos."
            module="configuracion"
            className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
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
            <SectionCard
              title="Iniciar nueva campaña"
              description="La campaña activa se cerrará al crear la nueva. Las reglas históricas no se modificarán."
              module="configuracion"
              className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS}
              headerClassName={CONFIG_HEADER_CLASS}
              contentClassName={CONFIG_CONTENT_CLASS}
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
          <SectionCard
            title="Historial de campañas"
            description="Las campañas cerradas conservan las condiciones con las que se emitieron las recompensas."
            module="configuracion"
            className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
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
          {!isMarketplaceReferralProgram ? (
            <AppReleaseSettingsCard projectId={projectId} canManage={canManage} hasUnsavedProjectChanges={projectDirty} />
          ) : null}
          <SectionCard
            title="Contacto institucional"
            description="Datos utilizados por la identidad del proyecto y sus documentos."
            module="configuracion"
            className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
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

          <SectionCard
            title="Canales operativos de WhatsApp"
            description="Configura soporte y cobros de forma independiente."
            module="configuracion"
            className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
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
                  <p className="mb-3 text-xs text-slate-400">Cada número cumple una función distinta en la atención del Marketplace.</p>
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
                  <p className="mb-3 text-xs text-slate-400">Textos visibles y plantillas de contacto para soporte y pagos.</p>
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
          {isMarketplaceReferralProgram ? (
            <AppReleaseSettingsCard projectId={projectId} canManage={canManage} hasUnsavedProjectChanges={projectDirty} />
          ) : null}
        <SectionCard
          title="Comportamiento de TukTuk Control"
          description="Parámetros administrativos que afectan el acceso y la experiencia de la aplicación."
          module="configuracion"
          className={isMarketplaceReferralProgram ? PREMIUM_CONFIG_CARD_CLASS : CONFIG_CARD_CLASS}
          headerClassName={CONFIG_HEADER_CLASS}
          contentClassName={CONFIG_CONTENT_CLASS}
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
    <div className="flex min-h-[90px] items-start justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.05] to-[#061217] p-4 shadow-inner shadow-black/15">
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
    <div className="rounded-2xl border border-cyan-400/18 bg-gradient-to-br from-cyan-400/[0.05] to-[#061217] p-4">
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
        className={`mx-auto flex h-16 w-16 items-center justify-center overflow-hidden border border-cyan-400/20 bg-cyan-400/[0.04] shadow-inner shadow-black/20 ${shapeClass}`}
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
