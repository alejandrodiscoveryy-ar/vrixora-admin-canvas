import type { LucideIcon } from "lucide-react";
import { premiumHeaderSurface, premiumMetricSurface } from "@/components/admin/density";

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

/** Compact context for every settings category: no hero, oversized art or nested cards. */
export default function PremiumSettingsSnapshot({ title, description, icon: Icon, metrics }: Props) {
  return (
    <section aria-label={"Panel de " + title} className={"min-w-0 rounded-[var(--radius-card)] border px-3 py-3 shadow-[var(--shadow-xs)] sm:px-4 " + premiumHeaderSurface}>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border-default bg-surface-3/70 text-[var(--module-accent,var(--primary))]" aria-hidden="true">
          <Icon className="size-4" />
        </span>
        <div className="min-w-[180px] flex-1">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <p className="text-xs leading-snug text-text-secondary">{description}</p>
        </div>
        <dl className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:max-w-[58%] lg:flex-1" aria-label="Estado de la categoría">
          {metrics.map((metric) => (
            <div key={metric.label} title={metric.hint} className={"min-w-0 rounded-[var(--radius-control)] border px-3 py-2 " + premiumMetricSurface}>
              <dt className="text-[11px] font-medium text-text-secondary">{metric.label}</dt>
              <dd className={"mt-0.5 min-w-0 break-words text-sm font-semibold tabular-nums " +
                (metric.tone === "warning" ? "text-[var(--semantic-warning-foreground)]"
                  : metric.tone === "success" ? "text-[var(--semantic-success-foreground)]" : "text-text-primary")}>
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
