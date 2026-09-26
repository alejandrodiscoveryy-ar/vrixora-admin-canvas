import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Map, RefreshCw, Route, Save, Search } from "lucide-react";
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
  getMarketplaceMapDashboard,
  mapHealthLabel,
  saveMarketplaceMapCapability,
  saveMarketplaceMapCredentials,
  saveMarketplaceMapProviderConnection,
  saveMarketplaceMapQuotaConfig,
  testMarketplaceMapProvider,
  translateMapError,
  usagePercentage,
  type MapCapability,
  type MapCapabilityCode,
} from "@/lib/marketplace-map";

const labels: Record<MapCapabilityCode, string> = {
  map_visual: "Mapa visual",
  geocoding: "Geocodificación",
  routing: "Rutas",
};
const icons = { map_visual: Map, geocoding: Search, routing: Route };
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Sin comprobación";
const tone = (status: string): "success" | "warning" | "danger" | "inactive" =>
  status === "operational"
    ? "success"
    : status === "error" || status === "critical"
      ? "danger"
      : status === "disabled" || status === "not_configured"
        ? "inactive"
        : "warning";
const quotaTone = (percent: number | null) =>
  percent != null && percent >= 95
    ? "bg-destructive"
    : percent != null && percent >= 85
      ? "bg-orange-500"
      : percent != null && percent >= 70
        ? "bg-yellow-500"
        : "bg-primary";

function CapabilityCard({ capability }: { capability: MapCapability }) {
  const Icon = icons[capability.code];
  const percent = usagePercentage(capability.usage, capability.limit);
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Icon className="h-4 w-4" />
          {labels[capability.code]}
        </div>
        <Badge variant={tone(capability.status)}>{mapHealthLabel(capability.status)}</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Proveedor</dt>
          <dd>{capability.primaryProviderCode ?? "Sin configurar"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Credencial</dt>
          <dd>{capability.primaryProviderCode ? "Consultar proveedor" : "Pendiente"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Consumo / límite</dt>
          <dd>
            {capability.usage == null || capability.limit == null
              ? "Sin snapshot"
              : `${capability.usage.toLocaleString("es")} / ${capability.limit.toLocaleString("es")}`}
          </dd>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className={`h-full ${quotaTone(percent)} transition-all`}
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {percent == null ? "Sin porcentaje disponible" : `${percent.toFixed(1)} %`}
            {capability.capturedAt ? ` · Captura: ${formatDate(capability.capturedAt)}` : ""}
          </p>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Último chequeo</dt>
          <dd>{formatDate(capability.lastCheckedAt)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function MarketplaceMapsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({
    queryKey: ["marketplace-map-dashboard", projectId],
    queryFn: () => getMarketplaceMapDashboard(projectId),
  });
  const dashboard = dashboardQuery.data;
  const mapbox = dashboard?.providers.find((provider) => provider.code === "mapbox");
  const [drafts, setDrafts] = useState<MapCapability[]>([]);
  const [publicToken, setPublicToken] = useState("");
  const [serverToken, setServerToken] = useState("");
  const [quotaLimit, setQuotaLimit] = useState("");
  const [quotaWarning, setQuotaWarning] = useState("");
  const [testResults, setTestResults] = useState<Record<string, Record<string, unknown>>>({});
  useEffect(() => {
    if (dashboard) {
      setDrafts(dashboard.capabilities);
      setQuotaLimit(String(mapbox?.quotaConfig.administrative_limit ?? ""));
      setQuotaWarning(String(mapbox?.quotaConfig.warning_threshold_percent ?? ""));
    }
  }, [dashboard, mapbox]);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["marketplace-map-dashboard", projectId] });
  const saveCapability = useMutation({
    mutationFn: (item: MapCapability) => saveMarketplaceMapCapability(projectId, item),
    onSuccess: () => {
      toast.success("Configuración guardada.");
      refresh();
    },
    onError: () => toast.error("No se pudo guardar la configuración de mapas."),
  });
  const saveCredentials = useMutation({
    mutationFn: () =>
      saveMarketplaceMapCredentials(projectId, "mapbox", publicToken.trim(), serverToken.trim()),
    onSuccess: () => {
      setPublicToken("");
      setServerToken("");
      toast.success("Credenciales guardadas.");
      refresh();
    },
    onError: () => toast.error("No se pudieron guardar las credenciales."),
  });
  const saveProvider = useMutation({
    mutationFn: (enabled: boolean) => {
      if (!mapbox) throw new Error("Mapbox no está disponible.");
      return saveMarketplaceMapProviderConnection(projectId, { ...mapbox, enabled });
    },
    onSuccess: () => {
      toast.success("Configuración preparada guardada.");
      refresh();
    },
    onError: () => toast.error("No se pudo guardar la configuración preparada del proveedor."),
  });
  const saveQuota = useMutation({
    mutationFn: () =>
      saveMarketplaceMapQuotaConfig(projectId, "mapbox", {
        ...(mapbox?.quotaConfig ?? {}),
        administrative_limit: quotaLimit === "" ? null : Number(quotaLimit),
        warning_threshold_percent: quotaWarning === "" ? null : Number(quotaWarning),
      }),
    onSuccess: () => {
      toast.success("Límites administrativos guardados.");
      refresh();
    },
    onError: () => toast.error("No se pudieron guardar los límites administrativos."),
  });
  const testProvider = useMutation({
    mutationFn: async (capability: MapCapabilityCode) => ({
      capability,
      result: await testMarketplaceMapProvider(projectId, "mapbox", capability),
    }),
    onSuccess: ({ capability, result }) => {
      setTestResults((previous) => ({ ...previous, [capability]: result }));
      toast.success("Comprobación finalizada.");
      refresh();
    },
    onError: (error, capability) => {
      setTestResults((previous) => ({
        ...previous,
        [capability]: { ok: false, error_code: error instanceof Error ? error.message : "UNKNOWN" },
      }));
      toast.error("La comprobación no pudo completarse.");
    },
  });
  if (dashboardQuery.isLoading)
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (dashboardQuery.isError || !dashboard)
    return (
      <PageAlert tone="error" title="No se pudo cargar Mapas y rutas">
        {dashboardQuery.error instanceof Error
          ? dashboardQuery.error.message
          : "No fue posible consultar el dashboard."}
      </PageAlert>
    );
  if (!dashboard.canView)
    return (
      <PageAlert tone="error" title="Acceso denegado">
        No tienes permiso para consultar la configuración de Marketplace.
      </PageAlert>
    );
  const updateDraft = (code: MapCapabilityCode, change: Partial<MapCapability>) =>
    setDrafts((items) => items.map((item) => (item.code === code ? { ...item, ...change } : item)));
  return (
    <div className="space-y-4 sm:space-y-6">
      <ModuleHeader
        title="Mapas y rutas"
        description="Administra el mapa, la geocodificación y el cálculo de rutas de TUKTUK Marketplace."
        icon={Map}
        module="configuracion"
        actions={
          <Button variant="outline" onClick={() => refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        }
      />
      {!dashboard.canManage && (
        <PageAlert tone="info">
          Tu acceso es de solo lectura. Solicita el permiso de gestión de Marketplace para realizar
          cambios.
        </PageAlert>
      )}
      <SectionCard
        title="Runtime actual"
        description="La administración dinámica está preparada, pendiente de integrarse con el runtime."
        module="configuracion"
      >
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <p>
            <span className="font-medium">Routing y geocodificación:</span> Mapbox V6
          </p>
          <p>
            <span className="font-medium">Credencial servidor:</span> entorno Edge
          </p>
          <p>
            <span className="font-medium">Mapa visual:</span> Mapbox / credencial del build del
            cliente
          </p>
          <p className="text-muted-foreground">
            Administración dinámica: preparada, pendiente de integración con runtime.
          </p>
        </div>
      </SectionCard>
      <SectionCard
        title="Resumen operativo"
        description="Estado y consumo leídos desde el dashboard del proveedor."
        module="configuracion"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {dashboard.capabilities.map((item) => (
            <CapabilityCard key={item.code} capability={item} />
          ))}
        </div>
      </SectionCard>
      <SectionCard
        title="Proveedores"
        description="Solo los proveedores integrados pueden ponerse en funcionamiento."
        module="configuracion"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {dashboard.providers.map((provider) => (
            <div
              key={provider.code}
              className={`rounded-lg border p-4 ${provider.integrated ? "border-border-subtle bg-surface-2" : "border-dashed border-muted bg-muted/30 opacity-70"}`}
            >
              <div className="flex justify-between gap-2">
                <p className="font-semibold">{provider.name}</p>
                <Badge
                  variant={
                    provider.integrated ? (provider.enabled ? "success" : "inactive") : "inactive"
                  }
                >
                  {provider.integrated
                    ? provider.enabled
                      ? "Integrado"
                      : "Desactivado"
                    : "Próximamente"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Capacidades:{" "}
                {provider.capabilities.map((item) => labels[item]).join(", ") || "Sin especificar"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Credenciales:{" "}
                {provider.publicCredentialConfigured || provider.serverCredentialConfigured
                  ? "Configuradas"
                  : "Pendientes"}{" "}
                · {formatDate(provider.lastCheckedAt)}
              </p>
              {provider.integrated ? (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
                  <p className="text-xs text-muted-foreground">
                    Configuración preparada; no cambia el motor V6 actual.
                  </p>
                  <Switch
                    checked={provider.enabled}
                    disabled={!dashboard.canManage || saveProvider.isPending}
                    onCheckedChange={(enabled) => saveProvider.mutate(enabled)}
                    aria-label={`Activar configuración preparada para ${provider.name}`}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard
        title="Configuración Mapbox"
        description="Cada capacidad conserva su propia configuración. Los proveedores próximos no son seleccionables."
        module="configuracion"
      >
        <div className="space-y-5">
          {drafts.map((item) => (
            <div key={item.code} className="rounded-lg border border-border-subtle p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <div className="flex-1">
                  <p className="font-medium">{labels[item.code]}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Proveedor principal</Label>
                      <Input className="mt-1" value={item.primaryProviderCode ?? ""} disabled />
                    </div>
                    <div>
                      <Label>Proveedor de respaldo</Label>
                      <Input
                        className="mt-1"
                        value={item.fallbackProviderCode ?? ""}
                        disabled
                        placeholder="Sin respaldo"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={item.enabled}
                    disabled={!dashboard.canManage || !mapbox?.integrated}
                    onCheckedChange={(enabled) => updateDraft(item.code, { enabled })}
                  />
                  <span className="text-sm">{item.enabled ? "Activo" : "Inactivo"}</span>
                </div>
                <Button
                  disabled={!dashboard.canManage || saveCapability.isPending || !mapbox?.integrated}
                  onClick={() => saveCapability.mutate(item)}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
              </div>
              <CapabilityControls
                capability={item}
                disabled={!dashboard.canManage}
                onChange={(config) => updateDraft(item.code, { config })}
              />
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard
        title="Credenciales de Mapbox"
        description="Los tokens existentes se mantienen si dejas el campo vacío; nunca se muestran completos."
        module="configuracion"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="map-public-token">Token público / cliente</Label>
            <Input
              id="map-public-token"
              type="password"
              autoComplete="new-password"
              className="mt-1"
              value={publicToken}
              disabled={!dashboard.canManage || !mapbox?.integrated}
              onChange={(event) => setPublicToken(event.target.value)}
              placeholder={
                mapbox?.publicCredentialConfigured
                  ? "Configurado — escribe solo para reemplazar"
                  : "Token público"
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              La aplicación actual todavía utiliza el token incluido en su build. Guardar uno aquí
              lo prepara para la integración administrable.
            </p>
          </div>
          <div>
            <Label htmlFor="map-server-token">Token servidor</Label>
            <Input
              id="map-server-token"
              type="password"
              autoComplete="new-password"
              className="mt-1"
              value={serverToken}
              disabled={!dashboard.canManage || !mapbox?.integrated}
              onChange={(event) => setServerToken(event.target.value)}
              placeholder={
                mapbox?.serverCredentialConfigured
                  ? "Configurado — escribe solo para reemplazar"
                  : "Token servidor"
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              El gateway V6 actual utiliza la credencial configurada en su entorno Edge. Guardar una
              aquí la prepara para la integración administrable.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={!dashboard.canManage || !mapbox?.integrated || saveCredentials.isPending}
            onClick={() => saveCredentials.mutate()}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            Guardar credenciales
          </Button>
        </div>
      </SectionCard>
      <SectionCard
        title="Límites administrativos"
        description="Estos valores preparan avisos administrativos. El consumo mostrado arriba procede exclusivamente del snapshot del backend."
        module="configuracion"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="map-quota-limit">Límite administrativo</Label>
            <Input
              id="map-quota-limit"
              className="mt-1"
              type="number"
              min="0"
              value={quotaLimit}
              disabled={!dashboard.canManage || !mapbox?.integrated}
              onChange={(event) => setQuotaLimit(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="map-quota-warning">Umbral de aviso (%)</Label>
            <Input
              id="map-quota-warning"
              className="mt-1"
              type="number"
              min="0"
              max="100"
              value={quotaWarning}
              disabled={!dashboard.canManage || !mapbox?.integrated}
              onChange={(event) => setQuotaWarning(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={!dashboard.canManage || !mapbox?.integrated || saveQuota.isPending}
            onClick={() => saveQuota.mutate()}
          >
            <Save className="mr-2 h-4 w-4" />
            Guardar límites
          </Button>
        </div>
      </SectionCard>
      <SectionCard
        title="Probar conexión"
        description="Las pruebas no bloquean el resto de la página y se ejecutan con tu sesión autenticada."
        module="configuracion"
      >
        <div className="grid gap-3 md:grid-cols-3">
          {dashboard.capabilities.map((item) => {
            const result = testResults[item.code];
            const code = result?.error_code;
            return (
              <div className="rounded-lg border border-border-subtle p-4" key={item.code}>
                <p className="font-medium">{labels[item.code]}</p>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  disabled={!dashboard.canManage || !mapbox?.integrated || testProvider.isPending}
                  onClick={() => testProvider.mutate(item.code)}
                >
                  Probar conexión
                </Button>
                {result && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {result.ok ? "Correcto" : translateMapError(code)}
                    {result.http_status ? ` · HTTP ${result.http_status}` : ""}
                    {result.latency_ms ? ` · ${result.latency_ms} ms` : ""}
                    <br />
                    {formatDate(String(result.checked_at ?? new Date().toISOString()))}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function CapabilityControls({
  capability,
  disabled,
  onChange,
}: {
  capability: MapCapability;
  disabled: boolean;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const config = capability.config;
  const set = (key: string, input: string | number) => onChange({ ...config, [key]: input });
  const fields =
    capability.code === "map_visual"
      ? [
          ["style", "Estilo", "text"],
          ["tile_size", "Tamaño de mosaico", "number"],
        ]
      : capability.code === "geocoding"
        ? [
            ["country", "País", "text"],
            ["language", "Idioma", "text"],
            ["limit", "Límite", "number"],
          ]
        : [
            ["profile", "Perfil", "text"],
            ["timeout_ms", "Tiempo de espera (ms)", "number"],
            ["quote_ttl_seconds", "TTL de cotización (s)", "number"],
          ];
  return (
    <div className="mt-4 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-3">
      {fields.map(([key, label, type]) => (
        <div key={key}>
          <Label>{label}</Label>
          <Input
            className="mt-1"
            type={type}
            disabled={disabled}
            value={String(config[key] ?? "")}
            onChange={(event) =>
              set(key, type === "number" ? Number(event.target.value) : event.target.value)
            }
          />
        </div>
      ))}
    </div>
  );
}
