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
  const displayValue = safeMetricValue(value, "0");
  const displayComparison = comparison ? safeMetricValue(comparison, "—") : undefined;
  const displayTrendValue = trend ? safeMetricValue(trend.value, "—") : undefined;
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
        "relative h-full min-h-28 overflow-hidden rounded-[var(--radius-card)] border-border-subtle bg-surface-1 shadow-[var(--shadow-card)] backdrop-blur-sm transition-[border-color,box-shadow,transform] duration-[var(--motion-interaction)] hover:-translate-y-0.5 hover:border-[var(--module-border,var(--border-default))] sm:min-h-0",
        className,
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ backgroundColor: accentColor }}
      />
      <CardContent className="p-3 min-[390px]:p-3.5 sm:p-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-28 bg-muted/60" />
            <Skeleton className="h-8 w-20 bg-muted/60" />
            <Skeleton className="h-3 w-36 bg-muted/60" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-1.5">
              <span className="text-[11px] font-semibold leading-tight tracking-wide text-text-tertiary sm:text-xs">
                {label}
              </span>
              {Icon ? (
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--module-surface,var(--surface-2))] sm:h-8 sm:w-8 sm:rounded-lg"
                  style={{ color: accentColor }}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
              ) : null}
            </div>

            <div className="mt-1.5 flex min-w-0 items-baseline gap-1.5 sm:mt-2 sm:gap-2">
              <span className="min-w-0 truncate font-mono text-2xl font-bold leading-none tracking-tight text-text-primary sm:text-3xl">
                {displayValue}
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
                  <span>{displayTrendValue}</span>
                  {trend.label ? (
                    <span className="text-muted-foreground">({trend.label})</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {(description || comparison) && (
              <div className="mt-1.5 flex min-w-0 items-center justify-between gap-1.5 text-[11px] leading-tight text-text-tertiary sm:mt-2 sm:gap-2 sm:text-xs">
                {description && <span className="min-w-0 truncate">{description}</span>}
                {displayComparison && (
                  <span className="min-w-0 truncate font-medium text-foreground/80">
                    {displayComparison}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function safeMetricValue(value: string | number, fallback: string): string | number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  return /(?:NaN|(?:^|[^a-z])Infinity|undefined)/i.test(value) ? fallback : value;
}
