import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { compactSectionHeader, premiumSurface, premiumHeaderSurface, type AdminAppearance, type AdminDensity } from "./density";

export interface AdminDataTableShellProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  isEmpty?: boolean;
  emptyState?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  density?: AdminDensity;
  appearance?: AdminAppearance;
}

export function AdminDataTableShell({
  title,
  description,
  actions,
  children,
  isEmpty = false,
  emptyState,
  footer,
  className,
  density = "comfortable",
  appearance = "standard",
}: AdminDataTableShellProps) {
  const premium = appearance === "premium";
  return (
    <Card
      data-density={density}
      data-appearance={premium ? "premium" : undefined}
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border-border-subtle bg-surface-1 shadow-[var(--shadow-card)] backdrop-blur-sm",
        density === "compact" && "min-w-0 backdrop-blur-none",
        premium && cn(premiumSurface, "backdrop-blur-none"),
        className,
      )}
    >
      {(title || description || actions) && (
        <CardHeader
          className={cn(
            density === "compact" ? compactSectionHeader : "flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6",
            premium && premiumHeaderSurface,
          )}
        >
          <div className={density === "compact" ? "min-w-0" : undefined}>
            {title ? <CardTitle className="text-base font-semibold">{title}</CardTitle> : null}
            {description ? (
              <CardDescription className={cn("text-xs text-muted-foreground mt-0.5", premium && "text-text-secondary")}>
                {description}
              </CardDescription>
            ) : null}
          </div>
          {actions ? <div className={cn("flex items-center gap-2", density === "compact" && "w-full min-w-0 flex-wrap")}>{actions}</div> : null}
        </CardHeader>
      )}

      <CardContent className="p-0">
        {isEmpty && emptyState ? (
          <div className={density === "compact" ? "p-3 sm:p-4" : "p-8"}>{emptyState}</div>
        ) : (
          <div className="w-full overflow-x-auto">{children}</div>
        )}
      </CardContent>

      {footer ? (
        <div className={cn("flex items-center justify-between border-t border-border-subtle bg-surface-2 px-4 py-3.5 text-xs text-text-tertiary sm:px-6", density === "compact" && "flex-wrap gap-2 px-3 py-2.5 sm:px-4", premium && premiumHeaderSurface)}>
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
