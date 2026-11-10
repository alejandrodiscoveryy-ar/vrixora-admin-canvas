import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, CheckCircle2, Clock3, Headphones, History, MapPin,
  MessageCircle, Navigation, Phone, Plus, Route, Send, ShieldCheck, UserRound, Users,
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
import { interpretManualWhatsAppMessage } from "@/lib/marketplace-whatsapp-manual.mjs";

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
type WhatsAppQuote = {
  id: string;
  request_key: string;
  customer_id: string;
  customer_name?: string;
  whatsapp_phone?: string;
  origin_text: string;
  destination_text: string;
  origin_point: { lat: number; lon: number };
  destination_point: { lat: number; lon: number };
  service_code: ServiceCode;
  vehicle_category_code: VehicleCode;
  expected_price: number;
  notes: string | null;
  cargo_weight_kg: number | null;
  status: "quoted" | "sent" | "accepted" | "published";
  quote_expires_at: string;
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
    WHATSAPP_QUOTE_ROUTE_OR_PRICE_CHANGED: "La ruta o tarifa cambió. Debes enviar una cotización nueva y obtener otra aceptación.",
    WHATSAPP_QUOTE_EXPIRED: "La cotización venció. Prepara y envía otra cotización.",
    WHATSAPP_QUOTE_NOT_ACCEPTED: "Debes registrar primero la aceptación del cliente.",
    WHATSAPP_QUOTE_MUST_BE_SENT_FIRST: "Registra primero que enviaste la cotización por WhatsApp.",
    WHATSAPP_QUOTE_IDEMPOTENCY_CONFLICT: "La solicitud cambió. Prepara una cotización nueva.",
    WHATSAPP_QUOTE_ACCEPTANCE_REQUIRED: "Copia la respuesta con la que el cliente acepta el importe.",
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
  const [whatsappMode, setWhatsappMode] = useState(false);
  const [whatsappRawMessage, setWhatsappRawMessage] = useState("");
  const [whatsappQuote, setWhatsappQuote] = useState<WhatsAppQuote | null>(null);
  const [whatsappOpened, setWhatsappOpened] = useState(false);
  const [acceptanceExcerpt, setAcceptanceExcerpt] = useState("");
  const [acceptanceReviewed, setAcceptanceReviewed] = useState(false);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
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

  const invalidateRequest = () => {
    setPublished(null);
    setWhatsappQuote(null);
    setWhatsappOpened(false);
    setAcceptanceExcerpt("");
    setAcceptanceReviewed(false);
    setRequestKey(crypto.randomUUID());
  };
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
    setWhatsappRawMessage("");
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
  }, [originPoint, destinationPoint, service, vehicle, routeKey, cargoWeight, quoteRefresh]);
  const validQuote = quote?.key === routeKey ? quote : null;
  const weight = Number(cargoWeight);
  const validCargo = service !== "cargo" || (Number.isFinite(weight) && weight > 0 && weight <= 10000);
  const pendingWhatsAppQuotes = useQuery({
    queryKey: ["care-whatsapp-pending-quotes", projectId],
    queryFn: () => rpc<WhatsAppQuote[]>("admin_list_marketplace_whatsapp_quotes", {
      target_project_id: projectId,
    }),
    enabled: whatsappMode && canManageMarketplace && canViewCustomers,
    staleTime: 15_000,
  });
  const quoteMatchesCurrent = !!(whatsappQuote && customer && validQuote
    && originPoint && destinationPoint
    && whatsappQuote.request_key === requestKey
    && whatsappQuote.customer_id === customer.id
    && whatsappQuote.service_code === service
    && whatsappQuote.vehicle_category_code === vehicle
    && whatsappQuote.origin_text === origin.trim()
    && whatsappQuote.destination_text === destination.trim()
    && (whatsappQuote.notes ?? "") === notes.trim()
    && (whatsappQuote.cargo_weight_kg ?? null) === (service === "cargo" ? weight : null)
    && Number(whatsappQuote.expected_price).toFixed(2) === validQuote.recommendedPrice.toFixed(2)
    && Number(whatsappQuote.origin_point.lat) === originPoint.lat
    && Number(whatsappQuote.origin_point.lon) === originPoint.lon
    && Number(whatsappQuote.destination_point.lat) === destinationPoint.lat
    && Number(whatsappQuote.destination_point.lon) === destinationPoint.lon
    && new Date(whatsappQuote.quote_expires_at).getTime() > Date.now());
  const acceptedWhatsAppQuote = quoteMatchesCurrent && whatsappQuote?.status === "accepted";
  const canPrepareWhatsAppQuote = whatsappMode && canManageMarketplace && !!customer
    && !!originPoint && !!destinationPoint && !!validQuote && !quoteLoading && validCargo
    && !whatsappQuote && !published;
  const canPublish = canManageMarketplace && !!customer && !!originPoint && !!destinationPoint &&
    !!validQuote && !quoteLoading && validCargo && !published &&
    (!whatsappMode || acceptedWhatsAppQuote);
  const quoteWhatsAppText = whatsappQuote
    ? [
      "TUKTUK | Cotización de servicio",
      "Origen: " + whatsappQuote.origin_text,
      "Destino: " + whatsappQuote.destination_text,
      "Servicio: " + (SERVICES.find((item) => item.value === whatsappQuote.service_code)?.label ?? whatsappQuote.service_code),
      "Vehículo: " + (VEHICLES.find((item) => item.value === whatsappQuote.vehicle_category_code)?.label ?? whatsappQuote.vehicle_category_code),
      "Precio total: " + Number(whatsappQuote.expected_price).toLocaleString("es-CU", { maximumFractionDigits: 2 }) + " CUP",
      "Referencia: " + whatsappQuote.id.slice(0, 8).toUpperCase(),
      "Válida hasta: " + new Intl.DateTimeFormat("es-CU", { timeZone: "America/Havana", dateStyle: "short", timeStyle: "short" }).format(new Date(whatsappQuote.quote_expires_at)) + " (hora de Cuba).",
      "Confirma este importe respondiendo ACEPTO y la referencia indicada.",
      "La carrera solo se enviará a los conductores después de tu aceptación.",
    ].join("\n")
    : "";
  const quoteWhatsAppLink = validPhone(normalizedPhone) && whatsappQuote
    ? "https://wa.me/" + normalizedPhone.replace(/\D/g, "") + "?text=" + encodeURIComponent(quoteWhatsAppText)
    : null;
  const missingWhatsAppFields = [
    !validPhone(normalizedPhone) ? "teléfono del cliente" : null,
    validPhone(normalizedPhone) && !customer ? "identificar o registrar al cliente" : null,
    !originPoint ? "ubicación exacta de recogida" : null,
    !destinationPoint ? "ubicación exacta de destino" : null,
    !validCargo ? "peso de la carga" : null,
    !validQuote ? "calcular tarifa" : null,
  ].filter((value): value is string => value !== null);
  const customerQuestions = missingWhatsAppFields.filter((part) => part !== "calcular tarifa" && part !== "identificar o registrar al cliente");
  const whatsappQuestion = customerQuestions.length
    ? "Hola, para preparar tu solicitud de TUKTUK necesitamos confirmar: "
      + customerQuestions.join(", ") + ". ¿Puedes facilitarnos estos datos? Gracias."
    : "";
  const whatsappQuestionLink = validPhone(normalizedPhone) && whatsappQuestion
    ? "https://wa.me/" + normalizedPhone.replace(/\D/g, "") + "?text=" + encodeURIComponent(whatsappQuestion)
    : null;
  const recoverWhatsAppQuote = (saved: WhatsAppQuote) => {
    if (!saved.whatsapp_phone) return;
    setWhatsappMode(true);
    setClientPhone(saved.whatsapp_phone);
    setClientName(""); setRegistered(null);
    setService(saved.service_code); setVehicle(saved.vehicle_category_code);
    setPreferredContact("whatsapp");
    setOrigin(saved.origin_text); setDestination(saved.destination_text);
    setOriginPoint(parsePoint(saved.origin_point)); setDestinationPoint(parsePoint(saved.destination_point));
    setCargoWeight(saved.cargo_weight_kg == null ? "" : String(saved.cargo_weight_kg));
    setNotes(saved.notes ?? "");
    setSuggestions({ origin: [], destination: [] });
    pointVersion.current.origin += 1; pointVersion.current.destination += 1;
    setQuote(null); setQuoteError(null); setPublished(null);
    setWhatsappQuote(saved); setRequestKey(saved.request_key);
    setWhatsappOpened(false); setAcceptanceExcerpt(""); setAcceptanceReviewed(false);
  };
  const extractWhatsAppMessage = () => {
    const parsed = interpretManualWhatsAppMessage(whatsappRawMessage);
    if (!whatsappRawMessage.trim()) return toast.error("Pega primero el mensaje del cliente.");
    if (parsed.clientPhone) onPhone(parsed.clientPhone);
    if (parsed.clientName) setClientName(parsed.clientName);
    if (parsed.notes) setNotes(parsed.notes);
    if (parsed.origin) editStop("origin", parsed.origin);
    if (parsed.destination) editStop("destination", parsed.destination);
    if (parsed.service) setService(parsed.service);
    if (parsed.vehicle) setVehicle(parsed.vehicle);
    setPreferredContact("whatsapp");
    invalidateRequest();
    toast.info(parsed.hints.length
      ? "Datos detectados. Comprueba lo que falta y selecciona ambos puntos exactos en el mapa."
      : "Revisa los datos y confirma ambos puntos exactos en el mapa.");
  };
  const verifyWhatsAppRoute = async () => {
    if (!customer || !originPoint || !destinationPoint || !validQuote || !validCargo)
      throw new Error("Completa los datos y calcula la tarifa antes de preparar la cotización.");
    const { data: verified, error } = await getSupabaseClient().functions.invoke(
      "marketplace-map-admin-gateway",
      { body: {
        operation: "care_route_verify_v1",
        project_id: projectId,
        target_service_code: service,
        target_vehicle_category_code: vehicle,
        target_origin_point: { lat: originPoint.lat, lon: originPoint.lon },
        target_destination_point: { lat: destinationPoint.lat, lon: destinationPoint.lon },
        target_cargo_weight_kg: service === "cargo" ? weight : null,
      } }
    );
    if (error || verified?.error) throw error ?? new Error(String(verified?.error));
    const routeId = verified?.data?.verified_route_id;
    const verifiedPrice = Number(verified?.data?.recommended_price);
    if (typeof routeId !== "string" || !/^[0-9a-f-]{36}$/i.test(routeId)
      || !Number.isFinite(verifiedPrice) || verifiedPrice <= 0)
      throw new Error("CARE_ROUTE_VERIFICATION_FAILED");
    if (Math.round(verifiedPrice * 100) !== Math.round(validQuote.recommendedPrice * 100))
      throw new Error("CARE_PRICE_CHANGED");
    return { routeId, verifiedPrice };
  };
  const prepareWhatsAppQuote = useMutation({
    mutationFn: async () => {
      if (!canPrepareWhatsAppQuote || !customer) throw new Error("Completa la solicitud antes de cotizar.");
      const { routeId, verifiedPrice } = await verifyWhatsAppRoute();
      return rpc<WhatsAppQuote>("admin_prepare_marketplace_whatsapp_quote", {
        target_project_id: projectId,
        target_customer_id: customer.id,
        target_request_key: requestKey,
        target_verified_route_id: routeId,
        target_expected_price: verifiedPrice,
        target_origin_text: origin.trim(),
        target_destination_text: destination.trim(),
        target_notes: notes.trim() || null,
      });
    },
    onSuccess: (saved) => {
      setWhatsappQuote(saved); setWhatsappOpened(false);
      void queryClient.invalidateQueries({ queryKey: ["care-whatsapp-pending-quotes", projectId] });
      toast.success("Cotización guardada. Ábrela en WhatsApp y envíala manualmente.");
    },
    onError: (error) => {
      toast.error(message(error));
      if (String(error).includes("PRICE_CHANGED") || String(error).includes("QUOTE_ROUTE")) {
        setQuoteRefresh((current) => current + 1);
      }
    },
  });
  const markWhatsAppQuoteSent = useMutation({
    mutationFn: () => rpc<WhatsAppQuote>("admin_mark_marketplace_whatsapp_quote_sent", {
      target_project_id: projectId, target_quote_id: whatsappQuote?.id,
    }),
    onSuccess: (saved) => {
      setWhatsappQuote(saved);
      void queryClient.invalidateQueries({ queryKey: ["care-whatsapp-pending-quotes", projectId] });
      toast.success("Envío marcado por el operador. Pendiente de respuesta del cliente.");
    },
    onError: (err) => toast.error(message(err)),
  });
  const confirmWhatsAppQuote = useMutation({
    mutationFn: () => rpc<WhatsAppQuote>("admin_confirm_marketplace_whatsapp_quote", {
      target_project_id: projectId,
      target_quote_id: whatsappQuote?.id,
      target_acceptance_excerpt: acceptanceExcerpt.trim(),
    }),
    onSuccess: (saved) => {
      setWhatsappQuote(saved); setAcceptanceReviewed(false);
      void queryClient.invalidateQueries({ queryKey: ["care-whatsapp-pending-quotes", projectId] });
      toast.success("Aceptación registrada. Ya puedes publicar la carrera.");
    },
    onError: (err) => toast.error(message(err)),
  });
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

      if (whatsappMode) {
        if (!acceptedWhatsAppQuote || !whatsappQuote || !quoteMatchesCurrent)
          throw new Error("WHATSAPP_QUOTE_NOT_ACCEPTED");
        return rpc<Published>("admin_publish_marketplace_whatsapp_accepted_job", {
          target_project_id: projectId,
          target_quote_id: whatsappQuote.id,
          target_verified_route_id: proofId,
        });
      }

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
        queryClient.invalidateQueries({ queryKey: ["care-whatsapp-pending-quotes", projectId] }),
      ]);
      toast.success(data.repeated ? "Esta carrera ya estaba publicada." : "Carrera real publicada y enviada al despacho.");
    },
    onError: (err) => {
      toast.error(message(err));
      if (String(err).includes("CARE_PRICE_CHANGED")
        || String(err).includes("WHATSAPP_QUOTE_ROUTE_OR_PRICE_CHANGED")) {
        setWhatsappQuote(null);
        setAcceptanceReviewed(false);
        setAcceptanceExcerpt("");
        setQuoteRefresh((current) => current + 1);
        setRequestKey(crypto.randomUUID());
      }
    },
  });
  const confirmPublish = () => {
    if (!customer || !validQuote || !canPublish || publish.isPending) return;
    const ok = window.confirm(`¿Publicar carrera REAL para ${customer.display_name} (${customer.whatsapp_phone})?\n\n${origin} → ${destination}\n${validQuote.recommendedPrice.toLocaleString("es-CU")} CUP\n\n${whatsappMode ? "Aceptación del precio registrada por el operador. " : ""}Los conductores disponibles podrán recibirla.`);
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
    <div className="min-w-0 space-y-3 sm:space-y-4" data-testid="customer-care-workspace">
      <header className="relative overflow-hidden rounded-[18px] border border-cyan-400/20 bg-gradient-to-r from-cyan-500/[0.10] via-background/85 to-emerald-500/[0.08] px-3 py-3 sm:rounded-[26px] sm:px-4 sm:py-4 shadow-[0_25px_60px_-45px_rgba(34,211,238,0.85)] sm:px-5">
        <div className="relative flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"><Headphones className="h-5 w-5" /></span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-300">Trabajos · Centro operativo</p>
              <h2 className="text-lg font-semibold tracking-tight sm:text-2xl">Atención al cliente</h2>
              <p className="hidden text-xs text-muted-foreground sm:block">Recibe la solicitud, prepara la ruta, cotiza y publica tras la aceptación del cliente.</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={reset} className="gap-2"><Plus className="h-4 w-4" /> Nueva solicitud</Button>
        </div>
      </header>
      <div className="grid min-w-0 items-start gap-3 sm:gap-4 xl:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <section className="rounded-[22px] border border-border/60 bg-background/85 p-4 sm:p-5" aria-label="Recepción asistida desde WhatsApp">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-emerald-300" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">01 · Recibir solicitud</p>
                  <h3 className="text-base font-semibold">WhatsApp asistido</h3>
                </div>
              </div>
              <Button type="button" variant={whatsappMode ? "default" : "outline"} size="sm"
                onClick={() => { reset(); setWhatsappMode(!whatsappMode); }}>
                {whatsappMode ? "Volver a solicitud habitual" : "Iniciar desde WhatsApp"}
              </Button>
            </div>
            {whatsappMode ? (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Copia el mensaje del cliente. La extracción es local y orientativa: no se sincroniza WhatsApp ni se usa IA externa.
                  Comprueba siempre los datos y selecciona las ubicaciones exactas en el mapa.
                </p>
                <Label htmlFor="care-whatsapp-message">Mensaje recibido</Label>
                <Textarea id="care-whatsapp-message" rows={3} maxLength={2000} value={whatsappRawMessage}
                  placeholder="Ej.: Necesito un triciclo desde Alamar hasta el Capitolio"
                  onChange={(event) => setWhatsappRawMessage(event.target.value)} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" onClick={extractWhatsAppMessage} disabled={!whatsappRawMessage.trim()}>
                    Extraer datos del mensaje
                  </Button>
                  <span className="text-[11px] text-muted-foreground">No se guardará el mensaje completo.</span>
                </div>
                {missingWhatsAppFields.length > 0 ? (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.05] p-3">
                    <p className="text-xs font-semibold text-amber-200">Datos pendientes</p>
                    <p className="mt-1 text-xs text-muted-foreground">{missingWhatsAppFields.join(" · ")}</p>
                    {whatsappQuestionLink ? (
                      <a href={whatsappQuestionLink} target="_blank" rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-200 hover:underline">
                        <MessageCircle className="h-3.5 w-3.5" /> Preguntar datos al cliente por WhatsApp
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {pendingWhatsAppQuotes.data?.length ? (
                  <details className="rounded-xl border border-border/50 bg-background/35 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-foreground">
                      Solicitudes en espera ({pendingWhatsAppQuotes.data.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                    {pendingWhatsAppQuotes.data.slice(0, 8).map((saved) => (
                      <button type="button" key={saved.id} onClick={() => recoverWhatsAppQuote(saved)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/45 px-3 py-2 text-left text-xs hover:border-emerald-400/40">
                        <span className="min-w-0 truncate">{saved.customer_name || saved.whatsapp_phone || "Cliente"} · {saved.origin_text} → {saved.destination_text}</span>
                        <span className="shrink-0 font-semibold text-emerald-200">{saved.status === "accepted" ? "Aceptada" : saved.status === "sent" ? "Esperando" : "Sin enviar"}</span>
                      </button>
                    ))}
                    </div>
                  </details>
                ) : null}
                {pendingWhatsAppQuotes.isError ? (
                  <p role="alert" className="text-xs text-amber-200">
                    No se pudieron cargar cotizaciones pendientes. Comprueba que esté aplicada la migración de WhatsApp asistido.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Elige «Iniciar desde WhatsApp» para importar una petición recibida o continúa con una solicitud manual.</p>
            )}
          </section>
          <section className="relative isolate overflow-hidden rounded-[22px] border border-border/60 bg-background/85 p-4 sm:p-5" aria-label="Identificación del cliente">
            <div className="relative z-10 space-y-3">
              <div className="mb-3 flex items-center gap-3"><span className="rounded-xl border border-violet-400/30 bg-violet-400/10 p-2 text-violet-200"><UserRound className="h-5 w-5" /></span>
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-violet-300">02 · Identificar cliente</p><h3 className="text-base font-semibold">Buscar cliente por teléfono</h3></div>
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
          <section className="relative isolate overflow-hidden rounded-[22px] border border-border/60 bg-background/85 p-4 sm:p-5" aria-label="Formulario de solicitud manual">
            <div className="relative z-10 mb-4 flex items-center gap-2"><Route className="h-4 w-4 text-teal-300" /><h3 className="text-base font-semibold">03 · Ruta y vehículo</h3></div>
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
              {!whatsappMode ? (
              <div className="space-y-1.5"><Label htmlFor="care-contact">Contacto preferido</Label>
                <select id="care-contact" value={preferredContact} onChange={(e) => { setPreferredContact(e.target.value); invalidateRequest(); }} className="flex h-10 w-full rounded-xl border border-border-default bg-surface-1 px-3 text-sm text-text-primary">
                  <option value="phone">Llamada</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
                </select>
              </div>
              ) : null}
              <div className="space-y-1.5"><Label htmlFor="care-notes">Indicaciones al conductor</Label>
                <Textarea id="care-notes" rows={3} maxLength={500} placeholder="Referencia o instrucciones de recogida" value={notes} onChange={(e) => { setNotes(e.target.value); invalidateRequest(); }} />
              </div>
            </div>
          </section>
        </div>
        <aside className="min-w-0 space-y-3 xl:sticky xl:top-4" aria-label="Mapa y resumen de la carrera">
          <section className="overflow-hidden rounded-[22px] border border-border/60 bg-background/85 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Navigation className="h-4 w-4 text-cyan-300" /><h3 className="font-semibold">Mapa del servicio</h3></div>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.075] px-3 py-1 text-[11px] text-cyan-100">Origen → destino</span>
            </div>
            <MarketplaceTestRouteMap projectId={projectId} origin={originPoint} destination={destinationPoint}
              route={validQuote?.routePoints ?? []} picking={picking} heightClassName="h-[350px] w-full lg:h-[440px]"
              ariaLabel="Mapa interactivo de solicitud para cliente" onPick={(kind, lat, lon) => { void pickFromMap(kind, lat, lon); }} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={picking === "origin" ? "default" : "outline"} onClick={() => setPicking("origin")} className="gap-1"><MapPin className="h-4 w-4" /> Origen</Button>
              <Button type="button" size="sm" variant={picking === "destination" ? "default" : "outline"} onClick={() => setPicking("destination")} className="gap-1"><MapPin className="h-4 w-4" /> Destino</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setStop("origin",null); setStop("destination",null); }} className="gap-1"><Route className="h-4 w-4" /> Limpiar ruta</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Marca el origen y el destino o elige las direcciones exactas en el mapa.</p>
            <details className="mt-3 rounded-xl border border-border/45 bg-background/40 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Estado de la flota</summary>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-border/60 bg-background/55 p-2"><span className="block text-muted-foreground">Trabajando</span><strong>{live.data?.summary.workingDrivers ?? "—"}</strong></div>
              <div className="rounded-xl border border-border/60 bg-background/55 p-2"><span className="block text-muted-foreground">GPS reciente</span><strong>{live.data?.summary.driversWithFreshLocation ?? "—"}</strong></div>
              <div className="rounded-xl border border-border/60 bg-background/55 p-2"><span className="block text-muted-foreground">Activas</span><strong>{live.data?.summary.activeJobs ?? "—"}</strong></div>
            </div>
            </details>

          </section>
          <section className="rounded-[22px] border border-border/60 bg-background/85 p-4 sm:p-5">
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
            {whatsappMode ? (
              <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold"><Send className="h-4 w-4 text-emerald-300" /> 04 · Cotizar, aceptar y publicar</h4>
                {!whatsappQuote ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">El importe se verificará otra vez en el servidor antes de guardar la cotización.</p>
                    <Button type="button" onClick={() => prepareWhatsAppQuote.mutate()}
                      disabled={!canPrepareWhatsAppQuote || prepareWhatsAppQuote.isPending} className="w-full">
                      {prepareWhatsAppQuote.isPending ? "Verificando tarifa…" : "Preparar cotización para WhatsApp"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.05] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-xs">Referencia {whatsappQuote.id.slice(0, 8).toUpperCase()}</strong>
                      <span className="text-[11px] text-emerald-200">
                        {whatsappQuote.status === "quoted" ? "Pendiente de envío" :
                          whatsappQuote.status === "sent" ? "Esperando al cliente" :
                          whatsappQuote.status === "accepted" ? "Aceptada por el cliente" : "Publicada"}
                      </span>
                    </div>
                    <p className="text-xs">Importe informado: <strong>{Number(whatsappQuote.expected_price).toLocaleString("es-CU")} CUP</strong></p>
                    {!quoteMatchesCurrent ? (
                      <p role="alert" className="text-xs text-amber-200">Los datos, el precio o la vigencia no coinciden. Prepara una cotización nueva.</p>
                    ) : null}
                    <Textarea rows={6} readOnly value={quoteWhatsAppText} aria-label="Texto de cotización para enviar al cliente" className="text-xs" />
                    {quoteWhatsAppLink && quoteMatchesCurrent ? (
                      <a href={quoteWhatsAppLink} onClick={() => setWhatsappOpened(true)}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20">
                        <MessageCircle className="h-4 w-4" /> Abrir WhatsApp con cotización
                      </a>
                    ) : null}
                    {whatsappQuote.status === "quoted" && quoteMatchesCurrent ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          {whatsappOpened ? "WhatsApp se abrió. El envío aún no está confirmado." : "Abrir WhatsApp no envía el mensaje automáticamente."}
                        </p>
                        <Button type="button" variant="outline" className="w-full"
                          disabled={markWhatsAppQuoteSent.isPending}
                          onClick={() => {
                            if (window.confirm("¿Enviaste realmente esta cotización al cliente por WhatsApp?"))
                              markWhatsAppQuoteSent.mutate();
                          }}>He enviado la cotización</Button>
                      </div>
                    ) : null}
                    {whatsappQuote.status === "sent" && quoteMatchesCurrent ? (
                      <div className="space-y-2">
                        <Label htmlFor="care-whatsapp-acceptance">Respuesta de aceptación recibida en WhatsApp</Label>
                        <Textarea id="care-whatsapp-acceptance" rows={2} maxLength={240} value={acceptanceExcerpt}
                          onChange={(event) => { setAcceptanceExcerpt(event.target.value); setAcceptanceReviewed(false); }}
                          placeholder="Copia la respuesta del cliente, por ejemplo: Acepto la cotización ABCD1234" />
                        <label className="flex items-start gap-2 text-xs text-muted-foreground">
                          <input type="checkbox" checked={acceptanceReviewed}
                            onChange={(event) => setAcceptanceReviewed(event.target.checked)} className="mt-0.5" />
                          He revisado personalmente que esta respuesta corresponde al cliente, a esta cotización y al precio indicado.
                        </label>
                        <Button type="button" className="w-full"
                          disabled={!acceptanceReviewed || acceptanceExcerpt.trim().length < 2 || confirmWhatsAppQuote.isPending}
                          onClick={() => confirmWhatsAppQuote.mutate()}>
                          Registrar aceptación del cliente
                        </Button>
                      </div>
                    ) : null}
                    {whatsappQuote.status === "accepted" && quoteMatchesCurrent ? (
                      <div className="flex items-start gap-2 text-xs text-emerald-200">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Aceptación registrada. Puedes publicar la carrera con su importe aceptado.
                      </div>
                    ) : null}
                    <Button type="button" variant="ghost" size="sm" className="w-full text-xs"
                      onClick={() => { invalidateRequest(); setQuoteRefresh((current) => current + 1); }}>
                      Preparar una cotización nueva
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
            <div className="mt-4 border-t border-border/50 pt-4" aria-label="Confirmar publicación de la carrera">
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
                  <p className="text-center text-xs text-muted-foreground">{!customer ? "Identifica o registra primero al cliente" : !validQuote ? "Selecciona origen y destino y espera la tarifa" : !validCargo ? "Indica el peso de la carga" : !canManageMarketplace ? "Tu rol no puede publicar carreras" : whatsappMode && !acceptedWhatsAppQuote ? "WhatsApp: primero envía el precio y registra la aceptación del cliente" : "Se solicitará confirmación antes de enviar al radar"}</p>
                </>
              )}

            </div>
          </section>
          <div className="flex items-center gap-2 px-1 text-xs text-emerald-200/80"><CheckCircle2 className="h-3.5 w-3.5" /> Las carreras se vinculan a Clientes y al despacho real.</div>
        </aside>
      </div>
      {canManageContact ? (
        <details className="rounded-xl border border-border/55 bg-background/55 p-3 sm:p-4">
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
            Configuración del canal WhatsApp Lite · Administración
          </summary>
          <div className="mt-3">
            <MarketplaceLiteContactCard projectId={projectId} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
