import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  CreditCard,
  Loader2,
  MessageCircle,
  Palette,
  Smartphone,
  Check,
  Save,
} from "lucide-react";
import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import { supabaseServices, type ProjectSettings, type WhatsAppSettings } from "@/lib/services";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { SectionCard } from "@/components/admin/SectionCard";
import { Badge } from "@/components/ui/badge";

const paymentMethods = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer", label: "Transferencia" },
  { value: "card", label: "Tarjeta" },
  { value: "paypal", label: "PayPal" },
] as const;

type TabKey = "general" | "marca" | "contacto" | "whatsapp" | "comercial" | "aplicacion";

export default function ConfiguracionSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: project } = useProject(projectId);
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("settings.manage");
  const canManageWhatsApp = permissions.includes("whatsapp_settings.manage");

  const settingsQuery = useQuery({
    queryKey: ["project-settings", projectId],
    queryFn: () => supabaseServices.projects.settings(projectId),
  });
  const whatsappQuery = useQuery({
    queryKey: ["project-whatsapp-settings", projectId],
    queryFn: () => supabaseServices.projects.whatsappSettings(projectId),
    enabled: canManageWhatsApp,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [form, setForm] = useState<ProjectSettings | null>(null);
  const [whatsappForm, setWhatsAppForm] = useState<WhatsAppSettings | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!project || !settingsQuery.data) return;
    setName(project.name);
    setDescription(project.description);
    setForm(settingsQuery.data);
  }, [project, settingsQuery.data]);

  useEffect(() => {
    if (whatsappQuery.data) setWhatsAppForm(whatsappQuery.data);
  }, [whatsappQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("La configuración todavía no está disponible.");
      await supabaseServices.projects.update(projectId, {
        ...form,
        name: name.trim(),
        description: description.trim(),
      });
      if (canManageWhatsApp && whatsappForm) {
        await supabaseServices.projects.updateWhatsAppSettings(projectId, whatsappForm);
      }
    },
    onSuccess: async () => {
      setIsDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-settings", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-whatsapp-settings", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["user-projects"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit", projectId] }),
      ]);
      toast.success("Configuración guardada y auditada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadBrandAsset = useMutation({
    mutationFn: ({ kind, file }: { kind: "logo" | "favicon"; file: File }) =>
      supabaseServices.projects.uploadBrandAsset(projectId, kind, file),
    onSuccess: (url, variables) => {
      const key = variables.kind === "logo" ? "logoUrl" : "iconUrl";
      setForm((current) => (current ? { ...current, [key]: url } : current));
      setIsDirty(true);
      toast.success(
        variables.kind === "logo"
          ? "Logo subido. Guarda los cambios para aplicarlo."
          : "Favicon subido. Guarda los cambios para aplicarlo.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (settingsQuery.isLoading || !project || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (settingsQuery.isError) {
    return (
      <p className="py-12 text-center text-sm text-destructive">{settingsQuery.error.message}</p>
    );
  }

  const update = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => {
    setIsDirty(true);
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };
  const togglePaymentMethod = (
    method: ProjectSettings["paymentMethods"][number],
    enabled: boolean,
  ) => {
    setIsDirty(true);
    const next = enabled
      ? [...new Set([...form.paymentMethods, method])]
      : form.paymentMethods.filter((item) => item !== method);
    update("paymentMethods", next);
  };
  const updateWhatsApp = <K extends keyof WhatsAppSettings>(key: K, value: WhatsAppSettings[K]) => {
    setIsDirty(true);
    setWhatsAppForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: "General" },
    { key: "marca", label: "Marca" },
    { key: "contacto", label: "Contacto" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "comercial", label: "Comercial" },
    { key: "aplicacion", label: "Aplicación" },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <ModuleHeader
        title="Configuración"
        description="Parámetros operativos, identidad visual, canales de comunicación y control de versión."
        icon={Building2}
        module="configuracion"
        actions={
          <div className="flex items-center gap-3">
            {isDirty && (
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-400 border-amber-500/30 gap-1.5"
              >
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                Cambios sin guardar
              </Badge>
            )}
            {canManage && (
              <Button
                size="sm"
                onClick={() => save.mutate()}
                disabled={save.isPending || !isDirty}
                className="gap-2"
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar cambios
              </Button>
            )}
          </div>
        }
      />

      {/* Internal Tabs Navigation */}
      <div className="flex overflow-x-auto gap-2 border-b border-border/70 pb-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
            className="rounded-xl text-xs shrink-0"
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="space-y-6">
        {activeTab === "general" && (
          <SectionCard title="Ajustes generales" module="configuracion">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre del proyecto</Label>
                <Input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setIsDirty(true);
                  }}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda principal</Label>
                <Select
                  value={form.currency}
                  onValueChange={(val) => update("currency", val as ProjectSettings["currency"])}
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUP">CUP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Días de prueba (Trial)</Label>
                <Input
                  type="number"
                  value={form.trialDays}
                  onChange={(event) => update("trialDays", Number(event.target.value))}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Descripción</Label>
                <Textarea
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setIsDirty(true);
                  }}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-3 md:col-span-2 pt-2">
                <Label>Métodos de pago aceptados</Label>
                <div className="flex flex-wrap gap-4">
                  {paymentMethods.map((m) => (
                    <label
                      key={m.value}
                      className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                    >
                      <Checkbox
                        checked={form.paymentMethods.includes(m.value)}
                        onCheckedChange={(checked) =>
                          togglePaymentMethod(m.value, Boolean(checked))
                        }
                        disabled={!canManage}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {activeTab === "marca" && (
          <SectionCard title="Identidad visual y marca" module="configuracion">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-logo">Logo</Label>
                <Input
                  id="project-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadBrandAsset.mutate({ kind: "logo", file });
                    event.target.value = "";
                  }}
                  disabled={!canManage || uploadBrandAsset.isPending}
                />
                <p className="text-xs text-muted-foreground">PNG, JPG o WEBP. MÃ¡ximo 2 MB.</p>
                {uploadBrandAsset.isPending && uploadBrandAsset.variables?.kind === "logo" ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo logo...
                  </p>
                ) : null}
                {form.logoUrl ? (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-border/70 bg-muted/20 p-3">
                    <img
                      src={form.logoUrl}
                      alt="Vista previa del logo"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-favicon">Icono / Favicon</Label>
                <Input
                  id="project-favicon"
                  type="file"
                  accept="image/png,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadBrandAsset.mutate({ kind: "favicon", file });
                    event.target.value = "";
                  }}
                  disabled={!canManage || uploadBrandAsset.isPending}
                />
                <p className="text-xs text-muted-foreground">PNG, WEBP o ICO. MÃ¡ximo 2 MB.</p>
                {uploadBrandAsset.isPending && uploadBrandAsset.variables?.kind === "favicon" ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo favicon...
                  </p>
                ) : null}
                {form.iconUrl ? (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-border/70 bg-muted/20 p-3">
                    <img
                      src={form.iconUrl}
                      alt="Vista previa del favicon"
                      className="h-14 w-14 object-contain"
                    />
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Color primario</Label>
                <Input
                  value={form.primaryColor}
                  onChange={(event) => update("primaryColor", event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label>Color secundario</Label>
                <Input
                  value={form.secondaryColor}
                  onChange={(event) => update("secondaryColor", event.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
          </SectionCard>
        )}

        {activeTab === "contacto" && (
          <SectionCard title="Información de contacto y legal" module="configuracion">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Correo de soporte</Label>
                <Input
                  type="email"
                  value={form.supportEmail}
                  onChange={(event) => update("supportEmail", event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label>Sitio Web oficial</Label>
                <Input
                  value={form.websiteUrl}
                  onChange={(event) => update("websiteUrl", event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label>Política de privacidad (URL)</Label>
                <Input
                  value={form.privacyUrl}
                  onChange={(event) => update("privacyUrl", event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label>Términos y condiciones (URL)</Label>
                <Input
                  value={form.termsUrl}
                  onChange={(event) => update("termsUrl", event.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
          </SectionCard>
        )}

        {activeTab === "whatsapp" && (
          <SectionCard title="Configuración de WhatsApp" module="configuracion">
            {whatsappForm ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Número de WhatsApp general</Label>
                  <Input
                    value={whatsappForm.fallbackNumber}
                    onChange={(e) => updateWhatsApp("fallbackNumber", e.target.value)}
                    disabled={!canManageWhatsApp}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Número de soporte</Label>
                  <Input
                    value={whatsappForm.supportNumber}
                    onChange={(e) => updateWhatsApp("supportNumber", e.target.value)}
                    disabled={!canManageWhatsApp}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Plantilla de soporte</Label>
                  <Textarea
                    value={whatsappForm.supportTemplate}
                    onChange={(e) => updateWhatsApp("supportTemplate", e.target.value)}
                    disabled={!canManageWhatsApp}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4">
                No tienes permisos para configurar WhatsApp.
              </p>
            )}
          </SectionCard>
        )}

        {activeTab === "comercial" && (
          <SectionCard title="Ajustes comerciales" module="configuracion">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-border/75 bg-background/50 p-4">
                <div>
                  <p className="text-sm font-medium">Renovación automática en pagos verificados</p>
                  <p className="text-xs text-muted-foreground">
                    Actualiza licencias al confirmar pagos.
                  </p>
                </div>
                <Switch
                  checked={form.autoRenewVerifiedPayments}
                  onCheckedChange={(checked) => update("autoRenewVerifiedPayments", checked)}
                  disabled={!canManage}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/75 bg-background/50 p-4">
                <div>
                  <p className="text-sm font-medium">Notificar vencimiento de licencias</p>
                  <p className="text-xs text-muted-foreground">
                    Enviar alertas operativas y de soporte.
                  </p>
                </div>
                <Switch
                  checked={form.notifyLicenseExpiry}
                  onCheckedChange={(checked) => update("notifyLicenseExpiry", checked)}
                  disabled={!canManage}
                />
              </div>
            </div>
          </SectionCard>
        )}

        {activeTab === "aplicacion" && (
          <SectionCard title="Comportamiento de la aplicación" module="configuracion">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Versión mínima requerida</Label>
                <Input
                  value={form.minimumVersion}
                  onChange={(event) => update("minimumVersion", event.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/75 bg-background/50 p-4 md:col-span-2">
                <div>
                  <p className="text-sm font-medium">Modo mantenimiento</p>
                  <p className="text-xs text-muted-foreground">
                    Bloquea temporalmente el acceso general.
                  </p>
                </div>
                <Switch
                  checked={form.maintenanceMode}
                  onCheckedChange={(checked) => update("maintenanceMode", checked)}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Mensaje de bienvenida</Label>
                <Textarea
                  value={form.welcomeMessage}
                  onChange={(event) => update("welcomeMessage", event.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
