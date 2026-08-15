import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Save, Trash2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";

import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import {
  supabaseServices,
  type P0ASettings,
  type ProjectSettings,
  type WhatsAppSettings,
} from "@/lib/services";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { SectionCard } from "@/components/admin/SectionCard";
import { PageAlert } from "@/components/admin/PageAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const paymentMethods = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer", label: "Transferencia" },
  { value: "card", label: "Tarjeta" },
  { value: "paypal", label: "PayPal" },
] as const;

type SectionKey =
  "general" | "commercial" | "billing" | "referrals" | "communication" | "application" | "testing";

const sections: Array<{ key: SectionKey; label: string }> = [
  { key: "general", label: "General e identidad" },
  { key: "commercial", label: "Comercial" },
  { key: "billing", label: "Cobros y moneda" },
  { key: "referrals", label: "Referidos" },
  { key: "communication", label: "Comunicación" },
  { key: "application", label: "Aplicación" },
  { key: "testing", label: "Entorno y pruebas" },
];

const CONFIG_CARD_CLASS = "border-border-default bg-surface-1 shadow-[var(--shadow-card)]";

const CONFIG_HEADER_CLASS = "px-4 py-2.5 sm:px-4 sm:py-2.5";

const CONFIG_CONTENT_CLASS = "p-3";

const CONFIG_CONTROL_CLASS =
  "h-9 border-border-strong bg-surface-2 shadow-[var(--shadow-xs)] hover:border-primary/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";

const CONFIG_SELECT_CLASS =
  "h-9 border-border-strong bg-surface-2 hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20";

const CONFIG_TEXTAREA_CLASS =
  "min-h-[60px] border-border-strong bg-surface-2 shadow-[var(--shadow-xs)] hover:border-primary/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";

export default function ConfiguracionSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: project } = useProject(projectId);
  const { data: permissions = [] } = useProjectPermissions(projectId);

  const canManage = permissions.includes("settings.manage");
  const canManageWhatsApp = permissions.includes("whatsapp_settings.manage");
  const canSave = canManage || canManageWhatsApp;

  const settingsQuery = useQuery({
    queryKey: ["project-settings", projectId],
    queryFn: () => supabaseServices.projects.settings(projectId),
  });

  const foundationQuery = useQuery({
    queryKey: ["project-foundation-settings", projectId],
    queryFn: () => supabaseServices.foundations.settings(projectId),
  });

  const whatsappQuery = useQuery({
    queryKey: ["project-whatsapp-settings", projectId],
    queryFn: () => supabaseServices.projects.whatsappSettings(projectId),
    enabled: canManageWhatsApp,
  });

  const [activeSection, setActiveSection] = useState<SectionKey>("general");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [form, setForm] = useState<ProjectSettings | null>(null);
  const [foundationForm, setFoundationForm] = useState<P0ASettings | null>(null);
  const [whatsappForm, setWhatsAppForm] = useState<WhatsAppSettings | null>(null);

  const [projectDirty, setProjectDirty] = useState(false);
  const [foundationDirty, setFoundationDirty] = useState(false);
  const [whatsappDirty, setWhatsAppDirty] = useState(false);

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

        if (foundationForm.referralRewardDays < 1 || foundationForm.referralRewardDays > 365) {
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

        if (original.referralRewardDays !== foundationForm.referralRewardDays) {
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
      supabaseServices.projects.uploadBrandAsset(projectId, kind, file),

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
          : "Icono subido. Guarda los cambios para aplicarlo.",
      );
    },

    onError: (error: Error) => toast.error(error.message),
  });

  const deleteTestData = useMutation({
    mutationFn: () => supabaseServices.foundations.deleteTestData(projectId),

    onSuccess: (result) => {
      toast.success(
        `Datos de prueba eliminados: ${result.preinvoices} prefacturas, ${result.payments} pagos, ${result.receipts} recibos, ${result.referralRewards} recompensas y ${result.referralRelationships} relaciones de referidos.`,
      );
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

  const togglePaymentMethod = (
    method: ProjectSettings["paymentMethods"][number],
    enabled: boolean,
  ) => {
    const next = enabled
      ? [...new Set([...form!.paymentMethods, method])]
      : form!.paymentMethods.filter((item) => item !== method);

    update("paymentMethods", next);
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

  return (
    <div className="space-y-3">
      <ModuleHeader
        title="Configuración"
        description="Administra la identidad, reglas comerciales, cobros, comunicación y comportamiento del proyecto."
        icon={Building2}
        module="configuracion"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isDirty ? (
              <Badge
                variant="outline"
                className="border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] text-[var(--semantic-warning-foreground)]"
              >
                Cambios sin guardar
              </Badge>
            ) : null}

            {canSave ? (
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !isDirty}>
                {save.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Guardar cambios
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
        {sections.map((section) => (
          <Button
            key={section.key}
            type="button"
            variant={activeSection === section.key ? "default" : "outline"}
            onClick={() => setActiveSection(section.key)}
            className="h-auto min-h-10 whitespace-normal px-3 py-1.5 text-xs leading-tight"
          >
            {section.label}
          </Button>
        ))}
      </div>

      {activeSection === "general" ? (
        <div className="space-y-3">
          <SectionCard
            title="Identidad del proyecto"
            description="Información principal utilizada en la administración y en los documentos."
            module="configuracion"
            className={CONFIG_CARD_CLASS}
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
            className={CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
          >
            <div className="grid gap-x-3 gap-y-2.5 md:grid-cols-2 xl:grid-cols-4">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_76px] sm:items-end">
                <div className="space-y-1.5">
                  <Label>Logo</Label>
                  <Input
                    id="project-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        uploadBrandAsset.mutate({
                          kind: "logo",
                          file,
                        });
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
                      {form.logoUrl ? "Reemplazar logo" : "Subir logo"}
                    </label>
                  </Button>

                  <p className="text-xs text-text-tertiary">PNG, JPG o WEBP · Máximo 2 MB.</p>
                </div>

                <div className="flex h-14 w-full items-center justify-center rounded-[var(--radius-compact)] border border-border-default bg-surface-2 p-2 sm:w-[76px]">
                  {form.logoUrl ? (
                    <img
                      src={form.logoUrl}
                      alt="Vista previa del logo"
                      className="max-h-9 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-text-tertiary">Sin logo</span>
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_76px] sm:items-end">
                <div className="space-y-1.5">
                  <Label>Icono / Favicon</Label>
                  <Input
                    id="project-favicon"
                    type="file"
                    accept="image/png,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        uploadBrandAsset.mutate({
                          kind: "favicon",
                          file,
                        });
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
                      {form.iconUrl ? "Reemplazar icono" : "Subir icono"}
                    </label>
                  </Button>

                  <p className="text-xs text-text-tertiary">PNG, WEBP o ICO · Máximo 2 MB.</p>
                </div>

                <div className="flex h-14 w-full items-center justify-center rounded-[var(--radius-compact)] border border-border-default bg-surface-2 p-2 sm:w-[76px]">
                  {form.iconUrl ? (
                    <img
                      src={form.iconUrl}
                      alt="Vista previa del icono"
                      className="h-8 w-8 object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-text-tertiary">Sin icono</span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Color primario</Label>
                <div className="flex items-center gap-2">
                  <div
                    className="h-9 w-9 shrink-0 rounded-lg border border-border-subtle"
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
                    className="h-9 w-9 shrink-0 rounded-lg border border-border-subtle"
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

      {activeSection === "commercial" ? (
        <SectionCard
          title="Reglas comerciales"
          description="Parámetros generales que afectan la relación con clientes y licencias."
          module="configuracion"
          className={CONFIG_CARD_CLASS}
          headerClassName={CONFIG_HEADER_CLASS}
          contentClassName={CONFIG_CONTENT_CLASS}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Días de prueba gratuita</Label>
              <Input
                className={CONFIG_CONTROL_CLASS}
                type="number"
                min={0}
                value={form.trialDays}
                onChange={(event) => update("trialDays", Number(event.target.value))}
                disabled={!canManage}
              />
              <p className="text-xs text-text-tertiary">
                Duración general configurada para el período de prueba.
              </p>
            </div>

            <SettingToggle
              title="Renovación automática al confirmar pagos"
              description="Actualiza la licencia cuando se confirma un pago válido."
              checked={form.autoRenewVerifiedPayments}
              onCheckedChange={(checked) => update("autoRenewVerifiedPayments", checked)}
              disabled={!canManage}
            />

            <SettingToggle
              title="Notificar vencimientos"
              description="Permite generar avisos operativos relacionados con licencias próximas a vencer."
              checked={form.notifyLicenseExpiry}
              onCheckedChange={(checked) => update("notifyLicenseExpiry", checked)}
              disabled={!canManage}
            />
          </div>
        </SectionCard>
      ) : null}

      {activeSection === "billing" ? (
        <div className="space-y-3">
          <PageAlert tone="info" title="Configuración monetaria">
            La moneda base debe coincidir con la moneda en que están definidos los planes. La tasa
            se conserva en cada documento emitido.
          </PageAlert>

          <SectionCard
            title="Monedas y tipo de cambio"
            description="Define cómo se calculan los importes de cobro."
            module="configuracion"
            className={CONFIG_CARD_CLASS}
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
                      Automática — sin proveedor configurado
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
                  disabled={!canManage}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Fuente de la tasa</Label>
                <Input
                  className={CONFIG_CONTROL_CLASS}
                  value={foundationForm.rateSource}
                  onChange={(event) => updateFoundation("rateSource", event.target.value)}
                  placeholder="Ej. Tasa manual administrativa"
                  disabled={!canManage}
                />
              </div>

              <p className="text-xs text-text-tertiary md:col-span-2">
                Última actualización: {formatDateTime(foundationForm.rateUpdatedAt)}
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="Métodos de pago"
            description="Opciones permitidas al registrar operaciones."
            module="configuracion"
            className={CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {paymentMethods.map((method) => (
                <label
                  key={method.value}
                  className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-compact)] border border-border-default bg-surface-2 p-2.5 text-sm font-medium"
                >
                  <Checkbox
                    checked={form.paymentMethods.includes(method.value)}
                    onCheckedChange={(checked) =>
                      togglePaymentMethod(method.value, Boolean(checked))
                    }
                    disabled={!canManage}
                  />
                  {method.label}
                </label>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeSection === "referrals" ? (
        <SectionCard
          title="Programa de referidos"
          description="Reglas generales para recompensar clientes que generan nuevas conversiones."
          module="configuracion"
          className={CONFIG_CARD_CLASS}
          headerClassName={CONFIG_HEADER_CLASS}
          contentClassName={CONFIG_CONTENT_CLASS}
        >
          <div className="max-w-xl space-y-3">
            <div className="space-y-1.5">
              <Label>Días de recompensa por referido convertido</Label>
              <Input
                className={CONFIG_CONTROL_CLASS}
                type="number"
                min={1}
                max={365}
                value={foundationForm.referralRewardDays}
                onChange={(event) =>
                  updateFoundation("referralRewardDays", Number(event.target.value))
                }
                disabled={!canManage}
              />
            </div>

            <PageAlert tone="info">
              La recompensa se genera cuando el referido cumple las condiciones comerciales
              definidas. El valor inicial recomendado es 15 días.
            </PageAlert>
          </div>
        </SectionCard>
      ) : null}

      {activeSection === "communication" ? (
        <div className="space-y-3">
          <SectionCard
            title="Contacto institucional"
            description="Datos utilizados por la identidad del proyecto y sus documentos."
            module="configuracion"
            className={CONFIG_CARD_CLASS}
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
            className={CONFIG_CARD_CLASS}
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
              <div className="space-y-3">
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

      {activeSection === "application" ? (
        <SectionCard
          title="Comportamiento de TukTuk Control"
          description="Parámetros administrativos que afectan el acceso y la experiencia de la aplicación."
          module="configuracion"
          className={CONFIG_CARD_CLASS}
          headerClassName={CONFIG_HEADER_CLASS}
          contentClassName={CONFIG_CONTENT_CLASS}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Versión mínima requerida</Label>
              <Input
                className={CONFIG_CONTROL_CLASS}
                value={form.minimumVersion}
                onChange={(event) => update("minimumVersion", event.target.value)}
                disabled={!canManage}
              />
            </div>

            <SettingToggle
              title="Forzar actualización"
              description="Obliga a los usuarios a actualizar cuando su versión no cumple la configuración."
              checked={form.forceUpdate}
              onCheckedChange={(checked) => update("forceUpdate", checked)}
              disabled={!canManage}
            />

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
      ) : null}

      {activeSection === "testing" ? (
        <div className="space-y-3">
          <SectionCard
            title="Modo de pruebas"
            description="Permite identificar operaciones creadas exclusivamente para validación."
            module="configuracion"
            className={CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
          >
            <div className="space-y-3">
              <SettingToggle
                title="Permitir operaciones de prueba"
                description="Cuando está activo, al preparar un cobro puedes marcar la operación como prueba antes de crear la prefactura."
                checked={foundationForm.testModeEnabled}
                onCheckedChange={(checked) => updateFoundation("testModeEnabled", checked)}
                disabled={!canManage}
              />

              <Badge
                variant="outline"
                className={
                  foundationForm.testModeEnabled
                    ? "border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] text-[var(--semantic-warning-foreground)]"
                    : "border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] text-[var(--semantic-success-foreground)]"
                }
              >
                {foundationForm.testModeEnabled
                  ? "Modo de pruebas activado"
                  : "Modo de pruebas desactivado"}
              </Badge>
            </div>
          </SectionCard>

          <SectionCard
            title="Limpieza de datos de prueba"
            description="Herramienta administrativa para retirar datos creados expresamente como prueba."
            module="configuracion"
            className={CONFIG_CARD_CLASS}
            headerClassName={CONFIG_HEADER_CLASS}
            contentClassName={CONFIG_CONTENT_CLASS}
          >
            <div className="space-y-3">
              <PageAlert tone="warning" title="Esta acción es irreversible">
                La limpieza elimina prefacturas, pagos, recibos, recompensas y relaciones de
                referidos marcados como prueba. No elimina operaciones reales.
              </PageAlert>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={!canManage || deleteTestData.isPending}>
                    {deleteTestData.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Eliminar datos de prueba
                  </Button>
                </AlertDialogTrigger>

                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar los datos de prueba?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se eliminarán únicamente prefacturas, pagos, recibos y datos de referidos que
                      fueron marcados como prueba. Las operaciones reales permanecerán intactas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="flex items-start gap-2 rounded-[var(--radius-compact)] border border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] p-3 text-sm">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Esta acción no se puede deshacer.</span>
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteTestData.mutate()}>
                      Confirmar eliminación
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
    <div className="flex items-start justify-between gap-3 rounded-[var(--radius-compact)] border border-border-default bg-surface-2 p-3">
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
