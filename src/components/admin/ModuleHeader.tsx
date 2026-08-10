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
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border/60 mb-6",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        {Icon ? (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card shadow-sm"
            style={{ color: accentColor }}
          >
            <Icon className="h-5 w-5" style={{ color: accentColor }} />
          </div>
        ) : null}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
            {module ? (
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: accentColor }}
                aria-hidden="true"
              />
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2.5 flex-wrap">{actions}</div> : null}
    </div>
  );
}
