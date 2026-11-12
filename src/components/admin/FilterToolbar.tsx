import { Search, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compactToolbarControls, compactToolbarSurface, embeddedToolbarSurface, premiumSurface, premiumControlSurface, type AdminAppearance, type AdminDensity } from "./density";

export interface FilterToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  onReset?: () => void;
  showReset?: boolean;
  className?: string;
  density?: AdminDensity;
  embedded?: boolean;
  appearance?: AdminAppearance;
}

export function FilterToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar registros...",
  children,
  actions,
  onReset,
  showReset = false,
  className,
  density = "comfortable",
  embedded = false,
  appearance = "standard",
}: FilterToolbarProps) {
  return (
    <div
      data-density={density}
      data-appearance={appearance === "premium" ? "premium" : undefined}
      className={cn(
        density === "compact"
          ? cn(compactToolbarSurface, compactToolbarControls, "flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between")
          : "flex flex-col gap-3 rounded-[var(--radius-card)] border border-border-subtle bg-surface-1 p-3 shadow-[var(--shadow-xs)] sm:p-4 lg:flex-row lg:items-center lg:justify-between",
        appearance === "premium" && !embedded && premiumSurface,
        embedded && embeddedToolbarSurface,
        className,
      )}
    >
      <div className={cn("flex flex-1 flex-col gap-3 sm:flex-row sm:items-center flex-wrap", density === "compact" && "min-w-0 gap-2")}>
        {onSearchChange !== undefined ? (
          <div className={cn("relative min-w-0 flex-1 sm:min-w-60 sm:max-w-xs", density === "compact" && "w-full sm:min-w-48")}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className={cn("pl-9", appearance === "premium" && premiumControlSurface)}
            />
          </div>
        ) : null}

        {children}

        {showReset && onReset ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {actions ? <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div> : null}
    </div>
  );
}
