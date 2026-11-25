import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { premiumColumnHeaderSurface, premiumControlSurface, premiumHeaderSurface, type AdminAppearance } from "./density";
import {
  adminPeriodOptions,
  periodRange,
  type AdminDateRange,
  type AdminPeriodKey,
  type AdminPeriodOption,
} from "@/components/admin/admin-period";

export function AdminPeriodSelector({
  value,
  range,
  onChange,
  options = adminPeriodOptions,
  className,
  appearance = "standard",
  allRange,
  maxCustomDays,
}: {
  value: AdminPeriodKey;
  range: AdminDateRange;
  onChange: (value: AdminPeriodKey, range: AdminDateRange) => void;
  options?: AdminPeriodOption[];
  className?: string;
  appearance?: AdminAppearance;
  allRange?: AdminDateRange;
  maxCustomDays?: number;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => toCalendarRange(range));
  const validDraft = Boolean(draft?.from && draft.to && draft.from <= draft.to && (!maxCustomDays || Math.round((draft.to.getTime()-draft.from.getTime())/86_400_000)+1 <= maxCustomDays));
  const currentRange = useMemo(() => currentPeriodRange(value, range), [range, value]);
  const isCurrent = value !== "all" && rangesEqual(range, currentRange);
  const canNavigate = value !== "all" && Boolean(range.from && range.to);

  useEffect(() => {
    if (!customOpen) setDraft(toCalendarRange(range));
  }, [customOpen, range]);

  const choosePeriod = (next: AdminPeriodKey) => {
    if (next === "custom") {
      setDraft(toCalendarRange(range));
      setCustomOpen(true);
      return;
    }
    onChange(next, next === "all" && allRange ? allRange : periodRange(next));
  };

  const move = (direction: -1 | 1) => {
    if (!canNavigate) return;
    onChange(value, shiftPeriodRange(value, range, direction));
  };

  const applyCustom = () => {
    if (!validDraft || !draft?.from || !draft.to) return;
    onChange("custom", { from: toIsoDate(draft.from), to: toIsoDate(draft.to) });
    setCustomOpen(false);
  };

  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-col gap-1.5 rounded-[var(--radius-compact)] border border-border-subtle bg-surface-1 p-1.5 shadow-[var(--shadow-xs)]",
        appearance === "premium" && cn(premiumControlSurface, "min-w-0 gap-1 shadow-none sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"),
        className,
      )}
      data-appearance={appearance === "premium" ? "premium" : undefined}
      aria-label="Selector de período"
    >
      <div className={cn("flex min-w-0 items-center gap-1", appearance === "premium" && "w-full sm:w-auto sm:shrink-0")}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9 shrink-0", appearance === "premium" && "max-sm:h-11 max-sm:w-11")}
          disabled={!canNavigate}
          aria-label="Período anterior"
          title="Período anterior"
          onClick={() => move(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <Select value={value} onValueChange={(next) => choosePeriod(next as AdminPeriodKey)}>
            <SelectTrigger aria-label="Período" className={cn("h-9 min-w-36 flex-1 border-0 bg-surface-2 shadow-none sm:w-44", appearance === "premium" && cn(premiumColumnHeaderSurface, "min-w-0 border shadow-none max-sm:h-11 sm:min-w-36"))}>
              <CalendarDays className="h-4 w-4 text-[var(--module-foreground,var(--primary))]" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={appearance === "premium" ? premiumHeaderSurface : undefined}>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-2"
              aria-label="Abrir selector de rango personalizado"
              title="Personalizar fechas"
            ><CalendarDays className="size-4" aria-hidden="true"/></button>
          </PopoverTrigger>
          <PopoverContent align="center" className={cn("w-auto max-w-[calc(100vw-1rem)] p-0", appearance === "premium" && premiumHeaderSurface)}>
            <div className="overflow-x-auto p-2">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-text-secondary">Desde<input type="date" className="block w-full rounded border border-border-default bg-surface-1 p-2 text-sm" value={draft?.from ? toIsoDate(draft.from) : ""} onChange={e=>setDraft(old=>({from:e.target.value?fromIsoDate(e.target.value):undefined,to:old?.to}))}/></label>
                <label className="text-xs text-text-secondary">Hasta<input type="date" className="block w-full rounded border border-border-default bg-surface-1 p-2 text-sm" value={draft?.to ? toIsoDate(draft.to) : ""} onChange={e=>setDraft(old=>({from:old?.from,to:e.target.value?fromIsoDate(e.target.value):undefined}))}/></label>
              </div>
              <Calendar
                className={appearance === "premium" ? "bg-transparent dark:bg-transparent" : undefined}
                mode="range"
                locale={es}
                selected={draft}
                onSelect={setDraft}
                numberOfMonths={1}
                defaultMonth={draft?.from}
              />
            </div>
            <div className="border-t border-border-subtle px-3 py-2 text-xs text-text-secondary">
              {draft?.from && draft.to
                ? formatRange({ from: toIsoDate(draft.from), to: toIsoDate(draft.to) })
                : "Selecciona fecha inicial y final"}
            </div>
            {draft?.from && draft.to && !validDraft ? <p role="alert" className="px-3 py-2 text-xs text-destructive">Comprueba el orden de las fechas y el límite del período.</p> : null}
            <div className="flex justify-end gap-2 border-t border-border-subtle p-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCustomOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!validDraft}
                onClick={applyCustom}
              >
                Aplicar
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9 shrink-0", appearance === "premium" && "max-sm:h-11 max-sm:w-11")}
          disabled={!canNavigate}
          aria-label="Período siguiente"
          title="Período siguiente"
          onClick={() => move(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {!isCurrent && value !== "all" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-9 w-9 shrink-0", appearance === "premium" && "max-sm:h-11 max-sm:w-11")}
            aria-label="Volver al período actual"
            title="Volver al período actual"
            onClick={() => onChange(value, currentRange)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <button
        type="button"
        disabled={value !== "custom"}
        className={cn("truncate px-2 text-left text-xs text-text-tertiary disabled:cursor-default", appearance === "premium" && cn("max-w-full whitespace-normal break-words text-text-secondary sm:px-2", value === "custom" && "max-sm:min-h-11"))}
        onClick={() => setCustomOpen(true)}
      >
        {value === "all" ? "Todo el historial" : formatRange(range)}
      </button>
    </div>
  );
}

function currentPeriodRange(value: AdminPeriodKey, range: AdminDateRange): AdminDateRange {
  if (value !== "custom" || !range.from || !range.to) return periodRange(value);
  const duration = Math.max(
    1,
    Math.round((fromIsoDate(range.to).getTime() - fromIsoDate(range.from).getTime()) / 86_400_000) +
      1,
  );
  const today = new Date();
  return { from: toIsoDate(addDays(today, -(duration - 1))), to: toIsoDate(today) };
}

function shiftPeriodRange(
  value: AdminPeriodKey,
  range: AdminDateRange,
  direction: -1 | 1,
): AdminDateRange {
  const from = fromIsoDate(range.from);
  const to = fromIsoDate(range.to);
  if (value === "month") {
    const target = new Date(from.getFullYear(), from.getMonth() + direction, 1);
    return {
      from: toIsoDate(target),
      to: toIsoDate(new Date(target.getFullYear(), target.getMonth() + 1, 0)),
    };
  }
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  return {
    from: toIsoDate(addDays(from, direction * days)),
    to: toIsoDate(addDays(to, direction * days)),
  };
}

function toCalendarRange(range: AdminDateRange): DateRange | undefined {
  if (!range.from || !range.to) return undefined;
  return { from: fromIsoDate(range.from), to: fromIsoDate(range.to) };
}

function rangesEqual(first: AdminDateRange, second: AdminDateRange) {
  return first.from === second.from && first.to === second.to;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function fromIsoDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRange(range: AdminDateRange) {
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  const short = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });
  const long = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });
  const from = (sameYear ? short : long).format(fromIsoDate(range.from));
  const to = long.format(fromIsoDate(range.to));
  return range.from === range.to ? to : `${from} – ${to}`;
}
