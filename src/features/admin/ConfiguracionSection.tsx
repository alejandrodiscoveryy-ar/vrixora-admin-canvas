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
} from "lucide-react";
import { useProject, useProjectPermissions } from "@/hooks/useProjects";
import { supabaseServices, type ProjectSettings, type WhatsAppSettings } from "@/lib/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { MobileSectionHeader } from "@/components/admin/MobileAdminSystem";

const paymentMethods = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer", label: "Transferencia" },
  { value: "card", label: "Tarjeta" },
  { value: "paypal", label: "PayPal" },
] as const;

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

  if (settingsQuery.isLoading || !project || !form) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (settingsQuery.isError) {
    return (
      <p className="py-12 text-center text-sm text-destructive">{settingsQuery.error.message}</p>
    );
  }

  const update = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const togglePaymentMethod = (
    method: ProjectSettings["paymentMethods"][number],
    enabled: boolean,
  ) => {
    const next = enabled
      ? [...new Set([...form.paymentMethods, method])]
      : form.paymentMethods.filter((item) => item !== method);
    update("paymentMethods", next);
  };
  const updateWhatsApp = <K extends keyof WhatsAppSettings>(key: K, value: WhatsAppSettings[K]) =>
    setWhatsAppForm((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="space-y-6">
      <MobileSectionHeader
        title="Configuracion"
        subtitle="Identidad, comercial y comportamiento del proyecto en una vista compacta."
      />

      <Section
        icon={Building2}
        title="Identidad"
        description="Nombre, textos e imágenes públicas del proyecto."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre" required>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canManage}
            />
          </Field>
          <Field label="Correo de soporte">
            <Input
              type="email"
              value={form.supportEmail}
              onChange={(event) => update("supportEmail", event.target.value)}
              disabled={!canManage}
              placeholder="soporte@empresa.com"
            />
          </Field>
          <Field label="Logo (URL HTTPS)">
            <Input
              type="url"
              value={form.logoUrl}
              onChange={(event) => update("logoUrl", event.target.value)}
              disabled={!canManage}
              placeholder="https://..."
            />
          </Field>
          <Field label="Icono (URL HTTPS)">
            <Input
              type="url"
              value={form.iconUrl}
              onChange={(event) => update("iconUrl", event.target.value)}
              disabled={!canManage}
              placeholder="https://..."
            />
          </Field>
          <Field label="Descripción" className="md:col-span-2">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!canManage}
            />
          </Field>
          <Field label="Mensaje de bienvenida" className="md:col-span-2">
            <Textarea
              value={form.welcomeMessage}
              onChange={(event) => update("welcomeMessage", event.target.value)}
              disabled={!canManage}
              placeholder="Mensaje que verá el usuario al iniciar."
            />
          </Field>
        </div>
      </Section>

      <Section
        icon={Palette}
        title="Marca"
        description="Colores independientes para reutilizar el panel con otros proyectos."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label="Color principal"
            value={form.primaryColor}
            disabled={!canManage}
            onChange={(value) => update("primaryColor", value)}
          />
          <ColorField
            label="Color secundario"
            value={form.secondaryColor}
            disabled={!canManage}
            onChange={(value) => update("secondaryColor", value)}
          />
        </div>
      </Section>

      <Section
        icon={MessageCircle}
        title="Contacto y documentos"
        description="Canales de ayuda y enlaces legales usados por la aplicación."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Sitio web">
            <Input
              type="url"
              value={form.websiteUrl}
              onChange={(event) => update("websiteUrl", event.target.value)}
              disabled={!canManage}
              placeholder="https://..."
            />
          </Field>
          <Field label="Política de privacidad">
            <Input
              type="url"
              value={form.privacyUrl}
              onChange={(event) => update("privacyUrl", event.target.value)}
              disabled={!canManage}
              placeholder="https://..."
            />
          </Field>
          <Field label="Términos de servicio">
            <Input
              type="url"
              value={form.termsUrl}
              onChange={(event) => update("termsUrl", event.target.value)}
              disabled={!canManage}
              placeholder="https://..."
            />
          </Field>
        </div>
      </Section>

      {canManageWhatsApp && whatsappForm && (
        <Section
          icon={MessageCircle}
          title="WhatsApp: soporte y pagos"
          description="Canales independientes con un número principal como respaldo. Solo el owner puede modificarlos."
        >
          <div className="space-y-5">
            <Field label="Número principal (fallback)">
              <Input
                value={whatsappForm.fallbackNumber}
                onChange={(event) => updateWhatsApp("fallbackNumber", event.target.value)}
                placeholder="+5355555555"
              />
            </Field>
            <WhatsAppChannelEditor
              title="Atención al cliente"
              number={whatsappForm.supportNumber}
              buttonText={whatsappForm.supportButtonText}
              template={whatsappForm.supportTemplate}
              enabled={whatsappForm.supportEnabled}
              variables={["nombre", "correo", "aplicacion"]}
              onNumberChange={(value) => updateWhatsApp("supportNumber", value)}
              onButtonTextChange={(value) => updateWhatsApp("supportButtonText", value)}
              onTemplateChange={(value) => updateWhatsApp("supportTemplate", value)}
              onEnabledChange={(value) => updateWhatsApp("supportEnabled", value)}
            />
            <WhatsAppChannelEditor
              title="Pagar, activar o renovar"
              number={whatsappForm.paymentNumber}
              buttonText={whatsappForm.paymentButtonText}
              template={whatsappForm.paymentTemplate}
              enabled={whatsappForm.paymentEnabled}
              variables={[
                "nombre",
                "correo",
                "licencia",
                "aplicacion",
                "plan_actual",
                "plan_solicitado",
                "fecha_vencimiento",
                "tipo_solicitud",
              ]}
              onNumberChange={(value) => updateWhatsApp("paymentNumber", value)}
              onButtonTextChange={(value) => updateWhatsApp("paymentButtonText", value)}
              onTemplateChange={(value) => updateWhatsApp("paymentTemplate", value)}
              onEnabledChange={(value) => updateWhatsApp("paymentEnabled", value)}
            />
            <p className="text-xs text-muted-foreground">
              Versión {whatsappForm.version}. Los números específicos vacíos usan el número
              principal.
            </p>
          </div>
        </Section>
      )}

      <Section
        icon={CreditCard}
        title="Comercial"
        description="Valores predeterminados para pruebas y cobros."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Moneda predeterminada">
            <Select
              value={form.currency}
              onValueChange={(value) => update("currency", value as ProjectSettings["currency"])}
              disabled={!canManage}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["CUP", "USD", "EUR"].map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Días de prueba">
            <Input
              type="number"
              min="0"
              max="3650"
              value={form.trialDays}
              onChange={(event) => update("trialDays", Number(event.target.value))}
              disabled={!canManage}
            />
          </Field>
          <div className="space-y-2 md:col-span-2">
            <Label>Métodos de pago habilitados</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {paymentMethods.map((method) => (
                <label
                  key={method.value}
                  className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm"
                >
                  <Checkbox
                    checked={form.paymentMethods.includes(method.value)}
                    onCheckedChange={(checked) =>
                      togglePaymentMethod(method.value, checked === true)
                    }
                    disabled={!canManage}
                  />
                  {method.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        icon={Smartphone}
        title="Aplicación"
        description="Compatibilidad, mantenimiento y comportamiento del cliente."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Versión mínima">
            <Input
              value={form.minimumVersion}
              onChange={(event) => update("minimumVersion", event.target.value)}
              disabled={!canManage}
              placeholder="Ej. 1.4.0"
            />
          </Field>
          <SettingToggle
            label="Actualización obligatoria"
            description="Bloquea versiones inferiores a la mínima."
            checked={form.forceUpdate}
            onChange={(checked) => update("forceUpdate", checked)}
            disabled={!canManage}
          />
          <SettingToggle
            label="Modo mantenimiento"
            description="Permite informar que el servicio está temporalmente limitado."
            checked={form.maintenanceMode}
            onChange={(checked) => update("maintenanceMode", checked)}
            disabled={!canManage}
          />
          <SettingToggle
            label="Avisos de vencimiento"
            description="Notificar antes de que termine una licencia."
            checked={form.notifyLicenseExpiry}
            onChange={(checked) => update("notifyLicenseExpiry", checked)}
            disabled={!canManage}
          />
          <SettingToggle
            label="Renovación por pago verificado"
            description="Aplicar la vigencia cuando se confirme un pago."
            checked={form.autoRenewVerifiedPayments}
            onChange={(checked) => update("autoRenewVerifiedPayments", checked)}
            disabled={!canManage}
          />
        </div>
      </Section>

      {canManage ? (
        <div className="sticky bottom-3 flex justify-end rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <Button
            disabled={save.isPending || !name.trim() || form.paymentMethods.length === 0}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar
            configuración
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
          Tu rol permite consultar esta configuración, pero no modificarla.
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function WhatsAppChannelEditor({
  title,
  number,
  buttonText,
  template,
  enabled,
  variables,
  onNumberChange,
  onButtonTextChange,
  onTemplateChange,
  onEnabledChange,
}: {
  title: string;
  number: string;
  buttonText: string;
  template: string;
  enabled: boolean;
  variables: string[];
  onNumberChange: (value: string) => void;
  onButtonTextChange: (value: string) => void;
  onTemplateChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="font-medium">{title}</div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Número específico (opcional)">
          <Input
            value={number}
            onChange={(event) => onNumberChange(event.target.value)}
            placeholder="Usa el número principal"
          />
        </Field>
        <Field label="Texto visible de la acción">
          <Input
            value={buttonText}
            maxLength={80}
            onChange={(event) => onButtonTextChange(event.target.value)}
          />
        </Field>
        <Field label="Plantilla del mensaje" className="md:col-span-2">
          <Textarea
            value={template}
            maxLength={2000}
            rows={5}
            onChange={(event) => onTemplateChange(event.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        <span>Variables permitidas:</span>
        {variables.map((variable) => (
          <code key={variable} className="rounded bg-muted px-1.5 py-0.5">{`{{${variable}}}`}</code>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>
        {label}
        {required && " *"}
      </Label>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input
          type="color"
          className="h-10 w-14 p-1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
        <Input
          value={value}
          pattern="#[0-9A-Fa-f]{6}"
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      </div>
    </Field>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-4 rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
