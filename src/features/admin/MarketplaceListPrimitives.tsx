import type { ReactNode } from "react";
import { BriefcaseBusiness, ChevronDown, Filter, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyMarketplaceState({
  title,
  description,
  icon: Icon = BriefcaseBusiness,
}: {
  title: string;
  description?: string;
  icon?: typeof BriefcaseBusiness;
}) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/35 px-3 py-4 text-center sm:min-h-40 sm:rounded-2xl sm:px-6 sm:py-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex min-h-32 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function PaginationButton({
  query,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
  };
}) {
  if (!query.hasNextPage) return null;

  return (
    <div className="mt-4 flex justify-center">
      <Button
        variant="outline"
        disabled={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      >
        {query.isFetchingNextPage ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando…
          </>
        ) : (
          "Cargar más"
        )}
      </Button>
    </div>
  );
}

export function FilterSelect({
  labelText,
  value,
  onChange,
  children,
}: {
  labelText: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative flex w-full min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background/55 px-2.5 py-2 sm:w-auto sm:min-w-52 sm:gap-3 sm:px-3">
      <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {labelText}
        </span>
        <select
          className="mt-0.5 w-full appearance-none bg-transparent pr-6 text-sm font-medium text-foreground outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
      </div>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" />
    </label>
  );
}

export function MiniMetric({ labelText, value }: { labelText: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{labelText}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

