import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabaseClient } from "./supabase";
import { savedAdminPushToken, unregisterAdminPush } from "./admin-push";
import type { AuthSession } from "@supabase/supabase-js";

type AuthCtx = {
  session: AuthSession | null;
  user: { id: string; email: string; name: string; avatarUrl: string | null } | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);
const LEGACY_STORAGE_KEY = "vrixora_auth_session";

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    const initializeAuth = async () => {
      try {
        const client = getSupabaseClient();

        // Supabase gestiona la persistencia de su propia sesión.
        // Retirar una única vez la copia antigua, que nunca se restauraba
        // como sesión válida y duplicaba los tokens en el navegador.
        try {
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          // Almacenamiento opcional o bloqueado: Auth sigue operativa.
        }

        const {
          data: { subscription: authSubscription },
        } = client.auth.onAuthStateChange((_event, nextSession) => {
          if (mounted) setSession(nextSession);
        });
        subscription = authSubscription;

        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (mounted) setSession(data.session);
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void initializeAuth();

    // La limpieza debe devolverse desde useEffect, no desde su función async.
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
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
      // Revocar el dispositivo antes de cerrar la sesion administrativa.
      if (savedAdminPushToken()) await unregisterAdminPush();
      const client = getSupabaseClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setSession(null);
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
