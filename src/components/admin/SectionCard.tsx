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
      className={cn(
        "overflow-hidden border-border/80 bg-card/90 backdrop-blur-sm shadow-sm",
        borderClass,
        className,
      )}
    >
      {(title || description || actions) && (
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/75 px-6 py-4">
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

      <CardContent className={cn("p-6", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
