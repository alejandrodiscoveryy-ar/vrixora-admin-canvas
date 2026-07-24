import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { SupabaseAuthProvider, useSupabaseAuth } from "@/lib/supabase-auth";
import { useUserProjects } from "@/hooks/useProjects";
import { CLIENTS, LICENSES, PAYMENTS } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { LogOut, LayoutDashboard, FolderKanban, Loader2, type LucideIcon } from "lucide-react";
import { VrixoraLogo } from "@/components/brand/VrixoraLogo";
import { useEffect } from "react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Vrixora Admin Panel" },
      { name: "description", content: "Panel administrativo interno de Vrixora." },
      { property: "og:title", content: "Vrixora Admin Panel" },
      { property: "og:description", content: "Panel administrativo de Vrixora." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <SupabaseAuthProvider>
      <AdminChrome />
      <Toaster richColors position="top-right" />
    </SupabaseAuthProvider>
  );
}

function AdminChrome() {
  const { user, loading } = useSupabaseAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isLogin = path === "/admin/login" || path === "/admin";

  useEffect(() => {
    if (!loading && !user && !isLogin) {
      navigate({ to: "/admin/login" });
    }
  }, [user, loading, isLogin, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLogin || !user) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen flex w-full">
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SideNav() {
  const { user } = useSupabaseAuth();
  const { data: projects = [], isLoading } = useUserProjects(user?.id ?? null);
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return null;

  const NavLink = ({ to, icon: Icon, label, active }: { to: string; icon: LucideIcon; label: string; active: boolean }) => (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="p-5 border-b border-sidebar-border">
        <Link to="/admin/proyectos" className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center ring-1 ring-primary/30">
            <VrixoraLogo variant="mark" size={28} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-widest text-gradient">VRIXORA</div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Admin panel</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <NavLink
          to="/admin/proyectos"
          icon={LayoutDashboard}
          label="Proyectos"
          active={path === "/admin/proyectos"}
        />
        <div className="mt-6 mb-2 px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          Accesos rápidos
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          projects.map((p) => (
            <NavLink
              key={p.id}
              to={"/admin/proyectos/$id"}
              icon={FolderKanban}
              label={p.name}
              active={path.startsWith(`/admin/proyectos/${p.id}`)}
            />
          ))
        )}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <Badge variant="outline" className="w-full justify-center text-[10px] uppercase tracking-widest">
          Datos en vivo
        </Badge>
      </div>
    </aside>
  );
}

function TopBar() {
  const { user, signOut } = useSupabaseAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      navigate({ to: "/admin/login" });
    } catch (error) {
      console.error("Sign out error:", error);
      setIsSigningOut(false);
    }
  };

  if (!user) return null;

  return (
    <header className="h-14 border-b bg-card/40 backdrop-blur flex items-center gap-3 px-4 md:px-6">
      <div className="text-xs text-muted-foreground hidden md:block">
        {user.email}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 mr-2" />
          )}
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}

import React from "react";
