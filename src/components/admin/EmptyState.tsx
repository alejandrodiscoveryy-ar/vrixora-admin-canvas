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
        "flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-card/40 p-12 text-center backdrop-blur-sm",
        className,
      )}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/80 bg-background/80 shadow-sm mb-4"
        style={{ color: accentColor }}
      >
        <Icon className="h-6 w-6" style={{ color: accentColor }} />
      </div>

      <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">
        {description}
      </p>

      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
