import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { DemoAuthProvider, useDemoAuth } from "@/lib/demo-auth";
import { visibleProjects } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Sparkles, LogOut, LayoutDashboard, FolderKanban } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Vrixora Admin Panel" },
      { name: "description", content: "Panel administrativo interno de Vrixora — prototipo de demostración." },
      { property: "og:title", content: "Vrixora Admin Panel" },
      { property: "og:description", content: "Prototipo visual del área administrativa de Vrixora." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <DemoAuthProvider>
      <AdminChrome />
      <Toaster richColors position="top-right" />
    </DemoAuthProvider>
  );
}

function AdminChrome() {
  const { user } = useDemoAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isLogin = path === "/admin/login" || path === "/admin";

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
  const { user } = useDemoAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!user) return null;
  const projects = visibleProjects(user);

  const NavLink = ({ to, icon: Icon, label, active }: { to: string; icon: typeof Sparkles; label: string; active: boolean }) => (
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
        <Link to="/admin/proyectos" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gradient">Vrixora</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin panel</div>
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
        {projects.map((p) => (
          <NavLink
            key={p.id}
            to={"/admin/proyectos/$id"}
            icon={FolderKanban}
            label={p.name}
            active={path.startsWith(`/admin/proyectos/${p.id}`)}
          />
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <Badge variant="outline" className="w-full justify-center text-[10px] uppercase tracking-widest">
          Datos de demostración
        </Badge>
      </div>
    </aside>
  );
}

function TopBar() {
  const { user, users, setUserId } = useDemoAuth();
  const navigate = useNavigate();

  return (
    <header className="h-14 border-b bg-card/40 backdrop-blur flex items-center gap-3 px-4 md:px-6">
      <div className="text-xs text-muted-foreground hidden md:block">
        Modo prototipo — selector temporal de usuario
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Select value={user?.id ?? ""} onValueChange={(v) => setUserId(v)}>
          <SelectTrigger className="w-[220px] h-9">
            <SelectValue placeholder="Selecciona usuario" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                <span className="flex items-center gap-2">
                  <Badge variant={u.role === "owner" ? "default" : "secondary"} className="text-[10px]">
                    {u.role}
                  </Badge>
                  {u.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setUserId(null);
            navigate({ to: "/admin/login" });
          }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Salir
        </Button>
      </div>
    </header>
  );
}
