import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BadgePercent,
  CalendarDays,
  CircleDollarSign,
  Gift,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveMarketplaceOfferCampaign,
  listMarketplaceOfferCampaigns,
  saveMarketplaceOfferCampaign,
  type MarketplaceOfferCampaign,
  type MarketplaceOfferAudience,
  type MarketplaceOfferActivation,
  type MarketplaceOfferKind,
  type MarketplaceOfferStacking,
  type MarketplaceOfferTrigger,
} from "@/lib/marketplace-offers";

const kinds: { value: MarketplaceOfferKind; name: string; helper: string }[] = [
  { value: "commission_free", name: "Sin comisión", helper: "0 % durante un período definido." },
  {
    value: "commission_reduced",
    name: "Comisión reducida",
    helper: "Porcentaje especial, por ejemplo 5 %.",
  },
  {
    value: "free_rides",
    name: "Carreras sin comisión",
    helper: "Número limitado de servicios gratuitos.",
  },
  {
    value: "wallet_credit",
    name: "Crédito promocional",
    helper: "Saldo de incentivo en CUP, sujeto a control financiero.",
  },
  {
    value: "referral_bonus",
    name: "Bonificación por referido",
    helper: "Recompensa al cumplir condiciones de referido.",
  },
  { value: "reactivation", name: "Reactivación", helper: "Oferta para conductores inactivos." },
  {
    value: "custom",
    name: "Oferta personalizada",
    helper: "Reglas específicas sujetas a aprobación.",
  },
];
const audiences: { value: MarketplaceOfferAudience; text: string }[] = [
  { value: "new_drivers", text: "Nuevos conductores" },
  { value: "active_drivers", text: "Conductores activos" },
  { value: "inactive_drivers", text: "Conductores inactivos" },
  { value: "all_drivers", text: "Todos los conductores" },
  { value: "selected_drivers", text: "Conductores seleccionados" },
];

const initialForm = () => {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 15);
  end.setHours(23, 59, 0, 0);
  const local = (date: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
  };
  return {
    id: "",
    name: "",
    description: "",
    kind: "commission_free" as MarketplaceOfferKind,
    benefitValue: "0",
    benefitDuration: "30",
    benefitRides: "10",
    beginsAt: local(start),
    closesAt: local(end),
    audience: "new_drivers" as MarketplaceOfferAudience,
    activation: "automatic" as MarketplaceOfferActivation,
    activationTrigger: "onboarding" as MarketplaceOfferTrigger,
    redemptionCode: "",
    maxParticipants: "",
    maxBudgetCup: "",
    maxUsesPerDriver: "1",
    priority: "100",
    stacking: "best_only" as MarketplaceOfferStacking,
    terms: "",
    minJobs: "",
    inactiveDays: "",
    userIds: "",
  };
};
type FormState = ReturnType<typeof initialForm>;

function displayDate(value: string) {
  return new Date(value).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}
function editDate(value: string) {
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return "No se pudo completar la operación.";
  if (error.message.includes("OFFERS_OWNER_ONLY"))
    return "Solo el propietario del proyecto puede modificar estas ofertas.";
  if (
    error.message.includes("admin_list_marketplace_offer_campaigns") ||
    error.message.includes("Could not find the function")
  )
    return "Falta instalar la migración del módulo comercial. No se modificó ninguna oferta.";
  return error.message;
}
const numbers = (value: string) => (value.trim() ? Number(value) : null);
const selectStyle =
  "mt-1.5 w-full rounded-xl border border-border/70 bg-background/75 px-3 py-2.5 text-sm text-foreground outline-none focus:border-cyan-400/60";

export default function MarketplaceOffersPanel({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const client = useQueryClient();
  const [openedAt] = useState(() => Date.now());
  const [form, setForm] = useState<FormState>(initialForm);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const campaignQuery = useQuery({
    queryKey: ["marketplace-offer-catalog", projectId],
    queryFn: () => listMarketplaceOfferCampaigns(projectId),
  });
  const campaigns = campaignQuery.data ?? [];
  const count = useMemo(
    () => ({
      total: campaigns.length,
      drafts: campaigns.filter((x) => x.status === "draft").length,
      archived: campaigns.filter((x) => x.status === "archived").length,
      forthcoming: campaigns.filter(
        (x) => x.status !== "archived" && new Date(x.begins_at).getTime() > openedAt,
      ).length,
    }),
    [campaigns, openedAt],
  );

  const change = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const begun = new Date(form.beginsAt);
      const closed = new Date(form.closesAt);
      if (!form.name.trim() || form.name.trim().length < 4)
        throw new Error("El nombre requiere al menos 4 caracteres.");
      if (
        !Number.isFinite(begun.getTime()) ||
        !Number.isFinite(closed.getTime()) ||
        begun.getTime() >= closed.getTime()
      )
        throw new Error("Revisa las fechas de inicio y fin.");
      const value = Number(form.benefitValue);
      const duration = numbers(form.benefitDuration);
      const rideLimit = numbers(form.benefitRides);
      const recipients = form.userIds.split(/[\s,;]+/).filter(Boolean);
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (recipients.some((id) => !uuid.test(id)))
        throw new Error("Los identificadores de conductores deben ser UUID válidos.");
      if (form.audience === "selected_drivers" && !recipients.length)
        throw new Error("Selecciona al menos un conductor.");
      if (form.activation === "code" && !form.redemptionCode.trim())
        throw new Error("Introduce un código de promoción.");
      if (
        !Number.isFinite(value) ||
        (form.kind === "commission_reduced" && (value <= 0 || value >= 100)) ||
        (["wallet_credit", "referral_bonus", "reactivation"].includes(form.kind) && value <= 0)
      ) {
        throw new Error("El valor de la oferta no es válido.");
      }
      const positiveInt = (value: number | null) =>
        value === null || (Number.isInteger(value) && value > 0);
      const maxParticipants = numbers(form.maxParticipants);
      const maxBudgetCup = numbers(form.maxBudgetCup);
      const maxUses = Number(form.maxUsesPerDriver);
      const priority = Number(form.priority);
      if (
        !positiveInt(duration) ||
        !positiveInt(rideLimit) ||
        !positiveInt(maxParticipants) ||
        !positiveInt(numbers(form.minJobs)) ||
        !positiveInt(numbers(form.inactiveDays)) ||
        !Number.isInteger(maxUses) ||
        maxUses < 1 ||
        !Number.isInteger(priority) ||
        priority < 1 ||
        (maxBudgetCup !== null && (!Number.isFinite(maxBudgetCup) || maxBudgetCup <= 0))
      )
        throw new Error("Comprueba los límites numéricos.");
      return saveMarketplaceOfferCampaign(projectId, {
        id: form.id || undefined,
        name: form.name,
        description: form.description,
        kind: form.kind,
        benefitValue: ["commission_free", "free_rides", "custom"].includes(form.kind) ? 0 : value,
        benefitDurationDays: duration,
        benefitRideLimit: form.kind === "free_rides" ? rideLimit : null,
        beginsAt: begun.toISOString(),
        closesAt: closed.toISOString(),
        audience: form.audience,
        audienceRules: {
          ...(numbers(form.minJobs) === null ? {} : { min_completed_jobs: Number(form.minJobs) }),
          ...(numbers(form.inactiveDays) === null
            ? {}
            : { inactive_days: Number(form.inactiveDays) }),
          ...(recipients.length ? { user_ids: recipients } : {}),
        },
        activation: form.activation,
        activationTrigger: form.activationTrigger,
        redemptionCode:
          form.activation === "code" ? form.redemptionCode.trim().toUpperCase() : null,
        maxParticipants,
        maxBudgetCup,
        maxUsesPerDriver: maxUses,
        priority,
        stacking: form.stacking,
        terms: form.terms,
      });
    },
    onSuccess: () => {
      setMessage("Oferta guardada como borrador. No altera cobros ni comisiones.");
      setEditing(false);
      setForm(initialForm());
      void client.invalidateQueries({ queryKey: ["marketplace-offer-catalog", projectId] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const archive = useMutation({
    mutationFn: (id: string) => archiveMarketplaceOfferCampaign(projectId, id),
    onSuccess: () => {
      setMessage("Oferta archivada y conservada en el historial.");
      void client.invalidateQueries({ queryKey: ["marketplace-offer-catalog", projectId] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const open = (item?: MarketplaceOfferCampaign) => {
    setMessage(null);
    if (!item) {
      setForm(initialForm());
      setEditing(true);
      return;
    }
    setForm({
      id: item.id,
      name: item.name,
      description: item.description,
      kind: item.kind,
      benefitValue: String(item.benefit_value),
      benefitDuration: item.benefit_duration_days?.toString() ?? "",
      benefitRides: item.benefit_ride_limit?.toString() ?? "10",
      beginsAt: editDate(item.begins_at),
      closesAt: editDate(item.closes_at),
      audience: item.audience,
      activation: item.activation,
      activationTrigger: item.activation_trigger,
      redemptionCode: item.redemption_code ?? "",
      maxParticipants: item.max_participants?.toString() ?? "",
      maxBudgetCup: item.max_budget_cup?.toString() ?? "",
      maxUsesPerDriver: String(item.max_uses_per_driver),
      priority: String(item.priority),
      stacking: item.stacking,
      terms: item.terms,
      minJobs: item.audience_rules.min_completed_jobs?.toString() ?? "",
      inactiveDays: item.audience_rules.inactive_days?.toString() ?? "",
      userIds: Array.isArray(item.audience_rules.user_ids)
        ? item.audience_rules.user_ids.join(", ")
        : "",
    });
    setEditing(true);
  };

  return (
    <section className="space-y-5">
      <div className="relative isolate overflow-hidden rounded-[26px] border border-violet-400/[0.22] bg-gradient-to-br from-violet-500/[0.075] via-background/75 to-cyan-500/[0.03] p-4 shadow-[0_25px_75px_-48px_rgba(139,92,246,0.68)] backdrop-blur-xl sm:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-violet-400/75 via-cyan-400/25 to-transparent" />
        <img
          src="/admin-premium/economy.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 top-0 hidden h-[19rem] w-[36%] object-contain object-right opacity-[0.10] mix-blend-screen md:block"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/76 via-background/78 to-background/65" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-violet-500/[0.10] blur-3xl" />
        <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-400/10 text-violet-200">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">
                TukTuk · Comercial
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">Campañas y ofertas</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground/70">
                Diseña promociones con fechas, beneficiarios, límites y condiciones. Cada campaña
                conserva su propia configuración.
              </p>
            </div>
          </div>
          {canEdit && (
            <Button onClick={() => open()} className="gap-2">
              <Plus className="h-4 w-4" /> Nueva oferta
            </Button>
          )}
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Modo seguro de preparación.</strong> Las campañas de este módulo se guardan como
            borradores y todavía no se aplican a carreras. La promoción heredada de incorporación de
            TukTuk se mantiene sin cambios hasta integrar y validar el motor financiero.
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            { title: "Campañas", value: count.total, icon: Gift },
            { title: "Borradores", value: count.drafts, icon: BadgePercent },
            { title: "Programables", value: count.forthcoming, icon: CalendarDays },
            { title: "Archivadas", value: count.archived, icon: Archive },
          ].map(({ title, value, icon: Icon }) => (
            <div key={title} className="relative overflow-hidden rounded-2xl border border-violet-400/[0.18] bg-gradient-to-br from-violet-500/[0.055] via-background/90 to-cyan-500/[0.025] p-4 shadow-[0_18px_48px_-37px_rgba(139,92,246,0.6)] backdrop-blur-lg">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-violet-400/55 via-cyan-400/20 to-transparent" />
              <Icon className="h-4 w-4 text-cyan-300" />
              <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-foreground">{value}</div>
              <div className="mt-1 text-sm font-medium text-foreground/70">{title}</div>
            </div>
          ))}
        </div>
        </div>
      </div>

      {message && (
        <p
          role="status"
          className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-3 text-sm"
        >
          {message}
        </p>
      )}

      {editing && canEdit && (
        <form
          className="relative isolate overflow-hidden rounded-[26px] border border-violet-400/25 bg-gradient-to-br from-background/95 via-background/95 to-violet-500/[0.05] p-5 shadow-[0_26px_80px_-55px_rgba(139,92,246,0.7)] sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <img
            src="/admin-premium/economy.svg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 top-0 h-[30rem] w-[52%] object-contain object-right-top opacity-[0.075] mix-blend-screen"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/35 via-background/45 to-background/70" />
          <div className="relative z-10 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">
              {form.id ? "Editar campaña" : "Crear campaña"}
            </h3>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cerrar
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="offer-name">Nombre comercial</Label>
              <Input
                id="offer-name"
                className="mt-1.5"
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
                maxLength={120}
                required
                placeholder="Bienvenida TukTuk · 30 días"
              />
            </div>
            <div>
              <Label htmlFor="offer-kind">Tipo de oferta</Label>
              <select
                id="offer-kind"
                className={selectStyle}
                value={form.kind}
                onChange={(e) => change("kind", e.target.value as MarketplaceOfferKind)}
              >
                {kinds.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="offer-description">Descripción</Label>
              <Textarea
                id="offer-description"
                className="mt-1.5"
                value={form.description}
                onChange={(e) => change("description", e.target.value)}
                maxLength={1200}
                placeholder="Objetivo, condiciones y público de la campaña."
              />
            </div>
            <div>
              <Label htmlFor="offer-start">Inicio de captación</Label>
              <Input
                id="offer-start"
                type="datetime-local"
                className="mt-1.5"
                value={form.beginsAt}
                onChange={(e) => change("beginsAt", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="offer-end">Fin de captación</Label>
              <Input
                id="offer-end"
                type="datetime-local"
                className="mt-1.5"
                value={form.closesAt}
                onChange={(e) => change("closesAt", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="offer-audience">Beneficiarios</Label>
              <select
                id="offer-audience"
                className={selectStyle}
                value={form.audience}
                onChange={(e) => change("audience", e.target.value as MarketplaceOfferAudience)}
              >
                {audiences.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.text}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="offer-activation">Modo de incorporación</Label>
              <select
                id="offer-activation"
                className={selectStyle}
                value={form.activation}
                onChange={(e) => change("activation", e.target.value as MarketplaceOfferActivation)}
              >
                <option value="automatic">Automático (cuando se autorice)</option>
                <option value="manual">Asignación manual</option>
                <option value="code">Código promocional</option>
              </select>
            </div>
            <div>
              <Label htmlFor="offer-trigger">Inicio del beneficio</Label>
              <select
                id="offer-trigger"
                className={selectStyle}
                value={form.activationTrigger}
                onChange={(e) =>
                  change("activationTrigger", e.target.value as MarketplaceOfferTrigger)
                }
              >
                <option value="onboarding">Desde la incorporación</option>
                <option value="first_job">Desde la primera carrera aceptada</option>
              </select>
            </div>
            <div>
              <Label htmlFor="offer-duration">Duración del beneficio (días)</Label>
              <Input
                id="offer-duration"
                type="number"
                min="1"
                max="365"
                className="mt-1.5"
                value={form.benefitDuration}
                onChange={(e) => change("benefitDuration", e.target.value)}
                placeholder="30"
              />
            </div>
            {form.kind === "commission_reduced" && (
              <div>
                <Label htmlFor="offer-value">Comisión promocional (%)</Label>
                <Input
                  id="offer-value"
                  type="number"
                  min="0.01"
                  max="99.99"
                  step="0.01"
                  className="mt-1.5"
                  value={form.benefitValue}
                  onChange={(e) => change("benefitValue", e.target.value)}
                />
              </div>
            )}
            {["wallet_credit", "referral_bonus", "reactivation"].includes(form.kind) && (
              <div>
                <Label htmlFor="offer-value">Valor promocional (CUP)</Label>
                <Input
                  id="offer-value"
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="mt-1.5"
                  value={form.benefitValue}
                  onChange={(e) => change("benefitValue", e.target.value)}
                />
              </div>
            )}
            {form.kind === "free_rides" && (
              <div>
                <Label htmlFor="offer-rides">Número de carreras gratuitas</Label>
                <Input
                  id="offer-rides"
                  type="number"
                  min="1"
                  className="mt-1.5"
                  value={form.benefitRides}
                  onChange={(e) => change("benefitRides", e.target.value)}
                />
              </div>
            )}
            {form.activation === "code" && (
              <div>
                <Label htmlFor="offer-code">Código promocional</Label>
                <Input
                  id="offer-code"
                  className="mt-1.5"
                  value={form.redemptionCode}
                  onChange={(e) => change("redemptionCode", e.target.value.toUpperCase())}
                  placeholder="TUKTUK30"
                  maxLength={32}
                />
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border/55 bg-background/35 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-violet-300" /> Segmentación y límites avanzados
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="offer-max-users">Máximo de beneficiarios</Label>
                <Input
                  id="offer-max-users"
                  type="number"
                  min="1"
                  value={form.maxParticipants}
                  onChange={(e) => change("maxParticipants", e.target.value)}
                  className="mt-1.5"
                  placeholder="Sin límite"
                />
              </div>
              <div>
                <Label htmlFor="offer-budget">Presupuesto máximo CUP</Label>
                <Input
                  id="offer-budget"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.maxBudgetCup}
                  onChange={(e) => change("maxBudgetCup", e.target.value)}
                  className="mt-1.5"
                  placeholder="Sin límite"
                />
              </div>
              <div>
                <Label htmlFor="offer-max-uses">Usos por conductor</Label>
                <Input
                  id="offer-max-uses"
                  type="number"
                  min="1"
                  value={form.maxUsesPerDriver}
                  onChange={(e) => change("maxUsesPerDriver", e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="offer-min-jobs">Mínimo carreras previas</Label>
                <Input
                  id="offer-min-jobs"
                  type="number"
                  min="1"
                  value={form.minJobs}
                  onChange={(e) => change("minJobs", e.target.value)}
                  className="mt-1.5"
                  placeholder="No requerido"
                />
              </div>
              <div>
                <Label htmlFor="offer-inactive-days">Días sin actividad</Label>
                <Input
                  id="offer-inactive-days"
                  type="number"
                  min="1"
                  value={form.inactiveDays}
                  onChange={(e) => change("inactiveDays", e.target.value)}
                  className="mt-1.5"
                  placeholder="No requerido"
                />
              </div>
              <div>
                <Label htmlFor="offer-priority">Prioridad (1 primero)</Label>
                <Input
                  id="offer-priority"
                  type="number"
                  min="1"
                  max="1000"
                  value={form.priority}
                  onChange={(e) => change("priority", e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="offer-stacking">Compatibilidad</Label>
                <select
                  id="offer-stacking"
                  className={selectStyle}
                  value={form.stacking}
                  onChange={(e) => change("stacking", e.target.value as MarketplaceOfferStacking)}
                >
                  <option value="best_only">Aplicar solo la mejor</option>
                  <option value="exclusive">Exclusiva; no combinar</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="offer-users">
                  IDs de conductores específicos (opcional; separados por comas)
                </Label>
                <Textarea
                  id="offer-users"
                  className="mt-1.5 min-h-10"
                  value={form.userIds}
                  onChange={(e) => change("userIds", e.target.value)}
                  placeholder="UUID, UUID..."
                />
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="offer-terms">Condiciones y notas internas</Label>
            <Textarea
              id="offer-terms"
              value={form.terms}
              onChange={(e) => change("terms", e.target.value)}
              className="mt-1.5"
              maxLength={3000}
              placeholder="Requisitos, control presupuestario, excepciones y autorización."
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-300" /> Guarda sin afectar las comisiones
              reales.
            </div>
            <Button disabled={save.isPending} type="submit" className="gap-2">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.id ? "Guardar cambios" : "Guardar borrador"}
            </Button>
          </div>
          </div>
        </form>
      )}

      {campaignQuery.isLoading ? (
        <div className="rounded-2xl border border-border/55 p-5 text-sm text-muted-foreground">
          Cargando campañas...
        </div>
      ) : campaignQuery.isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-400/35 bg-rose-500/[0.06] p-5 text-sm text-rose-200"
        >
          {errorMessage(campaignQuery.error)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="relative flex flex-col items-center overflow-hidden rounded-[24px] border border-dashed border-violet-400/20 bg-gradient-to-br from-background/85 to-violet-500/[0.04] px-6 py-12 text-center shadow-[0_20px_65px_-50px_rgba(139,92,246,0.65)]">
          <Gift className="h-10 w-10 text-violet-300" />
          <h3 className="mt-3 font-semibold">Todavía no hay ofertas preparadas</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Comienza creando una campaña de bienvenida, una comisión reducida o una oferta de
            reactivación.
          </p>
        </div>
      ) : (
        <div className={campaigns.length === 1 ? "grid gap-4" : "grid gap-4 xl:grid-cols-2"}>
          {campaigns.map((item) => {
            const offer = kinds.find((kind) => kind.value === item.kind);
            return (
              <article
                key={item.id}
                className="group relative isolate overflow-hidden rounded-[24px] border border-violet-400/[0.22] bg-gradient-to-br from-violet-500/[0.065] via-background/85 to-cyan-500/[0.025] p-5 shadow-[0_24px_72px_-49px_rgba(139,92,246,0.72)] backdrop-blur-lg transition-colors hover:border-violet-400/35 sm:p-6"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-violet-400/75 via-cyan-400/25 to-transparent" />
                <img
                  src="/admin-premium/economy.svg"
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 top-2 hidden h-52 w-[32%] object-contain object-right opacity-[0.07] mix-blend-screen md:block"
                />
                <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-violet-300">
                      {offer?.name ?? item.kind}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">{item.name}</h3>
                  </div>
                  <span className="rounded-full border border-amber-300/30 bg-amber-400/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                    {item.status === "archived" ? "Archivada" : "Borrador"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/70">
                  {item.description || offer?.helper}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.benefit_duration_days != null && (
                    <span className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.07] px-3 py-1.5 text-xs font-semibold text-cyan-100">
                      {item.benefit_duration_days} días de beneficio
                    </span>
                  )}
                  <span className="rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-3 py-1.5 text-xs font-medium text-violet-100">
                    {audiences.find((audience) => audience.value === item.audience)?.text ?? "Beneficiarios definidos"}
                  </span>
                </div>
                <div className={campaigns.length === 1 ? "mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] leading-relaxed text-foreground/70 lg:grid-cols-4" : "mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] leading-relaxed text-foreground/70"}>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-cyan-300" />{" "}
                    {displayDate(item.begins_at)}
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-cyan-300" />{" "}
                    {displayDate(item.closes_at)}
                  </div>
                  <div className="flex items-center gap-2">
                    <BadgePercent className="h-3.5 w-3.5 text-violet-300" />{" "}
                    {item.kind === "commission_free"
                      ? "0 % de comisión"
                      : item.kind === "commission_reduced"
                        ? `${item.benefit_value} % de comisión`
                        : item.kind === "free_rides"
                          ? `${item.benefit_ride_limit} carreras`
                          : `${item.benefit_value} CUP`}
                  </div>
                  <div className="flex items-center gap-2">
                    <CircleDollarSign className="h-3.5 w-3.5 text-amber-300" />{" "}
                    {item.max_budget_cup
                      ? `Tope ${item.max_budget_cup} CUP`
                      : "Sin presupuesto definido"}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/50 pt-4">
                  <span className="text-xs text-muted-foreground">
                    Versión {item.revision} · No activada
                  </span>
                  <div className="flex gap-2">
                    {canEdit && item.status !== "archived" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => open(item)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={archive.isPending}
                          onClick={() => {
                            if (window.confirm(`¿Archivar «${item.name}»?`))
                              archive.mutate(item.id);
                          }}
                          title="Archivar campaña"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
