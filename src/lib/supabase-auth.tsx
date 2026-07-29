import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabaseClient } from "./supabase";
import type { AuthSession } from "@supabase/supabase-js";

type AuthCtx = {
  session: AuthSession | null;
  user: { id: string; email: string; name: string; avatarUrl: string | null } | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);
const STORAGE_KEY = "vrixora_auth_session";

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const client = getSupabaseClient();

        // Recuperar sesión almacenada
        const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            // Validar que la sesión sea válida en Supabase
            const { data } = await client.auth.getSession();
            if (data.session) {
              setSession(data.session);
            } else {
              // Si no hay sesión en Supabase, limpiar storage
              localStorage.removeItem(STORAGE_KEY);
            }
          } catch {
            localStorage.removeItem(STORAGE_KEY);
          }
        } else {
          // Obtener sesión actual de Supabase
          const { data } = await client.auth.getSession();
          if (data.session) {
            setSession(data.session);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.session));
          }
        }

        // Escuchar cambios de autenticación
        const {
          data: { subscription },
        } = client.auth.onAuthStateChange((event, newSession) => {
          setSession(newSession);
          if (newSession) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        });

        return () => subscription?.unsubscribe();
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      const client = getSupabaseClient();
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/admin/proyectos`,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      const client = getSupabaseClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setSession(null);
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email || "",
        name: session.user.user_metadata?.full_name || session.user.email || "User",
        avatarUrl:
          session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
      }
    : null;

  return (
    <AuthContext.Provider value={{ session, user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useSupabaseAuth must be used inside SupabaseAuthProvider");
  return ctx;
}
