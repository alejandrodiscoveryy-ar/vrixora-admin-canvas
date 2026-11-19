import type { LucideIcon } from "lucide-react";
import { premiumHeaderSurface } from "@/components/admin/density";
import { configurationPremium as visual } from "./configuration-premium";

export type PremiumSettingsMetric = {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "warning";
};

type Props = {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  metrics: PremiumSettingsMetric[];
};

/** Editorial context + concise live status. No repeated section titles or giant hero. */
export default function PremiumSettingsSnapshot({ number, eyebrow, title, description, icon: Icon, metrics }: Props) {
  return (
    <section data-admin-module="configuracion" aria-label={"Panel de " + title}
      className={`relative isolate min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--module-border)] px-3 py-3 shadow-[var(--shadow-card)] sm:px-4 sm:py-4 ${premiumHeaderSurface}`}>
      <div aria-hidden="true" className={visual.accentLine} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60"
        style={{ backgroundImage: "linear-gradient(110deg, color-mix(in oklab, var(--module-accent) 9%, transparent), transparent 50%)" }} />
      <Icon aria-hidden="true" className="pointer-events-none absolute -right-3 bottom-0 size-20 text-[var(--module-accent)] opacity-[0.035] sm:size-24" />
      <div className="relative z-10 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-compact)] border border-[var(--module-border)] bg-[var(--module-surface)] text-[var(--module-accent)] shadow-[var(--shadow-xs)]" aria-hidden="true">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className={visual.eyebrow}>{number} · {eyebrow}</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-text-primary sm:text-xl">{title}</h2>
            <p className="mt-0.5 text-xs leading-snug text-text-secondary">{description}</p>
          </div>
        </div>
        {metrics.length > 0 && (
          <dl className="grid min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-3" aria-label="Estado de la categoría">
            {metrics.map(metric => (
              <div key={metric.label} title={metric.hint}
                className={`min-w-0 rounded-[var(--radius-control)] border border-border-default bg-surface-2/75 px-3 py-2.5 shadow-[var(--shadow-xs)]`}>
                <dt className="text-[11px] font-medium text-text-secondary">{metric.label}</dt>
                <dd className={"mt-1 break-words text-sm font-semibold tabular-nums " +
                  (metric.tone === "warning" ? "text-[var(--semantic-warning-foreground)]"
                    : metric.tone === "success" ? "text-[var(--semantic-success-foreground)]"
                      : "text-text-primary")}>
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
