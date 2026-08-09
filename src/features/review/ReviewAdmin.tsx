import { useState } from "react";
import {
  Activity,
  BarChart3,
  CreditCard,
  Eye,
  FileKey2,
  Gauge,
  Menu,
  Megaphone,
  ScrollText,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { VrixoraLogo } from "@/components/brand/VrixoraLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminChartTooltipProps } from "@/lib/chart-theme";
import { reviewServices } from "@/lib/review/review-services";

const tabs = [
  ["", "Resumen", Gauge],
  ["clientes", "Clientes", Users],
  ["licencias", "Licencias", FileKey2],
  ["planes", "Planes y precios", Tags],
  ["pagos", "Pagos", CreditCard],
  ["comercial", "Comercial", Megaphone],
  ["empleados", "Empleados", ShieldCheck],
  ["rendimiento", "Rendimiento", BarChart3],
  ["configuracion", "Configuración", Settings2],
  ["auditoria", "Auditoría", ScrollText],
] as const;

export function ReviewAdmin({ token, section = "" }: { token: string; section?: string }) {
  const data = reviewServices.snapshot();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = tabs.find(([slug]) => slug === section) ?? tabs[0];

  return (
    <div className="admin-shell min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-[1920px]">
        <aside className="hidden w-[272px] shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar/95 lg:flex">
          <Brand />
          <ReviewNav token={token} active={current[0]} />
          <div className="border-t border-sidebar-border/80 p-3.5">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
                <Eye className="h-4 w-4" />
                Modo revisión
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Snapshot sanitizado · Solo lectura
              </p>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-border/70 bg-background/90 px-3 backdrop-blur-xl md:px-6">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Abrir navegación"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[86vw] max-w-sm p-0">
                <SheetHeader className="border-b p-5">
                  <SheetTitle>
                    <Brand compact />
                  </SheetTitle>
                </SheetHeader>
                <ReviewNav token={token} active={current[0]} mobile />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Auditoría visual segura
              </span>
              <Badge variant="outline">Solo lectura</Badge>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs font-medium">{data.project.name}</p>
              <p className="text-[10px] text-muted-foreground">Datos demostrativos</p>
            </div>
          </header>
          <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[1480px] space-y-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{current[1]}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vista de revisión externa con información completamente sanitizada.
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-card/60 p-1.5 lg:hidden">
                <ReviewTabs token={token} active={current[0]} />
              </div>
              <ReviewSection section={current[0]} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact ? "flex items-center gap-3" : "border-b border-sidebar-border/80 px-5 py-5"
      }
    >
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-black ring-1 ring-primary/30">
          <VrixoraLogo variant="mark" size={28} />
        </span>
        <span>
          <b className="text-gradient text-sm tracking-[.22em]">VRIXORA</b>
          <small className="block text-[9px] uppercase tracking-[.2em] text-muted-foreground">
            Centro de control
          </small>
        </span>
      </div>
    </div>
  );
}

function ReviewNav({
  token,
  active,
  mobile = false,
}: {
  token: string;
  active: string;
  mobile?: boolean;
}) {
  return (
    <nav className={mobile ? "space-y-1 p-4" : "flex-1 space-y-1 p-3.5"}>
      <ReviewTabs token={token} active={active} vertical />
    </nav>
  );
}

function ReviewTabs({
  token,
  active,
  vertical = false,
}: {
  token: string;
  active: string;
  vertical?: boolean;
}) {
  return (
    <>
      {tabs.map(([slug, label, Icon]) => (
        <a
          key={slug || "resumen"}
          href={`/review/${encodeURIComponent(token)}${slug ? `/${slug}` : ""}`}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${vertical ? "w-full" : "shrink-0"} ${active === slug ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </a>
      ))}
    </>
  );
}

function ReviewSection({ section }: { section: string }) {
  const d = reviewServices.snapshot();
  if (!section) return <Dashboard />;
  if (section === "clientes")
    return (
      <DataPanel
        title="Directorio de clientes"
        headers={["Cliente", "Correo", "WhatsApp", "Estado", "Plan"]}
        rows={d.clients}
      />
    );
  if (section === "licencias")
    return (
      <DataPanel
        title="Licencias"
        headers={["Clave demo", "Cliente", "Plan", "Estado", "Vencimiento"]}
        rows={d.licenses}
      />
    );
  if (section === "planes")
    return (
      <DataPanel
        title="Planes y precios"
        headers={["Plan", "Precio", "Duración", "Estado"]}
        rows={d.plans}
      />
    );
  if (section === "pagos")
    return (
      <DataPanel
        title="Pagos y recibos"
        headers={["Referencia", "Cliente", "Importe demo", "Método", "Estado", "Fecha"]}
        rows={d.payments}
      />
    );
  if (section === "comercial")
    return (
      <div className="grid gap-5 xl:grid-cols-2">
        <DataPanel
          title="Leads"
          headers={["Lead", "Origen", "Estado", "Responsable"]}
          rows={d.leads}
        />
        <DataPanel
          title="Campañas"
          headers={["Campaña", "Estado", "Leads", "Conversiones"]}
          rows={d.campaigns}
        />
      </div>
    );
  if (section === "empleados")
    return (
      <DataPanel
        title="Equipo"
        headers={["Empleado", "Correo", "Rol", "Estado"]}
        rows={d.members}
      />
    );
  if (section === "rendimiento") return <Performance />;
  if (section === "configuracion") return <Settings />;
  return (
    <DataPanel
      title="Registro de auditoría"
      headers={["Evento", "Actor", "Fecha", "Referencia"]}
      rows={d.audit}
    />
  );
}

function Dashboard() {
  const d = reviewServices.snapshot();
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {d.metrics.map(([label, value, trend]) => (
          <Card className="glass-panel" key={label}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-emerald-400">{trend}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Performance />
      <DataPanel
        title="Actividad reciente"
        headers={["Evento", "Actor", "Fecha", "Referencia"]}
        rows={d.audit}
      />
    </>
  );
}

function Performance() {
  const d = reviewServices.snapshot();
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-base">Actividad semanal</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...d.activity]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip {...adminChartTooltipProps} />
              <Bar dataKey="leads" name="Leads" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="payments" name="Pagos" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Settings() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ReadOnlyCard
        title="Proyecto"
        items={[
          ["Nombre", "VRIXORA Demo"],
          ["Estado", "Activo"],
          ["Moneda", "CUP"],
        ]}
      />
      <ReadOnlyCard
        title="Canales WhatsApp"
        items={[
          ["Atención", "+5350000100"],
          ["Pagos", "+5350000200"],
          ["Estado", "Activos"],
        ]}
      />
      <ReadOnlyCard
        title="Seguridad"
        items={[
          ["Modo", "Solo lectura"],
          ["Origen", "Snapshot sanitizado"],
          ["Escrituras", "Bloqueadas"],
        ]}
      />
    </div>
  );
}

function ReadOnlyCard({ title, items }: { title: string; items: string[][] }) {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(([key, value]) => (
          <div
            key={key}
            className="flex justify-between gap-4 border-b border-border/50 pb-2 text-sm"
          >
            <span className="text-muted-foreground">{key}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DataPanel({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: ReadonlyArray<ReadonlyArray<string>>;
}) {
  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Badge variant="secondary">{rows.length} registros</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={`${row[0]}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Cell value={cell} />
                    </TableCell>
                  ))}
                  <TableCell>
                    <DetailModal title={String(row[0])} values={row} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Cell({ value }: { value: string }) {
  const state = ["Activo", "Activa", "Confirmado", "Convertido"].includes(value)
    ? "default"
    : ["Inactivo", "Vencida", "Anulado", "Suspendida"].includes(value)
      ? "destructive"
      : null;
  return state ? (
    <Badge variant={state}>{value}</Badge>
  ) : (
    <span className="whitespace-nowrap">{value}</span>
  );
}

function DetailModal({ title, values }: { title: string; values: ReadonlyArray<string> }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye className="h-4 w-4" />
          Ver
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Vista demostrativa de solo lectura. No hay acciones disponibles.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {values.map((value, index) => (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm" key={index}>
              {value}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
