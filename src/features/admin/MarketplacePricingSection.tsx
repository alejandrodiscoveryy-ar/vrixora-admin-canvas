import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { DollarSign, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/admin/SectionCard";
import { supabaseServices, type MarketplacePricingTariff, type MarketplacePricingTariffInput } from "@/lib/services";
import { getElToqueIntegration } from "@/lib/eltoque-integration";
import { useProjectPermissions } from "@/hooks/useProjects";

const fields: Array<[keyof MarketplacePricingTariffInput, string]> = [
  ["basePriceUsd", "Precio base"], ["minimumPriceUsd", "Precio mínimo"], ["perKmPriceUsd", "Por km"],
  ["perExtraPassengerPriceUsd", "Pasajero adicional"], ["perCargoKgPriceUsd", "Por kg de carga"],
  ["perCargoM3PriceUsd", "Por m³ de carga"], ["perStopPriceUsd", "Parada adicional"],
  ["loadHelpSurchargeUsd", "Ayuda de carga"], ["unloadHelpSurchargeUsd", "Ayuda de descarga"],
];

const numberValue = (value: number | null) => value == null ? "" : String(value);
const cup = (usd: number | null, rate: number) => usd == null ? "—" : `${(usd * rate).toLocaleString("es-CU", { maximumFractionDigits: 2 })} CUP`;

function inputFrom(tariff: MarketplacePricingTariff): MarketplacePricingTariffInput {
  return {
    serviceCode: tariff.serviceCode, vehicleCategoryCode: tariff.vehicleCategoryCode, basePriceUsd: tariff.basePriceUsd ?? 0, minimumPriceUsd: tariff.minimumPriceUsd ?? 0,
    perKmPriceUsd: tariff.perKmPriceUsd ?? 0, perExtraPassengerPriceUsd: tariff.perExtraPassengerPriceUsd ?? 0,
    perCargoKgPriceUsd: tariff.perCargoKgPriceUsd ?? 0, perCargoM3PriceUsd: tariff.perCargoM3PriceUsd ?? 0,
    perStopPriceUsd: tariff.perStopPriceUsd ?? 0, loadHelpSurchargeUsd: tariff.loadHelpSurchargeUsd ?? 0,
    unloadHelpSurchargeUsd: tariff.unloadHelpSurchargeUsd ?? 0,
  };
}

export default function MarketplacePricingSection({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("marketplace.manage");
  const tariffs = useQuery({ queryKey: ["marketplace-pricing-tariffs", projectId], queryFn: () => supabaseServices.marketplace.listPricingTariffs(projectId) });
  const exchange = useQuery({ queryKey: ["eltoque-integration", projectId], queryFn: () => getElToqueIntegration(projectId), refetchInterval: 60_000 });
  const [editing, setEditing] = useState<MarketplacePricingTariff | null>(null);
  const [draft, setDraft] = useState<MarketplacePricingTariffInput | null>(null);
  const save = useMutation({ mutationFn: () => supabaseServices.marketplace.savePricingTariff(projectId, draft!), onSuccess: () => { toast.success("Tarifa USD guardada."); setEditing(null); setDraft(null); void client.invalidateQueries({ queryKey: ["marketplace-pricing-tariffs", projectId] }); }, onError: (error) => toast.error(error instanceof Error ? error.message : String(error)) });
  const rate = exchange.data?.currentRate ?? 0;

  return <div className="space-y-5">
    <SectionCard title="Tasa USD/CUP vigente" description="Solo lectura. Los equivalentes CUP son una vista previa y nunca se guardan en las tarifas." module="planes" actions={<Button asChild variant="outline" size="sm"><Link to="/admin/proyectos/$id/$section" params={{ id: projectId, section: "integraciones" }}>Gestionar tasa <ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button>}>
      {exchange.isLoading ? <p className="text-sm text-muted-foreground">Consultando tasa vigente…</p> : exchange.isError ? <p className="text-sm text-destructive">No se pudo consultar la tasa. Las tarifas siguen expresadas en USD.</p> : <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm"><strong>{rate.toLocaleString("es-CU")} CUP por USD</strong><span>Fuente: {exchange.data?.rateSource ?? "—"}</span><span>Actualizada: {exchange.data?.rateUpdatedAt ? new Date(exchange.data.rateUpdatedAt).toLocaleString("es-CU") : "—"}</span><span>Estado: {exchange.data?.lastAutoSyncStatus ?? "—"}</span></div>}
    </SectionCard>
    <p className="text-sm text-muted-foreground">Las tarifas comerciales se administran en USD. Un cambio en elTOQUE solo recalcula esta vista previa; no modifica ninguna tarifa.</p>
    {tariffs.isLoading ? <p className="text-sm text-muted-foreground">Cargando tarifas…</p> : tariffs.data?.map((tariff) => <SectionCard key={`${tariff.serviceCode}:${tariff.vehicleCategoryCode}`} title={tariff.serviceName} description={`${tariff.serviceCode} · ${tariff.vehicleCategoryCode}`} module="planes" actions={canManage ? <Button size="sm" onClick={() => { setEditing(tariff); setDraft(inputFrom(tariff)); }}>Editar USD</Button> : undefined}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([key, label]) => { const value = tariff[key]; return <div key={key} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value == null ? "Sin configurar" : `$${value.toLocaleString("en-US")} USD`}</p><p className="text-xs text-muted-foreground">≈ {cup(value, rate)}</p></div>; })}</div>
    </SectionCard>)}
    {tariffs.data?.length === 0 ? <p className="text-sm text-muted-foreground">No hay servicios Marketplace configurados.</p> : null}
    {editing && draft ? <SectionCard title={`Editar tarifa USD · ${editing.serviceName}`} description="Los importes CUP se actualizan al cambiar la tasa y no se almacenan." module="planes">
      <div className="grid gap-4 md:grid-cols-2">{fields.map(([key, label]) => <div key={key} className="space-y-1.5"><Label>{label} (USD)</Label><Input type="number" min={key === "basePriceUsd" || key === "minimumPriceUsd" ? 0.0001 : 0} step="0.0001" value={numberValue(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /><p className="text-xs text-muted-foreground">Vista previa: ≈ {cup(draft[key], rate)}</p></div>)}</div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</Button><Button disabled={save.isPending || draft.basePriceUsd <= 0 || draft.minimumPriceUsd <= 0} onClick={() => save.mutate()}>{save.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}Guardar USD</Button></div>
    </SectionCard> : null}
  </div>;
}
