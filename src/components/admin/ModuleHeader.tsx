import type { LucideIcon } from "lucide-react";
import { type AdminModuleKey, moduleColorMap } from "./types";
import { cn } from "@/lib/utils";
import type { AdminDensity } from "./density";

export interface ModuleHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  module?: AdminModuleKey;
  actions?: React.ReactNode;
  className?: string;
  density?: AdminDensity;
}

export function ModuleHeader({
  title,
  description,
  icon: Icon,
  module,
  actions,
  className,
  density = "comfortable",
}: ModuleHeaderProps) {
  const accentColor = module ? moduleColorMap[module] : "var(--primary)";

  return (
    <div
      data-admin-module={module}
      data-density={density}
      className={cn(
        density === "compact"
          ? "flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border border-border-subtle bg-surface-1 px-3 py-3 shadow-[var(--shadow-xs)] sm:flex-row sm:items-center sm:justify-between sm:px-4"
          : "mb-4 flex flex-col gap-3 border-b border-border-subtle pb-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-6",
        className,
      )}
    >
      <div className={cn("flex items-start gap-3 sm:gap-3.5", density === "compact" && "min-w-0 items-center gap-2.5 sm:gap-3")}>
        {Icon ? (
          <div
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-compact)] border border-[var(--module-border,var(--border-default))] bg-[var(--module-surface,var(--surface-2))] shadow-[var(--shadow-xs)] sm:h-11 sm:w-11", density === "compact" && "h-9 w-9 sm:h-9 sm:w-9")}
            style={{ color: accentColor }}
          >
            <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" style={{ color: accentColor }} />
          </div>
        ) : null}
        <div className={density === "compact" ? "min-w-0" : undefined}>
          <div className="flex items-center gap-2">
            <h1 className={cn("text-xl font-bold tracking-tight text-text-primary sm:text-2xl", density === "compact" && "break-words text-lg font-semibold sm:text-xl")}>
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
            <p className={cn("mt-0.5 max-w-3xl text-sm leading-snug text-text-secondary sm:mt-1 sm:leading-relaxed", density === "compact" && "text-xs sm:mt-0.5 sm:leading-snug")}>
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className={cn("flex items-center gap-2.5 flex-wrap", density === "compact" && "min-w-0 gap-2 max-sm:[&_button]:min-h-11")}>{actions}</div> : null}
    </div>
  );
}
