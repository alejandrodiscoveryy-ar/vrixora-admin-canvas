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
    <Card
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border-border-subtle bg-surface-1 shadow-[var(--shadow-card)] backdrop-blur-sm",
        className,
      )}
    >
      {(title || description || actions) && (
        <CardHeader className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
        <div className="flex items-center justify-between border-t border-border-subtle bg-surface-2 px-4 py-3.5 text-xs text-text-tertiary sm:px-6">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
