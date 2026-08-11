import { Filter, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DataToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar registros...",
  resultCount,
  activeFilterCount = 0,
  filters,
  actions,
  onReset,
  className,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  resultCount?: number;
  activeFilterCount?: number;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-border-subtle bg-surface-1 p-3 shadow-[var(--shadow-xs)] sm:p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {onSearchChange ? (
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={searchValue ?? ""}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-9"
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {filters}
          {activeFilterCount > 0 ? (
            <Badge variant="info" className="gap-1 rounded-full">
              <Filter className="h-3 w-3" /> {activeFilterCount}
            </Badge>
          ) : null}
          {onReset && activeFilterCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" /> Limpiar
            </Button>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          {resultCount !== undefined ? (
            <span className="whitespace-nowrap text-xs text-text-tertiary">
              {resultCount} {resultCount === 1 ? "resultado" : "resultados"}
            </span>
          ) : null}
          {actions}
        </div>
      </div>
    </div>
  );
}
