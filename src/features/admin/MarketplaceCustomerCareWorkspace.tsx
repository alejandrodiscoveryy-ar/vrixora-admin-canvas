import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, CheckCircle2, Clock3, Headphones, MapPin,
  Navigation, Phone, Plus, Route, ShieldCheck, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { getMarketplaceOperationalMap } from "@/lib/marketplace-map";
import MarketplaceLiteContactCard from "@/features/admin/MarketplaceLiteContactCard";
import MarketplaceTestRouteMap, { type TestPoint } from "@/features/admin/MarketplaceTestRouteMap";

type Stop = "origin" | "destination";
type ServiceCode = "passenger" | "courier" | "cargo" | "tourism";
type VehicleCode = "motorcycle" | "bicitaxi" | "tricycle" | "light_car";
type Quote = {
  distanceKm: number;
  durationSeconds: number;
  recommendedPrice: number | null;
  routePoints: Array<{ lat: number; lon: number }>;
};

const SERVICES: Array<{ value: ServiceCode; label: string }> = [
  { value: "passenger", label: "Pasajeros" },
  { value: "courier", label: "Mensajería" },
  { value: "cargo", label: "Carga" },
  { value: "tourism", label: "Turismo" },
];
const VEHICLES: Array<{ value: VehicleCode; label: string }> = [
  { value: "motorcycle", label: "Moto" },
  { value: "bicitaxi", label: "Bicitaxi" },
  { value: "tricycle", label: "Triciclo" },
  { value: "light_car", label: "Auto" },
];

function parsePoint(value: unknown): TestPoint | null {
  if (!value || typeof value !== "object") return null;
  const p = value as { lat?: unknown; lon?: unknown; label?: unknown };
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, label: typeof p.label === "string" && p.label.trim() ? p.label.trim() : `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
}

export default function MarketplaceCustomerCareWorkspace({
  projectId,
  canManageContact,
}: {
  projectId: string;
  canManageContact: boolean;
}) {
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [service, setService] = useState<ServiceCode>("passenger");
  const [vehicle, setVehicle] = useState<VehicleCode>("tricycle");
  const [preferredContact, setPreferredContact] = useState("phone");
  const [notes, setNotes] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originPoint, setOriginPoint] = useState<TestPoint | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<TestPoint | null>(null);
  const [picking, setPicking] = useState<Stop | null>("origin");
  const [suggestions, setSuggestions] = useState<Record<Stop, TestPoint[]>>({ origin: [], destination: [] });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const pointVersion = useRef({ origin: 0, destination: 0 });

  const live = useQuery({
    queryKey: ["marketplace-operational-map-live", projectId],
    queryFn: () => getMarketplaceOperationalMap(projectId),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const setStop = useCallback((kind: Stop, point: TestPoint | null) => {
    pointVersion.current[kind] += 1;
    setSuggestions((current) => ({ ...current, [kind]: [] }));
    if (kind === "origin") {
      setOriginPoint(point);
      setOrigin(point?.label ?? "");
      setPicking(point ? (destinationPoint ? null : "destination") : "origin");
    } else {
      setDestinationPoint(point);
      setDestination(point?.label ?? "");
      setPicking(point ? null : "destination");
    }
  }, [destinationPoint]);

  const reset = () => {
    setClientName(""); setClientPhone(""); setService("passenger"); setVehicle("tricycle");
    setPreferredContact("phone"); setNotes(""); setOrigin(""); setDestination("");
    setOriginPoint(null); setDestinationPoint(null); setPicking("origin");
    setSuggestions({ origin: [], destination: [] }); setQuote(null); setQuoteError(null);
    pointVersion.current.origin += 1; pointVersion.current.destination += 1;
  };

  const editStop = (kind: Stop, value: string) => {
    pointVersion.current[kind] += 1;
    if (kind === "origin") { setOrigin(value); setOriginPoint(null); }
    else { setDestination(value); setDestinationPoint(null); }
    setSuggestions((current) => ({ ...current, [kind]: [] }));
  };

  useEffect(() => {
    const terms: Array<{ kind: Stop; text: string; point: TestPoint | null }> = [
      { kind: "origin", text: origin, point: originPoint },
      { kind: "destination", text: destination, point: destinationPoint },
    ];
    const controllers: Array<() => void> = [];
    for (const { kind, text, point } of terms) {
      if (point || text.trim().length < 3) continue;
      let cancelled = false;
      const version = pointVersion.current[kind];
      const timer = window.setTimeout(() => {
        void getSupabaseClient().functions.invoke("marketplace-map-gateway", {
          body: { operation: "geocode", query: text.trim() },
        }).then(({ data, error }) => {
          if (cancelled || pointVersion.current[kind] !== version) return;
          const entries = !error && Array.isArray(data?.data) ? data.data : [];
          setSuggestions((current) => ({
            ...current,
            [kind]: entries.map(parsePoint).filter((item: TestPoint | null): item is TestPoint => item !== null).slice(0, 5),
          }));
        }).catch(() => {
          if (!cancelled) setSuggestions((current) => ({ ...current, [kind]: [] }));
        });
      }, 450);
      controllers.push(() => { cancelled = true; window.clearTimeout(timer); });
    }
    return () => controllers.forEach((stop) => stop());
  }, [origin, destination, originPoint, destinationPoint]);

  const pickFromMap = async (kind: Stop, lat: number, lon: number) => {
    const fallback: TestPoint = { lat, lon, label: `Punto ${lat.toFixed(5)}, ${lon.toFixed(5)}` };
    setStop(kind, fallback);
    const version = pointVersion.current[kind];
    try {
      const { data, error } = await getSupabaseClient().functions.invoke("marketplace-map-gateway", {
        body: { operation: "reverse_geocode", point: { lat, lon } },
      });
      if (error || version !== pointVersion.current[kind]) return;
      const label = typeof data?.data?.label === "string" ? data.data.label.trim() : "";
      if (label) {
        const corrected = { ...fallback, label };
        if (kind === "origin") { setOriginPoint(corrected); setOrigin(label); }
        else { setDestinationPoint(corrected); setDestination(label); }
      }
    } catch {
      // El punto es válido incluso si la dirección textual no puede recuperarse.
    }
  };

  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!originPoint || !destinationPoint) { setQuoteLoading(false); return; }
    let cancelled = false;
    setQuoteLoading(true);
    const timer = window.setTimeout(() => {
      void getSupabaseClient().functions.invoke("marketplace-map-gateway", {
        body: {
          operation: "route_quote",
          origin: { lat: originPoint.lat, lon: originPoint.lon },
          destination: { lat: destinationPoint.lat, lon: destinationPoint.lon },
          pricing: { vehicle_category_code: vehicle, passenger_count: 1, stop_count: 0 },
        },
      }).then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) throw new Error("No se pudo calcular la ruta.");
        const root = data?.data;
        const km = Number(root?.distance_km);
        const seconds = Number(root?.duration_seconds);
        if (!Number.isFinite(km) || km <= 0 || !Number.isFinite(seconds) || seconds <= 0) {
          throw new Error("La ruta no tiene una distancia válida.");
        }
        const priced = service === "passenger" ? root?.prices?.passenger_by_category?.[vehicle] : root?.prices?.[service];
        const estimated = Number(priced?.recommended_price);
        const rawRoute = Array.isArray(root?.route_points) ? root.route_points : [];
        const routePoints = rawRoute.map(parsePoint).filter((p: TestPoint | null): p is TestPoint => p !== null).map(({lat,lon})=>({lat,lon}));
        setQuote({
          distanceKm: km,
          durationSeconds: seconds,
          recommendedPrice: Number.isFinite(estimated) && estimated > 0 ? estimated : null,
          routePoints,
        });
      }).catch((reason: unknown) => {
        if (!cancelled) setQuoteError(reason instanceof Error ? reason.message : "No se pudo calcular la ruta.");
      }).finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    }, 380);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [originPoint, destinationPoint, vehicle, service]);

  const filled = [clientName.trim().length >= 2, /^\+?[0-9 ()-]{8,22}$/.test(clientPhone.trim()), Boolean(originPoint), Boolean(destinationPoint)];
  const complete = filled.every(Boolean);

  const stopField = (kind: Stop, value: string) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`care-${kind}`}>{kind === "origin" ? "Origen de recogida" : "Destino"}</Label>
        <Button type="button" size="sm" variant={picking === kind ? "default" : "outline"}
          onClick={() => setPicking(kind)} className="h-8 gap-1.5 text-xs">
          <MapPin className="h-3.5 w-3.5" /> Marcar en mapa
        </Button>
      </div>
      <Input id={`care-${kind}`} value={value} autoComplete="off" maxLength={240}
        placeholder={kind === "origin" ? "Escribe o marca dónde recoger" : "Escribe o marca el destino"}
        onChange={(event) => editStop(kind, event.target.value)} />
      {suggestions[kind].length > 0 && (
        <div className="relative z-20 overflow-hidden rounded-xl border border-cyan-400/20 bg-background shadow-lg">
          {suggestions[kind].map((point, index) => (
            <button key={`${kind}-${index}-${point.lat}-${point.lon}`} type="button"
              className="flex w-full items-center gap-2 border-b border-border/45 px-3 py-2 text-left text-xs last:border-0 hover:bg-cyan-400/[0.08]"
              onClick={() => setStop(kind, point)}>
              <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-300" /><span>{point.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="customer-care-workspace">
      <header className="relative overflow-hidden rounded-[26px] border border-cyan-400/20 bg-gradient-to-r from-cyan-500/[0.10] via-background/85 to-emerald-500/[0.08] px-4 py-4 shadow-[0_25px_60px_-45px_rgba(34,211,238,0.85)] sm:px-5">
        <div className="pointer-events-none absolute -right-16 -top-28 h-56 w-56 rounded-full bg-cyan-400/[0.10] blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"><Headphones className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-300">Trabajos · Centro operativo</p>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Atención al cliente</h2>
              <p className="text-xs text-muted-foreground">Canal de soporte, datos del pasajero y recorrido en una sola pantalla.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-400/25 bg-amber-400/[0.075] px-3 py-2 text-[11px] font-semibold text-amber-200">Preparación · Sin envío real</span>
            <Button size="sm" variant="outline" onClick={reset} className="gap-2"><Plus className="h-4 w-4" /> Nueva solicitud</Button>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4">
          {canManageContact ? (
            <MarketplaceLiteContactCard projectId={projectId} />
          ) : (
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
              La configuración del teléfono y horario requiere permiso de propietario. Puedes preparar los datos de una solicitud.
            </div>
          )}

          <section className="overflow-hidden rounded-[24px] border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.055] via-background/90 to-background p-4 shadow-xl sm:p-5" aria-label="Formulario de solicitud manual">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-cyan-300" /><h3 className="text-base font-semibold">Solicitud manual de carrera</h3></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fase 1</span>
            </div>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="care-client-name">Nombre del cliente</Label>
                  <Input id="care-client-name" placeholder="Nombre y apellido" value={clientName} maxLength={100} onChange={(event) => setClientName(event.target.value)} />
                </div>
                <div className="space-y-1.5"><Label htmlFor="care-client-phone">Teléfono del cliente</Label>
                  <Input id="care-client-phone" type="tel" inputMode="tel" placeholder="+53 ..." value={clientPhone} maxLength={22} onChange={(event) => setClientPhone(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="care-service">Tipo de servicio</Label>
                  <select id="care-service" value={service} onChange={(event) => setService(event.target.value as ServiceCode)}
                    className="flex h-10 w-full rounded-xl border border-border-default bg-surface-1 px-3 text-sm text-text-primary">
                    {SERVICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="care-vehicle">Vehículo</Label>
                  <select id="care-vehicle" value={vehicle} onChange={(event) => setVehicle(event.target.value as VehicleCode)}
                    className="flex h-10 w-full rounded-xl border border-border-default bg-surface-1 px-3 text-sm text-text-primary">
                    {VEHICLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
              </div>
              {stopField("origin", origin)}
              {stopField("destination", destination)}
              <div className="space-y-1.5"><Label htmlFor="care-contact-channel">Contacto preferido</Label>
                <select id="care-contact-channel" value={preferredContact} onChange={(event) => setPreferredContact(event.target.value)}
                  className="flex h-10 w-full rounded-xl border border-border-default bg-surface-1 px-3 text-sm text-text-primary">
                  <option value="phone">Llamada</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="care-notes">Indicaciones para el conductor</Label>
                <Textarea id="care-notes" placeholder="Referencias de recogida u observaciones" value={notes} maxLength={500}
                  onChange={(event) => setNotes(event.target.value)} rows={3} />
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.055] p-3 text-xs text-amber-100/90">
                El formulario es una vista de preparación. No guarda datos personales ni crea carreras hasta habilitar y auditar el flujo real en la fase 2.
              </div>
              <Button type="button" className="w-full gap-2" disabled aria-label="Publicar carrera; disponible en fase 2">
                <ArrowRight className="h-4 w-4" /> Publicar carrera · Próxima fase
              </Button>
              <p className="text-center text-xs text-muted-foreground">{complete ? "Datos preparados para revisar" : "Completa nombre, teléfono, origen y destino"}</p>
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-3 xl:sticky xl:top-4" aria-label="Mapa y resumen de la carrera">
          <section className="overflow-hidden rounded-[24px] border border-cyan-400/25 bg-gradient-to-br from-cyan-500/[0.075] via-background/95 to-background p-3 shadow-[0_26px_70px_-45px_rgba(34,211,238,0.85)] sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Navigation className="h-4 w-4 text-cyan-300" /><h3 className="font-semibold">Mapa del servicio</h3></div>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.075] px-3 py-1 text-[11px] text-cyan-100">Origen → destino</span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-background/55 px-3 py-2"><span className="block text-muted-foreground">Conductores trabajando</span><strong className="text-base">{live.data?.summary.workingDrivers ?? "—"}</strong></div>
              <div className="rounded-xl border border-border/60 bg-background/55 px-3 py-2"><span className="block text-muted-foreground">GPS reciente</span><strong className="text-base">{live.data?.summary.driversWithFreshLocation ?? "—"}</strong></div>
              <div className="col-span-2 rounded-xl border border-border/60 bg-background/55 px-3 py-2 sm:col-span-1"><span className="block text-muted-foreground">Carreras activas</span><strong className="text-base">{live.data?.summary.activeJobs ?? "—"}</strong></div>
            </div>
            <MarketplaceTestRouteMap
              projectId={projectId} origin={originPoint} destination={destinationPoint}
              route={quote?.routePoints ?? []} picking={picking} heightClassName="h-[390px] w-full lg:h-[570px]"
              ariaLabel="Mapa interactivo de solicitud para cliente" onPick={(kind, lat, lon) => { void pickFromMap(kind, lat, lon); }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={picking === "origin" ? "default" : "outline"} onClick={() => setPicking("origin")} className="gap-1.5"><MapPin className="h-4 w-4" /> Origen</Button>
              <Button type="button" size="sm" variant={picking === "destination" ? "default" : "outline"} onClick={() => setPicking("destination")} className="gap-1.5"><MapPin className="h-4 w-4" /> Destino</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setStop("origin",null); setStop("destination",null); }} className="gap-1.5"><Route className="h-4 w-4" /> Limpiar ruta</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Toca el mapa para señalar origen y destino. También puedes arrastrar los marcadores o buscar direcciones en el formulario.</p>
          </section>

          <section className="rounded-[24px] border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.065] to-background p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><h3 className="font-semibold">Resumen preliminar</h3></div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border/55 bg-background/55 p-3"><span className="block text-xs text-muted-foreground">Distancia</span><strong>{quote ? `${quote.distanceKm.toFixed(2)} km` : "—"}</strong></div>
              <div className="rounded-xl border border-border/55 bg-background/55 p-3"><span className="block text-xs text-muted-foreground">Tiempo estimado</span><strong>{quote ? `${Math.ceil(quote.durationSeconds / 60)} min` : "—"}</strong></div>
              <div className="rounded-xl border border-border/55 bg-background/55 p-3"><span className="block text-xs text-muted-foreground">Tarifa orientativa</span><strong>{quote?.recommendedPrice ? `${quote.recommendedPrice.toLocaleString("es-CU")} CUP` : "—"}</strong></div>
            </div>
            {quoteLoading ? <p className="mt-2 flex items-center gap-1 text-xs text-cyan-200"><Clock3 className="h-3.5 w-3.5" /> Calculando recorrido…</p> : null}
            {quoteError ? <p role="status" className="mt-2 text-xs text-amber-200">{quoteError}</p> : null}
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {clientName.trim() || "Cliente sin identificar"} · {clientPhone.trim() || "Sin teléfono"}</div>
            <p className="mt-2 text-[11px] text-muted-foreground">La estimación no confirma precio final ni disponibilidad de un conductor.</p>
          </section>
          <div className="flex items-center gap-2 px-1 text-xs text-emerald-200/80"><CheckCircle2 className="h-3.5 w-3.5" /> El canal de atención permanece conectado a la configuración actual de TukTuk Lite.</div>
        </aside>
      </div>
    </div>
  );
}
