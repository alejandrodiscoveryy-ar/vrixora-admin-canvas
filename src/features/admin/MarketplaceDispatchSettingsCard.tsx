import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Radar, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabaseServices } from "@/lib/services";

type TieBreaker =
  | "rating_then_distance"
  | "distance_then_rating";

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/55 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

const formatDate = (
  value: string | null | undefined,
) => {
  if (!value) return "Sin cambios guardados";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export default function MarketplaceDispatchSettingsCard({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);

  const [
    radiusSearchEnabled,
    setRadiusSearchEnabled,
  ] = useState(true);

  const [radius1Enabled, setRadius1Enabled] =
    useState(true);

  const [radius1Km, setRadius1Km] =
    useState("1");

  const [radius2Enabled, setRadius2Enabled] =
    useState(true);

  const [radius2Km, setRadius2Km] =
    useState("2");

  const [radius3Enabled, setRadius3Enabled] =
    useState(true);

  const [radius3Km, setRadius3Km] =
    useState("3");

  const [
    expansionEnabled,
    setExpansionEnabled,
  ] = useState(true);

  const [
    expansionSeconds,
    setExpansionSeconds,
  ] = useState("30");

  const [
    ratingPriorityEnabled,
    setRatingPriorityEnabled,
  ] = useState(true);

  const [
    preferredMinRatingEnabled,
    setPreferredMinRatingEnabled,
  ] = useState(true);

  const [
    preferredMinRating,
    setPreferredMinRating,
  ] = useState("4");

  const [
    minimumRatingCountEnabled,
    setMinimumRatingCountEnabled,
  ] = useState(true);

  const [
    minimumRatingCount,
    setMinimumRatingCount,
  ] = useState("5");

  const [
    allowBelowPreferred,
    setAllowBelowPreferred,
  ] = useState(true);

  const [
    allowOutsideMaxRadius,
    setAllowOutsideMaxRadius,
  ] = useState(false);

  const [
    applyToTestJobs,
    setApplyToTestJobs,
  ] = useState(false);

  const [tieBreaker, setTieBreaker] =
    useState<TieBreaker>(
      "rating_then_distance",
    );

  const settings = useQuery({
    queryKey: [
      "marketplace-dispatch-settings",
      projectId,
    ],

    queryFn: () =>
      supabaseServices.marketplace.dispatchSettings(
        projectId,
      ),
  });

  useEffect(() => {
    if (!settings.data) return;

    setEnabled(settings.data.enabled);

    setRadiusSearchEnabled(
      settings.data.radiusSearchEnabled,
    );

    setRadius1Enabled(
      settings.data.radius1Enabled,
    );

    setRadius1Km(
      String(settings.data.radius1Km),
    );

    setRadius2Enabled(
      settings.data.radius2Enabled,
    );

    setRadius2Km(
      String(settings.data.radius2Km),
    );

    setRadius3Enabled(
      settings.data.radius3Enabled,
    );

    setRadius3Km(
      String(settings.data.radius3Km),
    );

    setExpansionEnabled(
      settings.data.expansionEnabled,
    );

    setExpansionSeconds(
      String(settings.data.expansionSeconds),
    );

    setRatingPriorityEnabled(
      settings.data.ratingPriorityEnabled,
    );

    setPreferredMinRatingEnabled(
      settings.data.preferredMinRatingEnabled,
    );

    setPreferredMinRating(
      String(settings.data.preferredMinRating),
    );

    setMinimumRatingCountEnabled(
      settings.data.minimumRatingCountEnabled,
    );

    setMinimumRatingCount(
      String(settings.data.minimumRatingCount),
    );

    setAllowBelowPreferred(
      settings.data.allowBelowPreferred,
    );

    setAllowOutsideMaxRadius(
      settings.data.allowOutsideMaxRadius,
    );

    setApplyToTestJobs(
      settings.data.applyToTestJobs,
    );

    setTieBreaker(
      settings.data.tieBreaker,
    );
  }, [settings.data]);

  const activeRadii = useMemo(
    () =>
      [
        {
          enabled: radius1Enabled,
          value: Number(radius1Km),
        },
        {
          enabled: radius2Enabled,
          value: Number(radius2Km),
        },
        {
          enabled: radius3Enabled,
          value: Number(radius3Km),
        },
      ].filter((item) => item.enabled),
    [
      radius1Enabled,
      radius1Km,
      radius2Enabled,
      radius2Km,
      radius3Enabled,
      radius3Km,
    ],
  );

  const validationError = useMemo(() => {
    const allRadii = [
      Number(radius1Km),
      Number(radius2Km),
      Number(radius3Km),
    ];

    if (
      allRadii.some(
        (value) =>
          !Number.isFinite(value) ||
          value <= 0 ||
          value > 100,
      )
    ) {
      return "Cada radio debe ser mayor que 0 km y no superar 100 km.";
    }

    if (
      radiusSearchEnabled &&
      activeRadii.length === 0
    ) {
      return "Activa al menos un radio de búsqueda.";
    }

    for (
      let index = 1;
      index < activeRadii.length;
      index += 1
    ) {
      const previous =
        activeRadii[index - 1];

      const current =
        activeRadii[index];

      if (
        previous &&
        current &&
        current.value <= previous.value
      ) {
        return "Los radios activos deben crecer de menor a mayor.";
      }
    }

    const seconds =
      Number(expansionSeconds);

    if (
      !Number.isInteger(seconds) ||
      seconds < 5 ||
      seconds > 600
    ) {
      return "El tiempo de ampliación debe estar entre 5 y 600 segundos.";
    }

    const rating =
      Number(preferredMinRating);

    if (
      !Number.isFinite(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return "La valoración preferente debe estar entre 1 y 5 estrellas.";
    }

    const ratingCount =
      Number(minimumRatingCount);

    if (
      !Number.isInteger(ratingCount) ||
      ratingCount < 0 ||
      ratingCount > 1000
    ) {
      return "El mínimo de valoraciones debe estar entre 0 y 1000.";
    }

    return null;
  }, [
    activeRadii,
    expansionSeconds,
    minimumRatingCount,
    preferredMinRating,
    radius1Km,
    radius2Km,
    radius3Km,
    radiusSearchEnabled,
  ]);

  const save = useMutation({
    mutationFn: () =>
      supabaseServices.marketplace.updateDispatchSettings(
        projectId,
        {
          enabled,

          radiusSearchEnabled,

          radius1Enabled,
          radius1Km: Number(radius1Km),

          radius2Enabled,
          radius2Km: Number(radius2Km),

          radius3Enabled,
          radius3Km: Number(radius3Km),

          expansionEnabled,

          expansionSeconds:
            Number(expansionSeconds),

          ratingPriorityEnabled,

          preferredMinRatingEnabled,

          preferredMinRating:
            Number(preferredMinRating),

          minimumRatingCountEnabled,

          minimumRatingCount:
            Number(minimumRatingCount),

          allowBelowPreferred,

          allowOutsideMaxRadius,

          applyToTestJobs,

          tieBreaker,
        },
      ),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          "marketplace-dispatch-settings",
          projectId,
        ],
      });
    },
  });

  const summary = useMemo(() => {
    if (!enabled) {
      return "Bloque desactivado. La configuración queda guardada, pero no debe aplicarse mientras permanezca apagado.";
    }

    const parts: string[] = [];

    if (radiusSearchEnabled) {
      const radii = activeRadii
        .map(
          (item) =>
            `${item.value.toLocaleString(
              "es",
            )} km`,
        )
        .join(" - ");

      parts.push(
        `radios ${radii}`,
      );

      if (expansionEnabled) {
        parts.push(
          `ampliación cada ${Number(
            expansionSeconds,
          ).toLocaleString("es")} s`,
        );
      }
    } else {
      parts.push("sin filtro por radio");
    }

    if (ratingPriorityEnabled) {
      if (preferredMinRatingEnabled) {
        parts.push(
          `preferencia desde ${Number(
            preferredMinRating,
          ).toLocaleString("es")} estrellas`,
        );
      } else {
        parts.push(
          "prioridad por valoración",
        );
      }
    } else {
      parts.push(
        "sin prioridad por valoración",
      );
    }

    return `Política activa: ${parts.join(
      " · ",
    )}.`;
  }, [
    activeRadii,
    enabled,
    expansionEnabled,
    expansionSeconds,
    preferredMinRating,
    preferredMinRatingEnabled,
    radiusSearchEnabled,
    ratingPriorityEnabled,
  ]);

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-cyan-400/35 bg-gradient-to-br from-cyan-500/[0.10] via-background/95 to-background shadow-[0_32px_95px_-48px_rgba(34,211,238,0.95)] xl:col-span-2">
      <img
        src="/admin-premium/dispatch-radar.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-screen"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/5 via-background/30 to-background/75" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-violet-500/[0.05] blur-3xl" />

      <div className="relative flex flex-col gap-4 border-b border-cyan-500/15 bg-cyan-500/[0.02] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/35 bg-cyan-400/[0.11] text-cyan-300 shadow-[0_0_28px_-10px_rgba(34,211,238,0.95)]">
            <Radar className="h-5 w-5" />
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-cyan-300">
              Política de despacho
            </p>

            <h3 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
              Búsqueda de conductores
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-full border border-border/60 bg-background/65 px-3 py-2 shadow-sm">
          <span
            className={
              enabled
                ? "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300"
                : "rounded-full border border-border/70 bg-muted/35 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
            }
          >
            {enabled ? "ACTIVO" : "DESACTIVADO"}
          </span>

          <Switch
            checked={enabled}
            disabled={!canManage}
            onCheckedChange={setEnabled}
          />
        </div>
      </div>

      <div className="relative space-y-5 p-4 sm:p-5">
        {settings.isLoading ? (
          <div className="flex min-h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          </div>
        ) : settings.isError ? (
          <p className="text-sm text-rose-300">
            No se pudo cargar la configuración de búsqueda.
          </p>
        ) : (
          <>
            <div className="grid gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.045] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {summary}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Última actualización:{" "}
                  {formatDate(settings.data?.updatedAt)}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
                <div className="rounded-xl border border-cyan-400/20 bg-background/60 px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                    Radios
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-foreground">
                    {activeRadii.length
                      ? activeRadii
                          .map((item) => `${item.value.toLocaleString("es")} km`)
                          .join(" → ")
                      : "Sin radios"}
                  </p>
                </div>

                <div className="rounded-xl border border-cyan-400/20 bg-background/60 px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                    Ampliación
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-foreground">
                    {expansionEnabled
                      ? `cada ${Number(expansionSeconds).toLocaleString("es")} s`
                      : "Desactivada"}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-400/20 bg-background/60 px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-amber-300">
                    Preferencia
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-foreground">
                    {ratingPriorityEnabled && preferredMinRatingEnabled
                      ? `desde ${Number(preferredMinRating).toLocaleString("es")} estrellas`
                      : "Sin filtro"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="relative overflow-hidden rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-5">
                <img
                  src="/admin-premium/dispatch-radar.svg"
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-20 top-0 h-64 w-80 object-cover opacity-24 mix-blend-screen"
                />
                <div className="pointer-events-none absolute -right-16 top-10 h-40 w-40 rounded-full border border-cyan-400/[0.10]" />
                <div className="pointer-events-none absolute -right-8 top-18 h-24 w-24 rounded-full border border-cyan-400/[0.08]" />

                <div className="relative flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-300">
                    <Radar className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                      Cobertura
                    </p>
                    <h4 className="mt-0.5 text-base font-semibold text-foreground">
                      Radios y ampliación
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Define cómo y hasta dónde se buscan conductores.
                    </p>
                  </div>
                </div>

                <div className="relative mt-4 space-y-3">
                  <ToggleRow
                    title="Buscar por radio"
                    description="Limita los candidatos según su distancia al origen del cliente."
                    checked={radiusSearchEnabled}
                    disabled={!canManage}
                    onCheckedChange={setRadiusSearchEnabled}
                  />

                  <div
                    className={`grid gap-2 sm:grid-cols-3 ${
                      radiusSearchEnabled ? "" : "opacity-50"
                    }`}
                  >
                    {[
                      {
                        number: 1,
                        enabled: radius1Enabled,
                        setEnabled: setRadius1Enabled,
                        value: radius1Km,
                        setValue: setRadius1Km,
                      },
                      {
                        number: 2,
                        enabled: radius2Enabled,
                        setEnabled: setRadius2Enabled,
                        value: radius2Km,
                        setValue: setRadius2Km,
                      },
                      {
                        number: 3,
                        enabled: radius3Enabled,
                        setEnabled: setRadius3Enabled,
                        value: radius3Km,
                        setValue: setRadius3Km,
                      },
                    ].map((radius) => (
                      <div
                        key={radius.number}
                        className="rounded-xl border border-cyan-500/15 bg-background/55 p-3 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor={`dispatch-radius-${radius.number}`}>
                            Radio {radius.number}
                          </Label>

                          <Switch
                            checked={radius.enabled}
                            disabled={!canManage || !radiusSearchEnabled}
                            onCheckedChange={radius.setEnabled}
                          />
                        </div>

                        <div className="relative mt-2">
                          <Input
                            id={`dispatch-radius-${radius.number}`}
                            type="number"
                            min="0.1"
                            max="100"
                            step="0.1"
                            className="pr-10"
                            value={radius.value}
                            disabled={
                              !canManage ||
                              !radiusSearchEnabled ||
                              !radius.enabled
                            }
                            onChange={(event) =>
                              radius.setValue(event.target.value)
                            }
                          />

                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
                            km
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <ToggleRow
                    title="Ampliación automática"
                    description="Si nadie toma la carrera, avanza al siguiente radio activo."
                    checked={expansionEnabled}
                    disabled={!canManage || !radiusSearchEnabled}
                    onCheckedChange={setExpansionEnabled}
                  />

                  <div className="rounded-xl border border-cyan-500/15 bg-background/55 p-3">
                    <Label htmlFor="dispatch-expansion-seconds">
                      Tiempo para ampliar
                    </Label>

                    <div className="relative mt-2">
                      <Input
                        id="dispatch-expansion-seconds"
                        type="number"
                        min="5"
                        max="600"
                        step="1"
                        className="pr-20"
                        value={expansionSeconds}
                        disabled={
                          !canManage ||
                          !radiusSearchEnabled ||
                          !expansionEnabled
                        }
                        onChange={(event) =>
                          setExpansionSeconds(event.target.value)
                        }
                      />

                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">
                        segundos
                      </span>
                    </div>
                  </div>

                  <ToggleRow
                    title="Buscar fuera del radio máximo"
                    description="Permite utilizar conductores más alejados después de agotar todos los radios definidos."
                    checked={allowOutsideMaxRadius}
                    disabled={!canManage || !radiusSearchEnabled}
                    onCheckedChange={setAllowOutsideMaxRadius}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl border border-amber-400/25 bg-amber-500/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-5">
                  <img
                    src="/admin-premium/reputation.svg"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-10 top-0 h-56 w-72 object-cover opacity-32 mix-blend-screen"
                  />
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/[0.08] text-amber-300">
                      <Star className="h-4 w-4" />
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">
                        Reputación
                      </p>
                      <h4 className="mt-0.5 text-base font-semibold text-foreground">
                        Valoración y prioridad
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Usa las valoraciones reales de clientes para priorizar conductores.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <ToggleRow
                      title="Priorizar por valoración"
                      description="Utiliza las valoraciones reales cliente a conductor."
                      checked={ratingPriorityEnabled}
                      disabled={!canManage}
                      onCheckedChange={setRatingPriorityEnabled}
                    />

                    <div className="rounded-xl border border-amber-500/15 bg-background/55 p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            Valoración mínima preferente
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Define qué conductores forman el grupo preferente.
                          </p>
                        </div>

                        <Switch
                          checked={preferredMinRatingEnabled}
                          disabled={!canManage || !ratingPriorityEnabled}
                          onCheckedChange={setPreferredMinRatingEnabled}
                        />
                      </div>

                      <div className="mt-3">
                        <Label htmlFor="dispatch-preferred-rating">
                          Valoración preferente
                        </Label>
                        <Input
                          id="dispatch-preferred-rating"
                          type="number"
                          min="1"
                          max="5"
                          step="0.1"
                          className="mt-1.5"
                          value={preferredMinRating}
                          disabled={
                            !canManage ||
                            !ratingPriorityEnabled ||
                            !preferredMinRatingEnabled
                          }
                          onChange={(event) =>
                            setPreferredMinRating(event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-500/15 bg-background/55 p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            Mínimo de valoraciones
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Evita tratar como reputación consolidada a un conductor nuevo.
                          </p>
                        </div>

                        <Switch
                          checked={minimumRatingCountEnabled}
                          disabled={!canManage || !ratingPriorityEnabled}
                          onCheckedChange={setMinimumRatingCountEnabled}
                        />
                      </div>

                      <div className="mt-3">
                        <Label htmlFor="dispatch-rating-count">
                          Cantidad mínima
                        </Label>
                        <Input
                          id="dispatch-rating-count"
                          type="number"
                          min="0"
                          max="1000"
                          step="1"
                          className="mt-1.5"
                          value={minimumRatingCount}
                          disabled={
                            !canManage ||
                            !ratingPriorityEnabled ||
                            !minimumRatingCountEnabled
                          }
                          onChange={(event) =>
                            setMinimumRatingCount(event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <ToggleRow
                      title="Permitir valoraciones inferiores"
                      description="Usa esos conductores como respaldo si los preferentes no resuelven el servicio."
                      checked={allowBelowPreferred}
                      disabled={
                        !canManage ||
                        !ratingPriorityEnabled ||
                        !preferredMinRatingEnabled
                      }
                      onCheckedChange={setAllowBelowPreferred}
                    />
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/[0.11] via-background/80 to-background/70 p-3.5 shadow-[0_20px_55px_-38px_rgba(139,92,246,1)]">
                  <img
                    src="/admin-premium/test-lab.svg"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-0 h-full w-48 object-cover opacity-24 mix-blend-screen"
                  />
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-violet-300">
                        Pruebas
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        Aplicar a carreras de prueba
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        Apagado: las pruebas siguen usando directamente el conductor seleccionado.
                      </p>
                    </div>

                    <Switch
                      checked={applyToTestJobs}
                      disabled={!canManage}
                      onCheckedChange={setApplyToTestJobs}
                    />
                  </div>
                </div>
              </div>
            </div>

            {validationError ? (
              <p className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] px-3 py-2.5 text-sm text-rose-300">
                {validationError}
              </p>
            ) : null}

            {save.isError ? (
              <p className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] px-3 py-2.5 text-sm text-rose-300">
                No se pudo guardar la configuración.
              </p>
            ) : null}

            {canManage ? (
              <Button
                className="h-11 w-full rounded-xl shadow-[0_0_30px_-14px_rgba(34,211,238,0.95)]"
                disabled={save.isPending || Boolean(validationError)}
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}

                Guardar búsqueda de conductores
              </Button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}