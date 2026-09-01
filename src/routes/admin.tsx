import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { VrixoraLogo } from "@/components/brand/VrixoraLogo";
import { ADMIN_PROJECT_TABS } from "@/lib/admin-navigation";
import { SupabaseAuthProvider, useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectPermissions, useUserProjects } from "@/hooks/useProjects";
import type { ProjectPermission } from "@/lib/services";
import { projectIconVariantUrl } from "@/lib/project-icon-variants";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "VRIXORA Centro de Control" },
      { name: "description", content: "Panel administrativo interno de VRIXORA." },
      { property: "og:title", content: "VRIXORA Centro de Control" },
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
  const path = useRouterState({ select: (state) => state.location.pathname });
  const isLogin = path === "/admin/login" || path === "/admin";

  const projectRouteMatch = useMemo(
    () => path.match(/^\/admin\/proyectos\/([^/]+)(?:\/([^/]+))?/),
    [path],
  );
  const currentProjectId = projectRouteMatch?.[1] ?? null;
  const currentSection = projectRouteMatch?.[2] ?? "";

  const { data: currentProject } = useProject(currentProjectId);
  const { data: projects = [], isLoading: projectsLoading } = useUserProjects(user?.id ?? null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user && !isLogin) {
      navigate({ to: "/admin/login" });
    }
  }, [user, loading, isLogin, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLogin || !user) {
    return <Outlet />;
  }

  return (
    <div className="admin-shell min-h-screen w-full bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-[1920px]">
        <DesktopSidebar
          projects={projects}
          projectsLoading={projectsLoading}
          path={path}
          currentProjectId={currentProjectId}
          currentSection={currentSection}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            user={user}
            onMenuOpen={() => setMobileDrawerOpen(true)}
            project={currentProject ?? null}
            section={currentSection}
          />
          <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[1480px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <MobileDrawer
        open={mobileDrawerOpen}
        onOpenChange={setMobileDrawerOpen}
        user={user}
        projects={projects}
        projectsLoading={projectsLoading}
        path={path}
        currentProjectId={currentProjectId}
        currentSection={currentSection}
      />
    </div>
  );
}

function ProjectNavItem({
  project,
  currentProjectId,
  currentSection,
  path,
  closeDrawer,
}: {
  project: {
    id: string;
    name: string;
    description: string;
    status: string;
    iconUrl?: string | null;
  };
  currentProjectId: string | null;
  currentSection: string;
  path: string;
  closeDrawer?: () => void;
}) {
  const isActiveProject = project.id === currentProjectId;
  const [expanded, setExpanded] = useState(isActiveProject);

  useEffect(() => {
    if (isActiveProject) {
      setExpanded(true);
    }
  }, [isActiveProject]);

  const { data: permissions = [] } = useProjectPermissions(project.id);
  const visibleTabs = ADMIN_PROJECT_TABS.filter((tab) => permissions.includes(tab.permission));

  const projectBasePath = `/admin/proyectos/${project.id}`;

  return (
    <div className="space-y-1">
      <div
        className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
          isActiveProject
            ? "bg-primary/10 text-primary ring-1 ring-primary/25 font-semibold shadow-xs"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        }`}
      >
        <Link
          to="/admin/proyectos/$id"
          params={{ id: project.id }}
          onClick={closeDrawer}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${
              isActiveProject
                ? "bg-primary/15 text-primary"
                : "bg-sidebar-accent/50 group-hover:bg-sidebar-accent"
            }`}
          >
            {project.iconUrl ? (
              <img
                src={projectIconVariantUrl(project.iconUrl, "pwa-192.png")}
                alt=""
                className="h-6 w-6 rounded-md object-contain"
              />
            ) : (
              <FolderKanban className="h-4 w-4" />
            )}
          </span>
          <span className="truncate">{project.name}</span>
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Expandir proyecto"
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          />
        </button>
      </div>

      {expanded && visibleTabs.length > 0 && (
        <div className="ml-4 pl-3 border-l border-border/60 space-y-1 my-1">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const to = tab.slug ? `${projectBasePath}/${tab.slug}` : projectBasePath;
            const active = tab.slug
              ? path === to || path === `${to}/` || path.startsWith(`${to}/`)
              : path === projectBasePath || path === `${projectBasePath}/`;

            return (
              <Link
                key={tab.slug || "resumen"}
                to={tab.slug ? "/admin/proyectos/$id/$section" : "/admin/proyectos/$id"}
                params={tab.slug ? { id: project.id, section: tab.slug } : { id: project.id }}
                onClick={closeDrawer}
                className={`flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "bg-primary/15 text-primary font-semibold ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DesktopSidebar({
  projects,
  projectsLoading,
  path,
  currentProjectId,
  currentSection,
}: {
  projects: Awaited<ReturnType<typeof useUserProjects>>["data"] | undefined;
  projectsLoading: boolean;
  path: string;
  currentProjectId: string | null;
  currentSection: string;
}) {
  return (
    <aside className="hidden w-[272px] shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-xl lg:flex">
      <div className="border-b border-sidebar-border/80 px-5 py-5">
        <Link to="/admin/proyectos" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black ring-1 ring-primary/30 shadow-[0_0_24px_-8px_var(--primary)]">
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

      <nav className="flex-1 space-y-1 p-3.5 overflow-y-auto">
        <DesktopLink
          to="/admin/proyectos"
          icon={LayoutDashboard}
          label="Proyectos"
          active={path === "/admin/proyectos"}
        />
        <div className="mb-2.5 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          Espacios de trabajo
        </div>
        {projectsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          projects?.map((project) => (
            <ProjectNavItem
              key={project.id}
              project={project}
              currentProjectId={currentProjectId}
              currentSection={currentSection}
              path={path}
            />
          ))
        )}
      </nav>

      <div className="border-t border-sidebar-border/80 p-3.5">
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

function MobileDrawer({
  open,
  onOpenChange,
  user,
  projects,
  projectsLoading,
  path,
  currentProjectId,
  currentSection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: NonNullable<ReturnType<typeof useSupabaseAuth>["user"]>;
  projects: Awaited<ReturnType<typeof useUserProjects>>["data"] | undefined;
  projectsLoading: boolean;
  path: string;
  currentProjectId: string | null;
  currentSection: string;
}) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useSupabaseAuth();

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      onOpenChange(false);
      navigate({ to: "/admin/login" });
    } catch (error) {
      console.error("Sign out error:", error);
      setIsSigningOut(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[82vw] max-w-[22rem] p-0 max-md:pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <SheetHeader className="border-b border-sidebar-border/80 px-5 pb-4 pt-5 text-left">
          <SheetTitle className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black ring-1 ring-primary/30">
              <VrixoraLogo variant="mark" size={25} />
            </span>
            <span className="text-gradient text-sm tracking-[0.2em]">VRIXORA</span>
          </SheetTitle>
          <SheetDescription>Centro de control móvil</SheetDescription>
        </SheetHeader>

        <nav className="flex max-h-[calc(100dvh-14rem)] flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          <DrawerLink
            to="/admin/proyectos"
            icon={LayoutDashboard}
            label="Proyectos"
            active={path === "/admin/proyectos"}
            closeDrawer={() => onOpenChange(false)}
          />

          <div className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Espacios de trabajo
          </div>
          {projectsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            projects?.map((item) => (
              <ProjectNavItem
                key={item.id}
                project={item}
                currentProjectId={currentProjectId}
                currentSection={currentSection}
                path={path}
                closeDrawer={() => onOpenChange(false)}
              />
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

          <Button
            variant="ghost"
            className="mt-3 w-full justify-start"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Cerrar sesión
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TopBar({
  user,
  project,
  section,
  onMenuOpen,
}: {
  user: NonNullable<ReturnType<typeof useSupabaseAuth>["user"]>;
  project: Awaited<ReturnType<typeof useProject>>["data"] | null;
  section: string;
  onMenuOpen: () => void;
}) {
  const navigate = useNavigate();
  const { signOut } = useSupabaseAuth();
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

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-border/70 bg-background px-3 py-2 backdrop-blur-none sm:px-4 md:bg-background/86 md:px-6 md:backdrop-blur-xl lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Abrir navegación"
        onClick={onMenuOpen}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Link to="/admin/proyectos" className="flex min-w-0 items-center gap-2 lg:hidden">
        {project?.iconUrl ? (
          <img
            src={projectIconVariantUrl(project.iconUrl, "pwa-192.png")}
            alt=""
            className="h-7 w-7 rounded-lg object-contain"
          />
        ) : (
          <VrixoraLogo variant="mark" size={24} />
        )}
        <div className="min-w-0">
          <span className="block truncate text-xs font-semibold tracking-[0.16em] text-gradient">
            VRIXORA
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {project?.name ?? "Centro de control"}
          </span>
        </div>
      </Link>

      <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground lg:flex">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span>Administración segura</span>
        {project ? <span className="text-border">/</span> : null}
        {project ? (
          <>
            {project.iconUrl ? (
              <img
                src={projectIconVariantUrl(project.iconUrl, "pwa-192.png")}
                alt=""
                className="h-5 w-5 rounded-md object-contain"
              />
            ) : null}
            <span className="truncate text-foreground">{project.name}</span>
          </>
        ) : null}
        {project ? (
          <Badge variant={project.status === "active" ? "default" : "secondary"} className="ml-1">
            {project.status === "active" ? "Proyecto activo" : project.status}
          </Badge>
        ) : null}
      </div>

      {section ? (
        <div className="hidden rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground lg:inline-flex">
          {section}
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <div className="hidden items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-3 py-1.5 sm:flex">
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
          <span className="hidden sm:inline">Cerrar sesión</span>
        </Button>
      </div>
    </header>
  );
}

function DesktopLink({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
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
}

function DrawerLink({
  to,
  icon: Icon,
  label,
  active,
  closeDrawer,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  closeDrawer: () => void;
}) {
  return (
    <SheetClose asChild>
      <Link
        to={to}
        onClick={closeDrawer}
        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
          active
            ? "bg-primary/10 text-primary ring-1 ring-primary/20"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="truncate">{label}</span>
      </Link>
    </SheetClose>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("vrixora-admin-theme") as "light" | "dark" | "system") || "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (currentTheme: "light" | "dark" | "system") => {
      let isDark = false;
      if (currentTheme === "dark") {
        isDark = true;
      } else if (currentTheme === "light") {
        isDark = false;
      } else {
        isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      }
      root.classList.toggle("dark", isDark);
    };

    applyTheme(theme);
    localStorage.setItem("vrixora-admin-theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Cambiar tema"
          title="Cambiar tema"
        >
          {theme === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : theme === "light" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            Claro
          </span>
          {theme === "light" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            Oscuro
          </span>
          {theme === "dark" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Sistema
          </span>
          {theme === "system" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
