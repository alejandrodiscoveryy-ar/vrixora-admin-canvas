import type { LucideIcon } from "lucide-react";
import { FolderSearch } from "lucide-react";
import { type AdminModuleKey, moduleColorMap } from "./types";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  module?: AdminModuleKey;
  className?: string;
}

export function EmptyState({
  icon: Icon = FolderSearch,
  title,
  description,
  action,
  module,
  className,
}: EmptyStateProps) {
  const accentColor = module ? moduleColorMap[module] : "var(--primary)";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border-default bg-surface-2 p-8 text-center sm:p-10",
        className,
      )}
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-card)] border border-border-subtle bg-surface-1 shadow-[var(--shadow-xs)]"
        style={{ color: accentColor }}
      >
        <Icon className="h-6 w-6" style={{ color: accentColor }} />
      </div>

      <h3 className="text-base font-semibold tracking-tight text-text-primary">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-text-secondary">{description}</p>

      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
