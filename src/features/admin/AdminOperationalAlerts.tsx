import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { BellRing, BriefcaseBusiness, UserRoundPlus, Volume2, VolumeX, MonitorCheck, MonitorOff } from "lucide-react";
import { supabaseServices } from "@/lib/services";
import {
  listenAdminPush, registerAdminPush, unregisterAdminPush, savedAdminPushToken, checkAdminPushWorker,
  type AdminPushEvent,
} from "@/lib/admin-push";

type AlertKind = "driver" | "job" | "pending";
type OperationalAlert = { id: string; kind: AlertKind; title: string; description: string; occurredAt: string; targetId?: string };
type PendingJob = { id: string; label: string; started: string };
const POLL_INTERVAL_MS = 20_000;
const MAX_RECENT_ITEMS = 80;
const MAX_KNOWN_IDS = 800;
const MAX_VISIBLE_ALERTS = 16;
const PENDING_THRESHOLD_MS = 2 * 60_000;

function alertDestination(projectId: string, alert: OperationalAlert) {
  const base = `/admin/proyectos/${encodeURIComponent(projectId)}/trabajos`;
  if (alert.kind === "driver") {
    return `${base}?vista=conductores${alert.targetId ? `&conductor=${encodeURIComponent(alert.targetId)}` : ""}`;
  }
  return `${base}?vista=trabajos${alert.targetId ? `&carrera=${encodeURIComponent(alert.targetId)}` : ""}`;
}

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
  // Persist the operator's audio preference per user, not per temporary browser session.
  const soundPreferenceKey = `vrixora:operational-sound-enabled:v1:${userId}`;
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundPreferred, setSoundPreferred] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem(soundPreferenceKey) === "enabled"; }
    catch { return false; }
  });
  const [soundError, setSoundError] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [pushDiagnostic, setPushDiagnostic] = useState("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const soundRef = useRef<AudioContext | null>(null);
  const soundPreferredRef = useRef(soundPreferred);
  const storageKey = `vrixora:operational-alert-known:v2:${projectId}:${userId}`;

  // The manager stays mounted while the menu is closed: polling, sound and FCM continue.
  useEffect(() => {
    setPortalTarget(document.getElementById("vrixora-admin-operational-alarm-slot"));
  }, []);

  // A saved preference remains enabled. Chrome may require a fresh user gesture
  // after reload; any normal interaction in Admin retries its audio context.
  const activateSound = useCallback((playConfirmation = false) => {
    if (!soundPreferredRef.current) return;
    try {
      let context = soundRef.current;
      if (!context || context.state === "closed") {
        context = new AudioContext();
        soundRef.current = context;
        const activeContext = context;
        activeContext.onstatechange = () => {
          if (soundRef.current === activeContext) {
            setSoundEnabled(activeContext.state === "running");
          }
        };
      }
      const activeContext = context;
      const reportState = () => {
        if (!soundPreferredRef.current || soundRef.current !== activeContext) return;
        const running = activeContext.state === "running";
        setSoundEnabled(running);
        if (running) {
          setSoundError("");
          if (playConfirmation) tone(activeContext, "job");
        }
      };
      if (activeContext.state === "running") { reportState(); return; }
      void activeContext.resume().then(reportState).catch(() => {
        if (!soundPreferredRef.current || soundRef.current !== activeContext) return;
        setSoundEnabled(false);
        setSoundError("Chrome bloqueó el audio. Haz clic en Vrixora para reactivarlo.");
      });
    } catch {
      setSoundEnabled(false);
      setSoundError("No fue posible activar el sonido en este navegador.");
    }
  }, []);

  useEffect(() => {
    const retryOnInteraction = () => {
      if (soundPreferredRef.current && soundRef.current?.state !== "running") activateSound();
    };
    const retryWhenVisible = () => { if (!document.hidden) retryOnInteraction(); };
    window.addEventListener("pointerdown", retryOnInteraction, true);
    window.addEventListener("keydown", retryOnInteraction, true);
    window.addEventListener("focus", retryOnInteraction);
    document.addEventListener("visibilitychange", retryWhenVisible);
    retryOnInteraction();
    return () => {
      window.removeEventListener("pointerdown", retryOnInteraction, true);
      window.removeEventListener("keydown", retryOnInteraction, true);
      window.removeEventListener("focus", retryOnInteraction);
      document.removeEventListener("visibilitychange", retryWhenVisible);
      const context = soundRef.current;
      soundRef.current = null;
      if (context) {
        context.onstatechange = null;
        void context.close().catch(() => undefined);
      }
    };
  }, [activateSound]);

  const ring = useCallback((kind: AlertKind) => {
    const context = soundRef.current;
    // Never queue an old alarm to play late when Chrome eventually unlocks audio.
    if (context?.state === "running") tone(context, kind);
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
              description: driver.displayName || "Conductor sin nombre", occurredAt: driver.createdAt,
              targetId: driver.userId });
          }
        }
        for (const job of jobs.items) {
          if (!job.publishedAt || job.isTest) continue;
          const key = `job:${job.jobId}`;
          observed.push(key);
          const active = validCurrentJob(job);
          if (active) {
            currentPending.push({ id: job.jobId, label: `${job.customerDisplayName || "Cliente sin nombre"} · ${job.originText} → ${job.destinationText}`, started: job.publishedAt });
          }
          // If the panel is opened after a live job was published, it must not silently swallow it.
          const recentlyPublished = active && now - Date.parse(job.publishedAt) <= PENDING_THRESHOLD_MS;
          if (!known.has(key) && (initialized || recentlyPublished)) {
            fresh.push({ id: key, kind: "job", title: "Nueva carrera publicada",
              description: `${job.customerDisplayName || "Cliente sin nombre"} · ${job.originText} → ${job.destinationText}`,
              occurredAt: job.publishedAt, targetId: job.jobId });
          }
          if (active && now - Date.parse(job.publishedAt) >= PENDING_THRESHOLD_MS) {
            const pendingKey = `pending:${job.jobId}`;
            observed.push(pendingKey);
            if (!known.has(pendingKey)) {
              fresh.push({ id: pendingKey, kind: "pending", title: "Carrera sin conductor",
                description: `${job.customerDisplayName || "Cliente sin nombre"} · ${job.originText} → ${job.destinationText}`,
                occurredAt: new Date().toISOString(), targetId: job.jobId });
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
        // Los avisos FCM pueden llegar con texto generico: completar datos en el area privada.
        // No se coloca el nombre del cliente en las notificaciones de pantalla bloqueada.
        const byDriver = new Map(drivers.items.map((driver) => [driver.userId, driver]));
        const byJob = new Map(jobs.items.map((job) => [job.jobId, job]));
        setAlerts((previous) => previous.map((alert) => {
          const target = alert.targetId;
          if (!target) return alert;
          if (alert.kind === "driver") {
            const driver = byDriver.get(target);
            return driver ? { ...alert, description: driver.displayName || "Conductor sin nombre" } : alert;
          }
          const job = byJob.get(target);
          return job ? { ...alert, description: `${job.customerDisplayName || "Cliente sin nombre"} · ${job.originText} → ${job.destinationText}` } : alert;
        }));
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
        title: message.title, description: message.body, occurredAt: new Date().toISOString(),
        targetId: message.job_id || message.driver_id }]);
    }).then((off) => { if (disposed) off(); else unsubscribe = off; }).catch(() => undefined);
    return () => { disposed = true; unsubscribe?.(); };
  }, [projectId, storageKey, appendAlerts, pushEnabled]);

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

  function toggleSound() {
    if (soundPreferredRef.current) {
      soundPreferredRef.current = false;
      setSoundPreferred(false);
      setSoundEnabled(false);
      setSoundError("");
      try { localStorage.setItem(soundPreferenceKey, "disabled"); } catch { /* optional */ }
      const context = soundRef.current;
      soundRef.current = null;
      if (context) {
        context.onstatechange = null;
        void context.close().catch(() => undefined);
      }
      return;
    }
    soundPreferredRef.current = true;
    setSoundPreferred(true);
    try { localStorage.setItem(soundPreferenceKey, "enabled"); } catch { /* optional */ }
    // Called directly from a click, so Chrome can unlock the audio immediately.
    activateSound(true);
  }
  async function toggleWindowsPush() {
    if (pushBusy) return;
    setPushBusy(true); setPushError("");
    // One deliberate click can unlock both foreground audio and OS notifications.
    if (!pushEnabled && !soundPreferredRef.current) toggleSound();
    try {
      if (pushEnabled) { await unregisterAdminPush(); setPushEnabled(false); }
      else { await registerAdminPush(); setPushEnabled(true); }
    } catch (error) {
      setPushError(error instanceof Error ? error.message : "No se pudieron configurar los avisos del sistema.");
    } finally { setPushBusy(false); }
  }

  // The bell is in the permanent top header; the panel opens only when requested.
  const badgeCount = Math.max(alerts.length, pending.length);
  return portalTarget ? createPortal(
    <Popover>
      <PopoverTrigger asChild>
        <button type="button"
          aria-label={`Abrir alarmas operativas${pending.length ? ` (${pending.length} carreras pendientes)` : badgeCount ? ` (${badgeCount} avisos)` : ""}`}
          title="Alarmas operativas"
          className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 text-cyan-300 transition-colors hover:bg-cyan-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
          <BellRing className="h-4 w-4" aria-hidden="true" />
          {badgeCount > 0 && <span className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold text-white ${pending.length ? "bg-rose-600" : "bg-amber-600"}`}>{badgeCount > 9 ? "9+" : badgeCount}</span>}
          {online === false && badgeCount === 0 && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-rose-500" aria-label="Sin conexión" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10}
        className="z-50 max-h-[min(78vh,680px)] w-[min(92vw,480px)] overflow-y-auto rounded-2xl border-cyan-400/30 bg-background p-4 text-foreground shadow-xl">
        <section className="min-w-0" aria-label="Alarmas operativas de TukTuk">
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
            {soundPreferred ? soundEnabled ? "Silenciar" : "Sonido pendiente · desactivar" : "Activar sonido"}
          </button>
          {alerts.length > 0 && <button type="button" onClick={() => setAlerts([])} className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-accent">Marcar revisadas</button>}
        </div>
      </div>
      {pushError && <p role="alert" className="mt-2 text-xs text-amber-500">{pushError}</p>}
      {pushDiagnostic && !pushDiagnostic.startsWith("Firebase cargado") && <p role="status" className="mt-2 text-xs text-cyan-300">{pushDiagnostic}</p>}
      {soundError && <p role="alert" className="mt-2 text-xs text-amber-500">{soundError}</p>}
      {soundPreferred && !soundEnabled && <p role="status" className="mt-2 text-xs text-amber-300">
        Sonido recordado, pendiente de que Chrome lo permita. Basta con hacer clic normalmente en Vrixora.
      </p>}
      {pending.length > 0 && <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/5 p-2.5">
        <p className="text-xs font-semibold text-rose-300">Carreras que esperan conductor: {pending.length}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{pending[0].label}</p>
        <a className="mt-1 inline-block text-xs font-semibold text-cyan-300 underline" href={alertDestination(projectId, { id: pending[0].id, kind: "pending", title: "", description: "", occurredAt: pending[0].started, targetId: pending[0].id })}>Ver carrera 360</a>
      </div>}
      {alerts.length > 0 && <ul className="mt-3 grid gap-2" aria-label="Nuevas alarmas">
        {alerts.slice(0, 5).map((alert) => <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface-1/70 p-2.5">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {alert.kind === "driver" ? <UserRoundPlus className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" /> : <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
            <a href={alertDestination(projectId, alert)} className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" aria-label={`Abrir ${alert.kind === "driver" ? "ficha 360" : "carrera 360"}: ${alert.description}`}>
              <p className="text-xs font-semibold">{alert.title}</p>
              <p className="max-w-xl truncate text-xs text-foreground" title={alert.description}>{alert.description}</p>
              <p className="text-[11px] text-muted-foreground">{dateLabel(alert.occurredAt)}</p>
            </a>
          </div>
          <a href={alertDestination(projectId, alert)} className="rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25">{alert.kind === "driver" ? "Ver ficha 360" : "Ver carrera 360"}</a>
        </li>)}
        {alerts.length > 5 && <li className="text-xs text-muted-foreground">Y {alerts.length - 5} avisos más.</li>}
      </ul>}
        </section>
      </PopoverContent>
    </Popover>, portalTarget) : null;
}
