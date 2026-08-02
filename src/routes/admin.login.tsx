import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2 } from "lucide-react";
import { VrixoraLogo } from "@/components/brand/VrixoraLogo";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — VRIXORA Centro de Control" },
      { name: "description", content: "Acceso al panel administrativo de Vrixora." },
      { property: "og:title", content: "VRIXORA Centro de Control — Login" },
      { property: "og:description", content: "Acceso seguro al panel administrativo." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, signInWithGoogle } = useSupabaseAuth();
  const navigate = useNavigate();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !loading) {
      navigate({ to: "/admin/proyectos" });
    }
  }, [user, loading, navigate]);

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
      setIsSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4 mb-10">
          <div className="rounded-2xl p-2 bg-black brand-glow">
            <VrixoraLogo variant="mark" size={72} className="rounded-xl" />
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold tracking-tight text-gradient">VRIXORA</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-[0.4em] mt-1">
              Admin panel
            </div>
          </div>
        </div>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Iniciar sesión
            </CardTitle>
            <CardDescription>
              Accede con tu cuenta de Google para gestionar tus proyectos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
            <Button
              onClick={handleSignIn}
              disabled={isSigningIn || loading}
              className="w-full"
              size="lg"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4 mr-2"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continuar con Google
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Al iniciar sesión, aceptas los términos de servicio de Vrixora.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
