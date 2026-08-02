import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Filter, MoreHorizontal } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMobilePagination } from "./useMobilePagination";

export function MobileSectionHeader({
  title,
  subtitle,
  action,
  badge,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold sm:text-lg">{title}</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </section>
  );
}

export type MobileMetric = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
};

export function MobileMetricsGrid({
  metrics,
  maxPrimary = 4,
  moreLabel = "Ver mas metricas",
}: {
  metrics: MobileMetric[];
  maxPrimary?: number;
  moreLabel?: string;
}) {
  const isMobile = useIsMobile();
  const primary = metrics.slice(0, maxPrimary);
  const secondary = metrics.slice(maxPrimary);

  const metricGrid = (items: MobileMetric[]) => (
    <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
      {items.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.key} className="border-border/70 bg-card/85">
            <CardContent className="space-y-1.5 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {Icon ? <Icon className="h-3.5 w-3.5 text-primary" /> : null}
                <span className="truncate">{metric.label}</span>
              </div>
              <div className="text-lg font-semibold leading-none">{metric.value}</div>
              {metric.hint ? (
                <p className="line-clamp-1 text-[11px] text-muted-foreground">{metric.hint}</p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  if (!isMobile) {
    return metricGrid(metrics);
  }

  return (
    <section className="space-y-2">
      {metricGrid(primary)}
      {secondary.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="h-10 w-full justify-between">
              {moreLabel}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">{metricGrid(secondary)}</CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  );
}

export function MobileFiltersPanel({
  activeFilters,
  onClear,
  onApply,
  children,
}: {
  activeFilters: number;
  onClear: () => void;
  onApply?: () => void;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return <div className="space-y-2">{children}</div>;
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          className="h-10 flex-1 justify-between"
          onClick={() => setOpen(true)}
        >
          <span className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </span>
          {activeFilters > 0 ? <Badge variant="secondary">{activeFilters}</Badge> : null}
        </Button>
        {activeFilters > 0 ? (
          <Button variant="ghost" className="h-10" onClick={onClear}>
            Limpiar
          </Button>
        ) : null}
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[88dvh]">
          <DrawerHeader>
            <DrawerTitle>Filtros</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-3">{children}</div>
          <DrawerFooter className="border-t">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={onClear}>
                Limpiar filtros
              </Button>
              <Button
                onClick={() => {
                  onApply?.();
                  setOpen(false);
                }}
              >
                Aplicar
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </section>
  );
}

export function MobileLoadMore({
  visible,
  total,
  onLoadMore,
  canLoadMore,
  className,
}: {
  visible: number;
  total: number;
  canLoadMore: boolean;
  onLoadMore: () => void;
  className?: string;
}) {
  if (total === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <p className="text-xs text-muted-foreground">
        Mostrando {Math.min(visible, total)} de {total} resultados
      </p>
      {canLoadMore ? (
        <Button variant="outline" className="h-10" onClick={onLoadMore}>
          Cargar mas
        </Button>
      ) : null}
    </div>
  );
}

export function MobileStatusPill({
  label,
  variant = "secondary",
}: {
  label: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <Badge variant={variant} className="h-6 rounded-full px-2 text-[11px]">
      {label}
    </Badge>
  );
}

export function MobileActionsMenu({
  items,
}: {
  items: Array<{ label: string; onSelect: () => void; destructive?: boolean; disabled?: boolean }>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" className="h-10 w-10">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            className={cn(item.destructive ? "text-destructive focus:text-destructive" : "")}
            onClick={item.onSelect}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MobileStateMessage({
  kind,
  message,
}: {
  kind: "empty" | "error" | "info";
  message: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        kind === "error" ? "border-destructive/40 text-destructive" : "text-muted-foreground",
      )}
    >
      {message}
    </div>
  );
}
