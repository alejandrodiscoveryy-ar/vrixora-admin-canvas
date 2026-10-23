import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, BriefcaseBusiness, UserRoundPlus, Volume2, VolumeX, MonitorCheck, MonitorOff } from "lucide-react";
import { supabaseServices } from "@/lib/services";
import {
  listenAdminPush, registerAdminPush, unregisterAdminPush, savedAdminPushToken, checkAdminPushWorker,
  type AdminPushEvent,
} from "@/lib/admin-push";

type AlertKind = "driver" | "job" | "pending";
type OperationalAlert = { id: string; kind: AlertKind; title: string; description: string; occurredAt: string };
type PendingJob = { id: string; label: string; started: string };
const POLL_INTERVAL_MS = 20_000;
const MAX_RECENT_ITEMS = 80;
const MAX_KNOWN_IDS = 800;
const MAX_VISIBLE_ALERTS = 16;
const PENDING_THRESHOLD_MS = 2 * 60_000;

function tone(context: AudioContext, kind: AlertKind) {
  const notes = kind === "driver" ? [523, 659] : kind === "pending" ? [659, 659, 784, 659] : [784, 988, 784];
  const start = context.currentTime + 0.02;
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * 0.16;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.28, at + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.145);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.15);
  });
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Reciente" :
    date.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function validCurrentJob(job: {
  publishedAt: string | null; isTest: boolean; status: string; driverUserId: string | null;
  expiresAt: string | null;
}) {
  return !job.isTest && !!job.publishedAt && job.status === "published" &&
    !job.driverUserId && (!job.expiresAt || Date.parse(job.expiresAt) > Date.now());
}

export function AdminOperationalAlerts({ projectId, userId }: { projectId: string; userId: string }) {
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [pending, setPending] = useState<PendingJob[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushDiagnostic, setPushDiagnostic] = useState("");
  const soundRef = useRef<AudioContext | null>(null);
  const storageKey = `vrixora:operational-alert-known:v2:${projectId}:${userId}`;

  const ring = useCallback((kind: AlertKind) => {
    const context = soundRef.current;
    if (!context) return;
    if (context.state === "running") tone(context, kind);
    else void context.resume().then(() => tone(context, kind)).catch(() => undefined);
  }, []);

  const appendAlerts = useCallback((found: OperationalAlert[]) => {
    if (!found.length) return;
    found.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    setAlerts((previous) => {
      const seen = new Set<string>();
      return [...found, ...previous].filter((item) => !seen.has(item.id) && !!seen.add(item.id)).slice(0, MAX_VISIBLE_ALERTS);
    });
    ring(found.some((item) => item.kind === "pending") ? "pending" :
      found.some((item) => item.kind === "job") ? "job" : "driver");
  }, [ring]);

  useEffect(() => {
    let stopped = false;
    let running = false;
    let known = new Set<string>();
    let initialized = false;
    setAlerts([]);
    setPending([]);
    setOnline(null);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((part) => typeof part === "string")) {
          known = new Set(parsed.slice(0, MAX_KNOWN_IDS));
          initialized = true;
        }
      }
    } catch { /* local-only preference */ }

    async function check() {
      if (stopped || running) return;
      running = true;
      try {
        const [drivers, jobs] = await Promise.all([
          supabaseServices.marketplace.listDrivers(projectId, { limit: MAX_RECENT_ITEMS }),
          supabaseServices.marketplace.listJobs(projectId, { limit: MAX_RECENT_ITEMS }),
        ]);
        if (stopped) return;
        const fresh: OperationalAlert[] = [];
        const observed: string[] = [];
        const currentPending: PendingJob[] = [];
        const now = Date.now();

        for (const driver of drivers.items) {
          const key = `driver:${driver.userId}`;
          observed.push(key);
          if (initialized && !known.has(key)) {
            fresh.push({ id: key, kind: "driver", title: "Nuevo conductor registrado",
              description: driver.displayName || "Consulta el directorio de conductores", occurredAt: driver.createdAt });
          }
        }
        for (const job of jobs.items) {
          if (!job.publishedAt || job.isTest) continue;
          const key = `job:${job.jobId}`;
          observed.push(key);
          const active = validCurrentJob(job);
          if (active) {
            currentPending.push({ id: job.jobId, label: `${job.originText} → ${job.destinationText}`, started: job.publishedAt });
          }
          // If the panel is opened after a live job was published, it must not silently swallow it.
          const recentlyPublished = active && now - Date.parse(job.publishedAt) <= PENDING_THRESHOLD_MS;
          if (!known.has(key) && (initialized || recentlyPublished)) {
            fresh.push({ id: key, kind: "job", title: "Nueva carrera publicada",
              description: `${job.serviceCode} · ${job.originText} → ${job.destinationText}`, occurredAt: job.publishedAt });
          }
          if (active && now - Date.parse(job.publishedAt) >= PENDING_THRESHOLD_MS) {
            const pendingKey = `pending:${job.jobId}`;
            observed.push(pendingKey);
            if (!known.has(pendingKey)) {
              fresh.push({ id: pendingKey, kind: "pending", title: "Carrera sin conductor",
                description: `${job.originText} → ${job.destinationText} · requiere supervisión`, occurredAt: new Date().toISOString() });
            }
          }
        }
        initialized = true;
        // Merge storage to avoid repeating an event already delivered by foreground push.
        try {
          const stored = JSON.parse(localStorage.getItem(storageKey) || "[]") as unknown;
          if (Array.isArray(stored)) for (const key of stored) if (typeof key === "string") known.add(key);
        } catch { /* optional */ }
        known = new Set([...fresh.map((event) => event.id), ...observed, ...known].slice(0, MAX_KNOWN_IDS));
        try { localStorage.setItem(storageKey, JSON.stringify([...known])); } catch { /* optional */ }
        setPending(currentPending);
        setOnline(true);
        appendAlerts(fresh);
      } catch {
        if (!stopped) setOnline(false);
      } finally { running = false; }
    }
    void check();
    const interval = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => { stopped = true; clearInterval(interval); };
  }, [projectId, storageKey, appendAlerts]);

  useEffect(() => {
    setPushEnabled(Boolean(savedAdminPushToken()) && "Notification" in window && Notification.permission === "granted");
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    void listenAdminPush(projectId, (message: AdminPushEvent) => {
      const id = message.job_id ? `${message.kind === "admin_marketplace_pending_job" ? message.stage === "pending_10m" ? "pending10" : "pending" : "job"}:${message.job_id}` :
        message.driver_id ? `driver:${message.driver_id}` : `push:${message.kind}`;
      let known: string[] = [];
      try { known = JSON.parse(localStorage.getItem(storageKey) || "[]") as string[]; } catch { /* optional */ }
      if (known.includes(id)) return;
      try { localStorage.setItem(storageKey, JSON.stringify([id, ...known].slice(0, MAX_KNOWN_IDS))); } catch { /* optional */ }
      appendAlerts([{ id, kind: message.job_id ? (message.kind === "admin_marketplace_pending_job" ? "pending" : "job") : "driver",
        title: message.title, description: message.body, occurredAt: new Date().toISOString() }]);
    }).then((off) => { if (disposed) off(); else unsubscribe = off; }).catch(() => undefined);
    return () => { disposed = true; unsubscribe?.(); };
  }, [projectId, storageKey, appendAlerts, pushEnabled]);

  useEffect(() => () => { if (soundRef.current) void soundRef.current.close().catch(() => undefined); soundRef.current = null; }, []);

  useEffect(() => {
    const onPresentationError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail || "Error desconocido";
      setPushError(`El navegador no pudo presentar el aviso: ${message}`);
    };
    window.addEventListener("vrixora:push-presentation-error", onPresentationError);
    return () => window.removeEventListener("vrixora:push-presentation-error", onPresentationError);
  }, []);

  useEffect(() => {
    if (!pushEnabled) { setPushDiagnostic(""); return; }
    let canceled = false;
    void checkAdminPushWorker().then((ready) => {
      if (!canceled) setPushDiagnostic(ready
        ? "Firebase cargado en el navegador. La recepcion efectiva debe probarse."
        : "Firebase no se inicializo en el servicio local; el modo de respaldo esta disponible.");
    }).catch((error) => {
      if (!canceled) setPushError(error instanceof Error ? error.message : String(error));
    });
    return () => { canceled = true; };
  }, [pushEnabled]);

  async function testLocalWindowsNotification() {
    setPushError("");
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") {
        throw new Error("Las notificaciones del navegador no tienen permiso.");
      }
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("PRUEBA LOCAL Â· Vrixora Administracion", {
        body: "Aviso local de Windows. No se crea ninguna carrera.",
        icon: "/icon-192.png", badge: "/favicon.png",
        tag: `vrixora:local-test:${Date.now()}`,
      });
      setPushDiagnostic("Aviso local solicitado; comprueba si Windows lo muestra. Esto no prueba el envio remoto.");
    } catch (error) {
      setPushError(`Error al mostrar aviso local: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function toggleSound() {
    if (soundEnabled) {
      setSoundEnabled(false);
      const context = soundRef.current;
      soundRef.current = null;
      if (context) await context.close().catch(() => undefined);
      return;
    }
    try {
      const context = new AudioContext();
      soundRef.current = context;
      await context.resume();
      if (context.state !== "running") throw new Error("Audio bloqueado");
      setSoundEnabled(true);
      setSoundError("");
      tone(context, "job");
    } catch {
      setSoundEnabled(false);
      setSoundError("El navegador no permitió el sonido. Revisa los permisos y el volumen del equipo.");
    }
  }
  async function toggleWindowsPush() {
    if (pushBusy) return;
    setPushBusy(true); setPushError("");
    // One deliberate click can unlock both foreground audio and OS notifications.
    if (!pushEnabled && !soundEnabled) void toggleSound();
    try {
      if (pushEnabled) { await unregisterAdminPush(); setPushEnabled(false); }
      else { await registerAdminPush(); setPushEnabled(true); }
    } catch (error) {
      setPushError(error instanceof Error ? error.message : "No se pudieron configurar los avisos del sistema.");
    } finally { setPushBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-cyan-400/25 bg-background/85 px-3 py-3 shadow-sm" aria-label="Alarmas operativas de TukTuk">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BellRing className="h-5 w-5 shrink-0 text-cyan-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Centro de alarmas operativas</p>
            <p className="text-xs text-muted-foreground">{online === null ? "Conectando…" : online ?
              "Vigilancia activa · cada 20 s · avisos Windows opcionales" : "Sin conexión · no se están consultando carreras"}</p>
          </div>
          {pending.length > 0 && <span className="rounded-full bg-rose-500/15 px-2 py-1 text-xs font-bold text-rose-300" aria-live="polite">
            {pending.length} sin conductor</span>}
          {alerts.length > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-300" aria-live="polite">
            {alerts.length} aviso(s)</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pushBusy} onClick={() => void toggleWindowsPush()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-2.5 py-1.5 text-xs font-semibold hover:bg-cyan-500/10">
            {pushEnabled ? <MonitorCheck className="h-4 w-4" /> : <MonitorOff className="h-4 w-4" />}
            {pushEnabled ? "Avisos Windows activos" : "Activar avisos Windows"}
          </button>
          <button type="button" onClick={() => void toggleSound()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {soundEnabled ? "Silenciar" : "Activar sonido"}
          </button>
          {pushEnabled && <button type="button" onClick={() => void testLocalWindowsNotification()}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent">Probar aviso local</button>}
          {alerts.length > 0 && <button type="button" onClick={() => setAlerts([])} className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent">Marcar revisadas</button>}
        </div>
      </div>
      {pushError && <p role="alert" className="mt-2 text-xs text-amber-500">{pushError}</p>}
      {pushDiagnostic && <p role="status" className="mt-2 text-xs text-cyan-300">{pushDiagnostic}</p>}
      {soundError && <p role="alert" className="mt-2 text-xs text-amber-500">{soundError}</p>}
      {pending.length > 0 && <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/5 p-2.5">
        <p className="text-xs font-semibold text-rose-300">Carreras que esperan conductor: {pending.length}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{pending[0].label}</p>
        <a className="mt-1 inline-block text-xs font-semibold text-cyan-300 underline" href={`/admin/proyectos/${encodeURIComponent(projectId)}/trabajos`}>Abrir operación</a>
      </div>}
      {alerts.length > 0 && <ul className="mt-3 grid gap-2" aria-label="Nuevas alarmas">
        {alerts.slice(0, 5).map((alert) => <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface-1/70 p-2.5">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {alert.kind === "driver" ? <UserRoundPlus className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" /> : <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
            <div className="min-w-0"><p className="text-xs font-semibold">{alert.title}</p>
              <p className="max-w-xl truncate text-xs text-muted-foreground" title={alert.description}>{alert.description}</p>
              <p className="text-[11px] text-muted-foreground">{dateLabel(alert.occurredAt)}</p>
            </div>
          </div>
          <a href={`/admin/proyectos/${encodeURIComponent(projectId)}/trabajos`} className="rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25">Abrir operación</a>
        </li>)}
        {alerts.length > 5 && <li className="text-xs text-muted-foreground">Y {alerts.length - 5} avisos más.</li>}
      </ul>}
      <p className="mt-2 text-[11px] text-muted-foreground">
        El tono de la página requiere activar sonido. Los avisos Windows requieren autorización del navegador y pueden llegar con la web cerrada;
        el sonido del sistema depende de Windows, del navegador y de No molestar.
      </p>
    </section>
  );
}
