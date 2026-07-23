// DEMO AUTH — temporary role switcher. Replace with Supabase Auth later.
// The entire content of this file can be deleted once real auth is wired.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEMO_USERS, type DemoUser } from "./mock-data";

type Ctx = {
  user: DemoUser | null;
  setUserId: (id: string | null) => void;
  users: DemoUser[];
};

const AuthCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "vrixora_demo_user";

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    setUserIdState(stored);
    setHydrated(true);
  }, []);

  const setUserId = (id: string | null) => {
    setUserIdState(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  const user = hydrated ? DEMO_USERS.find((u) => u.id === userId) ?? null : null;

  return (
    <AuthCtx.Provider value={{ user, setUserId, users: DEMO_USERS }}>{children}</AuthCtx.Provider>
  );
}

export function useDemoAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useDemoAuth must be used inside DemoAuthProvider");
  return ctx;
}
