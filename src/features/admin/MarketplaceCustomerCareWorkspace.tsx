import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, CheckCircle2, Clock3, Headphones, History, MapPin,
  Navigation, Phone, Plus, Route, ShieldCheck, UserRound, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { getMarketplaceOperationalMap } from "@/lib/marketplace-map";
import MarketplaceLiteContactCard from "@/features/admin/MarketplaceLiteContactCard";
import MarketplaceTestRouteMap, { type TestPoint } from "@/features/admin/MarketplaceTestRouteMap";

type Stop = "origin" | "destination";
type ServiceCode = "passenger" | "courier" | "cargo";
type VehicleCode = "motorcycle" | "bicitaxi" | "tricycle" | "light_car";
type Customer = { id: string; display_name: string; whatsapp_phone: string; created_at?: string };
type CustomerReply = { found: boolean; phone: string; created?: boolean; customer?: Customer };
type Quote = {
  key: string;
  distanceKm: number;
  durationSeconds: number;
  recommendedPrice: number;
  routePoints: Array<{ lat: number; lon: number }>;
};
type Published = {
  job_id: string;
  customer_id: string;
  status: string;
  final_price: number;
  expires_at: string;
  repeated: boolean;
};

const SERVICES: Array<{ value: ServiceCode; label: string }> = [
  { value: "passenger", label: "Pasajeros" },
  { value: "courier", label: "Mensajería" },
  { value: "cargo", label: "Carga" },
];
const VEHICLES: Array<{ value: VehicleCode; label: string }> = [
  { value: "motorcycle", label: "Moto" },
  { value: "bicitaxi", label: "Bicitaxi" },
  { value: "tricycle", label: "Triciclo" },
  { value: "light_car", label: "Auto" },
];

function phoneE164(value: string): string {
  let phone = value.trim().replace(/[\s()-]/g, "");
  if (/^5\d{7}$/.test(phone)) phone = `+53${phone}`;
  else if (/^535\d{7}$/.test(phone)) phone = `+${phone}`;
  return phone;
}
function validPhone(value: string) { return /^\+[1-9]\d{7,14}$/.test(value); }
function parsePoint(value: unknown): TestPoint | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
}
function message(error: unknown): string {
  const code = error instanceof Error ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "") : "";
  if (!code) return "No fue posible completar la operación.";
  const labels: Record<string, string> = {
    CUSTOMER_PHONE_INVALID: "Introduce un teléfono válido. Por ejemplo, +535XXXXXXX.",
    CUSTOMER_NAME_INVALID: "Introduce el nombre completo del cliente.",
    CARE_CUSTOMER_NOT_FOUND: "La ficha cambió. Busca nuevamente el teléfono.",
    CARE_PRICE_CHANGED: "La tarifa cambió. Actualiza la ruta antes de publicar.",
    CARE_IDEMPOTENCY_REUSED: "La solicitud cambió. Pulsa Nueva solicitud y vuelve a intentarlo.",
    PERMISSION_DENIED: "No tienes permisos para esta operación.",
    SMART_PRICING_TARIFF_NOT_CONFIGURED: "No hay una tarifa activa para esa modalidad.",
  };
  return Object.entries(labels).find(([key]) => code.includes(key))?.[1] ?? code;
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error) throw error;
  return data as T;
}

export default function MarketplaceCustomerCareWorkspace({
  projectId, canManageContact, canViewCustomers, canManageMarketplace, canRegisterCustomers,
  onOpenCustomer, onOpenJob,
}: {
  projectId: string;
  canManageContact: boolean;
  canViewCustomers: boolean;
  canManageMarketplace: boolean;
  canRegisterCustomers: boolean;
  onOpenCustomer: (customerId: string) => void;
  onOpenJob: (jobId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [clientPhone, setClientPhone] = useState("");
  const [clientName, setClientName] = useState("");
  const [registered, setRegistered] = useState<Customer | null>(null);
  const [service, setService] = useState<ServiceCode>("passenger");
  const [vehicle, setVehicle] = useState<VehicleCode>("tricycle");
  const [preferredContact, setPreferredContact] = useState("phone");
  const [notes, setNotes] = useState("");
  const [cargoWeight, setCargoWeight] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originPoint, setOriginPoint] = useState<TestPoint | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<TestPoint | null>(null);
  const [picking, setPicking] = useState<Stop | null>("origin");
  const [suggestions, setSuggestions] = useState<Record<Stop, TestPoint[]>>({ origin: [], destination: [] });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const pointVersion = useRef({ origin: 0, destination: 0 });

  const normalizedPhone = useMemo(() => phoneE164(clientPhone), [clientPhone]);
  const live = useQuery({
    queryKey: ["marketplace-operational-map-live", projectId],
    queryFn: () => getMarketplaceOperationalMap(projectId),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const lookup = useQuery({
    queryKey: ["care-customer-lookup", projectId, normalizedPhone],
    queryFn: async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 420));
      return rpc<CustomerReply>("admin_lookup_marketplace_care_customer", {
        target_project_id: projectId, target_phone: normalizedPhone,
      });
    },
    enabled: validPhone(normalizedPhone) && canViewCustomers,
    retry: 1,
    staleTime: 15_000,
  });
  // No usar datos de un teléfono anterior ni sobreescribir una ficha existente.
  const foundCustomer = lookup.data?.phone === normalizedPhone && lookup.data.found
    ? lookup.data.customer ?? null : null;
  const customer = foundCustomer ?? (registered?.whatsapp_phone === normalizedPhone ? registered : null);
  const customerName = customer?.display_name ?? clientName;
  const canRegister = canRegisterCustomers && !customer && validPhone(normalizedPhone) && clientName.trim().length >= 2;

  const invalidateRequest = () => { setPublished(null); setRequestKey(crypto.randomUUID()); };
  const onPhone = (value: string) => {
    setClientPhone(value); setRegistered(null); setClientName(""); invalidateRequest();
  };
  const register = useMutation({
    mutationFn: () => rpc<CustomerReply>("admin_register_marketplace_care_customer", {
      target_project_id: projectId, target_phone: normalizedPhone, target_display_name: clientName.trim(),
    }),
    onSuccess: async (data) => {
      if (!data.customer) throw new Error("No se recuperó la ficha del cliente.");
      setRegistered(data.customer);
      queryClient.setQueryData(["care-customer-lookup", projectId, data.phone], data);
      await queryClient.invalidateQueries({ queryKey: ["marketplace-customers", projectId] });
      toast.success(data.created ? "Cliente registrado en Clientes." : "Cliente existente identificado.");
    },
    onError: (error) => toast.error(message(error)),
  });

  const setStop = useCallback((kind: Stop, point: TestPoint | null) => {
    pointVersion.current[kind] += 1;
    setSuggestions((value) => ({ ...value, [kind]: [] }));
    if (kind === "origin") {
      setOriginPoint(point); setOrigin(point?.label ?? "");
      setPicking(point ? (destinationPoint ? null : "destination") : "origin");
    } else {
      setDestinationPoint(point); setDestination(point?.label ?? "");
      setPicking(point ? null : "destination");
    }
    invalidateRequest();
  }, [destinationPoint]);
  const editStop = (kind: Stop, value: string) => {
    pointVersion.current[kind] += 1;
    if (kind === "origin") { setOrigin(value); setOriginPoint(null); }
    else { setDestination(value); setDestinationPoint(null); }
    setSuggestions((prev) => ({ ...prev, [kind]: [] }));
    invalidateRequest();
  };
  const reset = () => {
    setClientPhone(""); setClientName(""); setRegistered(null);
    setService("passenger"); setVehicle("tricycle"); setPreferredContact("phone");
    setNotes(""); setCargoWeight(""); setOrigin(""); setDestination("");
    setOriginPoint(null); setDestinationPoint(null); setPicking("origin");
    setSuggestions({ origin: [], destination: [] }); setQuote(null); setQuoteError(null);
    pointVersion.current.origin += 1; pointVersion.current.destination += 1;
    invalidateRequest();
  };
  useEffect(() => {
    const terms: Array<{ kind: Stop; text: string; point: TestPoint | null }> = [
      { kind: "origin", text: origin, point: originPoint },
      { kind: "destination", text: destination, point: destinationPoint },
    ];
    const cleanups: Array<() => void> = [];
    for (const { kind, text, point } of terms) {
      if (point || text.trim().length < 3) continue;
      let cancelled = false;
      const version = pointVersion.current[kind];
      const timer = window.setTimeout(() => {
        void getSupabaseClient().functions.invoke("marketplace-map-gateway", {
          body: { operation: "geocode", query: text.trim() },
        }).then(({ data, error }) => {
          if (cancelled || pointVersion.current[kind] !== version) return;
          const rows = !error && Array.isArray(data?.data) ? data.data : [];
          setSuggestions((current) => ({ ...current,
            [kind]: rows.map(parsePoint).filter((p: TestPoint | null): p is TestPoint => p !== null).slice(0, 5),
          }));
        }).catch(() => { if (!cancelled) setSuggestions((current) => ({ ...current, [kind]: [] })); });
      }, 420);
      cleanups.push(() => { cancelled = true; window.clearTimeout(timer); });
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [origin, destination, originPoint, destinationPoint]);

  const pickFromMap = async (kind: Stop, lat: number, lon: number) => {
    const point = { lat, lon, label: `Punto ${lat.toFixed(5)}, ${lon.toFixed(5)}` };
    setStop(kind, point);
    const version = pointVersion.current[kind];
    try {
      const { data, error } = await getSupabaseClient().functions.invoke("marketplace-map-gateway", {
        body: { operation: "reverse_geocode", point: { lat, lon } },
      });
      if (error || version !== pointVersion.current[kind]) return;
      const label = typeof data?.data?.label === "string" ? data.data.label.trim() : "";
      if (label) {
        const updated = { ...point, label };
        if (kind === "origin") { setOriginPoint(updated); setOrigin(label); }
        else { setDestinationPoint(updated); setDestination(label); }
      }
    } catch { /* Conservar el marcador si el geocodificador no responde. */ }
  };
  const routeKey = `${originPoint?.lat ?? ""},${originPoint?.lon ?? ""}|${destinationPoint?.lat ?? ""},${destinationPoint?.lon ?? ""}|${service}|${vehicle}`;
  useEffect(() => {
    setQuote(null); setQuoteError(null);
    if (!originPoint || !destinationPoint) { setQuoteLoading(false); return; }
    let cancelled = false;
    setQuoteLoading(true);
    const timer = window.setTimeout(() => {
      void getSupabaseClient().functions.invoke("marketplace-map-gateway", {
        body: {
          operation: "route_quote",
          origin: { lat: originPoint.lat, lon: originPoint.lon },
          destination: { lat: destinationPoint.lat, lon: destinationPoint.lon },
          pricing: { service_code: service, vehicle_category_code: vehicle, passenger_count: 1, cargo_weight_kg: service === "cargo" ? Number(cargoWeight) || null : null, stop_count: 0 },
        },
      }).then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) throw new Error("No se pudo calcular la ruta.");
        const root = data?.data;
        const km = Number(root?.distance_km);
        const seconds = Number(root?.duration_seconds);
        const priced = service === "passenger" ? root?.prices?.passenger_by_category?.[vehicle] : root?.prices?.[service];
        const price = Number(priced?.recommended_price);
        if (![km, seconds, price].every(Number.isFinite) || km <= 0 || seconds <= 0 || price <= 0) {
          throw new Error("La ruta o tarifa no está disponible para esa modalidad.");
        }
        const points = Array.isArray(root?.route_points) ? root.route_points : [];
        setQuote({ key: routeKey, distanceKm: km, durationSeconds: seconds, recommendedPrice: price,
          routePoints: points.map(parsePoint).filter((p: TestPoint | null): p is TestPoint => p !== null).map(({ lat, lon }) => ({ lat, lon })),
        });
      }).catch((err: unknown) => { if (!cancelled) setQuoteError(message(err)); })
        .finally(() => { if (!cancelled) setQuoteLoading(false); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [originPoint, destinationPoint, service, vehicle, routeKey, cargoWeight]);
  const validQuote = quote?.key === routeKey ? quote : null;
  const weight = Number(cargoWeight);
  const validCargo = service !== "cargo" || (Number.isFinite(weight) && weight > 0 && weight <= 10000);
  const canPublish = canManageMarketplace && !!customer && !!originPoint && !!destinationPoint &&
    !!validQuote && !quoteLoading && validCargo && !published;
  const publish = useMutation({
    mutationFn: async () => {
      if (!customer || !originPoint || !destinationPoint || !validQuote || !canPublish) throw new Error("Completa y verifica los datos antes de publicar.");

      const { data: verified, error: verifiedError } =
        await getSupabaseClient().functions.invoke(
          "marketplace-map-admin-gateway",
          { body: {
            operation: "care_route_verify_v1",
            project_id: projectId,
            target_service_code: service,
            target_vehicle_category_code: vehicle,
            target_origin_point: {
              lat: originPoint.lat,
              lon: originPoint.lon,
            },
            target_destination_point: {
              lat: destinationPoint.lat,
              lon: destinationPoint.lon,
            },
            target_cargo_weight_kg:
              service === "cargo" ? weight : null,
          } },
        );

      if (verifiedError || verified?.error)
        throw verifiedError ??
          new Error(String(verified.error));

      const proofId = verified?.data?.verified_route_id;
      const serverDistance = Number(verified?.data?.distance_km);
      const serverDuration = Number(verified?.data?.duration_seconds);
      const verifiedPrice = Number(verified?.data?.recommended_price);

      if (typeof proofId !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(proofId) ||
          !Number.isFinite(serverDistance) ||
          serverDistance <= 0 ||
          !Number.isFinite(serverDuration) ||
          serverDuration <= 0 ||
          !Number.isFinite(verifiedPrice) ||
          verifiedPrice <= 0)
        throw new Error("CARE_ROUTE_VERIFICATION_FAILED");

      if (Math.round(verifiedPrice * 100) !==
          Math.round(validQuote.recommendedPrice * 100))
        throw new Error("CARE_PRICE_CHANGED");

      return rpc<Published>("admin_publish_marketplace_care_job", {
        target_verified_route_id: proofId,
        target_project_id: projectId,
        target_customer_id: customer.id,
        target_idempotency_key: requestKey,
        target_service_code: service,
        target_vehicle_category_code: vehicle,
        target_origin_text: origin.trim(),
        target_destination_text: destination.trim(),
        target_origin_point: { lat: originPoint.lat, lon: originPoint.lon },
        target_destination_point: { lat: destinationPoint.lat, lon: destinationPoint.lon },
        target_distance_km: serverDistance,
        target_route_duration_seconds: serverDuration,
        target_expected_price: verifiedPrice,
        target_notes: notes.trim() || null,
        target_cargo_weight_kg: service === "cargo" ? weight : null,
        target_contact_preference: preferredContact,
      });
    },
    onSuccess: async (data) => {
      setPublished(data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["marketplace-jobs", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace-customers", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace-operational-map-live", projectId] }),
      ]);
      toast.success(data.repeated ? "Esta carrera ya estaba publicada." : "Carrera real publicada y enviada al despacho.");
    },
    onError: (err) => toast.error(message(err)),
  });
  const confirmPublish = () => {
    if (!customer || !validQuote || !canPublish || publish.isPending) return;
    const ok = window.confirm(`¿Publicar carrera REAL para ${customer.display_name} (${customer.whatsapp_phone})?\n\n${origin} → ${destination}\n${validQuote.recommendedPrice.toLocaleString("es-CU")} CUP\n\nLos conductores disponibles podrán recibirla.`);
    if (ok) publish.mutate();
  };
  const stopField = (kind: Stop, value: string) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`care-${kind}`}>{kind === "origin" ? "Origen de recogida" : "Destino"}</Label>
        <Button type="button" size="sm" variant={picking === kind ? "default" : "outline"}
          onClick={() => setPicking(kind)} className="h-8 gap-1 text-xs"><MapPin className="h-3.5 w-3.5" /> Mapa</Button>
      </div>
      <Input id={`care-${kind}`} value={value} autoComplete="off" maxLength={240}
        placeholder={kind === "origin" ? "Escribe o marca dónde recoger" : "Escribe o marca el destino"}
        onChange={(event) => editStop(kind, event.target.value)} />
      {suggestions[kind].length > 0 && (
        <div className="relative z-20 overflow-hidden rounded-xl border border-cyan-400/20 bg-background shadow-lg">
          {suggestions[kind].map((point, index) => (
            <button key={`${kind}-${index}-${point.lat}-${point.lon}`} type="button"
              className="flex w-full items-center gap-2 border-b border-border/45 px-3 py-2 text-left text-xs last:border-0 hover:bg-cyan-400/[0.08]"
              onClick={() => setStop(kind, point)}><MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-300" /><span>{point.label}</span></button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="customer-care-workspace">
      <header className="relative overflow-hidden rounded-[26px] border border-cyan-400/20 bg-gradient-to-r from-cyan-500/[0.10] via-background/85 to-emerald-500/[0.08] px-4 py-4 shadow-[0_25px_60px_-45px_rgba(34,211,238,0.85)] sm:px-5">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"><Headphones className="h-5 w-5" /></span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-300">Trabajos · Centro operativo</p>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Atención al cliente</h2>
              <p className="text-xs text-muted-foreground">Identifica clientes y publica carreras reales desde el mismo mapa.</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={reset} className="gap-2"><Plus className="h-4 w-4" /> Nueva solicitud</Button>
        </div>
      </header>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4">
          {canManageContact ? <MarketplaceLiteContactCard projectId={projectId} /> : (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.055] p-4 text-xs text-muted-foreground">El teléfono y horario del canal requieren el permiso de configuración de Lite.</div>
          )}
          <section className="relative isolate overflow-hidden rounded-[26px] border border-violet-400/30 bg-gradient-to-br from-violet-500/[0.12] via-background/95 to-indigo-500/[0.045] p-4 shadow-[0_24px_65px_-44px_rgba(139,92,246,0.65)] sm:p-5" aria-label="Identificación del cliente">
            <Users aria-hidden="true" className="pointer-events-none absolute -right-8 top-8 h-40 w-40 text-violet-200/[0.07]" />
            <div className="relative z-10 space-y-3">
              <div className="mb-3 flex items-center gap-3"><span className="rounded-xl border border-violet-400/30 bg-violet-400/10 p-2 text-violet-200"><UserRound className="h-5 w-5" /></span>
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-violet-300">02 · Identificación</p><h3 className="text-base font-semibold">Buscar cliente por teléfono</h3></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="care-client-phone">Teléfono del cliente</Label>
                <Input id="care-client-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="+535XXXXXXX" value={clientPhone} maxLength={22} onChange={(e) => onPhone(e.target.value)} />
                <p className="text-xs text-violet-200/80">Se acepta +53, 53 o número cubano de 8 dígitos que empiece por 5.</p>
              </div>
              {validPhone(normalizedPhone) && canViewCustomers && lookup.isFetching ? <p className="text-xs text-cyan-200">Buscando en Clientes…</p> : null}
              {lookup.isError && validPhone(normalizedPhone) ? <p role="alert" className="text-xs text-rose-300">{message(lookup.error)}</p> : null}
              {customer ? (
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Cliente identificado</p>
                  <p className="mt-1 text-sm">{customer.display_name}</p><p className="text-xs text-muted-foreground">{customer.whatsapp_phone}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <button type="button" className="inline-flex gap-1 text-xs font-semibold text-violet-200 underline-offset-2 hover:underline"
                      onClick={() => onOpenCustomer(customer.id)}><History className="h-3.5 w-3.5" /> Abrir ficha 360</button>
                    <a className="inline-flex gap-1 text-xs font-semibold text-violet-200 underline-offset-2 hover:underline"
                      href={`/admin/proyectos/${encodeURIComponent(projectId)}/trabajos?vista=clientes`}>Ir a Clientes</a>
                  </div>
                </div>
              ) : validPhone(normalizedPhone) && lookup.isSuccess && lookup.data?.found === false ? (
                <div className="space-y-2 rounded-xl border border-violet-400/20 bg-background/65 p-3">
                  <p className="text-sm font-semibold">Teléfono sin ficha registrada</p>
                  <Label htmlFor="care-new-name">Nombre del cliente</Label>
                  <Input id="care-new-name" maxLength={100} placeholder="Nombre y apellido" value={clientName} onChange={(e) => { setClientName(e.target.value); invalidateRequest(); }} />
                  <Button type="button" size="sm" disabled={!canRegister || register.isPending} onClick={() => register.mutate()}>
                    {register.isPending ? "Registrando…" : "Registrar en Clientes"}
                  </Button>
                  {!canRegisterCustomers ? <p className="text-xs text-muted-foreground">Tu rol requiere permiso de gestión de Clientes para registrar.</p> : null}
                </div>
              ) : <p className="text-xs text-muted-foreground">Introduce un teléfono válido para recuperar la ficha 360 sin duplicados.</p>}
            </div>
          </section>
          <section className="relative isolate overflow-hidden rounded-[26px] border border-teal-400/30 bg-gradient-to-br from-teal-500/[0.12] via-background/95 to-cyan-500/[0.035] p-4 shadow-[0_25px_70px_-45px_rgba(20,184,166,0.65)] sm:p-5" aria-label="Formulario de solicitud manual">
            <Route aria-hidden="true" className="pointer-events-none absolute -right-10 top-10 h-44 w-44 -rotate-12 text-teal-200/[0.07]" />
            <div className="relative z-10 mb-4 flex items-center gap-2"><Route className="h-4 w-4 text-teal-300" /><h3 className="text-base font-semibold">03 · Montar carrera</h3></div>
            <div className="relative z-10 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="care-service">Servicio</Label>
                  <select id="care-service" value={service} onChange={(e) => { setService(e.target.value as ServiceCode); invalidateRequest(); }} className="flex h-10 w-full rounded-xl border border-border-default bg-surface-1 px-3 text-sm text-text-primary">
                    {SERVICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="care-vehicle">Vehículo</Label>
                  <select id="care-vehicle" value={vehicle} onChange={(e) => { setVehicle(e.target.value as VehicleCode); invalidateRequest(); }} className="flex h-10 w-full rounded-xl border border-border-default bg-surface-1 px-3 text-sm text-text-primary">
                    {VEHICLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
              </div>
              {service === "cargo" ? <div className="space-y-1.5"><Label htmlFor="care-weight">Peso de la carga (kg)</Label>
                <Input id="care-weight" type="number" min="0.1" max="10000" step="0.1" value={cargoWeight} onChange={(e) => { setCargoWeight(e.target.value); invalidateRequest(); }} />
              </div> : null}
              {stopField("origin", origin)}
              {stopField("destination", destination)}
              <div className="space-y-1.5"><Label htmlFor="care-contact">Contacto preferido</Label>
                <select id="care-contact" value={preferredContact} onChange={(e) => { setPreferredContact(e.target.value); invalidateRequest(); }} className="flex h-10 w-full rounded-xl border border-border-default bg-surface-1 px-3 text-sm text-text-primary">
                  <option value="phone">Llamada</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="care-notes">Indicaciones al conductor</Label>
                <Textarea id="care-notes" rows={3} maxLength={500} placeholder="Referencia o instrucciones de recogida" value={notes} onChange={(e) => { setNotes(e.target.value); invalidateRequest(); }} />
              </div>
              {published ? (
                <div className="space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Carrera publicada correctamente</p>
                  <p className="break-all text-xs">ID: {published.job_id}</p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => onOpenJob(published.job_id)} className="inline-flex gap-1 text-xs font-semibold text-emerald-200 underline-offset-2 hover:underline">Ver detalle de carrera <ArrowRight className="h-3.5 w-3.5" /></button>
                    <a href={`/admin/proyectos/${encodeURIComponent(projectId)}/trabajos?vista=trabajos`} className="inline-flex gap-1 text-xs font-semibold text-emerald-200 underline-offset-2 hover:underline">Abrir Operaciones</a>
                  </div>
                  <p className="text-xs text-muted-foreground">Para atender otro cliente, pulsa Nueva solicitud.</p>
                </div>
              ) : (
                <>
                  <Button type="button" disabled={!canPublish || publish.isPending} onClick={confirmPublish} className="w-full gap-2">
                    <ArrowRight className="h-4 w-4" /> {publish.isPending ? "Publicando…" : "Publicar carrera real"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">{!customer ? "Identifica o registra primero al cliente" : !validQuote ? "Selecciona origen y destino y espera la tarifa" : !validCargo ? "Indica el peso de la carga" : !canManageMarketplace ? "Tu rol no puede publicar carreras" : "Se solicitará confirmación antes de enviar al radar"}</p>
                </>
              )}
            </div>
          </section>
        </div>
        <aside className="min-w-0 space-y-3 xl:sticky xl:top-4" aria-label="Mapa y resumen de la carrera">
          <section className="overflow-hidden rounded-[24px] border border-cyan-400/25 bg-gradient-to-br from-cyan-500/[0.075] via-background/95 to-background p-3 shadow-[0_26px_70px_-45px_rgba(34,211,238,0.85)] sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Navigation className="h-4 w-4 text-cyan-300" /><h3 className="font-semibold">Mapa del servicio</h3></div>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.075] px-3 py-1 text-[11px] text-cyan-100">Origen → destino</span>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-border/60 bg-background/55 p-2"><span className="block text-muted-foreground">Trabajando</span><strong>{live.data?.summary.workingDrivers ?? "—"}</strong></div>
              <div className="rounded-xl border border-border/60 bg-background/55 p-2"><span className="block text-muted-foreground">GPS reciente</span><strong>{live.data?.summary.driversWithFreshLocation ?? "—"}</strong></div>
              <div className="rounded-xl border border-border/60 bg-background/55 p-2"><span className="block text-muted-foreground">Activas</span><strong>{live.data?.summary.activeJobs ?? "—"}</strong></div>
            </div>
            <MarketplaceTestRouteMap projectId={projectId} origin={originPoint} destination={destinationPoint}
              route={validQuote?.routePoints ?? []} picking={picking} heightClassName="h-[390px] w-full lg:h-[570px]"
              ariaLabel="Mapa interactivo de solicitud para cliente" onPick={(kind, lat, lon) => { void pickFromMap(kind, lat, lon); }} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={picking === "origin" ? "default" : "outline"} onClick={() => setPicking("origin")} className="gap-1"><MapPin className="h-4 w-4" /> Origen</Button>
              <Button type="button" size="sm" variant={picking === "destination" ? "default" : "outline"} onClick={() => setPicking("destination")} className="gap-1"><MapPin className="h-4 w-4" /> Destino</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setStop("origin",null); setStop("destination",null); }} className="gap-1"><Route className="h-4 w-4" /> Limpiar ruta</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Dos toques para origen y destino. También puedes arrastrar marcadores o buscar direcciones.</p>
          </section>
          <section className="rounded-[24px] border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.065] to-background p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><h3 className="font-semibold">Cotización del recorrido</h3></div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border/55 bg-background/55 p-3"><span className="block text-xs text-muted-foreground">Distancia</span><strong>{validQuote ? `${validQuote.distanceKm.toFixed(2)} km` : "—"}</strong></div>
              <div className="rounded-xl border border-border/55 bg-background/55 p-3"><span className="block text-xs text-muted-foreground">Tiempo</span><strong>{validQuote ? `${Math.ceil(validQuote.durationSeconds / 60)} min` : "—"}</strong></div>
              <div className="rounded-xl border border-border/55 bg-background/55 p-3"><span className="block text-xs text-muted-foreground">Tarifa</span><strong>{validQuote ? `${validQuote.recommendedPrice.toLocaleString("es-CU")} CUP` : "—"}</strong></div>
            </div>
            {quoteLoading ? <p className="mt-2 flex items-center gap-1 text-xs text-cyan-200"><Clock3 className="h-3.5 w-3.5" /> Calculando recorrido…</p> : null}
            {quoteError ? <p role="alert" className="mt-2 text-xs text-amber-200">{quoteError}</p> : null}
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {customerName.trim() || "Sin identificar"} · {normalizedPhone || "Sin teléfono"}</div>
            <p className="mt-2 text-[11px] text-muted-foreground">El servidor comprueba de nuevo la tarifa antes de publicar; no se permite fijarla desde el navegador.</p>
          </section>
          <div className="flex items-center gap-2 px-1 text-xs text-emerald-200/80"><CheckCircle2 className="h-3.5 w-3.5" /> Las carreras se vinculan a Clientes y al despacho real.</div>
        </aside>
      </div>
    </div>
  );
}
