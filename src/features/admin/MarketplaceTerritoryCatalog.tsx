import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Database, Loader2, MapPinned, Plus, RefreshCw } from "lucide-react";
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
  if (error || !data?.ok) throw new Error(String(data?.error ?? error?.message ?? "No se pudo consultar el catálogo"));
  return data;
}

function dateLabel(value: string | null) {
  if (!value) return "Sin actualizar";
  return new Intl.DateTimeFormat("es-CU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const statusLabel: Record<Job["status"], string> = {
  queued: "En cola", running: "Actualizando", succeeded: "Completado", failed: "Falló",
};

export default function MarketplaceTerritoryCatalog({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const client = useQueryClient();
  const [provinceCode, setProvinceCode] = useState("CU-04");
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ["marketplace-poi-territories", projectId],
    queryFn: () => api(projectId, "list") as Promise<Catalog>,
    refetchInterval: (state) =>
      state.state.data?.jobs?.some((j) => ["running", "queued"].includes(j.status)) ? 10_000 : 60_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    retry: 1,
  });
  const provinces = query.data?.provinces ?? [];
  const jobs = query.data?.jobs ?? [];
  const pending = useMemo(() => new Set(jobs.filter((j) => j.status === "queued" || j.status === "running").map((j) => j.province_code)), [jobs]);
  const habana = provinces.find((p) => p.code === "CU-03");
  const available = provinces.filter((p) => p.code !== "CU-03" && !p.catalog_ready);
  const mutation = useMutation({
    mutationFn: (code: string) => api(projectId, "queue", code),
    onSuccess: async () => {
      toast.success("Solicitud registrada. Se procesará desde la cola de GitHub Actions.");
      await client.invalidateQueries({ queryKey: ["marketplace-poi-territories", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const handleQueue = (code: string) => {
    if (!canManage || pending.has(code) || mutation.isPending) return;
    mutation.mutate(code);
  };

  return (
    <section className="mb-4 rounded-2xl border border-sky-400/20 bg-card/75 p-4 shadow-sm" aria-label="Administración de mapas y provincias">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-2.5 text-sky-300"><MapPinned className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Mapas y provincias</h2>
            <p className="text-sm text-muted-foreground">Catálogo OpenStreetMap por provincia. No habilita carreras ni cambia tarifas.</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Consultar estado
        </Button>
      </header>
      {query.isError ? (
        <div role="alert" className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4" /> No se pudo cargar el panel. Comprueba que el servicio de administración está desplegado.
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-background/45 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provincia inicial</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <strong>La Habana</strong>
            {habana?.catalog_ready ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Database className="h-4 w-4 text-muted-foreground" />}
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{(habana?.poi_count ?? 0).toLocaleString("es-CU")}</p>
          <p className="text-xs text-muted-foreground">lugares registrados · {dateLabel(habana?.last_updated_at ?? null)}</p>
          <Button type="button" size="sm" className="mt-3 w-full" disabled={!canManage || !habana || mutation.isPending || pending.has("CU-03")}
            onClick={() => handleQueue("CU-03")}>
            {pending.has("CU-03") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {pending.has("CU-03") ? "Actualización solicitada" : "Actualizar La Habana"}
          </Button>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/45 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expansión territorial</p>
          <p className="mt-2 text-sm font-semibold">Preparar otra provincia</p>
          <label htmlFor="tuktuk-province-selector" className="mt-2 block text-xs text-muted-foreground">Provincia o municipio especial</label>
          <select id="tuktuk-province-selector" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            value={available.some((p) => p.code === provinceCode) ? provinceCode : (available[0]?.code ?? "")}
            onChange={(e) => setProvinceCode(e.target.value)} disabled={!canManage || available.length === 0}>
            {available.map((p) => <option value={p.code} key={p.code}>{p.name}</option>)}
          </select>
          <Button type="button" size="sm" className="mt-3 w-full" disabled={!canManage || !available.length || mutation.isPending || pending.has(available.some((p) => p.code === provinceCode) ? provinceCode : available[0].code)}
            onClick={() => handleQueue(available.some((p) => p.code === provinceCode) ? provinceCode : available[0].code)}>
            <Plus className="mr-2 h-4 w-4" /> Preparar provincia
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Importar lugares no activa operaciones, conductores ni solicitudes de viajes.</p>
        </div>
      </div>
      <button type="button" className="mt-4 text-sm font-medium text-sky-300 hover:underline" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Ocultar" : "Ver"} provincias preparadas e historial
      </button>
      {expanded ? (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Catálogos cargados</p>
            {provinces.filter((p) => p.catalog_ready).map((p) => (
              <div key={p.code} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 p-2.5 text-sm">
                <div><strong>{p.name}</strong><span className="ml-2 text-muted-foreground">{p.poi_count.toLocaleString("es-CU")} lugares</span></div>
                {p.code !== "CU-03" && canManage ? <Button size="sm" variant="outline" disabled={pending.has(p.code) || mutation.isPending} onClick={() => handleQueue(p.code)}>Actualizar</Button> : null}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Últimas solicitudes</p>
            {jobs.slice(0,8).map((job) => (
              <div key={job.id} className="rounded-lg border border-border/40 p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{provinces.find((p) => p.code === job.province_code)?.name ?? job.province_code}</strong>
                  <span className={job.status === "succeeded" ? "text-emerald-400" : job.status === "failed" ? "text-red-400" : "text-sky-300"}>{statusLabel[job.status]}</span>
                </div>
                <p className="text-xs text-muted-foreground">{dateLabel(job.created_at)}{job.processed_count != null ? ` · ${job.processed_count.toLocaleString("es-CU")} lugares` : ""}</p>
                {job.error_message ? <p className="mt-1 text-xs text-red-300">{job.error_message}</p> : null}
              </div>
            ))}
            {!jobs.length ? <p className="text-sm text-muted-foreground">Todavía no hay actualizaciones solicitadas.</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
