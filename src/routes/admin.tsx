import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { SupabaseAuthProvider, useSupabaseAuth } from "@/lib/supabase-auth";
import { useUserProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Activity,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { VrixoraLogo } from "@/components/brand/VrixoraLogo";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
    <div className="admin-shell min-h-screen flex w-full">
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="min-w-0 flex-1 px-3 py-5 sm:px-6 md:px-8 md:py-8 lg:px-10">
          <div className="mx-auto w-full max-w-[1480px]">
            <Outlet />
          </div>
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

  const NavLink = ({
    to,
    icon: Icon,
    label,
    active,
  }: {
    to: string;
    icon: LucideIcon;
    label: string;
    active: boolean;
  }) => (
    <Link
      to={to}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "bg-primary/10 text-primary ring-1 ring-primary/20"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
      }`}
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
          active ? "bg-primary/15" : "bg-sidebar-accent/50 group-hover:bg-sidebar-accent"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate">{label}</span>
      <ChevronRight
        className={`ml-auto h-3.5 w-3.5 transition-all ${
          active
            ? "translate-x-0 opacity-100"
            : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60"
        }`}
      />
    </Link>
  );

  return (
    <aside className="hidden md:flex w-[272px] shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-xl">
      <div className="px-5 py-5 border-b border-sidebar-border/80">
        <Link to="/admin/proyectos" className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-black flex items-center justify-center ring-1 ring-primary/30 shadow-[0_0_24px_-8px_var(--primary)]">
            <VrixoraLogo variant="mark" size={28} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[0.22em] text-gradient">VRIXORA</div>
            <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Centro de control
            </div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 p-3.5 space-y-1">
        <NavLink
          to="/admin/proyectos"
          icon={LayoutDashboard}
          label="Proyectos"
          active={path === "/admin/proyectos"}
        />
        <div className="mt-7 mb-2.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          Espacios de trabajo
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          projects.map((p) => (
            <NavLink
              key={p.id}
              to={`/admin/proyectos/${p.id}`}
              icon={FolderKanban}
              label={p.name}
              active={path.startsWith(`/admin/proyectos/${p.id}`)}
            />
          ))
        )}
      </nav>
      <div className="p-3.5 border-t border-sidebar-border/80">
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
            <Activity className="h-3.5 w-3.5" />
            Sistema operativo
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Datos sincronizados con Supabase
          </p>
        </div>
      </div>
    </aside>
  );
}

function MobileNav() {
  const { user } = useSupabaseAuth();
  const { data: projects = [], isLoading } = useUserProjects(user?.id ?? null);
  const path = useRouterState({ select: (state) => state.location.pathname });

  if (!user) return null;

  const linkClass = (active: boolean) =>
    `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
      active ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground"
    }`;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir navegación">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col p-0">
        <SheetHeader className="border-b border-sidebar-border/80 px-5 py-5 text-left">
          <SheetTitle className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-black ring-1 ring-primary/30">
              <VrixoraLogo variant="mark" size={25} />
            </span>
            <span className="text-gradient text-sm tracking-[0.2em]">VRIXORA</span>
          </SheetTitle>
          <SheetDescription>Centro de control</SheetDescription>
        </SheetHeader>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <SheetClose asChild>
            <Link to="/admin/proyectos" className={linkClass(path === "/admin/proyectos")}>
              <LayoutDashboard className="h-4 w-4" />
              Proyectos
            </Link>
          </SheetClose>
          <div className="px-3 pb-1 pt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Espacios de trabajo
          </div>
          {isLoading ? (
            <Loader2 className="mx-auto my-5 h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            projects.map((project) => (
              <SheetClose asChild key={project.id}>
                <Link
                  to="/admin/proyectos/$id"
                  params={{ id: project.id }}
                  className={linkClass(path.startsWith(`/admin/proyectos/${project.id}`))}
                >
                  <FolderKanban className="h-4 w-4" />
                  <span className="truncate">{project.name}</span>
                </Link>
              </SheetClose>
            ))
          )}
        </nav>
        <div className="border-t border-sidebar-border/80 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
            <Avatar className="h-9 w-9 border border-primary/20">
              <AvatarImage
                src={user.avatarUrl ?? undefined}
                alt={user.name}
                referrerPolicy="no-referrer"
              />
              <AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TopBar() {
  const { user, signOut } = useSupabaseAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-4 md:px-6 lg:px-8">
      <MobileNav />
      <Link to="/admin/proyectos" className="mr-1 flex items-center gap-2 md:hidden">
        <VrixoraLogo variant="mark" size={24} />
        <span className="text-gradient text-xs font-semibold tracking-[0.16em]">VRIXORA</span>
      </Link>
      <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span>Administración segura</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-1.5">
          <Avatar className="h-8 w-8 border border-primary/20">
            <AvatarImage
              src={user.avatarUrl ?? undefined}
              alt={user.name}
              referrerPolicy="no-referrer"
            />
            <AvatarFallback className="bg-primary/10 text-[11px] font-semibold uppercase text-primary">
              {user.name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <div className="max-w-48 truncate text-xs font-medium text-foreground">{user.name}</div>
            <div className="max-w-48 truncate text-[10px] text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="px-2 text-muted-foreground hover:text-foreground sm:px-3"
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? (
            <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
          ) : (
            <LogOut className="h-4 w-4 sm:mr-2" />
          )}
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}

import React from "react";
