import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AdminDataTableShellProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  isEmpty?: boolean;
  emptyState?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
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
}: AdminDataTableShellProps) {
  return (
    <Card className={cn("overflow-hidden border-border/80 bg-card/90 backdrop-blur-sm shadow-sm", className)}>
      {(title || description || actions) && (
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/75 px-6 py-4">
          <div>
            {title ? <CardTitle className="text-base font-semibold">{title}</CardTitle> : null}
            {description ? (
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                {description}
              </CardDescription>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </CardHeader>
      )}

      <CardContent className="p-0">
        {isEmpty && emptyState ? (
          <div className="p-8">{emptyState}</div>
        ) : (
          <div className="w-full overflow-x-auto">{children}</div>
        )}
      </CardContent>

      {footer ? (
        <div className="border-t border-border/75 px-6 py-3.5 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
