import { useEffect, useState } from "react";
import { CalendarDays, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type AnalyticsDateRange = { from: string; to: string };

export function usePersistentAnalyticsDateRange(storageKey: string) {
  const [range, setRange] = useState<AnalyticsDateRange>(() => currentMonth());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as AnalyticsDateRange;
        if (validDate(parsed.from) && validDate(parsed.to) && parsed.from <= parsed.to) setRange(parsed);
      }
    } catch { /* Keep the safe default range. */ }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (loaded) localStorage.setItem(storageKey, JSON.stringify(range));
  }, [loaded, range, storageKey]);
  return [range, setRange] as const;
}

export function AnalyticsDateRangePicker({ range, onChange }: { range: AnalyticsDateRange; onChange: (range: AnalyticsDateRange) => void }) {
  const identifiedPreset = identifyPreset(range);
  const [customOpen, setCustomOpen] = useState(identifiedPreset === "custom");
  useEffect(() => {
    if (identifiedPreset === "custom") setCustomOpen(true);
  }, [identifiedPreset]);
  const preset = customOpen ? "custom" : identifiedPreset;
  const choose = (value: string) => {
    if (value === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(presetRange(value));
  };
  return <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>Periodo</span>
      <Select value={preset} onValueChange={choose}>
        <SelectTrigger className="h-9 w-48 text-foreground"><CalendarDays className="mr-2 h-4 w-4 text-primary" /><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hoy</SelectItem>
          <SelectItem value="yesterday">Ayer</SelectItem>
          <SelectItem value="last7">Últimos 7 días</SelectItem>
          <SelectItem value="last30">Últimos 30 días</SelectItem>
          <SelectItem value="month">Este mes</SelectItem>
          <SelectItem value="custom">Rango personalizado</SelectItem>
        </SelectContent>
      </Select>
    </label>
    {customOpen && <>
      <DateField label="Desde" value={range.from} max={range.to} onChange={(from) => onChange({ ...range, from })} />
      <DateField label="Hasta" value={range.to} min={range.from} max={todayIso()} onChange={(to) => onChange({ ...range, to })} />
    </>}
    {!customOpen && <div className="flex h-9 items-center text-xs text-muted-foreground">{formatRange(range)}</div>}
    <div className="flex h-9 items-center gap-1.5 text-xs text-emerald-400"><Check className="h-3.5 w-3.5" />Selección guardada</div>
  </div>;
}

function DateField({ label, value, min, max, onChange }: { label: string; value: string; min?: string; max?: string; onChange: (value: string) => void }) {
  return <label className="space-y-1 text-xs text-muted-foreground"><span>{label}</span><Input className="h-9 w-40 text-foreground" type="date" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} /></label>;
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function shift(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function currentMonth(): AnalyticsDateRange { const now = new Date(); return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: todayIso() }; }
function presetRange(value: string): AnalyticsDateRange {
  if (value === "today") return { from: todayIso(), to: todayIso() };
  if (value === "yesterday") return { from: shift(-1), to: shift(-1) };
  if (value === "last7") return { from: shift(-6), to: todayIso() };
  if (value === "last30") return { from: shift(-29), to: todayIso() };
  return currentMonth();
}
function identifyPreset(range: AnalyticsDateRange) {
  for (const value of ["today", "yesterday", "last7", "last30", "month"]) {
    const candidate = presetRange(value);
    if (candidate.from === range.from && candidate.to === range.to) return value;
  }
  return "custom";
}
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
function formatRange(range: AnalyticsDateRange) {
  const formatter = new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" });
  const from = formatter.format(new Date(`${range.from}T12:00:00`));
  const to = formatter.format(new Date(`${range.to}T12:00:00`));
  return range.from === range.to ? from : `${from} – ${to}`;
}
