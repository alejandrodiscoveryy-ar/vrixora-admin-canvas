import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  BellRing,
  Clock3,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { PageAlert } from "@/components/admin/PageAlert";
import { SectionCard } from "@/components/admin/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getElToqueIntegration,
  saveElToqueIntegration,
  syncElToqueNow,
  type ElToqueCurrency,
  type ElToqueIntegrationSettings,
} from "@/lib/eltoque-integration";

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin registro";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatus(
  settings: ElToqueIntegrationSettings,
): {
  label: string;
  variant: "success" | "warning" | "danger" | "inactive";
} {
  if (!settings.apiKeyConfigured) {
    return {
      label: "Sin configurar",
      variant: "inactive",
    };
  }

  if (
    settings.lastAutoSyncStatus === "success" ||
    settings.lastAutoSyncStatus === "ok"
  ) {
    return {
      label: "Conectado",
      variant: "success",
    };
  }

  if (
    settings.lastAutoSyncStatus === "error" ||
    settings.lastAutoSyncError
  ) {
    return {
      label: "Error",
      variant: "danger",
    };
  }

  return {
    label: "Configurado",
    variant: "warning",
  };
}

export default function IntegracionesSection({
  projectId,
}: {
  projectId: string;
}) {
  const queryClient = useQueryClient();

  const integrationQuery = useQuery({
    queryKey: ["eltoque-integration", projectId],
    queryFn: () => getElToqueIntegration(projectId),
  });

  const settings = integrationQuery.data;

  const [apiKey, setApiKey] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoCurrency, setAutoCurrency] =
    useState<ElToqueCurrency>("USD");
  const [fallbackRate, setFallbackRate] = useState(1);
  const [
    dailyNotificationEnabled,
    setDailyNotificationEnabled,
  ] = useState(false);
  const [notificationHour, setNotificationHour] = useState(8);
  const [notificationTimezone, setNotificationTimezone] =
    useState("America/Havana");

  useEffect(() => {
    if (!settings) return;

    setAutoSyncEnabled(settings.autoSyncEnabled);
    setAutoCurrency(settings.autoCurrency);
    setFallbackRate(settings.fallbackRate);
    setDailyNotificationEnabled(
      settings.dailyRateNotificationEnabled,
    );
    setNotificationHour(
      settings.dailyRateNotificationHour,
    );
    setNotificationTimezone(
      settings.dailyRateNotificationTimezone,
    );
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.canManage) {
        throw new Error(
          "No tienes permisos para modificar esta integración.",
        );
      }

      if (!Number.isFinite(fallbackRate) || fallbackRate <= 0) {
        throw new Error(
          "La tasa de respaldo debe ser mayor que cero.",
        );
      }

      if (
        !Number.isInteger(notificationHour) ||
        notificationHour < 0 ||
        notificationHour > 23
      ) {
        throw new Error(
          "La hora de notificación debe estar entre 0 y 23.",
        );
      }

      return saveElToqueIntegration(projectId, {
        apiKey: apiKey.trim() || undefined,
        autoSyncEnabled,
        autoCurrency,
        fallbackRate,
        dailyRateNotificationEnabled:
          dailyNotificationEnabled,
        dailyRateNotificationHour: notificationHour,
        dailyRateNotificationTimezone:
          notificationTimezone.trim(),
      });
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(
        ["eltoque-integration", projectId],
        result.settings,
      );

      await queryClient.invalidateQueries({
        queryKey: ["project-foundation-settings", projectId],
      });

      setApiKey("");

      if (result.sync.ok) {
        toast.success(
          autoSyncEnabled
            ? "Integración guardada y verificada."
            : "Configuración guardada.",
        );
      } else {
        toast.warning(
          "La configuración se guardó, pero la verificación no pudo completarse.",
        );
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la integración.",
      );
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => syncElToqueNow(projectId),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["eltoque-integration", projectId],
        result.settings,
      );

      if (result.sync.ok) {
        toast.success("Tasa actualizada correctamente.");
      } else {
        toast.error(
          result.sync.message ||
            "elTOQUE no devolvió una tasa válida.",
        );
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la tasa.",
      );
    },
  });

  if (integrationQuery.isLoading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (integrationQuery.isError || !settings) {
    return (
      <PageAlert
        tone="error"
        title="No se pudo cargar la integración"
      >
        {integrationQuery.error instanceof Error
          ? integrationQuery.error.message
          : "No fue posible consultar la configuración de elTOQUE."}
      </PageAlert>
    );
  }

  const status = getStatus(settings);

  return (
    <div className="space-y-4 sm:space-y-6">
      <ModuleHeader
        title="Integraciones y API"
        description="Conecta servicios externos con este proyecto sin exponer credenciales sensibles."
        icon={PlugZap}
        module="configuracion"
      />

      <PageAlert tone="info">
        Este espacio centraliza las integraciones externas del
        proyecto. La primera integración disponible es la API oficial
        de tasas de elTOQUE.
      </PageAlert>

      <SectionCard
        title="elTOQUE"
        description="Tasa referencial automática para operaciones USD/EUR → CUP."
        module="configuracion"
        actions={
          <Badge variant={status.variant}>{status.label}</Badge>
        }
      >
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eltoque-api-key">
                <span className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Clave API
                </span>
              </Label>

              <Input
                id="eltoque-api-key"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                disabled={!settings.canManage}
                onChange={(event) =>
                  setApiKey(event.target.value)
                }
                placeholder={
                  settings.apiKeyConfigured
                    ? "Clave configurada — escribe una nueva solo para reemplazarla"
                    : "Introduce la clave API de elTOQUE"
                }
              />

              <p className="text-xs text-muted-foreground">
                La clave no se vuelve a mostrar después de guardarla.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">
                  Moneda base
                </p>
                <p className="mt-1 font-semibold">
                  {settings.baseCurrency}
                </p>
              </div>

              <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">
                  Moneda de cobro
                </p>
                <p className="mt-1 font-semibold">
                  {settings.chargeCurrency}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border-subtle pt-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  Actualización automática
                </p>
                <p className="text-sm text-muted-foreground">
                  Consulta elTOQUE cada hora y actualiza la tasa
                  vigente del proyecto.
                </p>
              </div>

              <Switch
                checked={autoSyncEnabled}
                disabled={!settings.canManage}
                onCheckedChange={setAutoSyncEnabled}
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Moneda consultada</Label>
                <Input
                  value={autoCurrency}
                  disabled
                />
              </div>

              <div className="space-y-2">
                <Label>Frecuencia</Label>
                <Input
                  value="Cada hora · minuto 5"
                  disabled
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fallback-rate">
                  Tasa de respaldo
                </Label>
                <Input
                  id="fallback-rate"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={fallbackRate}
                  disabled={!settings.canManage}
                  onChange={(event) =>
                    setFallbackRate(
                      Number(event.target.value),
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
              <p className="text-xs text-muted-foreground">
                Tasa actual
              </p>
              <p className="mt-1 text-2xl font-bold">
                {settings.currentRate.toLocaleString("es")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {settings.baseCurrency} →{" "}
                {settings.chargeCurrency}
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
              <p className="text-xs text-muted-foreground">
                Fuente
              </p>
              <p className="mt-1 font-semibold">
                {settings.rateSource || "Sin fuente"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Actualizada: {formatDate(settings.rateUpdatedAt)}
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
              <p className="text-xs text-muted-foreground">
                Última sincronización
              </p>
              <p className="mt-1 font-semibold">
                {settings.lastAutoSyncStatus || "Sin ejecutar"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(settings.lastAutoSyncAt)}
              </p>
            </div>
          </div>

          {settings.lastAutoSyncError ? (
            <PageAlert
              tone="warning"
              title="Último intento de sincronización"
            >
              {settings.lastAutoSyncError}
            </PageAlert>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={
                !settings.canManage ||
                syncMutation.isPending ||
                !settings.apiKeyConfigured
              }
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Actualizar ahora
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Notificación diaria de la tasa"
        description="Prepara una notificación diaria con la tasa vigente."
        module="configuracion"
      >
        <div className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <BellRing className="h-4 w-4" />
                Notificación diaria
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Genera una notificación diaria para los usuarios
                habilitados.
              </p>
            </div>

            <Switch
              checked={dailyNotificationEnabled}
              disabled={!settings.canManage}
              onCheckedChange={setDailyNotificationEnabled}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notification-hour">
                <span className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  Hora
                </span>
              </Label>

              <Input
                id="notification-hour"
                type="number"
                min="0"
                max="23"
                step="1"
                value={notificationHour}
                disabled={
                  !settings.canManage ||
                  !dailyNotificationEnabled
                }
                onChange={(event) =>
                  setNotificationHour(
                    Number(event.target.value),
                  )
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification-timezone">
                Zona horaria
              </Label>

              <Input
                id="notification-timezone"
                value={notificationTimezone}
                disabled={
                  !settings.canManage ||
                  !dailyNotificationEnabled
                }
                onChange={(event) =>
                  setNotificationTimezone(
                    event.target.value,
                  )
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
              <p className="text-xs text-muted-foreground">
                Dispositivos push activos
              </p>
              <p className="mt-1 text-xl font-semibold">
                {settings.enabledPushTokens}
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
              <p className="text-xs text-muted-foreground">
                Notificaciones pendientes
              </p>
              <p className="mt-1 text-xl font-semibold">
                {settings.pendingNotifications}
              </p>
            </div>
          </div>

          {settings.enabledPushTokens === 0 ? (
            <PageAlert tone="warning">
              El backend puede preparar las notificaciones, pero
              todavía no hay dispositivos registrados para recibir
              notificaciones push con la aplicación cerrada.
            </PageAlert>
          ) : null}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={
            !settings.canManage || saveMutation.isPending
          }
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar y verificar
        </Button>
      </div>
    </div>
  );
}