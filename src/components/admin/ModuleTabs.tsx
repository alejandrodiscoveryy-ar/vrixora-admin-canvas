import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminModuleKey } from "./types";

export type ModuleTab = {
  value: string;
  label: string;
  badge?: React.ReactNode;
  disabled?: boolean;
};

export function ModuleTabs({
  module,
  value,
  onValueChange,
  tabs,
  ariaLabel = "Secciones",
  className,
}: {
  module: AdminModuleKey;
  value: string;
  onValueChange: (value: string) => void;
  tabs: ModuleTab[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-admin-module={module}
      className={cn(
        "flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-compact)] border border-border-subtle bg-surface-1 p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <Button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={tab.disabled}
            variant="ghost"
            size="sm"
            onClick={() => onValueChange(tab.value)}
            className={cn(
              "min-h-9 shrink-0 rounded-lg border border-transparent px-3 text-text-secondary",
              active &&
                "border-[var(--module-border)] bg-[var(--module-surface)] text-[var(--module-foreground)] shadow-[var(--shadow-xs)]",
            )}
          >
            {tab.label}
            {tab.badge}
          </Button>
        );
      })}
    </div>
  );
}
