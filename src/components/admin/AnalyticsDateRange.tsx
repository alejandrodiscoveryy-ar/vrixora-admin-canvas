import { useEffect, useState } from "react";

export type AnalyticsDateRange = { from: string; to: string };

export function usePersistentAnalyticsDateRange(storageKey: string) {
  const [range, setRange] = useState<AnalyticsDateRange>(() => last7Days());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as AnalyticsDateRange;
        if (validDate(parsed.from) && validDate(parsed.to) && parsed.from <= parsed.to)
          setRange(parsed);
      }
    } catch {
      /* Keep the safe default range. */
    }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (loaded) localStorage.setItem(storageKey, JSON.stringify(range));
  }, [loaded, range, storageKey]);
  return [range, setRange] as const;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function shift(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
function last7Days(): AnalyticsDateRange {
  return { from: shift(-6), to: todayIso() };
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
