import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type AdminModuleKey, type SemanticState, moduleColorMap, semanticColorMap } from "./types";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

export interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  description?: string;
  trend?: {
    value: string | number;
    direction: "up" | "down" | "neutral";
    label?: string;
    semantic?: SemanticState | "neutral";
  };
  comparison?: string;
  module?: AdminModuleKey;
  semanticState?: SemanticState;
  isLoading?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  description,
  trend,
  comparison,
  module,
  semanticState,
  isLoading = false,
  className,
}: MetricCardProps) {
  const accentColor = module
    ? moduleColorMap[module]
    : semanticState
      ? semanticColorMap[semanticState]
      : "var(--primary)";

  const trendColor = trend?.semantic
    ? trend.semantic === "neutral"
      ? "text-muted-foreground"
      : `text-[${semanticColorMap[trend.semantic as SemanticState]}]`
    : trend?.direction === "up"
      ? "text-[var(--semantic-success)]"
      : trend?.direction === "down"
        ? "text-[var(--semantic-danger)]"
        : "text-muted-foreground";

  return (
    <Card
      data-admin-module={module}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] border-border-subtle bg-surface-1 shadow-[var(--shadow-card)] backdrop-blur-sm transition-[border-color,box-shadow,transform] duration-[var(--motion-interaction)] hover:-translate-y-0.5 hover:border-[var(--module-border,var(--border-default))]",
        className,
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ backgroundColor: accentColor }}
      />
      <CardContent className="p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-28 bg-muted/60" />
            <Skeleton className="h-8 w-20 bg-muted/60" />
            <Skeleton className="h-3 w-36 bg-muted/60" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-text-tertiary">
                {label}
              </span>
              {Icon ? (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--module-surface,var(--surface-2))]"
                  style={{ color: accentColor }}
                >
                  <Icon className="h-4 w-4" />
                </div>
              ) : null}
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-[1.75rem] font-bold leading-none tracking-tight text-text-primary sm:text-3xl">
                {value}
              </span>
              {trend ? (
                <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
                  {trend.direction === "up" ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : trend.direction === "down" ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                  <span>{trend.value}</span>
                  {trend.label ? (
                    <span className="text-muted-foreground">({trend.label})</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {(description || comparison) && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-text-tertiary">
                {description && <span className="truncate">{description}</span>}
                {comparison && <span className="font-medium text-foreground/80">{comparison}</span>}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
