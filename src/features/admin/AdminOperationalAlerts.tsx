import { useEffect, useRef, useState } from "react";
import { BellRing, BriefcaseBusiness, UserRoundPlus, Volume2, VolumeX } from "lucide-react";
import { supabaseServices } from "@/lib/services";

type AlertKind = "driver" | "job";
type OperationalAlert = {
  id: string;
  kind: AlertKind;
  title: string;
  description: string;
  occurredAt: string;
};

const POLL_INTERVAL_MS = 20_000;
const MAX_RECENT_ITEMS = 80;
const MAX_KNOWN_IDS = 600;
const MAX_VISIBLE_ALERTS = 12;

function tone(context: AudioContext, kind: AlertKind) {
  // Distinctive but restrained sounds. An AudioContext is unlocked only by a click.
  const notes = kind === "job" ? [784, 988, 784] : [523, 659];
  const start = context.currentTime + 0.025;
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * 0.15;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.06, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.15);
  });
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Reciente"
    : date.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * First-stage operational alarms: authorized admin RPCs, never direct table reads.
 * Requires an open session. Closed-browser push will be a separate, server-backed stage.
 */
export function AdminOperationalAlerts({ projectId, userId }: { projectId: string; userId: string }) {
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundError, setSoundError] = useState("");
  const soundRef = useRef<AudioContext | null>(null);
  const storageKey = `vrixora:operational-alert-known:v1:${projectId}:${userId}`;

  useEffect(() => {
    let stopped = false;
    let running = false;
    let known = new Set<string>();
    let initialized = false;
    setAlerts([]);
    setOnline(null);

    // Persist event IDs only, not names, phone numbers, or route details.
    try {
      const value = window.localStorage.getItem(storageKey);
      if (value !== null) {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
          known = new Set(parsed.slice(0, MAX_KNOWN_IDS));
          initialized = true;
        }
      }
    } catch {
      // Storage can be unavailable. Live-session alarms still work.
    }

    async function check() {
      if (running || stopped) return;
      running = true;
      try {
        const [drivers, jobs] = await Promise.all([
          supabaseServices.marketplace.listDrivers(projectId, { limit: MAX_RECENT_ITEMS }),
          supabaseServices.marketplace.listJobs(projectId, { limit: MAX_RECENT_ITEMS }),
        ]);
        if (stopped) return;
        const fresh: OperationalAlert[] = [];
        const observedKeys: string[] = [];

        for (const driver of drivers.items) {
          const key = `driver:${driver.userId}`;
          observedKeys.push(key);
          if (initialized && !known.has(key)) {
            fresh.push({
              id: key,
              kind: "driver",
              title: "Nuevo conductor registrado",
              description: driver.displayName || "Abrir la lista de conductores",
              occurredAt: driver.createdAt,
            });
          }
        }
        for (const job of jobs.items) {
          // An unpublished draft or synthetic test is not a real new ride.
          if (!job.publishedAt || job.isTest) continue;
          const key = `job:${job.jobId}`;
          observedKeys.push(key);
          if (initialized && !known.has(key)) {
            fresh.push({
              id: key,
              kind: "job",
              title: "Nueva carrera para monitorear",
              description: `${job.serviceCode} · ${job.originText || "Origen pendiente"} → ${job.destinationText || "Destino pendiente"}`,
              occurredAt: job.publishedAt,
            });
          }
        }

        // Initial connection establishes a baseline; historical data is not a new alarm.
        initialized = true;
        known = new Set([...observedKeys, ...known].slice(0, MAX_KNOWN_IDS));
        try { window.localStorage.setItem(storageKey, JSON.stringify([...known])); } catch { /* optional */ }
        setOnline(true);
        if (fresh.length > 0) {
          fresh.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
          setAlerts((existing) => [...fresh, ...existing].slice(0, MAX_VISIBLE_ALERTS));
          if (document.visibilityState === "visible" && soundRef.current?.state === "running") {
            // One audible signal per batch; a ride takes precedence.
            tone(soundRef.current, fresh.some((item) => item.kind === "job") ? "job" : "driver");
          }
        }
      } catch {
        if (!stopped) setOnline(false);
      } finally {
        running = false;
      }
    }

    void check();
    const interval = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [projectId, storageKey]);

  useEffect(() => {
    return () => {
      if (soundRef.current) void soundRef.current.close().catch(() => undefined);
      soundRef.current = null;
    };
  }, []);

  async function toggleSound() {
    if (soundEnabled) {
      setSoundEnabled(false);
      if (soundRef.current) {
        await soundRef.current.close();
        soundRef.current = null;
      }
      return;
    }
    try {
      // Browser sound permissions require an explicit user gesture per session.
      const context = new AudioContext();
      soundRef.current = context;
      await context.resume();
      if (context.state !== "running") throw new Error("Audio no autorizado");
      setSoundEnabled(true);
      setSoundError("");
      tone(context, "driver");
    } catch {
      setSoundEnabled(false);
      setSoundError("El navegador bloqueó el audio. Revisa el volumen y vuelve a activarlo.");
    }
  }

  return (
    <section className="rounded-2xl border border-cyan-400/20 bg-background/80 px-3 py-3 shadow-sm" aria-label="Alarmas operativas de TukTuk">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BellRing className="h-5 w-5 shrink-0 text-cyan-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Alarmas de operación</p>
            <p className="text-xs text-muted-foreground">
              {online === null ? "Conectando…" : online ? "Vigilancia activa con el panel abierto · cada 20 s" : "Sin conexión: no se están comprobando eventos"}
            </p>
          </div>
          {alerts.length > 0 && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-500" aria-live="polite">{alerts.length} nuevos</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void toggleSound()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {soundEnabled ? "Silenciar" : "Activar sonido"}
          </button>
          {alerts.length > 0 && <button type="button" onClick={() => setAlerts([])} className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent">Marcar revisadas</button>}
        </div>
      </div>
      {soundError && <p role="alert" className="mt-2 text-xs text-amber-500">{soundError}</p>}
      {alerts.length > 0 && (
        <ul className="mt-3 grid gap-2" aria-label="Nuevas alarmas">
          {alerts.slice(0, 5).map((alert) => (
            <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface-1/70 p-2.5">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {alert.kind === "job" ? <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <UserRoundPlus className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />}
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{alert.title}</p>
                  <p className="max-w-xl truncate text-xs text-muted-foreground" title={alert.description}>{alert.description}</p>
                  <p className="text-[11px] text-muted-foreground">{dateLabel(alert.occurredAt)}</p>
                </div>
              </div>
              <a href={`/admin/proyectos/${encodeURIComponent(projectId)}/trabajos`} className="rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25">
                {alert.kind === "job" ? "Ver trabajos" : "Abrir Marketplace"}
              </a>
            </li>
          ))}
          {alerts.length > 5 && <li className="text-xs text-muted-foreground">Y {alerts.length - 5} alarmas más pendientes de revisión.</li>}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Los avisos de esta primera etapa funcionan mientras Vrixora Admin permanece abierto. No equivalen a notificaciones push con el navegador cerrado.</p>
    </section>
  );
}
