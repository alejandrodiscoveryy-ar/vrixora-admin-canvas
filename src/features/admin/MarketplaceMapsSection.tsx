import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Gauge,
  KeyRound,
  Loader2,
  Map,
  Pencil,
  RefreshCw,
  Route,
  Search,
  Server,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { PageAlert } from "@/components/admin/PageAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const icons = {
  map_visual: Map,
  geocoding: Search,
  routing: Route,
};

const capabilityVisuals: Record<
  MapCapabilityCode,
  {
    card: string;
    icon: string;
    strip: string;
    panel: string;
    text: string;
  }
> = {
  map_visual: {
    card: "border-sky-500/25 bg-sky-500/[0.025]",
    icon: "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    strip: "from-sky-500 via-sky-400/55 to-transparent",
    panel: "border-sky-500/20 bg-sky-500/[0.06]",
    text: "text-sky-600 dark:text-sky-400",
  },
  geocoding: {
    card: "border-violet-500/25 bg-violet-500/[0.025]",
    icon: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
    strip: "from-violet-500 via-violet-400/55 to-transparent",
    panel: "border-violet-500/20 bg-violet-500/[0.06]",
    text: "text-violet-600 dark:text-violet-400",
  },
  routing: {
    card: "border-emerald-500/25 bg-emerald-500/[0.025]",
    icon: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    strip: "from-emerald-500 via-emerald-400/55 to-transparent",
    panel: "border-emerald-500/20 bg-emerald-500/[0.06]",
    text: "text-emerald-600 dark:text-emerald-400",
  },
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
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

const configValue = (capability: MapCapability, key: string, fallback = "—") => {
  const value = capability.config[key];
  return value == null || value === "" ? fallback : String(value);
};

function capabilitySummary(capability: MapCapability) {
  if (capability.code === "map_visual") {
    return [
      ["Estilo", configValue(capability, "style")],
      ["Mosaico", configValue(capability, "tile_size")],
    ];
  }

  if (capability.code === "geocoding") {
    return [
      ["País", configValue(capability, "country")],
      ["Idioma", configValue(capability, "language")],
      ["Límite", configValue(capability, "limit")],
    ];
  }

  return [
    ["Perfil", configValue(capability, "profile")],
    ["Timeout", `${configValue(capability, "timeout_ms")} ms`],
    ["TTL", `${configValue(capability, "quote_ttl_seconds")} s`],
  ];
}

function CapabilityCard({ capability }: { capability: MapCapability }) {
  const Icon = icons[capability.code];
  const visual = capabilityVisuals[capability.code];
  const percent = usagePercentage(capability.usage, capability.limit);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${visual.card}`}
    >
      <div className={`h-1 bg-gradient-to-r ${visual.strip}`} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${visual.icon}`}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{labels[capability.code]}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {capability.primaryProviderCode ?? "Sin configurar"}
              </p>
            </div>
          </div>

          <Badge variant={tone(capability.status)}>{mapHealthLabel(capability.status)}</Badge>
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${visual.panel}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">Consumo / límite</span>
            <span className={`text-xs font-semibold ${visual.text}`}>
              {percent == null ? "Sin porcentaje" : `${percent.toFixed(1)} %`}
            </span>
          </div>

          <p className="mt-1 text-sm font-semibold text-foreground">
            {capability.usage == null || capability.limit == null
              ? "Sin snapshot"
              : `${capability.usage.toLocaleString("es")} / ${capability.limit.toLocaleString("es")}`}
          </p>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background/70">
            <div
              className={`h-full rounded-full ${quotaTone(percent)} transition-all`}
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border/60 bg-background/45 p-2.5">
            <p className="text-muted-foreground">Credencial</p>
            <p className="mt-1 font-medium text-foreground">
              {capability.primaryProviderCode ? "Consultar proveedor" : "Pendiente"}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/45 p-2.5">
            <p className="text-muted-foreground">Último chequeo</p>
            <p className="mt-1 font-medium text-foreground">
              {formatDate(capability.lastCheckedAt)}
            </p>
          </div>
        </div>

        {capability.capturedAt ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Snapshot: {formatDate(capability.capturedAt)}
          </p>
        ) : null}
      </div>
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

  const [editingCapability, setEditingCapability] = useState<MapCapability | null>(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [publicToken, setPublicToken] = useState("");
  const [serverToken, setServerToken] = useState("");
  const [quotaLimit, setQuotaLimit] = useState("");
  const [quotaWarning, setQuotaWarning] = useState("");
  const [testResults, setTestResults] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    if (dashboard) {
      setQuotaLimit(String(mapbox?.quotaConfig.administrative_limit ?? ""));
      setQuotaWarning(String(mapbox?.quotaConfig.warning_threshold_percent ?? ""));
    }
  }, [dashboard, mapbox]);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["marketplace-map-dashboard", projectId],
    });

  const saveCapability = useMutation({
    mutationFn: (item: MapCapability) => saveMarketplaceMapCapability(projectId, item),
    onSuccess: () => {
      toast.success("Configuración guardada.");
      setEditingCapability(null);
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
      setCredentialsOpen(false);
      toast.success("Credenciales guardadas.");
      refresh();
    },
    onError: () => toast.error("No se pudieron guardar las credenciales."),
  });

  const saveProvider = useMutation({
    mutationFn: (enabled: boolean) => {
      if (!mapbox) throw new Error("Mapbox no está disponible.");
      return saveMarketplaceMapProviderConnection(projectId, {
        ...mapbox,
        enabled,
      });
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
      setQuotaOpen(false);
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
      setTestResults((previous) => ({
        ...previous,
        [capability]: result,
      }));
      toast.success("Comprobación finalizada.");
      refresh();
    },
    onError: (error, capability) => {
      setTestResults((previous) => ({
        ...previous,
        [capability]: {
          ok: false,
          error_code: error instanceof Error ? error.message : "UNKNOWN",
        },
      }));
      toast.error("La comprobación no pudo completarse.");
    },
  });

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboard) {
    return (
      <PageAlert tone="error" title="No se pudo cargar Mapas y rutas">
        {dashboardQuery.error instanceof Error
          ? dashboardQuery.error.message
          : "No fue posible consultar el dashboard."}
      </PageAlert>
    );
  }

  if (!dashboard.canView) {
    return (
      <PageAlert tone="error" title="Acceso denegado">
        No tienes permiso para consultar la configuración de Marketplace.
      </PageAlert>
    );
  }

  const openQuotaEditor = () => {
    setQuotaLimit(String(mapbox?.quotaConfig.administrative_limit ?? ""));
    setQuotaWarning(String(mapbox?.quotaConfig.warning_threshold_percent ?? ""));
    setQuotaOpen(true);
  };

  return (
    <div className="space-y-6">
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

      {!dashboard.canManage ? (
        <PageAlert tone="info">
          Tu acceso es de solo lectura. Solicita el permiso de gestión de Marketplace para realizar
          cambios.
        </PageAlert>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-sm">
        <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Runtime actual</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Estado técnico de la integración actualmente utilizada.
            </p>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-sky-600 dark:text-sky-400">
              Routing y geocodificación
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">Mapbox V6</p>
          </div>

          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-violet-600 dark:text-violet-400">
              Credencial servidor
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">Entorno Edge</p>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-emerald-600 dark:text-emerald-400">
              Mapa visual
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              Mapbox / credencial del build del cliente
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-amber-600 dark:text-amber-400">
              Administración dinámica
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">Preparada</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Pendiente de integración con runtime
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                Resumen operativo
              </h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Estado y consumo leídos desde el dashboard del proveedor.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {dashboard.capabilities.map((item) => (
            <CapabilityCard key={item.code} capability={item} />
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/55 shadow-sm">
        <div className="border-b border-border/60 px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">Proveedores</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Solo los proveedores integrados pueden ponerse en funcionamiento.
          </p>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2">
          {dashboard.providers.map((provider) => {
            const active = provider.integrated && provider.enabled;

            return (
              <div
                key={provider.code}
                className={`relative overflow-hidden rounded-2xl border p-4 ${
                  provider.integrated
                    ? "border-primary/25 bg-primary/[0.035] shadow-sm"
                    : "border-dashed border-border/60 bg-muted/20 opacity-70"
                }`}
              >
                {provider.integrated ? (
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/50 to-transparent" />
                ) : null}

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{provider.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {provider.integrated
                        ? "Proveedor disponible para Marketplace"
                        : "Integración prevista"}
                    </p>
                  </div>

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

                <div className="mt-4 flex flex-wrap gap-2">
                  {provider.capabilities.length ? (
                    provider.capabilities.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                      >
                        {labels[item]}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Sin capacidades especificadas
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-border/60 bg-background/45 p-2.5">
                    <p className="text-muted-foreground">Credenciales</p>
                    <p className="mt-1 font-medium text-foreground">
                      {provider.publicCredentialConfigured || provider.serverCredentialConfigured
                        ? "Configuradas"
                        : "Pendientes"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-background/45 p-2.5">
                    <p className="text-muted-foreground">Última comprobación</p>
                    <p className="mt-1 font-medium text-foreground">
                      {formatDate(provider.lastCheckedAt)}
                    </p>
                  </div>
                </div>

                {provider.integrated ? (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                    <div>
                      <p className="text-xs font-medium text-foreground">Configuración preparada</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        No cambia el motor V6 actual.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {active ? "Activa" : "Inactiva"}
                      </span>
                      <Switch
                        checked={provider.enabled}
                        disabled={!dashboard.canManage || saveProvider.isPending}
                        onCheckedChange={(enabled) => saveProvider.mutate(enabled)}
                        aria-label={`Activar configuración preparada para ${provider.name}`}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Configuración Mapbox
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulta la configuración activa y abre el editor solo cuando necesites cambiarla.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {dashboard.capabilities.map((item) => {
            const Icon = icons[item.code];
            const visual = capabilityVisuals[item.code];
            const summary = capabilitySummary(item);

            return (
              <div
                key={item.code}
                className={`relative overflow-hidden rounded-2xl border shadow-sm ${visual.card}`}
              >
                <div className={`h-1 bg-gradient-to-r ${visual.strip}`} />

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl border ${visual.icon}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-foreground">{labels[item.code]}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.primaryProviderCode ?? "Sin proveedor"}
                        </p>
                      </div>
                    </div>

                    <Badge variant={item.enabled ? "success" : "inactive"}>
                      {item.enabled ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2">
                    {summary.map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5"
                      >
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="max-w-[60%] truncate text-xs font-semibold text-foreground">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {dashboard.canManage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full"
                      disabled={!mapbox?.integrated}
                      onClick={() =>
                        setEditingCapability({
                          ...item,
                          config: { ...item.config },
                        })
                      }
                    >
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Editar configuración
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-violet-500/20 bg-violet-500/[0.025] shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <KeyRound className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground">Credenciales de Mapbox</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Estado de los tokens administrables.
                  </p>
                </div>
              </div>

              <ShieldCheck className="h-5 w-5 text-violet-500" />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Token público / cliente</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {mapbox?.publicCredentialConfigured ? "Configurado" : "Pendiente"}
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Token servidor</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {mapbox?.serverCredentialConfigured ? "Configurado" : "Pendiente"}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Última comprobación: {formatDate(mapbox?.lastCheckedAt ?? null)}
            </p>

            {dashboard.canManage ? (
              <Button
                className="mt-4 w-full"
                variant="outline"
                disabled={!mapbox?.integrated}
                onClick={() => setCredentialsOpen(true)}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Administrar credenciales
              </Button>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/[0.025] shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Gauge className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground">Límites administrativos</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Avisos administrativos de consumo.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Límite administrativo</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {mapbox?.quotaConfig.administrative_limit == null
                    ? "Sin definir"
                    : Number(mapbox.quotaConfig.administrative_limit).toLocaleString("es")}
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Umbral de aviso</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {mapbox?.quotaConfig.warning_threshold_percent == null
                    ? "Sin definir"
                    : `${mapbox.quotaConfig.warning_threshold_percent} %`}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              El consumo mostrado procede exclusivamente del snapshot del backend.
            </p>

            {dashboard.canManage ? (
              <Button
                className="mt-4 w-full"
                variant="outline"
                disabled={!mapbox?.integrated}
                onClick={openQuotaEditor}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Editar límites
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Probar conexión</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Las pruebas se ejecutan con tu sesión autenticada y no bloquean el resto de la página.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {dashboard.capabilities.map((item) => {
            const Icon = icons[item.code];
            const visual = capabilityVisuals[item.code];
            const result = testResults[item.code];
            const code = result?.error_code;

            return (
              <div
                key={item.code}
                className={`relative overflow-hidden rounded-2xl border shadow-sm ${visual.card}`}
              >
                <div className={`h-1 bg-gradient-to-r ${visual.strip}`} />

                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border ${visual.icon}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <p className="text-sm font-semibold text-foreground">{labels[item.code]}</p>
                  </div>

                  <Button
                    className="mt-4 w-full"
                    variant="outline"
                    disabled={!dashboard.canManage || !mapbox?.integrated || testProvider.isPending}
                    onClick={() => testProvider.mutate(item.code)}
                  >
                    {testProvider.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Activity className="mr-2 h-4 w-4" />
                    )}
                    Probar conexión
                  </Button>

                  {result ? (
                    <div className="mt-3 rounded-xl border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">
                        {result.ok ? "Correcto" : translateMapError(code)}
                      </p>
                      <p className="mt-1">
                        {result.http_status ? `HTTP ${result.http_status}` : "Sin HTTP"}
                        {result.latency_ms ? ` · ${result.latency_ms} ms` : ""}
                      </p>
                      <p className="mt-1">
                        {formatDate(String(result.checked_at ?? new Date().toISOString()))}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Sin prueba ejecutada en esta sesión.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={Boolean(editingCapability)}
        onOpenChange={(open) => {
          if (!open && !saveCapability.isPending) {
            setEditingCapability(null);
          }
        }}
      >
        {editingCapability ? (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader className="pr-8">
              <DialogTitle>Editar configuración · {labels[editingCapability.code]}</DialogTitle>
              <DialogDescription>Modifica únicamente esta capacidad de Mapbox.</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Proveedor principal</Label>
                  <Input
                    className="mt-1"
                    value={editingCapability.primaryProviderCode ?? ""}
                    disabled
                  />
                </div>

                <div>
                  <Label>Proveedor de respaldo</Label>
                  <Input
                    className="mt-1"
                    value={editingCapability.fallbackProviderCode ?? ""}
                    disabled
                    placeholder="Sin respaldo"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/40 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Capacidad activa</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Controla si esta configuración queda habilitada.
                  </p>
                </div>

                <Switch
                  checked={editingCapability.enabled}
                  disabled={!dashboard.canManage || !mapbox?.integrated}
                  onCheckedChange={(enabled) =>
                    setEditingCapability({
                      ...editingCapability,
                      enabled,
                    })
                  }
                />
              </label>

              <CapabilityControls
                capability={editingCapability}
                disabled={!dashboard.canManage}
                onChange={(config) =>
                  setEditingCapability({
                    ...editingCapability,
                    config,
                  })
                }
              />
            </div>

            <DialogFooter className="border-t border-border/60 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={saveCapability.isPending}
                onClick={() => setEditingCapability(null)}
              >
                Cancelar
              </Button>

              <Button
                type="button"
                disabled={!dashboard.canManage || !mapbox?.integrated || saveCapability.isPending}
                onClick={() => saveCapability.mutate(editingCapability)}
              >
                {saveCapability.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Guardar configuración
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={credentialsOpen}
        onOpenChange={(open) => {
          if (!open && !saveCredentials.isPending) {
            setCredentialsOpen(false);
            setPublicToken("");
            setServerToken("");
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader className="pr-8">
            <DialogTitle>Credenciales de Mapbox</DialogTitle>
            <DialogDescription>
              Los tokens existentes se mantienen si dejas el campo vacío; nunca se muestran
              completos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
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
                El gateway V6 actual utiliza la credencial configurada en su entorno Edge. Guardar
                una aquí la prepara para la integración administrable.
              </p>
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={saveCredentials.isPending}
              onClick={() => {
                setCredentialsOpen(false);
                setPublicToken("");
                setServerToken("");
              }}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              disabled={!dashboard.canManage || !mapbox?.integrated || saveCredentials.isPending}
              onClick={() => saveCredentials.mutate()}
            >
              {saveCredentials.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Guardar credenciales
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={quotaOpen}
        onOpenChange={(open) => {
          if (!open && !saveQuota.isPending) {
            setQuotaOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="pr-8">
            <DialogTitle>Límites administrativos</DialogTitle>
            <DialogDescription>
              Configura el límite interno y el porcentaje de advertencia.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
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

          <DialogFooter className="border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={saveQuota.isPending}
              onClick={() => setQuotaOpen(false)}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              disabled={!dashboard.canManage || !mapbox?.integrated || saveQuota.isPending}
              onClick={() => saveQuota.mutate()}
            >
              {saveQuota.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Gauge className="mr-2 h-4 w-4" />
              )}
              Guardar límites
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  const set = (key: string, input: string | number) =>
    onChange({
      ...config,
      [key]: input,
    });

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
    <div className="grid gap-3 sm:grid-cols-2">
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
