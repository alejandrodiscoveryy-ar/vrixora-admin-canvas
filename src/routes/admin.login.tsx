import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDemoAuth } from "@/lib/demo-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ShieldCheck, User, Users } from "lucide-react";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Vrixora Admin" },
      { name: "description", content: "Acceso al panel administrativo de Vrixora (prototipo)." },
      { property: "og:title", content: "Vrixora Admin — Login" },
      { property: "og:description", content: "Prototipo del acceso al panel administrativo." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { users, setUserId, user } = useDemoAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate({ to: "/admin/proyectos" });
  }, [user, navigate]);

  const enter = (id: string) => {
    setUserId(id);
    navigate({ to: "/admin/proyectos" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-2xl font-semibold text-gradient">Vrixora Admin</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">
              Prototipo de demostración
            </div>
          </div>
        </div>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Selector temporal de usuario
            </CardTitle>
            <CardDescription>
              Este selector reemplaza a Supabase Auth durante el prototipo. Podrá eliminarse sin
              tocar el resto de la interfaz.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {users.map((u) => {
              const isOwner = u.role === "owner";
              return (
                <button
                  key={u.id}
                  onMouseEnter={() => setSelected(u.id)}
                  onFocus={() => setSelected(u.id)}
                  onClick={() => enter(u.id)}
                  className={`text-left rounded-xl border p-4 transition-all ${
                    selected === u.id
                      ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {isOwner ? (
                      <Users className="h-4 w-4 text-primary" />
                    ) : (
                      <User className="h-4 w-4 text-accent" />
                    )}
                    <Badge variant={isOwner ? "default" : "secondary"}>{u.role}</Badge>
                  </div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{u.email}</div>
                  <div className="text-[11px] text-muted-foreground mt-3">
                    {isOwner
                      ? "Acceso total: proyectos, empleados, finanzas y configuración."
                      : `Proyectos asignados: ${u.projectIds.length}`}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <Badge variant="outline">Demostración</Badge>
          Datos simulados. No hay backend real, ni pagos, ni información de clientes.
          <Button variant="link" size="sm" className="text-xs" onClick={() => enter("u_owner")}>
            Entrar como Owner
          </Button>
        </div>
      </div>
    </div>
  );
}
