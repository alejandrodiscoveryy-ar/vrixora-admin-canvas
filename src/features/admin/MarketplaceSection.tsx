import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, Users, WalletCards, AlertTriangle } from "lucide-react";
import { supabaseServices } from "@/lib/services";
import { useProjectPermissions } from "@/hooks/useProjects";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { KpiGrid } from "@/components/admin/KpiGrid";
import { SectionCard } from "@/components/admin/SectionCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const label = (value: string | null) => ({ requested: "Pendiente", confirmed: "Confirmada", rejected: "Rechazada", active: "Activo", suspended: "Suspendido", incident: "Incidencia", trial_free: "Gratis", wallet_commission: "Billetera" }[value ?? ""] ?? value ?? "—");

export default function MarketplaceSection({ projectId }: { projectId: string }) {
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const [tab, setTab] = useState("resumen");
  const canCustomers = permissions.includes("customers.view");
  const canPayments = permissions.includes("payments.view");
  const canSettings = permissions.includes("settings.view");
  const overview = useQuery({ queryKey: ["marketplace-overview", projectId], queryFn: () => supabaseServices.marketplace.overview(projectId), refetchInterval: 30_000 });
  const jobs = useQuery({ queryKey: ["marketplace-jobs", projectId], queryFn: () => supabaseServices.marketplace.listJobs(projectId), enabled: tab === "trabajos" });
  const drivers = useQuery({ queryKey: ["marketplace-drivers", projectId], queryFn: () => supabaseServices.marketplace.listDrivers(projectId), enabled: tab === "conductores" });
  const customers = useQuery({ queryKey: ["marketplace-customers", projectId], queryFn: () => supabaseServices.marketplace.listCustomers(projectId), enabled: tab === "clientes" && canCustomers });
  const wallets = useQuery({ queryKey: ["marketplace-wallets", projectId], queryFn: () => supabaseServices.marketplace.listWallets(projectId), enabled: tab === "billeteras" && canPayments });
  const topups = useQuery({ queryKey: ["marketplace-topups", projectId], queryFn: () => supabaseServices.marketplace.listTopups(projectId), enabled: tab === "recargas" && canPayments });
  const incidents = useQuery({ queryKey: ["marketplace-incidents", projectId], queryFn: () => supabaseServices.marketplace.listIncidents(projectId), enabled: tab === "incidencias" });
  const settings = useQuery({ queryKey: ["marketplace-financial-settings", projectId], queryFn: () => supabaseServices.marketplace.financialSettings(projectId), enabled: tab === "configuracion" && canSettings });
  const data = overview.data;
  return <div className="space-y-5 sm:space-y-6"><ModuleHeader title="Trabajos" description="Operación de TukTuk Marketplace." icon={BriefcaseBusiness} module="pagos" />
    <Tabs value={tab} onValueChange={setTab}><TabsList className="h-auto w-full flex-wrap justify-start"><TabsTrigger value="resumen">Resumen</TabsTrigger><TabsTrigger value="trabajos">Trabajos</TabsTrigger><TabsTrigger value="conductores">Conductores</TabsTrigger>{canCustomers && <TabsTrigger value="clientes">Clientes</TabsTrigger>}{canPayments && <><TabsTrigger value="billeteras">Billeteras</TabsTrigger><TabsTrigger value="recargas">Recargas</TabsTrigger></>}<TabsTrigger value="incidencias">Incidencias</TabsTrigger>{canSettings && <TabsTrigger value="configuracion">Configuración</TabsTrigger>}</TabsList>
      <TabsContent value="resumen"><KpiGrid columns={4} density="compact"><MetricCard label="Conductores" value={data?.driversTotal ?? 0} icon={Users} module="pagos" isLoading={overview.isLoading}/><MetricCard label="Activos" value={data?.driversActive ?? 0} icon={Users} module="pagos"/><MetricCard label="En prueba" value={data?.driversTrialActive ?? 0} icon={BriefcaseBusiness} module="pagos"/><MetricCard label="Post-prueba activos" value={data?.driversPostTrialActive ?? 0} icon={WalletCards} module="pagos"/><MetricCard label="Trabajos publicados" value={data?.jobsPublished ?? 0} icon={BriefcaseBusiness} module="pagos"/><MetricCard label="Trabajos activos" value={data?.jobsActive ?? 0} icon={BriefcaseBusiness} module="pagos"/><MetricCard label="Incidencias abiertas" value={data?.jobsIncidentOpen ?? 0} icon={AlertTriangle} module="pagos"/>{data?.pendingTopups !== null && <MetricCard label="Recargas pendientes" value={data?.pendingTopups ?? 0} icon={WalletCards} module="pagos"/>}</KpiGrid></TabsContent>
      <TabsContent value="trabajos"><List title="Trabajos" loading={jobs.isLoading} empty="No hay trabajos.">{jobs.data?.map(x=><Row key={x.jobId} title={`${x.originText} → ${x.destinationText}`} detail={`${label(x.status)} · ${x.finalPrice} ${x.currency}${x.driverDisplayName ? ` · ${x.driverDisplayName}` : ""}`}/>)}</List></TabsContent>
      <TabsContent value="conductores"><List title="Conductores" loading={drivers.isLoading} empty="No hay conductores.">{drivers.data?.map(x=><Row key={x.userId} title={x.displayName} detail={`${label(x.status)} · ${x.vehicleName ?? "Sin vehículo"} · ${x.isAvailable ? "Disponible" : "No disponible"}`}/>)}</List></TabsContent>
      {canCustomers && <TabsContent value="clientes"><List title="Clientes" loading={customers.isLoading} empty="No hay clientes.">{customers.data?.map(x=><Row key={x.customerId} title={x.displayName} detail={`${x.whatsappPhone} · ${x.jobsTotal} trabajos`}/>)}</List></TabsContent>}
      {canPayments && <><TabsContent value="billeteras"><List title="Billeteras" loading={wallets.isLoading} empty="No hay billeteras.">{wallets.data?.map(x=><Row key={x.userId} title={x.driverDisplayName} detail={`${x.availableBalance} ${x.currency} disponible`}/>)}</List></TabsContent><TabsContent value="recargas"><List title="Recargas" loading={topups.isLoading} empty="No hay recargas.">{topups.data?.map(x=><Row key={x.topupId} title={x.driverDisplayName} detail={`${x.amount} ${x.currency} · ${label(x.status)}`}/>)}</List></TabsContent></>}
      <TabsContent value="incidencias"><List title="Incidencias" loading={incidents.isLoading} empty="No hay incidencias.">{incidents.data?.map(x=><Row key={x.jobId} title={x.serviceCode} detail={`${x.incidentReason} · ${x.resolved ? "Resuelta" : "Abierta"}`}/>)}</List></TabsContent>
      {canSettings && <TabsContent value="configuracion"><SectionCard title="Configuración financiera" module="pagos"><p className="text-sm text-text-secondary">Moneda: {settings.data?.walletCurrency ?? "CUP"} · Depósito mínimo: {settings.data?.initialMinimumDeposit ?? "—"} · Comisión: {settings.data ? `${settings.data.commissionRate * 100}%` : "—"}</p></SectionCard></TabsContent>}
    </Tabs></div>;
}
function List({ title, loading, empty, children }: { title: string; loading: boolean; empty: string; children: React.ReactNode }) { return <SectionCard title={title} module="pagos" contentClassName="space-y-2">{loading ? <p className="text-sm text-text-tertiary">Cargando…</p> : children ? children : <EmptyState icon={BriefcaseBusiness} title={empty} module="pagos" />}</SectionCard>; }
function Row({ title, detail }: { title: string; detail: string }) { return <div className="flex items-center justify-between gap-3 rounded border border-border-subtle p-3"><div><p className="font-medium text-text-primary">{title}</p><p className="text-sm text-text-secondary">{detail}</p></div><Badge variant="secondary">Ver</Badge></div>; }
