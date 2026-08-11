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
}: {
  value: AdminPeriodKey;
  range: AdminDateRange;
  onChange: (value: AdminPeriodKey, range: AdminDateRange) => void;
  options?: AdminPeriodOption[];
  className?: string;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => toCalendarRange(range));
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
    onChange(next, periodRange(next));
  };

  const move = (direction: -1 | 1) => {
    if (!canNavigate) return;
    onChange(value, shiftPeriodRange(value, range, direction));
  };

  const applyCustom = () => {
    if (!draft?.from || !draft.to) return;
    onChange("custom", { from: toIsoDate(draft.from), to: toIsoDate(draft.to) });
    setCustomOpen(false);
  };

  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-col gap-1.5 rounded-[var(--radius-compact)] border border-border-subtle bg-surface-1 p-1.5 shadow-[var(--shadow-xs)]",
        className,
      )}
      aria-label="Selector de período"
    >
      <div className="flex min-w-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={!canNavigate}
          aria-label="Período anterior"
          title="Período anterior"
          onClick={() => move(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <Select value={value} onValueChange={(next) => choosePeriod(next as AdminPeriodKey)}>
            <SelectTrigger className="h-9 min-w-36 flex-1 border-0 bg-surface-2 shadow-none sm:w-44">
              <CalendarDays className="h-4 w-4 text-[var(--module-foreground,var(--primary))]" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
              className="sr-only"
              aria-label="Abrir selector de rango personalizado"
            />
          </PopoverTrigger>
          <PopoverContent align="center" className="w-auto max-w-[calc(100vw-1rem)] p-0">
            <div className="overflow-x-auto p-2">
              <Calendar
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
            <div className="flex justify-end gap-2 border-t border-border-subtle p-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCustomOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!draft?.from || !draft.to}
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
          className="h-9 w-9 shrink-0"
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
            className="h-9 w-9 shrink-0"
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
        className="truncate px-2 text-left text-xs text-text-tertiary disabled:cursor-default"
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
