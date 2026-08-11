import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminModuleKey } from "./types";
import { EmptyState } from "./EmptyState";
import { SectionCard } from "./SectionCard";

export function ChartCard({
  title,
  description,
  module,
  legend,
  actions,
  children,
  isLoading = false,
  isEmpty = false,
  emptyTitle = "Sin datos",
  emptyDescription = "No hay información suficiente para mostrar este gráfico.",
  className,
}: {
  title: string;
  description?: string;
  module?: AdminModuleKey;
  legend?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  return (
    <SectionCard
      title={title}
      description={description}
      module={module}
      actions={actions}
      className={className}
      contentClassName="min-w-0"
    >
      {isLoading ? (
        <div
          className="grid min-h-56 place-items-center"
          role="status"
          aria-label="Cargando gráfico"
        >
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : isEmpty ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          module={module}
          className="min-h-56 p-6"
        />
      ) : (
        <div className="min-w-0 space-y-4">
          <div className={cn("h-64 min-w-0 sm:h-72", "[&_.recharts-wrapper]:max-w-full")}>
            {children}
          </div>
          {legend ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
              {legend}
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
