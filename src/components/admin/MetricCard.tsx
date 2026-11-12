import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type AdminModuleKey, type SemanticState, moduleColorMap, semanticColorMap } from "./types";
import { cn } from "@/lib/utils";
import { premiumMetricSurface, type AdminAppearance, type AdminDensity } from "./density";
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
  density?: AdminDensity;
  appearance?: AdminAppearance;
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
  density = "comfortable",
  appearance = "standard",
}: MetricCardProps) {
  const premium = appearance === "premium";
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
      data-density={density}
      data-appearance={premium ? "premium" : undefined}
      className={cn(
        "relative h-full min-h-28 overflow-hidden rounded-[var(--radius-card)] border-border-subtle bg-surface-1 shadow-[var(--shadow-card)] backdrop-blur-sm transition-[border-color,box-shadow,transform] duration-[var(--motion-interaction)] hover:-translate-y-0.5 hover:border-[var(--module-border,var(--border-default))] sm:min-h-0",
        density === "compact" && "min-h-0 backdrop-blur-none hover:translate-y-0",
        premium && cn(premiumMetricSurface, "isolate backdrop-blur-none hover:translate-y-0"),
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn("absolute top-0 left-0 right-0 h-[2px]", premium && "h-px opacity-70")}
        style={{ backgroundColor: accentColor }}
      />
      {premium && Icon && !isLoading ? (
        <Icon
          aria-hidden="true"
          focusable="false"
          data-watermark="metric"
          className="pointer-events-none absolute bottom-2 right-2 z-0 size-12 select-none opacity-[0.06] sm:right-3 sm:size-16 dark:opacity-[0.07]"
          style={{ color: accentColor }}
        />
      ) : null}
      <CardContent
        className={cn(
          density === "compact" ? "p-3 sm:p-4" : "p-3 min-[390px]:p-3.5 sm:p-5",
          premium && "relative z-10 p-3 sm:p-3",
        )}
      >
        {isLoading ? (
          <div className={density === "compact" ? "space-y-2" : "space-y-3"}>
            <Skeleton className="h-4 w-28 max-w-full bg-muted/60" />
            <Skeleton className="h-8 w-20 bg-muted/60" />
            <Skeleton className="h-3 w-36 max-w-full bg-muted/60" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-1.5">
              <span className={cn("text-[11px] font-semibold leading-tight tracking-wide text-text-tertiary sm:text-xs", premium && "text-xs tracking-normal text-text-secondary")}>
                {label}
              </span>
              {Icon && !premium ? (
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--module-surface,var(--surface-2))] sm:h-8 sm:w-8 sm:rounded-lg"
                  style={{ color: accentColor }}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
              ) : null}
            </div>

            <div className={cn("mt-1.5 flex min-w-0 items-baseline gap-1.5 sm:mt-2 sm:gap-2", density === "compact" && "flex-wrap gap-1 sm:mt-1.5 sm:gap-1.5", premium && "mt-1 sm:mt-1")}>
              <span className={cn("min-w-0 font-mono text-2xl font-bold leading-none tracking-tight text-text-primary sm:text-3xl", density === "compact" ? "max-w-full whitespace-normal break-words text-xl leading-tight tabular-nums sm:text-2xl" : "truncate", premium && "font-semibold")}>
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
              <div className={cn("mt-1.5 flex min-w-0 items-center justify-between gap-1.5 text-[11px] leading-tight text-text-tertiary sm:mt-2 sm:gap-2 sm:text-xs", density === "compact" && "flex-wrap sm:mt-1.5", premium && "mt-1 text-xs sm:mt-1")}>
                {description && <span className={density === "compact" ? "min-w-0 break-words" : "min-w-0 truncate"}>{description}</span>}
                {displayComparison && (
                  <span className={cn("min-w-0 font-medium text-foreground/80", density === "compact" ? "break-words" : "truncate")}>
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
  // Reject invalid numeric tokens without matching parts of valid words (e.g. Finanzas).
  return /(?:^|[^\p{L}\p{N}_])(?:NaN|[+-]?Infinity|undefined)(?=$|[^\p{L}\p{N}_])/iu.test(value)
    ? fallback
    : value;
}
