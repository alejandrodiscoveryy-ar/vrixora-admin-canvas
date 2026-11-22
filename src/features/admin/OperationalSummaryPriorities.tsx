import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, Clock3, MapPinOff, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";
import { premiumSurface } from "@/components/admin/density";

type Priority = {
  id: string;
  title: string;
  detail: string;
  vista: "trabajos" | "incidencias" | "mapa" | "recargas";
  tone: "danger" | "warning";
};

export function OperationalSummaryPriorities({
  projectId, waiting, incidents, topups, gpsMissing, cancellations, loading, incomplete,
}: {
  projectId: string;
  waiting: number | null;
  incidents: number | null;
  topups: number | null;
  gpsMissing: number | null;
  cancellations: { requested: number; cancelled: number } | null;
  loading: boolean;
  incomplete: boolean;
}) {
  const priorities: Priority[] = [];

  if (incidents !== null && incidents > 0) priorities.push({
    id: "incidents", title: `${incidents} incidencia${incidents === 1 ? "" : "s"} sin resolver`,
    detail: "Revisar y dar seguimiento", vista: "incidencias", tone: "danger",
  });
  // Evitar alarmas por muestras minúsculas o por un solo viaje cancelado.
  if (cancellations && cancellations.requested >= 5 &&
      cancellations.cancelled > 0 && cancellations.cancelled / cancellations.requested >= 0.3) {
    priorities.push({
      id: "cancellations",
      title: `${cancellations.cancelled} de ${cancellations.requested} carreras canceladas (7 fechas)`,
      detail: "Revisar motivos y recuperación de solicitudes", vista: "trabajos", tone: "danger",
    });
  }
  if (waiting !== null && waiting > 0) priorities.push({
    id: "waiting", title: `${waiting} carrera${waiting === 1 ? "" : "s"} sin conductor`,
    detail: "Asignación y cobertura pendientes", vista: "trabajos", tone: "warning",
  });
  if (topups !== null && topups > 0) priorities.push({
    id: "topups", title: `${topups} recarga${topups === 1 ? "" : "s"} por verificar`,
    detail: "Solicitudes, no dinero recibido", vista: "recargas", tone: "warning",
  });
  if (gpsMissing !== null && gpsMissing > 0) priorities.push({
    id: "gps", title: `${gpsMissing} trabajando sin GPS reciente`,
    detail: "Revisar ubicación; no significa que estén desconectados", vista: "mapa", tone: "warning",
  });

  return (
    <section aria-label="Prioridades del resumen operativo" className={cn("rounded-[var(--radius-card)] border p-3", premiumSurface)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Requiere atención</h2>
        <span className="text-[11px] text-text-secondary">
          {loading ? "Actualizando" : incomplete ? "Datos parciales" : "Estado actual"}
        </span>
      </div>
      {priorities.length ? (
        <div className="grid gap-1.5 lg:grid-cols-2">
          {priorities.map((item) => (
            <Link key={item.id} to="/admin/proyectos/$id/$section"
              params={{ id: projectId, section: "trabajos" }} search={{ vista: item.vista }}
              className={cn("flex min-h-12 min-w-0 items-center gap-2 rounded-[var(--radius-control)] border px-2.5 py-2 transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.tone === "danger"
                  ? "border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-surface)]"
                  : "border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)]")}
            >
              {item.id === "topups" ? <WalletCards className="h-4 w-4 shrink-0 text-[var(--semantic-warning)]" aria-hidden="true" /> :
                item.id === "gps" ? <MapPinOff className="h-4 w-4 shrink-0 text-[var(--semantic-warning)]" aria-hidden="true" /> :
                item.id === "waiting" ? <Clock3 className="h-4 w-4 shrink-0 text-[var(--semantic-warning)]" aria-hidden="true" /> :
                <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--semantic-danger)]" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-snug text-foreground">{item.title}</span>
                <span className="block text-[11px] leading-snug text-text-secondary">{item.detail}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-secondary">
          {loading ? "Comprobando las prioridades…" :
            incomplete ? "No se han podido verificar todas las prioridades." :
            "No hay alertas en los indicadores operativos consultados."}
        </p>
      )}
    </section>
  );
}
