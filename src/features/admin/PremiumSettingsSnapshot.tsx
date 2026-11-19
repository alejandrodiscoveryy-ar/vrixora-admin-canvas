import type { LucideIcon } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";

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

/**
 * A composition of the approved ModuleHeader, not a second bespoke hero.
 * Show live values as small context labels; forms below remain the authority.
 */
export default function PremiumSettingsSnapshot({ title, description, icon, metrics }: Props) {
  return (
    <ModuleHeader
      module="configuracion"
      density="compact"
      appearance="premium"
      title={title}
      description={description}
      icon={icon}
      actions={
        metrics.length ? (
          <dl className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Estado de la categoría">
            {metrics.map(metric => (
              <div key={metric.label} title={metric.hint}
                className="flex min-w-0 max-w-full items-center gap-1.5 rounded-[var(--radius-control)] border border-border-default bg-surface-3/65 px-2.5 py-1.5 text-xs">
                <dt className="shrink-0 text-text-secondary">{metric.label}</dt>
                <dd className={"min-w-0 break-words font-semibold tabular-nums " +
                  (metric.tone === "warning" ? "text-[var(--semantic-warning-foreground)]"
                    : metric.tone === "success" ? "text-[var(--semantic-success-foreground)]"
                      : "text-text-primary")}>
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : undefined
      }
    />
  );
}
