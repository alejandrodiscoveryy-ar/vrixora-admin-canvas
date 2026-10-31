import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Globe2,
  Layers3,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";

type Province = {
  code: string;
  name: string;
  catalog_ready: boolean;
  poi_count: number;
  last_updated_at: string | null;
  last_source_md5: string | null;
};
type Job = {
  id: string;
  province_code: string;
  status: "queued" | "running" | "succeeded" | "failed";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  processed_count: number | null;
  error_message: string | null;
};
type Catalog = { ok: true; provinces: Province[]; jobs: Job[] };

async function api(projectId: string, operation: "list" | "queue", provinceCode?: string) {
  const { data, error } = await getSupabaseClient().functions.invoke("marketplace-poi-admin-gateway", {
    body: { operation, project_id: projectId, ...(provinceCode ? { province_code: provinceCode } : {}) },
  });
  if (error || !data?.ok) {
    throw new Error(String(data?.error ?? error?.message ?? "No se pudo consultar el catálogo"));
  }
  return data;
}

const numberLabel = (value: number) => value.toLocaleString("es-CU");

function dateLabel(value: string | null) {
  if (!value) return "Sin actualizar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CU", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

const statusLabel: Record<Job["status"], string> = {
  queued: "En cola",
  running: "Actualizando",
  succeeded: "Completado",
  failed: "Falló",
};

export default function MarketplaceTerritoryCatalog({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const [provinceCode, setProvinceCode] = useState("CU-04");
  const [expanded, setExpanded] = useState(false);

  const query = useQuery({
    queryKey: ["marketplace-poi-territories", projectId],
    queryFn: () => api(projectId, "list") as Promise<Catalog>,
    refetchInterval: (state) =>
      state.state.data?.jobs?.some((job) => job.status === "running" || job.status === "queued") ? 10_000 : 60_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    retry: 1,
  });

  const provinces = query.data?.provinces ?? [];
  const jobs = query.data?.jobs ?? [];
  const loaded = provinces.filter((province) => province.catalog_ready);
  const available = provinces.filter((province) => province.code !== "CU-03" && !province.catalog_ready);
  const pending = useMemo(() => new Set(
    jobs.filter((job) => job.status === "queued" || job.status === "running")
      .map((job) => job.province_code),
  ), [jobs]);
  const habana = provinces.find((province) => province.code === "CU-03");
  const totalPlaces = loaded.reduce((sum, province) => sum + province.poi_count, 0);
  const selectedCode = available.some((province) => province.code === provinceCode)
    ? provinceCode : (available[0]?.code ?? "");
  const pendingSelected = pending.has(selectedCode);

  const mutation = useMutation({
    mutationFn: (code: string) => api(projectId, "queue", code),
    onSuccess: async () => {
      toast.success("Solicitud registrada. Puedes seguir el estado desde el historial.");
      await client.invalidateQueries({ queryKey: ["marketplace-poi-territories", projectId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const handleQueue = (code: string) => {
    if (!canManage || !code || pending.has(code) || mutation.isPending) return;
    mutation.mutate(code);
  };

  return (
    <section aria-label="Administración del catálogo territorial" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/55 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.07] text-cyan-300">
            <Globe2 aria-hidden="true" className="h-[18px] w-[18px]" />
          </div>
          <div>
            <p className="text-sm font-semibold">Fuente de datos: OpenStreetMap</p>
            <p className="text-xs text-muted-foreground">Datos geográficos administrados desde el servidor</p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />}
          Consultar estado
        </Button>
      </div>

      {query.isError ? (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm text-amber-200">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          No se pudo consultar el catálogo. Comprueba la conexión con el servicio administrativo.
        </div>
      ) : null}
      {query.isPending ? <p className="text-sm text-muted-foreground">Consultando catálogos territoriales…</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[20px] border border-border/65 bg-card/65 p-4">
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span className="text-xs font-medium">Lugares registrados</span>
            <Database aria-hidden="true" className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-[28px] font-semibold tracking-tight tabular-nums">{query.isPending ? "—" : numberLabel(totalPlaces)}</p>
          <p className="mt-1 text-xs text-muted-foreground">En provincias con catálogo cargado</p>
        </div>
        <div className="rounded-[20px] border border-border/65 bg-card/65 p-4">
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span className="text-xs font-medium">Territorios preparados</span>
            <Layers3 aria-hidden="true" className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-[28px] font-semibold tracking-tight tabular-nums">{query.isPending ? "—" : `${loaded.length} / ${provinces.length}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Catálogo disponible, no servicio activado</p>
        </div>
        <div className="rounded-[20px] border border-border/65 bg-card/65 p-4">
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span className="text-xs font-medium">Solicitudes pendientes</span>
            <Clock3 aria-hidden="true" className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-[28px] font-semibold tracking-tight tabular-nums">{query.isPending ? "—" : pending.size}</p>
          <p className="mt-1 text-xs text-muted-foreground">En cola o procesándose</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <article className="relative overflow-hidden rounded-[24px] border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.07] via-card/75 to-card/65 p-5 shadow-[0_22px_55px_-45px_rgba(8,145,178,0.5)]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-cyan-400/[0.065] blur-2xl" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400">01 / CATÁLOGO ACTUAL</p>
              <h4 className="mt-2 text-lg font-semibold">La Habana</h4>
              <p className="mt-1 text-sm text-muted-foreground">Mantén actualizadas las direcciones y los puntos de interés.</p>
            </div>
            <MapPin aria-hidden="true" className="h-5 w-5 shrink-0 text-cyan-400" />
          </div>
          <div className="mt-5 rounded-2xl border border-border/50 bg-background/35 px-4 py-3">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{habana ? numberLabel(habana.poi_count) : "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">lugares · Última actualización: {dateLabel(habana?.last_updated_at ?? null)}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 aria-hidden="true" className={`h-3.5 w-3.5 ${habana?.catalog_ready ? "text-emerald-400" : "text-muted-foreground"}`} />
              {habana?.catalog_ready ? "Catálogo preparado" : "Catálogo pendiente"}
            </p>
          </div>
          <Button
            type="button" className="mt-4 w-full" disabled={!canManage || !habana || mutation.isPending || pending.has("CU-03")}
            onClick={() => handleQueue("CU-03")}
          >
            {pending.has("CU-03") ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />}
            {pending.has("CU-03") ? "Actualización solicitada" : "Actualizar La Habana"}
          </Button>
        </article>

        <article className="rounded-[24px] border border-border/70 bg-card/70 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-400">02 / EXPANSIÓN TERRITORIAL</p>
              <h4 className="mt-2 text-lg font-semibold">Agregar una provincia</h4>
              <p className="mt-1 text-sm text-muted-foreground">Prepara su catálogo antes de decidir cuándo habilitar el servicio.</p>
            </div>
            <Plus aria-hidden="true" className="h-5 w-5 shrink-0 text-cyan-400" />
          </div>
          <label htmlFor="tuktuk-config-province-selector" className="mt-5 block text-xs font-medium text-muted-foreground">
            Provincia o municipio especial
          </label>
          <select
            id="tuktuk-config-province-selector"
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background/70 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            value={selectedCode}
            onChange={(event) => setProvinceCode(event.target.value)}
            disabled={!canManage || available.length === 0}
          >
            {available.length === 0 ? <option value="">No hay provincias pendientes</option> : null}
            {available.map((province) => <option value={province.code} key={province.code}>{province.name}</option>)}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">{available.length} territorios disponibles para importar</p>
          <Button
            type="button" variant="outline" className="mt-4 w-full"
            disabled={!canManage || !selectedCode || mutation.isPending || pendingSelected}
            onClick={() => handleQueue(selectedCode)}
          >
            {pendingSelected ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Plus aria-hidden="true" className="mr-2 h-4 w-4" />}
            {pendingSelected ? "Provincia en preparación" : "Preparar provincia"}
          </Button>
          <div className="mt-4 flex items-start gap-2 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            No habilita carreras ni cambia tarifas o disponibilidad de conductores.
          </div>
        </article>
      </div>

      {!canManage ? (
        <p className="text-xs text-muted-foreground">Tu perfil permite consultar catálogos. Las actualizaciones requieren permiso de gestión de mapas.</p>
      ) : null}

      <section className="overflow-hidden rounded-[24px] border border-border/65 bg-card/55">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="tuktuk-territory-details"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 sm:px-5"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Provincias preparadas e historial</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Consulta catálogos cargados, fechas y resultados de actualización</span>
          </span>
          <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded ? (
          <div id="tuktuk-territory-details" className="grid gap-5 border-t border-border/65 p-4 lg:grid-cols-2 sm:p-5">
            <div className="min-w-0 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catálogos disponibles</h4>
              {loaded.map((province) => (
                <div key={province.code} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/35 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{province.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{numberLabel(province.poi_count)} lugares · {dateLabel(province.last_updated_at)}</p>
                  </div>
                  {province.code !== "CU-03" && canManage ? (
                    <Button size="sm" variant="outline" disabled={pending.has(province.code) || mutation.isPending} onClick={() => handleQueue(province.code)}>
                      <RefreshCw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Actualizar
                    </Button>
                  ) : null}
                </div>
              ))}
              {!loaded.length ? <p className="text-sm text-muted-foreground">Todavía no hay catálogos disponibles.</p> : null}
            </div>
            <div className="min-w-0 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Últimas solicitudes</h4>
              {jobs.slice(0, 8).map((job) => (
                <div key={job.id} className="rounded-2xl border border-border/50 bg-background/35 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <strong>{provinces.find((province) => province.code === job.province_code)?.name ?? job.province_code}</strong>
                    <span className={job.status === "succeeded" ? "text-emerald-400" : job.status === "failed" ? "text-rose-400" : "text-cyan-400"}>
                      {statusLabel[job.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateLabel(job.created_at)}{job.processed_count != null ? ` · ${numberLabel(job.processed_count)} lugares` : ""}
                  </p>
                  {job.error_message ? <p className="mt-1 text-xs text-rose-400">{job.error_message}</p> : null}
                </div>
              ))}
              {!jobs.length ? <p className="text-sm text-muted-foreground">No hay actualizaciones anteriores.</p> : null}
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
