/** Pure, source-aware rules for the Agencia TukTuk vitality board.
 * Colors NEVER infer missing data as zero. Every signal carries its basis.
 */
export type VitalityTone = "green" | "yellow" | "orange" | "red" | "gray";
export type VitalitySignal = {
  id: string;
  label: string;
  tone: VitalityTone;
  value: number | null;
  display: string;
  explanation: string;
  basis: string;
  priority: number;
};

export type AgencyVitality = {
  from: string;
  to: string;
  computed_at: string;
  control: {
    registered: number;
    previous_registered: number;
    only_control: number;
    started: number;
    activated: number;
    first_ride: number;
  };
  clients: null | {
    total: number;
    new: number;
    previous_new: number;
    served: number;
    recurrent: number;
  };
  rides: null | {
    requested: number;
    completed: number;
    settled: number;
    cancelled: number;
    unassigned: number;
    previous_completed: number;
  };
  finance: null | { cup: number; usd: number; eur: number; other: number };
  operation: null | {
    profiles_total: number;
    profiles_active: number;
    incidents_open: number;
    topups_pending: number | null;
  };
};

export const VITALITY_RULES = {
  minPrevious: 5,
  minRequestsForCancellation: 5,
  declineWarning: 10,
  declineOrange: 25,
  declineRed: 40,
  cancellationWarning: 10,
  cancellationOrange: 20,
  cancellationRed: 35,
  incidentsWarning: 1,
  incidentsOrange: 2,
  incidentsRed: 4,
  topupsWarning: 1,
  topupsOrange: 4,
  topupsRed: 11,
} as const;

function finiteNumber(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  if (x == null || !Number.isFinite(n) || n < 0) throw Error("INVALID_VITALITY_DATA");
  return n;
}
function numberGroup<T extends object>(obj: unknown, fields: readonly (keyof T)[]): T {
  if (!obj || typeof obj !== "object") throw Error("INVALID_VITALITY_DATA");
  const row = obj as Record<string, unknown>;
  return Object.fromEntries(fields.map(key => [key, finiteNumber(row[String(key)])])) as T;
}
export function parseAgencyVitality(data: unknown): AgencyVitality {
  if (!data || typeof data !== "object") throw Error("INVALID_VITALITY_DATA");
  const r = data as Record<string, unknown>;
  if (typeof r.from !== "string" || typeof r.to !== "string" || typeof r.computed_at !== "string") {
    throw Error("INVALID_VITALITY_DATA");
  }
  const controlKeys = ["registered", "previous_registered", "only_control", "started", "activated", "first_ride"] as const;
  const clientsKeys = ["total", "new", "previous_new", "served", "recurrent"] as const;
  const ridesKeys = ["requested", "completed", "settled", "cancelled", "unassigned", "previous_completed"] as const;
  const financeKeys = ["cup", "usd", "eur", "other"] as const;
  const operationKeys = ["profiles_total", "profiles_active", "incidents_open"] as const;
  const operation = r.operation == null ? null :
    { ...numberGroup<NonNullable<AgencyVitality["operation"]>>(r.operation, operationKeys),
      topups_pending: (r.operation as Record<string, unknown>).topups_pending == null
        ? null : finiteNumber((r.operation as Record<string, unknown>).topups_pending) };
  const result: AgencyVitality = {
    from: r.from,
    to: r.to,
    computed_at: r.computed_at,
    control: numberGroup<AgencyVitality["control"]>(r.control, controlKeys),
    clients: r.clients == null ? null : numberGroup<NonNullable<AgencyVitality["clients"]>>(r.clients, clientsKeys),
    rides: r.rides == null ? null : numberGroup<NonNullable<AgencyVitality["rides"]>>(r.rides, ridesKeys),
    finance: r.finance == null ? null : numberGroup<NonNullable<AgencyVitality["finance"]>>(r.finance, financeKeys),
    operation,
  };
  return result;
}

export function toneFromDecline(current: number | null, previous: number | null): VitalityTone {
  if (current == null || previous == null || previous < VITALITY_RULES.minPrevious) return "gray";
  const decline = (previous - current) * 100 / previous;
  if (decline >= VITALITY_RULES.declineRed) return "red";
  if (decline >= VITALITY_RULES.declineOrange) return "orange";
  if (decline >= VITALITY_RULES.declineWarning) return "yellow";
  return "green";
}
export function toneFromCancellation(requested: number | null, cancelled: number | null): VitalityTone {
  if (requested == null || cancelled == null || requested < VITALITY_RULES.minRequestsForCancellation) return "gray";
  const rate = cancelled * 100 / requested;
  if (rate >= VITALITY_RULES.cancellationRed) return "red";
  if (rate >= VITALITY_RULES.cancellationOrange) return "orange";
  if (rate >= VITALITY_RULES.cancellationWarning) return "yellow";
  return "green";
}
export function toneFromPending(value: number | null, kind: "incidents" | "topups"): VitalityTone {
  if (value == null) return "gray";
  const [yellow, orange, red] = kind === "incidents"
    ? [VITALITY_RULES.incidentsWarning, VITALITY_RULES.incidentsOrange, VITALITY_RULES.incidentsRed]
    : [VITALITY_RULES.topupsWarning, VITALITY_RULES.topupsOrange, VITALITY_RULES.topupsRed];
  if (value >= red) return "red";
  if (value >= orange) return "orange";
  if (value >= yellow) return "yellow";
  return "green";
}
export const vitalityToneName: Record<VitalityTone, string> = {
  green: "Saludable", yellow: "Atención", orange: "Deterioro", red: "Crítico", gray: "Sin base suficiente",
};
const priority: Record<VitalityTone, number> = {
  red: 4, orange: 3, yellow: 2, green: 1, gray: 0,
};
function varianceLabel(current: number, previous: number): string {
  if (previous < VITALITY_RULES.minPrevious) return "Sin base anterior suficiente (mínimo 5).";
  const pct = ((current - previous) * 100 / previous);
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)} % frente al período anterior.`;
}


/** Cohorte observada, no el total de usuarios de Control ni la flota en línea. */
export function controlConversionFunnel(control: AgencyVitality["control"]) {
  const registered = control.registered;
  const stages = [
    { id: "registered", label: "Registro en Control", value: registered },
    { id: "started", label: "Inició alta de conductor", value: control.started },
    { id: "activated", label: "Conductor habilitado", value: control.activated },
    { id: "first_ride", label: "Primera carrera liquidada", value: control.first_ride },
  ] as const;
  return {
    consistent: control.started <= registered
      && control.activated <= control.started
      && control.first_ride <= control.activated
      && control.only_control <= registered,
    stages: stages.map(stage => ({
      ...stage,
      share: registered > 0 ? stage.value * 100 / registered : null,
    })),
  };
}

export function agencyVitalitySignals(data: AgencyVitality): VitalitySignal[] {
  const clients = data.clients;
  const rides = data.rides;
  const op = data.operation;
  const make = (id: string, label: string, tone: VitalityTone, value: number | null, explanation: string, basis: string): VitalitySignal => ({
    id, label, tone, value, display: value == null ? "—" : String(value), explanation, basis, priority: priority[tone],
  });
  const cancelRate = rides && rides.requested > 0 ? rides.cancelled * 100 / rides.requested : null;
  return [
    make("clients", "Clientes nuevos", clients ? toneFromDecline(clients.new, clients.previous_new) : "gray", clients?.new ?? null,
      clients ? varianceLabel(clients.new, clients.previous_new) : "Sin permiso para consultar clientes.",
      "Clientes registrados durante el período; comparados con período anterior equivalente"),
    make("rides", "Carreras completadas", rides ? toneFromDecline(rides.completed, rides.previous_completed) : "gray", rides?.completed ?? null,
      rides ? varianceLabel(rides.completed, rides.previous_completed) : "Sin permiso para consultar carreras.",
      "Carreras reales creadas en el período; estado actual completado o liquidado"),
    make("control", "Conductores incorporados", "gray", data.control.activated,
      data.control.registered > 0
        ? `${data.control.activated} de ${data.control.registered} registros de Control observados incorporados al cierre del período. Sin objetivo aprobado para clasificar.`
        : "Sin registros instrumentados de Control en el período; no equivale a que no exista actividad.",
      "Cohorte de registros user_registered y driver_profiles"),
    make("cancelled", "Cancelaciones", toneFromCancellation(rides?.requested ?? null, rides?.cancelled ?? null), cancelRate,
      cancelRate == null ? "Sin solicitudes comprobadas o sin permisos." :
        `${rides!.cancelled} canceladas de ${rides!.requested} solicitadas (${cancelRate.toFixed(1)} %). ${rides!.requested < VITALITY_RULES.minRequestsForCancellation ? "Muestra insuficiente: mínimo 5." : "Umbrales: 10 % atención; 20 % deterioro; 35 % crítico."}`,
      "Proporción de carreras creadas en el período, con estado actual"),
    make("incidents", "Incidencias abiertas", toneFromPending(op?.incidents_open ?? null, "incidents"), op?.incidents_open ?? null,
      op ? "Situación actual; 1 atención, 2–3 deterioro, 4 o más crítico." : "Sin permiso para consultar incidencias.",
      "Estado operativo actual, no filtrado por fecha"),
    make("topups", "Recargas pendientes", toneFromPending(op?.topups_pending ?? null, "topups"), op?.topups_pending ?? null,
      op?.topups_pending == null ? "Dato no disponible o sin permiso de pagos." : "Situación actual; 1–3 atención, 4–10 deterioro, 11 o más crítico.",
      "Solicitudes de recarga pendientes ahora, no filtradas por fecha"),
  ];
}
