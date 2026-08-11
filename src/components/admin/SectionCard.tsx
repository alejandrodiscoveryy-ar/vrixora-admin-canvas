import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { type AdminModuleKey, moduleBorderLeftMap, moduleColorMap } from "./types";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  module?: AdminModuleKey;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionCard({
  title,
  description,
  actions,
  module,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  const borderClass = module ? moduleBorderLeftMap[module] : "";
  const accentColor = module ? moduleColorMap[module] : undefined;

  return (
    <Card
      data-admin-module={module}
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border-border-subtle bg-surface-1 shadow-[var(--shadow-card)] backdrop-blur-sm",
        borderClass,
        className,
      )}
    >
      {(title || description || actions) && (
        <CardHeader className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            {title ? (
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">{title}</CardTitle>
                {module && accentColor ? (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: accentColor }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            ) : null}
            {description ? (
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                {description}
              </CardDescription>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </CardHeader>
      )}

      <CardContent className={cn("p-4 sm:p-6", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
