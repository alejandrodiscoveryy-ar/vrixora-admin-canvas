import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FlaskConical,
  MapPin,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSupabaseClient } from "@/lib/supabase";
import { supabaseServices } from "@/lib/services";
import MarketplaceTestRouteMap, { type TestPoint } from "./MarketplaceTestRouteMap";
import "./MarketplaceTestCenterPremium.css";

interface TestQuote {
  key: string;
  distanceKm: number;
  durationSeconds: number;
  routePoints: Array<{ lat: number; lon: number }>;
  recommendedPrice: number | null;
  exchangeRate: number | null;
}
interface GeocodeSuggestion extends TestPoint {}
interface AudienceDriver {
  driver_user_id: string;
  display_name: string;
  status: string;
}
interface TestHistoryEntry {
  job_id: string;
  created_at: string;
  status: string;
  service_code: string;
  origin_text: string;
  destination_text: string;
  final_price: number;
  recipient_count: number;
  destination_mode: string;
  accepted_driver_user_id: string | null;
  recipients: Array<{ driver_user_id: string; display_name: string }>;
  notification_status: Array<{
    driver_user_id: string;
    delivery_status: string;
    attempt_count: number;
  }>;
  deleted: boolean;
}
const names: Record<string, string> = {
  passenger: "Pasajeros",
  cargo: "Carga",
  courier: "Mensajería",
  tourism: "Turismo",
  light_car: "Auto ligero",
  bicitaxi: "Bicitaxi",
  tricycle: "Triciclo",
  bicycle: "Bicicleta",
  motorcycle: "Motocicleta",
  van: "Furgoneta",
  truck: "Camión",
  other: "Otro",
  individual: "Individual",
  group: "Grupo",
  published: "Publicada",
  accepted: "Aceptada",
  en_route: "En camino",
  pickup: "Recogida",
  in_progress: "En curso",
  completed: "Completada",
  settled: "Liquidada",
  expired: "Expirada",
  incident: "Incidencia",
};
function labelFor(value: string) {
  return names[value] ?? value;
}
function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : "No se pudo completar la operación.";
}

async function rpcJson<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export default function MarketplaceTestCenterV2({
  projectId,
  canManage,
  canManagePayments,
  onOpenJob,
}: {
  projectId: string;
  canManage: boolean;
  canManagePayments: boolean;
  onOpenJob: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forceRealCommission, setForceRealCommission] = useState(false);
  const [recipientMode, setRecipientMode] = useState<"individual" | "group">("individual");
  const [individualId, setIndividualId] = useState("");
  const [serviceCode, setServiceCode] = useState("passenger");
  const [vehicleCategory, setVehicleCategory] = useState("tricycle");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [price, setPrice] = useState("200");
  const [priceMode, setPriceMode] = useState<"auto" | "manual">("auto");
  const [originPoint, setOriginPoint] = useState<TestPoint | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<TestPoint | null>(null);
  const [picking, setPicking] = useState<"origin" | "destination" | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [routeQuote, setRouteQuote] = useState<TestQuote | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [successJobId, setSuccessJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El laboratorio permanece compacto por defecto. No se altera la semántica V2.
  const [driversOpen, setDriversOpen] = useState(false);
  const [driverSearch, setDriverSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyCursors, setHistoryCursors] = useState<
    Array<{ createdAt: string; jobId: string } | null>
  >([null]);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [expandedJobs, setExpandedJobs] = useState<string[]>([]);

  const current = useQuery({
    queryKey: ["marketplace-test-mode", projectId],
    queryFn: () => supabaseServices.marketplace.testMode(projectId),
  });
  const drivers = useQuery({
    queryKey: ["marketplace-test-mode-drivers", projectId],
    queryFn: () => supabaseServices.marketplace.listDrivers(projectId, { limit: 200 }),
  });
  const audience = useQuery({
    queryKey: ["marketplace-test-audience", projectId],
    queryFn: () =>
      rpcJson<AudienceDriver[]>("admin_get_marketplace_test_audience", {
        target_project_id: projectId,
      }),
  });
  const history = useQuery({
    queryKey: [
      "marketplace-test-history-v3",
      projectId,
      historyPage,
      historyFilter,
      historyCursors[historyPage],
    ],
    queryFn: () =>
      rpcJson<{
        items: TestHistoryEntry[];
        has_more: boolean;
        next_created_at: string | null;
        next_job_id: string | null;
      }>("admin_list_marketplace_test_jobs_v3", {
        target_project_id: projectId,
        target_limit: 10,
        target_cursor_created_at: historyCursors[historyPage]?.createdAt ?? null,
        target_cursor_job_id: historyCursors[historyPage]?.jobId ?? null,
        target_status: historyFilter === "all" ? null : historyFilter,
      }),
    enabled: historyOpen,
  });
  useEffect(() => {
    if (!current.data || !audience.data) return;
    setEnabled(current.data.enabled);
    const ids = audience.data.map((item) => item.driver_user_id);
    if (ids.length === 0 && current.data.targetDriverUserId)
      ids.push(current.data.targetDriverUserId);
    setSelectedIds(ids);
  }, [current.data, audience.data]);
  useEffect(() => {
    if (!selectedIds.includes(individualId)) setIndividualId(selectedIds[0] ?? "");
  }, [selectedIds, individualId]);
  const eligible = useMemo(
    () =>
      (drivers.data?.items ?? []).filter(
        (driver) =>
          driver.status === "active" && Boolean(driver.activatedAt) && !driver.suspendedAt,
      ),
    [drivers.data],
  );
  const selected = eligible.filter((driver) => selectedIds.includes(driver.userId));
  const visibleDrivers = eligible.filter((driver) =>
    driver.displayName.toLocaleLowerCase("es").includes(driverSearch.toLocaleLowerCase("es")),
  );
  const historyVisible = history.data?.items ?? [];
  const completeCount = (history.data?.items ?? []).filter((job) =>
    ["settled", "completed"].includes(job.status),
  ).length;
  const pointKey = (point: TestPoint | null) =>
    point ? `${point.lat.toFixed(6)},${point.lon.toFixed(6)}` : "-";
  const routeKey = `${pointKey(originPoint)}|${pointKey(destinationPoint)}|${serviceCode}|${vehicleCategory}`;
  const validQuote = routeQuote?.key === routeKey ? routeQuote : null;
  const selectedPrice =
    priceMode === "auto" ? (validQuote?.recommendedPrice ?? NaN) : Number(price);
  const canUseAuto =
    serviceCode !== "tourism" &&
    (serviceCode !== "passenger" ||
      ["motorcycle", "tricycle", "bicitaxi", "light_car"].includes(vehicleCategory));

  // Reutiliza los servicios Mapbox oficiales del cliente, nunca sus credenciales secretas.
  useEffect(() => {
    let cancelled = false;
    if (originPoint || origin.trim().length < 3) {
      setOriginSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void getSupabaseClient()
        .functions.invoke("marketplace-map-gateway", {
          body: { operation: "geocode", query: origin.trim() },
        })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setOriginSuggestions([]);
            return;
          }
          const rows = Array.isArray(data?.data) ? data.data : [];
          setOriginSuggestions(
            rows
              .filter((p: GeocodeSuggestion) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
              .slice(0, 6),
          );
        })
        .catch(() => {
          if (!cancelled) setOriginSuggestions([]);
        });
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [origin, originPoint]);
  useEffect(() => {
    let cancelled = false;
    if (destinationPoint || destination.trim().length < 3) {
      setDestinationSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void getSupabaseClient()
        .functions.invoke("marketplace-map-gateway", {
          body: { operation: "geocode", query: destination.trim() },
        })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setDestinationSuggestions([]);
            return;
          }
          const rows = Array.isArray(data?.data) ? data.data : [];
          setDestinationSuggestions(
            rows
              .filter((p: GeocodeSuggestion) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
              .slice(0, 6),
          );
        })
        .catch(() => {
          if (!cancelled) setDestinationSuggestions([]);
        });
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [destination, destinationPoint]);
  async function pickFromMap(kind: "origin" | "destination", lat: number, lon: number) {
    setPicking(null);
    const fallback = `Punto ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    let label = fallback;
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "marketplace-map-gateway",
        { body: { operation: "reverse_geocode", point: { lat, lon } } },
      );
      if (!error && typeof data?.data?.label === "string") label = data.data.label;
    } catch {
      /* El pin sigue siendo preciso, aunque Mapbox no devuelva un nombre. */
    }
    const point = { lat, lon, label };
    if (kind === "origin") {
      setOriginPoint(point);
      setOrigin(label);
    } else {
      setDestinationPoint(point);
      setDestination(label);
    }
  }
  async function calculateRoute() {
    if (!originPoint || !destinationPoint) {
      setRouteError("Selecciona origen y destino entre las sugerencias o en el mapa.");
      return;
    }
    if (!canUseAuto && priceMode === "auto") {
      setRouteError(
        "Esta combinación no tiene cotización automática. Cambia a Precio manual de prueba.",
      );
      return;
    }
    setRouteError(null);
    setRouteLoading(true);
    setRouteQuote(null);
    const key = routeKey;
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "marketplace-map-gateway",
        {
          body: {
            operation: "route_quote",
            origin: { lat: originPoint.lat, lon: originPoint.lon },
            destination: { lat: destinationPoint.lat, lon: destinationPoint.lon },
            pricing: { vehicle_category_code: vehicleCategory, passenger_count: 1, stop_count: 0 },
          },
        },
      );
      if (error) throw error;
      if (data?.error) throw Error(String(data.error));
      const root = data?.data;
      const priced =
        serviceCode === "passenger"
          ? root?.prices?.passenger_by_category?.[vehicleCategory]
          : root?.prices?.[serviceCode];
      const suggested = Number(priced?.recommended_price);
      const distance = Number(root?.distance_km),
        duration = Number(root?.duration_seconds);
      if (
        !Number.isFinite(distance) ||
        distance <= 0 ||
        !Number.isFinite(duration) ||
        duration <= 0
      )
        throw Error("ROUTE_QUOTE_INVALID");
      // Un cambio mientras se calculaba no autoriza reutilizar la cotización antigua.
      setRouteQuote({
        key,
        distanceKm: distance,
        durationSeconds: duration,
        routePoints: Array.isArray(root?.route_points) ? root.route_points : [],
        recommendedPrice: Number.isFinite(suggested) && suggested > 0 ? suggested : null,
        exchangeRate: Number.isFinite(Number(priced?.exchange_rate_snapshot))
          ? Number(priced.exchange_rate_snapshot)
          : null,
      });
    } catch (reason) {
      setRouteError(errorMessage(reason));
    } finally {
      setRouteLoading(false);
    }
  }

  const activeCount = (history.data?.items ?? []).filter((job) =>
    ["published", "accepted", "en_route", "pickup", "in_progress"].includes(job.status),
  ).length;
  const allowed = recipientMode === "group" ? selectedIds : individualId ? [individualId] : [];
  const configured = current.data?.enabled && audience.data != null;
  const dirty =
    enabled !== Boolean(current.data?.enabled) ||
    [...selectedIds].sort().join() !==
      [
        ...(audience.data?.map((d) => d.driver_user_id) ??
          (current.data?.targetDriverUserId ? [current.data.targetDriverUserId] : [])),
      ]
        .sort()
        .join();

  const save = useMutation({
    mutationFn: async () => {
      if (enabled && selectedIds.length === 0) throw new Error("Selecciona al menos un conductor.");
      if (selectedIds.length > 30) throw new Error("El máximo es de 30 conductores.");
      if (selectedIds.length > 0) {
        await rpcJson("admin_set_marketplace_test_audience", {
          target_project_id: projectId,
          target_driver_user_ids: selectedIds,
        });
      }
      return supabaseServices.marketplace.setTestMode(projectId, {
        enabled,
        targetDriverUserId: enabled ? (selectedIds[0] ?? null) : null,
        forceWalletCommission: false,
      });
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["marketplace-test-audience", projectId] });
      void qc.invalidateQueries({ queryKey: ["marketplace-test-mode", projectId] });
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!configured || dirty)
        throw new Error("Guarda primero el grupo de conductores y el modo de prueba.");
      if (allowed.length < 1) throw new Error("Selecciona el destinatario de esta carrera.");
      if (!originPoint || !destinationPoint || !validQuote)
        throw new Error("Calcula primero un recorrido real en el mapa.");
      if (priceMode === "auto" && (!canUseAuto || validQuote.recommendedPrice == null))
        throw new Error(
          "No existe cotización automática válida. Selecciona precio manual o revisa las tarifas.",
        );
      if (!Number.isFinite(selectedPrice) || selectedPrice <= 0 || selectedPrice > 100000)
        throw new Error("El importe debe ser mayor que cero y no superar 100.000 CUP.");
      if (forceRealCommission && !canManagePayments)
        throw new Error("No tienes permiso financiero para probar una comisión real.");
      if (
        !window.confirm(
          `Crear UNA carrera de PRUEBA para ${allowed.length} conductor(es), por ${selectedPrice} CUP. ${forceRealCommission ? "ATENCIÓN: se aplicará una comisión REAL al conductor que acepte." : "Sin cobrar comisión real."} ¿Enviar?`,
        )
      )
        return null;
      if (
        forceRealCommission &&
        !window.confirm(
          "CONFIRMACIÓN FINANCIERA: este ensayo puede reservar y cobrar saldo real del conductor. ¿Confirmas expresamente?",
        )
      )
        return null;
      const { data, error: gatewayError } = await getSupabaseClient().functions.invoke(
        "marketplace-map-admin-gateway",
        {
          body: {
            operation: "test_lab_create_v3",
            project_id: projectId,
            target_idempotency_key: requestKey,
            target_driver_user_ids: allowed,
            target_service_code: serviceCode,
            target_vehicle_category_code: vehicleCategory || null,
            target_origin_text: origin.trim(),
            target_destination_text: destination.trim(),
            target_origin_point: { lat: originPoint.lat, lon: originPoint.lon },
            target_destination_point: { lat: destinationPoint.lat, lon: destinationPoint.lon },
            target_price_mode: priceMode,
            target_expected_price: selectedPrice,
            target_notes: notes.trim() || null,
            target_force_wallet_commission: forceRealCommission,
          },
        },
      );
      if (gatewayError) throw gatewayError;
      if (data?.error) throw new Error(String(data.error));
      const created = data?.data ?? data;
      if (!created || typeof created.job_id !== "string")
        throw Error("TEST_LAB_V3_RESPONSE_INVALID");
      return created as { job_id: string; replayed: boolean };
    },
    onSuccess: (result) => {
      if (!result) return;
      setError(null);
      setSuccessJobId(result.job_id);
      setRequestKey(crypto.randomUUID());
      void qc.invalidateQueries({ queryKey: ["marketplace-test-history-v3", projectId] });
      void qc.invalidateQueries({ queryKey: ["marketplace-jobs", projectId] });
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const clean = useMutation({
    mutationFn: async () => {
      const why = window.prompt(
        "Motivo para eliminar todas las carreras de prueba:",
        "Limpieza de pruebas",
      );
      if (!why?.trim()) return false;
      if (
        !window.confirm(
          "Se ocultarán TODAS las carreras de PRUEBA. Las carreras reales se conservarán. ¿Continuar?",
        )
      )
        return false;
      await supabaseServices.marketplace.deleteAllTestJobs(projectId, why.trim());
      return true;
    },
    onSuccess: (yes) => {
      if (yes) {
        void qc.invalidateQueries({ queryKey: ["marketplace-test-history-v3", projectId] });
        void qc.invalidateQueries({ queryKey: ["marketplace-jobs", projectId] });
      }
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  const loading = current.isPending || drivers.isPending || audience.isPending;
  return (
    <section className="tt-lab-v4 min-w-0 space-y-3 xl:col-span-2" aria-label="Centro de pruebas">
      <div className="tt-lab-v4-header relative overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.08] via-background/80 to-cyan-500/[0.055] px-4 py-3 sm:px-5">
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-400/10">
              <FlaskConical className="h-5 w-5 text-violet-200" />
            </span>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                Centro de pruebas
              </h3>
              <p className="text-xs text-muted-foreground">
                Simulación controlada · sin comisiones por defecto
              </p>
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/55 px-3 py-2 text-sm font-medium text-foreground">
            {enabled ? "Activado" : "Desactivado"}
            <Switch
              checked={enabled}
              disabled={!canManage || loading || save.isPending}
              onCheckedChange={setEnabled}
              aria-label="Activar modo de prueba"
            />
          </label>
        </div>
        <div
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
          aria-label="Resumen del laboratorio"
        >
          {[
            { label: "Conductores", value: String(selectedIds.length) },
            {
              label: "En esta página",
              value: history.isSuccess ? String(history.data.items.length) : "—",
            },
            { label: "Activas en página", value: history.isSuccess ? String(activeCount) : "—" },
            {
              label: "Terminadas en página",
              value: history.isSuccess ? String(completeCount) : "—",
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-border/45 bg-background/55 px-3 py-2"
            >
              <span className="text-[11px] text-muted-foreground">{metric.label}</span>
              <p className="mt-0.5 text-lg font-bold leading-tight tabular-nums text-foreground">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Cargando configuración…</p>
      ) : null}
      {current.isError || drivers.isError || audience.isError ? (
        <p role="alert" className="text-sm text-rose-200">
          No se pudo consultar el centro de pruebas.{" "}
          {errorMessage(current.error ?? drivers.error ?? audience.error)}
        </p>
      ) : null}
      {!loading && !current.isError && !drivers.isError && !audience.isError ? (
        <>
          <div className="tt-lab-v4-workspace grid min-w-0 gap-3">
            <section className="tt-lab-v4-drivers min-w-0 rounded-2xl border border-border/60 bg-background/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4 text-cyan-300" />
                  Conductores autorizados
                </h4>
                <button
                  type="button"
                  aria-expanded={driversOpen}
                  aria-controls="test-driver-chooser"
                  onClick={() => setDriversOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.045] px-3 py-2 text-xs font-semibold text-cyan-200"
                >
                  {selectedIds.length} seleccionados{" "}
                  {driversOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Selecciona uno o varios conductores. El grupo se guarda antes de enviar.
              </p>
              {!driversOpen && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selected.length ? (
                    selected.slice(0, 3).map((d) => (
                      <span
                        key={d.userId}
                        className="rounded-lg border border-border/55 bg-muted/20 px-2.5 py-1.5 text-xs text-foreground"
                      >
                        {d.displayName}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin selección</span>
                  )}
                  {selected.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{selected.length - 3} más
                    </span>
                  )}
                </div>
              )}
              {driversOpen && (
                <div id="test-driver-chooser" className="mt-3">
                  <label className="relative block">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <span className="sr-only">Buscar conductor</span>
                    <input
                      value={driverSearch}
                      onChange={(e) => setDriverSearch(e.target.value)}
                      placeholder="Buscar conductor…"
                      className="h-10 w-full rounded-xl border border-border/60 bg-background pl-9 pr-3 text-sm text-foreground"
                    />
                  </label>
                  <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {visibleDrivers.map((driver) => (
                      <label
                        key={driver.userId}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm hover:bg-muted/20"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-400"
                          disabled={!canManage}
                          checked={selectedIds.includes(driver.userId)}
                          onChange={(event) =>
                            setSelectedIds((ids) =>
                              event.target.checked
                                ? [...ids, driver.userId]
                                : ids.filter((id) => id !== driver.userId),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 break-words text-foreground">
                          {driver.displayName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {driver.isAvailable ? "Disponible" : "No disponible"}
                        </span>
                      </label>
                    ))}
                    {!visibleDrivers.length ? (
                      <p className="text-xs text-muted-foreground">
                        No hay conductores que coincidan.
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-amber-200">
                  Los cargos reales sólo se habilitan por carrera y con doble confirmación.
                </p>
                <Button
                  size="sm"
                  disabled={!canManage || save.isPending || (enabled && selectedIds.length === 0)}
                  onClick={() => save.mutate()}
                >
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                  {save.isPending ? "Guardando…" : "Guardar grupo y modo"}
                </Button>
              </div>
            </section>
            <section className="tt-lab-v4-create min-w-0 rounded-2xl border border-border/60 bg-background/45 p-4">
              <h4 className="text-sm font-semibold text-foreground">Crear carrera de prueba</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Un único servicio. El primero en aceptarlo queda asignado.
              </p>
              <div className="tt-lab-v4-fields mt-3 grid gap-2.5 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Destinatarios
                  <select
                    value={recipientMode}
                    onChange={(e) => setRecipientMode(e.target.value as "individual" | "group")}
                    className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground"
                  >
                    <option value="individual">Un conductor</option>
                    <option value="group">Todo el grupo</option>
                  </select>
                </label>
                {recipientMode === "individual" ? (
                  <label className="space-y-1 text-xs text-muted-foreground">
                    Conductor
                    <select
                      value={individualId}
                      onChange={(e) => setIndividualId(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground"
                    >
                      <option value="">Seleccionar…</option>
                      {selected.map((d) => (
                        <option key={d.userId} value={d.userId}>
                          {d.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="self-end rounded-lg border border-cyan-400/20 px-3 py-3 text-xs text-cyan-200">
                    {allowed.length} conductores del grupo
                  </div>
                )}
                <label className="space-y-1 text-xs text-muted-foreground">
                  Servicio
                  <select
                    value={serviceCode}
                    onChange={(e) => setServiceCode(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground"
                  >
                    {["passenger", "cargo", "courier", "tourism"].map((s) => (
                      <option key={s} value={s}>
                        {labelFor(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Tipo de vehículo (opcional)
                  <select
                    value={vehicleCategory}
                    onChange={(e) => setVehicleCategory(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground"
                  >
                    <option value="">Cualquier compatible</option>
                    {[
                      "motorcycle",
                      "tricycle",
                      "light_car",
                      "bicitaxi",
                      "bicycle",
                      "van",
                      "truck",
                      "other",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {labelFor(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="relative space-y-1 text-xs text-muted-foreground">
                  <span>Origen</span>
                  <div className="flex gap-1.5">
                    <input
                      value={origin}
                      onChange={(e) => {
                        setOrigin(e.target.value);
                        setOriginPoint(null);
                      }}
                      maxLength={180}
                      placeholder="Calle y número de recogida"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={picking === "origin" ? "default" : "outline"}
                      className="h-10 px-3"
                      onClick={() => setPicking(picking === "origin" ? null : "origin")}
                      title="Marcar origen en el mapa"
                    >
                      <MapPin className="h-4 w-4" />
                    </Button>
                  </div>
                  {originSuggestions.length > 0 && (
                    <div className="relative z-10 rounded-lg border border-border bg-background p-1 shadow-xl">
                      {originSuggestions.map((item, i) => (
                        <button
                          key={`${i}-${item.lat}`}
                          type="button"
                          onClick={() => {
                            setOriginPoint(item);
                            setOrigin(item.label);
                            setOriginSuggestions([]);
                          }}
                          className="block w-full rounded-lg px-2 py-2 text-left text-xs text-foreground hover:bg-muted/40"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {originPoint && (
                    <p className="text-[11px] text-emerald-300">Ubicación geográfica confirmada</p>
                  )}
                </div>
                <div className="relative space-y-1 text-xs text-muted-foreground">
                  <span>Destino</span>
                  <div className="flex gap-1.5">
                    <input
                      value={destination}
                      onChange={(e) => {
                        setDestination(e.target.value);
                        setDestinationPoint(null);
                      }}
                      maxLength={180}
                      placeholder="Calle y número de llegada"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={picking === "destination" ? "default" : "outline"}
                      className="h-10 px-3"
                      onClick={() => setPicking(picking === "destination" ? null : "destination")}
                      title="Marcar destino en el mapa"
                    >
                      <MapPin className="h-4 w-4" />
                    </Button>
                  </div>
                  {destinationSuggestions.length > 0 && (
                    <div className="relative z-10 rounded-lg border border-border bg-background p-1 shadow-xl">
                      {destinationSuggestions.map((item, i) => (
                        <button
                          key={`${i}-${item.lat}`}
                          type="button"
                          onClick={() => {
                            setDestinationPoint(item);
                            setDestination(item.label);
                            setDestinationSuggestions([]);
                          }}
                          className="block w-full rounded-lg px-2 py-2 text-left text-xs text-foreground hover:bg-muted/40"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {destinationPoint && (
                    <p className="text-[11px] text-emerald-300">Ubicación geográfica confirmada</p>
                  )}
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <span>Precio de carrera</span>
                  <select
                    value={priceMode}
                    onChange={(e) => setPriceMode(e.target.value as "auto" | "manual")}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  >
                    <option value="auto">Automático · tarifa oficial</option>
                    <option value="manual">Manual · solo prueba</option>
                  </select>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <span>Importe (CUP)</span>
                  {priceMode === "manual" ? (
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                    />
                  ) : (
                    <div className="tt-lab-v4-price flex h-10 items-center rounded-lg border border-cyan-400/20 bg-cyan-400/[0.035] px-3 text-base font-semibold tabular-nums text-foreground">
                      {validQuote?.recommendedPrice != null
                        ? `${validQuote.recommendedPrice.toLocaleString("es")} CUP`
                        : "Calcula la ruta"}
                    </div>
                  )}
                </div>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Observaciones
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={1000}
                    placeholder="Opcional"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  />
                </label>
              </div>
              <div className="tt-lab-v4-route mt-3 space-y-2">
                <MarketplaceTestRouteMap
                  projectId={projectId}
                  origin={originPoint}
                  destination={destinationPoint}
                  route={validQuote?.routePoints ?? []}
                  picking={picking}
                  onPick={(kind, lat, lon) => {
                    void pickFromMap(kind, lat, lon);
                  }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/[0.08] p-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Distancia{" "}
                      <strong className="ml-1 text-sm text-foreground">
                        {validQuote ? `${validQuote.distanceKm.toFixed(2)} km` : "—"}
                      </strong>
                    </span>
                    <span>
                      Tiempo{" "}
                      <strong className="ml-1 text-sm text-foreground">
                        {validQuote ? `${Math.ceil(validQuote.durationSeconds / 60)} min` : "—"}
                      </strong>
                    </span>
                    <span>
                      Tarifa{" "}
                      <strong className="ml-1 text-sm text-foreground">
                        {priceMode === "auto" ? "Oficial" : "Manual"}
                      </strong>
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={routeLoading || !originPoint || !destinationPoint}
                    onClick={() => void calculateRoute()}
                  >
                    {routeLoading ? "Calculando…" : "Calcular ruta y tarifa"}
                  </Button>
                </div>
                {routeError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200"
                  >
                    {routeError}
                  </p>
                )}
                {validQuote && priceMode === "auto" && (
                  <p className="text-[11px] text-muted-foreground">
                    Precio del mismo motor que utiliza Cliente. El servidor lo volverá a calcular al
                    enviar.
                  </p>
                )}
              </div>
              <label className="tt-lab-v4-risk mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-400/15 px-3 py-2 text-xs text-amber-200">
                <span>Probar comisión real (puede afectar el saldo del conductor)</span>
                <Switch
                  checked={forceRealCommission}
                  disabled={!canManage || !canManagePayments}
                  onCheckedChange={setForceRealCommission}
                  aria-label="Probar comisión real"
                />
              </label>
              <div className="tt-lab-v4-actions mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {dirty
                    ? "Guarda los cambios del grupo antes del envío."
                    : forceRealCommission
                      ? "Ensayo financiero con doble confirmación."
                      : "Prueba georreferenciada · sin comisión real."}
                </p>
                <Button
                  disabled={
                    !canManage ||
                    !configured ||
                    dirty ||
                    send.isPending ||
                    allowed.length === 0 ||
                    !validQuote ||
                    (priceMode === "auto" && validQuote.recommendedPrice == null)
                  }
                  onClick={() => send.mutate()}
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  {send.isPending ? "Enviando…" : "Enviar carrera de prueba"}
                </Button>
              </div>
              {successJobId ? (
                <button
                  type="button"
                  onClick={() => onOpenJob(successJobId)}
                  className="tt-lab-v4-success mt-3 flex items-center gap-2 text-xs text-emerald-300 underline"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Carrera creada. Ver detalle.
                </button>
              ) : null}
            </section>
          </div>
          <section
            className="tt-lab-v4-history min-w-0 rounded-2xl border border-border/60 bg-background/45 p-4"
            aria-label="Historial de pruebas"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                aria-expanded={historyOpen}
                aria-controls="test-history-list"
                onClick={() => setHistoryOpen((v) => !v)}
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-foreground"
              >
                <Clock3 className="h-4 w-4 text-violet-300" />
                Historial de pruebas{" "}
                {historyOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <span className="text-xs text-muted-foreground">
                {historyOpen ? "10 registros por página · historial completo" : "Abrir historial"}
              </span>
            </div>
            {historyOpen && (
              <div id="test-history-list" className="mt-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Estado
                    <select
                      value={historyFilter}
                      onChange={(e) => {
                        setHistoryFilter(e.target.value);
                        setHistoryCursors([null]);
                        setHistoryPage(0);
                      }}
                      className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                    >
                      <option value="all">Todos</option>
                      <option value="published">Publicadas</option>
                      <option value="accepted">Aceptadas</option>
                      <option value="settled">Liquidadas</option>
                      <option value="completed">Completadas</option>
                      <option value="expired">Expiradas</option>
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void history.refetch()}
                      disabled={history.isFetching}
                    >
                      Actualizar
                    </Button>
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-rose-400/30 text-rose-300 hover:text-rose-200"
                        disabled={clean.isPending}
                        onClick={() => clean.mutate()}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Limpiar pruebas
                      </Button>
                    )}
                  </div>
                </div>
                {history.isLoading && (
                  <p className="py-4 text-sm text-muted-foreground">Consultando historial…</p>
                )}
                {history.isError && (
                  <p role="alert" className="py-4 text-sm text-rose-200">
                    {errorMessage(history.error)}
                  </p>
                )}
                {history.isSuccess && historyVisible.length === 0 && (
                  <p className="py-4 text-sm text-muted-foreground">
                    No hay carreras con ese filtro.
                  </p>
                )}
                <div className="space-y-1.5">
                  {historyVisible.map((job) => {
                    const expanded = expandedJobs.includes(job.job_id);
                    return (
                      <div
                        key={job.job_id}
                        className="overflow-hidden rounded-xl border border-border/55 bg-background/55"
                      >
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() =>
                            setExpandedJobs((all) =>
                              expanded
                                ? all.filter((id) => id !== job.job_id)
                                : [...all, job.job_id],
                            )
                          }
                          className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 text-left hover:bg-muted/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                        >
                          <span className="min-w-[95px] text-xs text-muted-foreground">
                            {new Date(job.created_at).toLocaleString("es", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span
                            className="min-w-0 flex-1 basis-40 truncate text-sm font-medium text-foreground"
                            title={`${job.origin_text} → ${job.destination_text}`}
                          >
                            {job.origin_text} → {job.destination_text}
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {Number(job.final_price).toLocaleString("es")} CUP
                          </span>
                          <span className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] px-2 py-1 text-xs text-cyan-200">
                            {job.deleted ? "Eliminada" : labelFor(job.status)}
                          </span>
                          {expanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        {expanded && (
                          <div className="grid gap-2 border-t border-border/50 px-3 py-3 text-xs text-muted-foreground sm:grid-cols-2">
                            <p>
                              <strong className="text-foreground">Servicio:</strong>{" "}
                              {labelFor(job.service_code)}
                            </p>
                            <p>
                              <strong className="text-foreground">Destinatarios:</strong>{" "}
                              {job.recipient_count} ({labelFor(job.destination_mode)})
                            </p>
                            <p className="sm:col-span-2">
                              <strong className="text-foreground">Conductores:</strong>{" "}
                              {job.recipients.map((r) => r.display_name).join(", ") ||
                                "No disponibles"}
                            </p>
                            <p>
                              <strong className="text-foreground">Avisos en servidor:</strong>{" "}
                              {job.notification_status.length}
                            </p>
                            <p>
                              <strong className="text-foreground">Estado de envío:</strong>{" "}
                              {job.notification_status.map((n) => n.delivery_status).join(", ") ||
                                "Sin registro"}
                            </p>
                            <div className="sm:col-span-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenJob(job.job_id)}
                              >
                                Ver carrera completa
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                  <span>
                    {historyVisible.length
                      ? `Página ${historyPage + 1} · ${historyVisible.length} operaciones`
                      : "Sin resultados"}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyPage === 0}
                      onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        !history.data?.has_more ||
                        !history.data?.next_created_at ||
                        !history.data?.next_job_id
                      }
                      onClick={() => {
                        if (!history.data?.next_created_at || !history.data?.next_job_id) return;
                        setHistoryCursors((list) => [
                          ...list.slice(0, historyPage + 1),
                          {
                            createdAt: history.data.next_created_at!,
                            jobId: history.data.next_job_id!,
                          },
                        ]);
                        setHistoryPage((p) => p + 1);
                      }}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
