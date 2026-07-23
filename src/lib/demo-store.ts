// Small in-memory + localStorage store for demo mutations (activations, payments).
// Delete this file when connecting to Supabase.
import { useEffect, useState } from "react";
import { HISTORY, LICENSES, PAYMENTS, type HistoryEntry, type License, type Payment } from "./mock-data";

type State = {
  licenses: License[];
  payments: Payment[];
  history: HistoryEntry[];
};

const KEY = "vrixora_demo_state_v1";

function load(): State {
  if (typeof window === "undefined") {
    return { licenses: LICENSES, payments: PAYMENTS, history: HISTORY };
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { licenses: LICENSES, payments: PAYMENTS, history: HISTORY };
}

let state: State = { licenses: LICENSES, payments: PAYMENTS, history: HISTORY };
const listeners = new Set<() => void>();

function persist() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  }
  listeners.forEach((l) => l());
}

export function resetDemoStore() {
  state = { licenses: LICENSES, payments: PAYMENTS, history: HISTORY };
  persist();
}

export function useDemoStore() {
  const [, force] = useState(0);
  useEffect(() => {
    state = load();
    force((n) => n + 1);
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    licenses: state.licenses,
    payments: state.payments,
    history: state.history,
    activateLicense: (input: {
      licenseId: string;
      days: 30 | 90 | 365;
      payment: Omit<Payment, "id" | "createdAt" | "licenseId">;
      actor: string;
    }) => {
      const lic = state.licenses.find((l) => l.id === input.licenseId);
      if (!lic) return;
      const base = new Date(lic.status === "expired" ? Date.now() : new Date(lic.expiresAt).getTime());
      base.setDate(base.getDate() + input.days);
      const newExpires = base.toISOString().slice(0, 10);
      lic.expiresAt = newExpires;
      lic.status = "active";
      const now = new Date().toISOString().replace("T", " ").slice(0, 16);
      const payment: Payment = {
        ...input.payment,
        id: `pay_${Date.now()}`,
        licenseId: lic.id,
        createdAt: now,
      };
      state.payments = [payment, ...state.payments];
      state.history = [
        {
          id: `h_${Date.now()}`,
          projectId: lic.projectId,
          action: "Activación de licencia",
          detail: `${lic.key} extendida ${input.days} días · ${payment.amount} ${payment.currency}`,
          actor: input.actor,
          createdAt: now,
        },
        ...state.history,
      ];
      persist();
      return newExpires;
    },
  };
}
