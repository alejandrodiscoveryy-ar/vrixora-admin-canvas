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
  PanelLeftClose,
  PanelLeftOpen,
  Monitor,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { ADMIN_PROJECT_TABS, MARKETPLACE_WORKSPACE_VIEWS, PRICING_WORKSPACE_VIEWS, adminNavTone, type AdminProjectNavItem } from "@/lib/admin-navigation";
import { SupabaseAuthProvider, useSupabaseAuth } from "@/lib/supabase-auth";
import { useProject, useProjectPermissions, useUserProjects } from "@/hooks/useProjects";
import type { ProjectPermission } from "@/lib/services";
import { projectIconVariantUrl } from "@/lib/project-icon-variants";

const PRICING_VIEWS = PRICING_WORKSPACE_VIEWS;
const DESKTOP_SIDEBAR_PREFERENCE = "vrixora-admin-sidebar-collapsed";

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
  const requestedView = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).vista,
  });
  const isLogin = path === "/admin/login" || path === "/admin";

  const projectRouteMatch = useMemo(
    () => path.match(/^\/admin\/proyectos\/([^/]+)(?:\/([^/]+))?/),
    [path],
  );
  const currentProjectId = projectRouteMatch?.[1] ?? null;
  const currentSection = projectRouteMatch?.[2] ?? "";
  const compactWorkspace = currentSection === "trabajos";
  // Solo el mapa operativo móvil elimina el espacio superior del contenedor general.
  const compactMobileMap = compactWorkspace && requestedView === "mapa";

  const { data: currentProject } = useProject(currentProjectId);
  const { data: projects = [], isLoading: projectsLoading } = useUserProjects(user?.id ?? null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(DESKTOP_SIDEBAR_PREFERENCE) === "true");
    } catch { /* storage may be unavailable */ }
  }, []);

  function toggleDesktopSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(DESKTOP_SIDEBAR_PREFERENCE, String(next));
    } catch { /* preference is optional */ }
  }

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
    <div
      className="admin-shell min-h-screen w-full bg-background"
      data-admin-reference-shell="graphite"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1920px]">
        <DesktopSidebar
          projects={projects}
          projectsLoading={projectsLoading}
          path={path}
          currentProjectId={currentProjectId}
          currentSection={currentSection}
          compact={compactWorkspace}
          collapsed={sidebarCollapsed}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            user={user}
            onMenuOpen={() => setMobileDrawerOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleDesktopSidebar}
            project={currentProject ?? null}
          />
          <main
            data-nav-tone={adminNavTone(currentSection)}
            className={`min-w-0 flex-1 px-3 sm:px-4 md:px-6 md:py-6 ${
              compactMobileMap ? "pt-1 pb-2 sm:py-4" : "py-4"
            } ${
              compactWorkspace ? "lg:px-5 lg:py-5" : "lg:px-8 lg:py-8"
            }`}
          >
            <div className={`mx-auto w-full ${compactWorkspace ? "max-w-none" : "max-w-[1480px]"}`}>
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

/** Shared icon treatment for the desktop rail and mobile drawer. */
function AdminNavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <span className="admin-nav-icon" aria-hidden="true"><Icon strokeWidth={2} /></span>;
}

function ProjectNavItem({
  project,
  currentProjectId,
  currentSection,
  path,
  closeDrawer,
  collapsed = false,
}: {
  project: {
    id: string;
    slug: string;
    name: string;
    description: string;
    status: string;
    iconUrl?: string | null;
  };
  currentProjectId: string | null;
  currentSection: string;
  path: string;
  closeDrawer?: () => void;
  collapsed?: boolean;
}) {
  const isActiveProject = project.id === currentProjectId;
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(isActiveProject);

  useEffect(() => {
    if (isActiveProject) {
      setExpanded(true);
    }
  }, [isActiveProject]);

  const { data: permissions = [] } = useProjectPermissions(project.id);

  const visibleTabs = ADMIN_PROJECT_TABS.reduce<AdminProjectNavItem[]>(
    (items, item) => {
      if ("children" in item) {
        const visibleChildren = item.children.filter((child) =>
          permissions.includes(child.permission),
        );

        if (visibleChildren.length > 0) {
          items.push({
            ...item,
            children: visibleChildren,
          });
        }

        return items;
      }

      if (permissions.includes(item.permission)) {
        items.push(item);
      }

      return items;
    },
    [],
  );

  const workspaceView = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).vista,
  });
  const pricingView = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).precio,
  });

  const projectBasePath = `/admin/proyectos/${project.id}`;

  return (
    <div className="space-y-1">
      <div
        className={`group flex items-center justify-between rounded-xl text-sm font-medium transition-all ${collapsed ? "p-1" : "px-3 py-2.5"} ${
          isActiveProject
            ? "bg-primary/10 text-primary ring-1 ring-primary/25 font-semibold shadow-xs"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        }`}
      >
        <Link
          to="/admin/proyectos/$id"
          params={{ id: project.id }}
          onClick={closeDrawer}
          title={project.name}
          className={`flex min-w-0 flex-1 items-center ${collapsed ? "justify-center" : "gap-3"}`}
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
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
              <FolderKanban className="h-5 w-5" />
            )}
          </span>
          <span className={collapsed ? "sr-only" : "truncate"}>{project.name}</span>
        </Link>
        {!collapsed && <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="grid min-h-11 w-7 shrink-0 place-items-center rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label={expanded ? "Contraer proyecto" : "Expandir proyecto"}
          aria-expanded={expanded}
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          />
        </button>}
      </div>

      {(collapsed ? isActiveProject : expanded) && visibleTabs.length > 0 && (
        <div data-nav-nested className="ml-1 pl-1 border-l border-border/60 space-y-1 my-1">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;

            // Areas de Trabajos: mismo panel, URL navegable y sin barra horizontal.
            if (tab.slug === "trabajos") {
              const groupActive = isActiveProject && currentSection === "trabajos";
              return (
                <div key="trabajos" className="space-y-1">
                  <details className="group/workspace" open={groupActive || undefined}>
                    <summary title="Trabajos" data-nav-tone="trabajos" data-nav-active={groupActive ? "true" : undefined} className="admin-nav-item admin-nav-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <AdminNavIcon icon={Icon} />
                      <span data-nav-label className="min-w-0 flex-1 break-words">Trabajos</span>
                      <ChevronRight data-nav-chevron className="h-3.5 w-3.5 shrink-0 transition-transform group-open/workspace:rotate-90" />
                    </summary>
                    <div data-nav-nested className="ml-2 mt-1 space-y-1 border-l border-border/60 pl-1.5" aria-label="Vistas de Trabajos">
                      {MARKETPLACE_WORKSPACE_VIEWS.filter((view) => permissions.includes(view.permission)).map((view) => {
                        const ViewIcon = view.icon;
                        const viewActive = groupActive && (workspaceView === view.slug || (!workspaceView && view.slug === "resumen"));
                        return (
                          <Link
                            key={view.slug}
                            to="/admin/proyectos/$id/$section"
                            params={{ id: project.id, section: "trabajos" }}
                            search={{ vista: view.slug }}
                            title={view.label}
                            onClick={closeDrawer}
                            aria-current={viewActive ? "page" : undefined}
                            data-nav-tone={view.slug === "billeteras" || view.slug === "recargas" ? "finanzas" : "trabajos"}
                            data-nav-active={viewActive ? "true" : undefined}
                            className="admin-nav-item admin-nav-secondary"
                          >
                            <AdminNavIcon icon={ViewIcon} />
                            <span data-nav-label className="min-w-0 flex-1 break-words">{view.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                </div>
              );
            }

            // El centro de precios comparte el patrón de expansión de Administración.
            // La ruta /planes conserva compatibilidad con enlaces previos.
            if (tab.slug === "planes" && project.slug === "tuktuk-control") {
              const groupActive = isActiveProject && currentSection === "planes";
              return (
                <div key="centro-precios" className="space-y-1">
                  <details open={groupActive || undefined} className="group/admin">
                    <summary
                      title="Centro de precios"
                      onClick={() => {
                        if (!groupActive) {
                          void navigate({ to: "/admin/proyectos/$id/$section", params: { id: project.id, section: "planes" }, search: { precio: "global" } });
                          closeDrawer?.();
                        }
                      }}
                      data-nav-tone="tarifas"
                      data-nav-active={groupActive ? "true" : undefined}
                      className="admin-nav-item admin-nav-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                    >
                      <AdminNavIcon icon={Icon} />
                      <span data-nav-label className="min-w-0 flex-1 break-words">Centro de precios</span>
                      <ChevronRight data-nav-chevron className="h-3.5 w-3.5 shrink-0 transition-transform group-open/admin:rotate-90" />
                    </summary>
                    <div data-nav-nested className="ml-2 mt-1 space-y-1 border-l border-border/60 pl-1.5" aria-label="Vistas del Centro de precios">
                      {PRICING_VIEWS.map((view) => {
                        const ViewIcon = view.icon;
                        const selected = groupActive && (pricingView === view.code || (!pricingView && view.code === "global"));
                        return (
                          <Link
                            key={view.code}
                            to="/admin/proyectos/$id/$section"
                            params={{ id: project.id, section: "planes" }}
                            search={{ precio: view.code }}
                            title={view.label}
                            onClick={closeDrawer}
                            aria-current={selected ? "page" : undefined}
                            data-nav-tone="tarifas"
                            data-nav-active={selected ? "true" : undefined}
                            className="admin-nav-item admin-nav-secondary"
                          >
                            <AdminNavIcon icon={ViewIcon} />
                            <span data-nav-label className="min-w-0 flex-1 break-words">{view.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                </div>
              );
            }

            if ("children" in tab) {
              const groupActive = tab.children.some((child) => {
                const childPath = `${projectBasePath}/${child.slug}`;

                return (
                  path === childPath ||
                  path === `${childPath}/` ||
                  path.startsWith(`${childPath}/`)
                );
              });

              return (
                <div key={tab.slug} className="space-y-1">
                  <details open={groupActive || undefined} className="group/admin">
                    <summary
                      title={tab.label}
                      data-nav-tone={adminNavTone(tab.slug)}
                      data-nav-active={groupActive ? "true" : undefined}
                      className="admin-nav-item admin-nav-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                    >
                      <AdminNavIcon icon={Icon} />
                      <span data-nav-label className="min-w-0 flex-1 break-words">{tab.label}</span>
                      <ChevronRight data-nav-chevron className="h-3.5 w-3.5 shrink-0 transition-transform group-open/admin:rotate-90" />
                    </summary>

                    <div data-nav-nested className="ml-2 mt-1 space-y-1 border-l border-border/60 pl-1.5">
                      {tab.children.map((child) => {
                        const ChildIcon = child.icon;
                        const childPath = `${projectBasePath}/${child.slug}`;
                        const childActive =
                          path === childPath ||
                          path === `${childPath}/` ||
                          path.startsWith(`${childPath}/`);

                        return (
                          <Link
                            key={child.slug}
                            to="/admin/proyectos/$id/$section"
                            params={{
                              id: project.id,
                              section: child.slug,
                            }}
                            title={child.label}
                            onClick={closeDrawer}
                            aria-current={childActive ? "page" : undefined}
                            data-nav-tone={adminNavTone(tab.slug)}
                            data-nav-active={childActive ? "true" : undefined}
                            className="admin-nav-item admin-nav-secondary"
                          >
                            <AdminNavIcon icon={ChildIcon} />
                            <span data-nav-label className="min-w-0 flex-1 break-words">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                </div>
              );
            }

            const to = tab.slug ? `${projectBasePath}/${tab.slug}` : projectBasePath;
            const active = tab.slug
              ? path === to || path === `${to}/` || path.startsWith(`${to}/`)
              : path === projectBasePath || path === `${projectBasePath}/`;

            return (
              <Link
                key={tab.slug || "resumen"}
                to={tab.slug ? "/admin/proyectos/$id/$section" : "/admin/proyectos/$id"}
                params={tab.slug ? { id: project.id, section: tab.slug } : { id: project.id }}
                title={tab.label}
                onClick={closeDrawer}
                aria-current={active ? "page" : undefined}
                data-nav-tone={adminNavTone(tab.slug)}
                data-nav-active={active ? "true" : undefined}
                className="admin-nav-item admin-nav-primary"
              >
                <AdminNavIcon icon={Icon} />
                <span data-nav-label className="min-w-0 flex-1 break-words">{tab.label}</span>
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
  compact,
  collapsed,
}: {
  projects: Awaited<ReturnType<typeof useUserProjects>>["data"] | undefined;
  projectsLoading: boolean;
  path: string;
  currentProjectId: string | null;
  currentSection: string;
  compact: boolean;
  collapsed: boolean;
}) {
  return (
        <aside
      id="admin-desktop-sidebar"
      aria-label="Navegación principal"
      data-state={collapsed ? "collapsed" : "expanded"}
      className={`hidden shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-xl transition-[width] duration-200 motion-reduce:transition-none lg:flex ${
        collapsed ? "w-16" : compact ? "w-[232px]" : "w-[272px]"
      }`}
    >
            <div
        className={`border-b border-sidebar-border/80 ${
          collapsed ? "px-2 py-4" : compact ? "px-3.5 py-4" : "px-5 py-5"
        }`}
      >
        <Link to="/admin/proyectos" title="VRIXORA · Centro de control" aria-label="VRIXORA · Centro de control" className={`flex items-center ${collapsed ? "justify-center" : compact ? "gap-2.5" : "gap-3"}`}>
                    <div
            className={`flex items-center justify-center rounded-xl bg-black ring-1 ring-primary/30 shadow-[0_0_24px_-8px_var(--primary)] ${
              collapsed || compact ? "h-9 w-9" : "h-11 w-11"
            }`}
          >
            <VrixoraLogo variant="mark" size={compact ? 24 : 28} />
          </div>
          <div className={collapsed ? "sr-only" : "min-w-0"}>
            <div className="text-sm font-semibold tracking-[0.22em] text-gradient">VRIXORA</div>
            <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Centro de control
            </div>
          </div>
        </Link>
      </div>

            <nav
        className={`flex-1 space-y-1 overflow-y-auto ${
          collapsed ? "overflow-x-hidden p-2 [&_[data-nav-nested]]:ml-0 [&_[data-nav-nested]]:border-0 [&_[data-nav-nested]]:pl-0 [&_[data-nav-label]]:sr-only [&_[data-nav-chevron]]:hidden [&_summary]:justify-center [&_summary]:gap-0 [&_summary]:px-1 [&_[data-nav-nested]_a]:justify-center [&_[data-nav-nested]_a]:gap-0 [&_[data-nav-nested]_a]:px-1" : compact ? "p-2.5" : "p-3.5"
        }`}
      >
        <DesktopLink
          to="/admin/proyectos"
          icon={LayoutDashboard}
          label="Proyectos"
          active={path === "/admin/proyectos"}
          collapsed={collapsed}
        />
                <div
          className={`px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 ${
            collapsed ? "sr-only" : compact ? "mb-2 mt-4" : "mb-2.5 mt-7"
          }`}
        >
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
              collapsed={collapsed}
            />
          ))
        )}
      </nav>

            <div
        className={`border-t border-sidebar-border/80 ${
          collapsed ? "p-2" : compact ? "p-2.5" : "p-3.5"
        }`}
      >
        {collapsed ? (
          <div title="Sistema operativo" aria-label="Sistema operativo" className="flex h-10 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </div>
        ) : (
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
            <Activity className="h-3.5 w-3.5" />
            Sistema operativo
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Datos sincronizados con Supabase
          </p>
        </div>
        )}
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
        data-admin-reference-drawer="graphite"
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
  onMenuOpen,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  user: NonNullable<ReturnType<typeof useSupabaseAuth>["user"]>;
  project: Awaited<ReturnType<typeof useProject>>["data"] | null;
  onMenuOpen: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
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
    <header className="sticky top-0 z-30 flex min-h-12 items-center gap-2 border-b border-border/70 bg-background px-3 py-1 backdrop-blur-none sm:px-4 md:bg-background/86 md:px-6 md:backdrop-blur-xl lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Abrir navegación"
        onClick={onMenuOpen}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden shrink-0 text-muted-foreground hover:text-foreground lg:inline-flex"
        aria-controls="admin-desktop-sidebar"
        aria-expanded={!sidebarCollapsed}
        aria-label={sidebarCollapsed ? "Desplegar menú lateral" : "Contraer menú lateral"}
        title={sidebarCollapsed ? "Desplegar menú lateral" : "Contraer menú lateral"}
        onClick={onToggleSidebar}
      >
        {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
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

      <div className="ml-auto flex items-center gap-3">
        {/* Operations badge is securely mounted by the authorized project layout. */}
        <span id="vrixora-admin-operational-alarm-slot" className="inline-flex shrink-0 items-center" />
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
  collapsed,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      to={to}
      title={label}
      aria-current={active ? "page" : undefined}
      data-nav-tone="panel"
      data-nav-active={active ? "true" : undefined}
      className="admin-nav-item admin-nav-primary group"
    >
      <AdminNavIcon icon={Icon} />
      <span className={collapsed ? "sr-only" : "truncate"}>{label}</span>
      {!collapsed && <ChevronRight
        className={`ml-auto h-3.5 w-3.5 transition-all ${
          active
            ? "translate-x-0 opacity-100"
            : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60"
        }`}
      />}
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
        title={label}
        aria-current={active ? "page" : undefined}
        data-nav-tone="panel"
        data-nav-active={active ? "true" : undefined}
        className="admin-nav-item admin-nav-primary"
      >
        <AdminNavIcon icon={Icon} />
        <span className="min-w-0 flex-1 break-words">{label}</span>
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
