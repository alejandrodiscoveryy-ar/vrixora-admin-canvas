import type { LucideIcon } from "lucide-react";
import { type AdminModuleKey, moduleColorMap } from "./types";
import { cn } from "@/lib/utils";

export interface ModuleHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  module?: AdminModuleKey;
  actions?: React.ReactNode;
  className?: string;
}

export function ModuleHeader({
  title,
  description,
  icon: Icon,
  module,
  actions,
  className,
}: ModuleHeaderProps) {
  const accentColor = module ? moduleColorMap[module] : "var(--primary)";

  return (
    <div
      data-admin-module={module}
      className={cn(
        "mb-4 flex flex-col gap-3 border-b border-border-subtle pb-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-6",
        className,
      )}
    >
      <div className="flex items-start gap-3 sm:gap-3.5">
        {Icon ? (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-compact)] border border-[var(--module-border,var(--border-default))] bg-[var(--module-surface,var(--surface-2))] shadow-[var(--shadow-xs)] sm:h-11 sm:w-11"
            style={{ color: accentColor }}
          >
            <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" style={{ color: accentColor }} />
          </div>
        ) : null}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
              {title}
            </h1>
            {module ? (
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: accentColor }}
                aria-hidden="true"
              />
            ) : null}
          </div>
          {description ? (
            <p className="mt-0.5 max-w-3xl text-sm leading-snug text-text-secondary sm:mt-1 sm:leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2.5 flex-wrap">{actions}</div> : null}
    </div>
  );
}
