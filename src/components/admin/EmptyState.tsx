import type { LucideIcon } from "lucide-react";
import { FolderSearch } from "lucide-react";
import { type AdminModuleKey, moduleColorMap } from "./types";
import { cn } from "@/lib/utils";
import type { AdminDensity } from "./density";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  module?: AdminModuleKey;
  className?: string;
  density?: AdminDensity;
}

export function EmptyState({
  icon: Icon = FolderSearch,
  title,
  description,
  action,
  module,
  className,
  density = "comfortable",
}: EmptyStateProps) {
  const accentColor = module ? moduleColorMap[module] : "var(--primary)";

  return (
    <div
      data-density={density}
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border-default bg-surface-2 p-8 text-center sm:p-10",
        density === "compact" && "p-4 sm:p-5",
        className,
      )}
    >
      <div
        className={cn("mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-card)] border border-border-subtle bg-surface-1 shadow-[var(--shadow-xs)]", density === "compact" && "mb-2.5 h-10 w-10 rounded-[var(--radius-compact)]")}
        style={{ color: accentColor }}
      >
        <Icon className="h-6 w-6" style={{ color: accentColor }} />
      </div>

      <h3 className="text-base font-semibold tracking-tight text-text-primary">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-text-secondary">{description}</p>

      {action ? <div className={density === "compact" ? "mt-3 max-sm:[&_button]:min-h-11" : "mt-6"}>{action}</div> : null}
    </div>
  );
}
