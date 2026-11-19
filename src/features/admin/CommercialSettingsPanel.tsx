import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { commercialPremium as cp } from "@/features/admin/commercial-premium";

/** One active settings group; each group is an administrative task, not another dashboard. */
export function CommercialSettingsPanel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details name="commercial-policy" className={cp.accordion}>
      <summary className={cp.accordionTitle}>
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-surface-2 text-[var(--module-accent,var(--primary))]">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text-primary">{title}</span>
          <span className="mt-0.5 block text-xs font-normal text-text-secondary">{description}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border-subtle px-3 py-3 sm:px-4 sm:py-4">
        {children}
      </div>
    </details>
  );
}
