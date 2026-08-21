import { requireOnline } from "@/lib/pwa";
import { getSupabaseClient } from "@/lib/supabase";

export type ElToqueCurrency = "USD" | "EUR";

export interface ElToqueIntegrationSettings {
  projectId: string;
  provider: string;
  apiKeyConfigured: boolean;
  apiKeyScope: "project" | "legacy" | "missing";
  autoSyncEnabled: boolean;
  autoCurrency: ElToqueCurrency;
  baseCurrency: string;
  chargeCurrency: string;
  currentRate: number;
  fallbackRate: number;
  rateSource: string;
  rateUpdatedAt: string;
  lastAutoSyncAt: string | null;
  lastAutoSyncStatus: string;
  lastAutoSyncError: string | null;
  dailyRateNotificationEnabled: boolean;
  dailyRateNotificationHour: number;
  dailyRateNotificationTimezone: string;
  lastDailyRateNotificationDate: string | null;
  syncSchedule: string;
  enabledPushTokens: number;
  pendingNotifications: number;
  canManage: boolean;
}

export interface SaveElToqueIntegrationInput {
  apiKey?: string;
  autoSyncEnabled: boolean;
  autoCurrency: ElToqueCurrency;
  fallbackRate: number;
  dailyRateNotificationEnabled: boolean;
  dailyRateNotificationHour: number;
  dailyRateNotificationTimezone: string;
}

export interface ElToqueSyncResult {
  ok: boolean;
  status: string;
  rate?: number;
  currency?: string;
  source?: string;
  fallbackRate?: number;
  message?: string;
}

export interface ElToqueMutationResult {
  settings: ElToqueIntegrationSettings;
  sync: ElToqueSyncResult;
}

function mapSettings(
  row: Record<string, unknown>,
): ElToqueIntegrationSettings {
  return {
    projectId: String(row.project_id),
    provider: String(row.provider ?? "elTOQUE"),
    apiKeyConfigured: Boolean(row.api_key_configured),
    apiKeyScope: String(
      row.api_key_scope ?? "missing",
    ) as ElToqueIntegrationSettings["apiKeyScope"],
    autoSyncEnabled: Boolean(row.auto_sync_enabled),
    autoCurrency: String(row.auto_currency ?? "USD") as ElToqueCurrency,
    baseCurrency: String(row.base_currency),
    chargeCurrency: String(row.charge_currency),
    currentRate: Number(row.current_rate),
    fallbackRate: Number(row.fallback_rate),
    rateSource: String(row.rate_source),
    rateUpdatedAt: String(row.rate_updated_at),
    lastAutoSyncAt: row.last_auto_sync_at
      ? String(row.last_auto_sync_at)
      : null,
    lastAutoSyncStatus: String(row.last_auto_sync_status ?? "never"),
    lastAutoSyncError: row.last_auto_sync_error
      ? String(row.last_auto_sync_error)
      : null,
    dailyRateNotificationEnabled: Boolean(
      row.daily_rate_notification_enabled,
    ),
    dailyRateNotificationHour: Number(
      row.daily_rate_notification_hour ?? 8,
    ),
    dailyRateNotificationTimezone: String(
      row.daily_rate_notification_timezone ?? "America/Havana",
    ),
    lastDailyRateNotificationDate:
      row.last_daily_rate_notification_date
        ? String(row.last_daily_rate_notification_date)
        : null,
    syncSchedule: String(row.sync_schedule ?? "5 * * * *"),
    enabledPushTokens: Number(row.enabled_push_tokens ?? 0),
    pendingNotifications: Number(row.pending_notifications ?? 0),
    canManage: Boolean(row.can_manage),
  };
}

function mapMutationResult(data: unknown): ElToqueMutationResult {
  const row = (data ?? {}) as Record<string, unknown>;
  const settings = (row.settings ?? {}) as Record<string, unknown>;
  const sync = (row.sync ?? {}) as Record<string, unknown>;

  return {
    settings: mapSettings(settings),
    sync: {
      ok: Boolean(sync.ok),
      status: String(sync.status ?? "unknown"),
      rate: sync.rate == null ? undefined : Number(sync.rate),
      currency:
        sync.currency == null ? undefined : String(sync.currency),
      source:
        sync.source == null ? undefined : String(sync.source),
      fallbackRate:
        sync.fallback_rate == null
          ? undefined
          : Number(sync.fallback_rate),
      message:
        sync.message == null ? undefined : String(sync.message),
    },
  };
}

function throwIntegrationError(message: string): never {
  if (message.includes("INVALID_ELTOQUE_API_KEY")) {
    throw new Error("La clave API de elTOQUE no parece válida.");
  }

  if (message.includes("ELTOQUE_REQUIRES_CUP_CHARGE")) {
    throw new Error(
      "Para usar elTOQUE, la moneda de cobro debe ser CUP.",
    );
  }

  if (message.includes("ELTOQUE_CURRENCY_MUST_MATCH_BASE")) {
    throw new Error(
      "La moneda consultada en elTOQUE debe coincidir con la moneda base del proyecto.",
    );
  }

  if (message.includes("INVALID_FALLBACK_RATE")) {
    throw new Error(
      "La tasa de respaldo debe ser mayor que cero.",
    );
  }

  if (message.includes("INVALID_NOTIFICATION_HOUR")) {
    throw new Error(
      "La hora de notificación debe estar entre 0 y 23.",
    );
  }

  throw new Error(message);
}

export async function getElToqueIntegration(
  projectId: string,
) {
  const { data, error } = await getSupabaseClient().rpc(
    "admin_get_eltoque_integration",
    {
      target_project_id: projectId,
    },
  );

  if (error) throwIntegrationError(error.message);

  return mapSettings(
    (data ?? {}) as Record<string, unknown>,
  );
}

export async function saveElToqueIntegration(
  projectId: string,
  input: SaveElToqueIntegrationInput,
) {
  await requireOnline("guardar la integración de elTOQUE");

  const { data, error } = await getSupabaseClient().rpc(
    "admin_save_eltoque_integration",
    {
      target_project_id: projectId,
      target_api_key: input.apiKey?.trim() || null,
      target_auto_sync_enabled: input.autoSyncEnabled,
      target_auto_currency: input.autoCurrency,
      target_fallback_rate: input.fallbackRate,
      target_daily_notification_enabled:
        input.dailyRateNotificationEnabled,
      target_notification_hour:
        input.dailyRateNotificationHour,
      target_notification_timezone:
        input.dailyRateNotificationTimezone,
    },
  );

  if (error) throwIntegrationError(error.message);

  return mapMutationResult(data);
}

export async function syncElToqueNow(
  projectId: string,
) {
  await requireOnline("actualizar la tasa de elTOQUE");

  const { data, error } = await getSupabaseClient().rpc(
    "admin_sync_eltoque_now",
    {
      target_project_id: projectId,
    },
  );

  if (error) throwIntegrationError(error.message);

  return mapMutationResult(data);
}