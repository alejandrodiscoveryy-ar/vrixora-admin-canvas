import { useQuery } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Clock3, WalletCards, XCircle } from "lucide-react";
import { MetricCard } from "@/components/admin/MetricCard";
import { premiumControlSurface, premiumSurface } from "@/components/admin/density";
import { supabaseServices, type MarketplaceTopup } from "@/lib/services";
import { cn } from "@/lib/utils";

const PAGE_LIMIT = 50;
const MAX_PAGES = 60;

function monthInHavana(input: string | Date): string | null {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Havana",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : null;
}

type FinancialPulse = {
  currency: string;
  pendingCount: number;
  pendingAmount: number;
  pendingCash: number;
  pendingTransfer: number;
  confirmedCount: number;
  confirmedAmount: number;
  confirmedCash: number;
  confirmedTransfer: number;
  monthCount: number;
  monthAmount: number;
  rejectedCount: number;
  rejectedAmount: number;
};

export function summarizeTopups(topups: MarketplaceTopup[], now = new Date()): FinancialPulse {
  const currencies = [...new Set(topups.map((row) => row.currency))];
  if (currencies.length > 1) {
    throw new Error("Las recargas usan varias monedas y no se pueden sumar en una sola cifra.");
  }
  const month = monthInHavana(now);
  const result: FinancialPulse = {
    currency: currencies[0] ?? "CUP",
    pendingCount: 0, pendingAmount: 0, pendingCash: 0, pendingTransfer: 0,
    confirmedCount: 0, confirmedAmount: 0, confirmedCash: 0, confirmedTransfer: 0,
    monthCount: 0, monthAmount: 0, rejectedCount: 0, rejectedAmount: 0,
  };

  for (const row of topups) {
    if (!Number.isFinite(row.amount) || row.amount < 0) {
      throw new Error("Existe una recarga con importe no válido.");
    }
    if (row.status === "requested") {
      result.pendingCount++;
      result.pendingAmount += row.amount;
      if (row.method === "cash") result.pendingCash += row.amount;
      if (row.method === "transfer") result.pendingTransfer += row.amount;
    } else if (row.status === "confirmed") {
      result.confirmedCount++;
      result.confirmedAmount += row.amount;
      if (row.method === "cash") result.confirmedCash += row.amount;
      if (row.method === "transfer") result.confirmedTransfer += row.amount;
      if (row.confirmedAt && monthInHavana(row.confirmedAt) === month) {
        result.monthCount++;
        result.monthAmount += row.amount;
      }
    } else if (row.status === "rejected") {
      result.rejectedCount++;
      result.rejectedAmount += row.amount;
    }
  }
  return result;
}

async function loadTopupFinancialPulse(projectId: string): Promise<FinancialPulse> {
  const all: MarketplaceTopup[] = [];
  let cursor: { at: string; id: string } | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    // Reutilizar la RPC administrativa que ya verifica payments.view y pagina el directorio.
    // Nunca inferir totales a partir de la primera página.
    const batch = await supabaseServices.marketplace.listTopups(projectId, {
      limit: PAGE_LIMIT,
      cursor,
    });
    all.push(...batch.items);
    if (!batch.nextCursor) return summarizeTopups(all);
    if (batch.nextCursor.at === cursor?.at && batch.nextCursor.id === cursor.id) {
      throw new Error("No fue posible completar la paginación financiera.");
    }
    cursor = batch.nextCursor;
  }
  // Fallar explícitamente en vez de publicar importes incompletos como totales.
  throw new Error("El histórico supera el límite del resumen. Se necesita agregación en el servidor.");
}

function formatMoney(amount: number, currency: string) {
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}

export default function MarketplaceTopupFinancialPulse({
  projectId,
  enabled,
  onViewTopups,
}: {
  projectId: string;
  enabled: boolean;
  onViewTopups: () => void;
}) {
  const summary = useQuery({
    queryKey: ["marketplace-topups", projectId, "financial-pulse"],
    queryFn: () => loadTopupFinancialPulse(projectId),
    enabled,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  if (!enabled) return null;
  const data = summary.data;
  const shown = (amount: number | undefined) =>
    summary.isError || !data || amount === undefined ? "—" : formatMoney(amount, data.currency);

  return (
    <section aria-label="Actividad financiera de recargas" className={cn("relative mt-3 min-w-0 overflow-hidden rounded-[var(--radius-card)] border p-3 sm:p-4", premiumSurface)}>
      <header className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border text-primary", premiumControlSurface)}>
            <WalletCards className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Finanzas · Conductores</p>
            <h3 className="text-base font-semibold text-text-primary sm:text-lg">Actividad financiera de recargas</h3>
            <p className="text-xs text-text-secondary">Importes solicitados y confirmados, sin mezclar estados.</p>
          </div>
        </div>
        <button type="button" onClick={onViewTopups} className={cn("inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", premiumControlSurface)}>
          Ver recargas
        </button>
      </header>

      <div className="relative grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <MetricCard density="compact" appearance="premium" label="Pendiente de confirmar"
          value={shown(data?.pendingAmount)} description={data ? `${data.pendingCount} solicitudes` : "Solicitudes aún no aprobadas"}
          comparison="No es ingreso" icon={Clock3} semanticState="warning" isLoading={summary.isPending} />
        <MetricCard density="compact" appearance="premium" label="Recargas confirmadas"
          value={shown(data?.confirmedAmount)} description={data ? `${data.confirmedCount} confirmaciones` : "Histórico"}
          comparison="Bruto registrado" icon={CheckCircle2} semanticState="success" isLoading={summary.isPending} />
        <MetricCard density="compact" appearance="premium" label="Confirmadas este mes"
          value={shown(data?.monthAmount)} description={data ? `${data.monthCount} confirmaciones` : "Mes actual (Cuba)"}
          comparison="Fecha de confirmación" icon={Banknote} module="resumen" isLoading={summary.isPending} />
        <MetricCard density="compact" appearance="premium" label="Solicitudes rechazadas"
          value={shown(data?.rejectedAmount)} description={data ? `${data.rejectedCount} rechazadas` : "Histórico"}
          comparison="No es ingreso" icon={XCircle} semanticState="danger" isLoading={summary.isPending} />
      </div>

      {summary.isError ? (
        <p role="alert" className="mt-3 text-xs text-[var(--semantic-danger)]">
          No fue posible calcular el resumen completo. No se muestran ceros ficticios.
          <button type="button" onClick={() => void summary.refetch()} className="ml-2 min-h-11 underline">Reintentar</button>
        </p>
      ) : data ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border-default pt-2 text-xs text-text-secondary">
          <span>Pendientes: transferencia <strong className="text-text-primary">{formatMoney(data.pendingTransfer, data.currency)}</strong> · efectivo <strong className="text-text-primary">{formatMoney(data.pendingCash, data.currency)}</strong></span>
          <span>Confirmadas: transferencia <strong className="text-text-primary">{formatMoney(data.confirmedTransfer, data.currency)}</strong> · efectivo <strong className="text-text-primary">{formatMoney(data.confirmedCash, data.currency)}</strong></span>
        </div>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">
        Confirmadas son solicitudes marcadas como verificadas en la plataforma; no equivalen a conciliación bancaria ni a saldo disponible.
        Los importes son brutos y no descuentan eventuales reversiones o aplicaciones a deuda.
      </p>
    </section>
  );
}
