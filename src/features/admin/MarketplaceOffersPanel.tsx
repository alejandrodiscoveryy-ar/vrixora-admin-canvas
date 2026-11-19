import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Gift,
  Loader2,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { CommercialPageHeader } from "@/features/admin/CommercialPageHeader";
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
  const [showHistory, setShowHistory] = useState(false);
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
      expired: campaigns.filter((x) => x.status !== "archived" && new Date(x.closes_at).getTime() < openedAt).length,
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
    <section className="space-y-3">
      <CommercialPageHeader
        title="Beneficios de conductores"
        description="Campañas y ofertas para incorporar, fidelizar o reactivar conductores. No cambian las comisiones hasta su activación."
        icon={Gift}
        actions={canEdit ? (
          <Button onClick={() => open()} size="sm" className="max-sm:min-h-11">
            <Plus className="mr-1 size-4" /> Nueva oferta
          </Button>
        ) : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
        <p>{count.total} ofertas · {count.drafts} borradores · {count.expired} vencidas · {count.archived} archivadas</p>
        {count.archived + count.expired > 0 && (
          <Button type="button" size="sm" variant="ghost" aria-pressed={showHistory}
            onClick={() => setShowHistory(value => !value)}>
            {showHistory ? "Ocultar historial" : "Ver vencidas y archivadas"}
          </Button>
        )}
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
          className={cp.section}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-4 [&_label]:text-sm [&_input]:min-h-11">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.20em] text-cyan-300">Configuración de la oferta</p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                {form.id ? "Editar campaña" : "Crear campaña"}
              </h3>
              <p className="mt-1 text-sm text-text-secondary">Define el beneficio en bloques claros. Los cambios seguirán siendo borradores.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cerrar
            </Button>
          </div>
          <div className="grid gap-4 rounded-[var(--radius-card)] border border-border-default bg-surface-2 p-3 md:grid-cols-2 sm:p-4">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3 md:col-span-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/15 font-mono text-sm font-bold text-violet-200">01</span>
              <div><p className="text-base font-bold text-text-primary">Identidad y vigencia</p><p className="text-xs text-text-secondary">Nombre, tipo de promoción y fechas de captación.</p></div>
            </div>
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
            <div className="flex items-center gap-3 border-b border-white/10 pb-3 pt-2 md:col-span-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/15 font-mono text-sm font-bold text-cyan-200">02</span>
              <div><p className="text-base font-bold text-text-primary">Beneficio y destinatarios</p><p className="text-xs text-text-secondary">A quién se dirige, cuándo comienza y cuánto dura.</p></div>
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
          <div className="rounded-[var(--radius-card)] border border-border-default bg-surface-2 p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/15 font-mono text-sm font-bold text-cyan-200">03</span><Users className="h-5 w-5 text-cyan-200" /> <span className="text-base font-bold text-text-primary">Segmentación y límites avanzados</span>
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
          <div className="rounded-[var(--radius-card)] border border-border-default bg-surface-2 p-3 sm:p-4">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/15 font-mono text-sm font-bold text-violet-200">04</span>
              <span className="text-base font-bold text-text-primary">Condiciones y notas internas</span>
            </div>
            <Label htmlFor="offer-terms">Condiciones de la campaña</Label>
            <Textarea
              id="offer-terms"
              value={form.terms}
              onChange={(e) => change("terms", e.target.value)}
              className="mt-1.5"
              maxLength={3000}
              placeholder="Requisitos, control presupuestario, excepciones y autorización."
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-300" /> Guarda sin afectar las comisiones
              reales.
            </div>
            <Button disabled={save.isPending} type="submit" className="min-h-11 gap-2 rounded-xl bg-cyan-400 px-6 font-bold text-[#071219] hover:bg-cyan-300">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.id ? "Guardar cambios" : "Guardar borrador"}
            </Button>
          </div>
          </div>
        </form>
      )}

      {campaignQuery.isLoading ? (
        <p className="py-4 text-sm text-text-secondary">Cargando ofertas…</p>
      ) : campaignQuery.isError ? (
        <p role="alert" className="rounded-xl border border-rose-400/30 p-3 text-sm text-text-secondary">
          {errorMessage(campaignQuery.error)}
        </p>
      ) : campaigns.filter(item => (item.status !== "archived" && new Date(item.closes_at).getTime() >= openedAt) || showHistory).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle px-4 py-8 text-center">
          <p className="text-sm font-medium text-text-primary">No hay ofertas pendientes en el catálogo.</p>
          <p className="mt-1 text-xs text-text-secondary">Puedes crear una nueva oferta o consultar las archivadas.</p>
        </div>
      ) : (
        <div className="space-y-2" aria-label="Catálogo de beneficios">
          {campaigns.filter(item => (item.status !== "archived" && new Date(item.closes_at).getTime() >= openedAt) || showHistory).map(item => {
            const offer = kinds.find(kind => kind.value === item.kind);
            const expired = item.status !== "archived" && new Date(item.closes_at).getTime() < Date.now();
            return (
              <article key={item.id} className="min-w-0 rounded-[var(--radius-card)] border border-border-default bg-surface-1 p-3 shadow-[var(--shadow-xs)] sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-secondary">{offer?.name ?? item.kind}</p>
                    <h3 className="mt-1 break-words text-base font-semibold text-text-primary">{item.name}</h3>
                    <p className="mt-1 text-xs text-text-secondary">{item.description || offer?.helper}</p>
                  </div>
                  <span className="rounded-full border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs font-medium text-text-secondary">
                    {item.status === "archived" ? "Archivada" : expired ? "Borrador vencido" : "Borrador"}
                  </span>
                </div>
                <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-t border-border-subtle pt-3 text-xs sm:grid-cols-4">
                  <div><dt className="text-text-secondary">Destinatarios</dt><dd className="mt-1 font-medium text-text-primary">{audiences.find(a => a.value === item.audience)?.text ?? "Definidos"}</dd></div>
                  <div><dt className="text-text-secondary">Beneficio</dt><dd className="mt-1 font-medium text-text-primary">
                    {item.kind === "commission_free" ? "0 % comisión" : item.kind === "commission_reduced" ? `${item.benefit_value} % comisión`
                      : item.kind === "free_rides" ? `${item.benefit_ride_limit} carreras` : `${item.benefit_value} CUP`}
                    {item.benefit_duration_days != null ? ` · ${item.benefit_duration_days} días` : ""}
                  </dd></div>
                  <div><dt className="text-text-secondary">Inicio</dt><dd className="mt-1 font-medium text-text-primary">{displayDate(item.begins_at)}</dd></div>
                  <div><dt className="text-text-secondary">Fin</dt><dd className="mt-1 font-medium text-text-primary">{displayDate(item.closes_at)}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
                  <p className="text-xs text-text-secondary">
                    Versión {item.revision} · Sin activar{item.max_budget_cup ? ` · Tope ${item.max_budget_cup} CUP` : " · Sin presupuesto definido"}
                  </p>
                  {canEdit && item.status !== "archived" && (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" className="max-sm:min-h-11" onClick={() => open(item)}>Editar</Button>
                      <Button type="button" size="sm" variant="ghost" className="max-sm:min-h-11"
                        disabled={archive.isPending} aria-label={`Archivar ${item.name}`}
                        onClick={() => { if (window.confirm(`¿Archivar «${item.name}»?`)) archive.mutate(item.id); }}>
                        <Archive className="size-4" /> Archivar
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
