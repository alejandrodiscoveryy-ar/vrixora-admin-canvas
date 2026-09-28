import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { DollarSign, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/admin/SectionCard";
import { supabaseServices, type MarketplacePricingTariff, type MarketplacePricingTariffInput, type MarketplacePricingAdjustment } from "@/lib/services";
import { getElToqueIntegration } from "@/lib/eltoque-integration";
import { useProjectPermissions } from "@/hooks/useProjects";

type PricingFieldKey = "basePriceUsd" | "minimumPriceUsd" | "perKmPriceUsd" | "perExtraPassengerPriceUsd" | "perStopPriceUsd";
const fields: Array<[PricingFieldKey, string]> = [
  ["basePriceUsd", "Precio base"], ["minimumPriceUsd", "Precio mínimo"], ["perKmPriceUsd", "Por km"],
  ["perExtraPassengerPriceUsd", "Pasajero adicional"], ["perStopPriceUsd", "Parada adicional"],
];

const numberValue = (value: number | null) => value == null ? "" : String(value);
const cup = (usd: number | null, rate: number) => usd == null ? "—" : `${(usd * rate).toLocaleString("es-CU", { maximumFractionDigits: 2 })} CUP`;

function inputFrom(tariff: MarketplacePricingTariff): MarketplacePricingTariffInput {
  return {
    serviceCode: tariff.serviceCode, vehicleCategoryCode: tariff.vehicleCategoryCode, basePriceUsd: tariff.basePriceUsd ?? 0, minimumPriceUsd: tariff.minimumPriceUsd ?? 0,
    perKmPriceUsd: tariff.perKmPriceUsd ?? 0, perExtraPassengerPriceUsd: tariff.perExtraPassengerPriceUsd ?? 0, perStopPriceUsd: tariff.perStopPriceUsd ?? 0,
  };
}

export default function MarketplacePricingSection({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("marketplace.manage");
  const tariffs = useQuery({ queryKey: ["marketplace-pricing-tariffs", projectId], queryFn: () => supabaseServices.marketplace.listPricingTariffs(projectId) });
  const adjustments = useQuery({ queryKey: ["marketplace-pricing-adjustments", projectId], queryFn: () => supabaseServices.marketplace.listPricingAdjustments(projectId) });
  const exchange = useQuery({ queryKey: ["eltoque-integration", projectId], queryFn: () => getElToqueIntegration(projectId), refetchInterval: 60_000 });
  const [editing, setEditing] = useState<MarketplacePricingTariff | null>(null);
  const [draft, setDraft] = useState<MarketplacePricingTariffInput | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState<{ item: MarketplacePricingAdjustment; value: number; enabled: boolean } | null>(null);
  const save = useMutation({ mutationFn: () => supabaseServices.marketplace.savePricingTariff(projectId, draft!), onSuccess: () => { toast.success("Nueva tarifa publicada."); setEditing(null); setDraft(null); void client.invalidateQueries({ queryKey: ["marketplace-pricing-tariffs", projectId] }); }, onError: (error) => toast.error(error instanceof Error ? error.message : String(error)) });
  const rate = exchange.data?.currentRate ?? 0;
  const publishAdjustment = useMutation({ mutationFn: () => supabaseServices.marketplace.publishPricingAdjustment(projectId, { code: adjustmentDraft!.item.code, adjustmentValue: adjustmentDraft!.value, enabled: adjustmentDraft!.enabled }), onSuccess: () => { toast.success("Nueva versión del ajuste publicada."); setAdjustmentDraft(null); void client.invalidateQueries({ queryKey: ["marketplace-pricing-adjustments", projectId] }); }, onError: error => toast.error(error instanceof Error ? error.message : String(error)) });
  const airport = adjustments.data?.find(item => item.code === "airport_destination_auto");

  return <div className="space-y-5">
    <SectionCard title="Tasa USD/CUP vigente" description="Solo lectura. Los equivalentes CUP son una vista previa y nunca se guardan en las tarifas." module="planes" actions={<Button asChild variant="outline" size="sm"><Link to="/admin/proyectos/$id/$section" params={{ id: projectId, section: "integraciones" }}>Gestionar tasa <ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button>}>
      {exchange.isLoading ? <p className="text-sm text-muted-foreground">Consultando tasa vigente…</p> : exchange.isError ? <p className="text-sm text-destructive">No se pudo consultar la tasa. Las tarifas siguen expresadas en USD.</p> : <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm"><strong>{rate.toLocaleString("es-CU")} CUP por USD</strong><span>Fuente: {exchange.data?.rateSource ?? "—"}</span><span>Actualizada: {exchange.data?.rateUpdatedAt ? new Date(exchange.data.rateUpdatedAt).toLocaleString("es-CU") : "—"}</span><span>Estado: {exchange.data?.lastAutoSyncStatus ?? "—"}</span></div>}
    </SectionCard>
    <p className="text-sm text-muted-foreground">Las tarifas comerciales se administran en USD. Un cambio en elTOQUE solo recalcula esta vista previa; no modifica ninguna tarifa.</p>
    {tariffs.isLoading ? <p className="text-sm text-muted-foreground">Cargando tarifas…</p> : tariffs.data?.map((tariff) => <SectionCard key={`${tariff.serviceCode}:${tariff.vehicleCategoryCode}`} title={categoryLabel(tariff.vehicleCategoryCode)} description={`Modalidad: ${tariff.serviceCode}`} module="planes" actions={canManage ? <Button size="sm" onClick={() => { setEditing(tariff); setDraft(inputFrom(tariff)); }}>Editar tarifa</Button> : undefined}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([key, label]) => { const value = tariff[key]; return <div key={key} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value == null ? "Sin configurar" : `$${value.toLocaleString("en-US")} USD`}</p><p className="text-xs text-muted-foreground">≈ {cup(value, rate)}</p></div>; })}</div>
    </SectionCard>)}
    {tariffs.data?.length === 0 ? <p className="text-sm text-muted-foreground">No hay servicios Marketplace configurados.</p> : null}
    {editing && draft ? <SectionCard title={`Editar tarifa USD · ${editing.serviceName}`} description="Los importes CUP se actualizan al cambiar la tasa y no se almacenan." module="planes">
      <div className="grid gap-4 md:grid-cols-2">{fields.map(([key, label]) => <div key={key} className="space-y-1.5"><Label>{label} (USD)</Label><Input type="number" min={key === "basePriceUsd" || key === "minimumPriceUsd" ? 0.0001 : 0} step="0.0001" value={numberValue(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /><p className="text-xs text-muted-foreground">Vista previa: ≈ {cup(draft[key], rate)}</p></div>)}</div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</Button><Button disabled={save.isPending || draft.basePriceUsd < 0 || draft.minimumPriceUsd < 0} onClick={() => { const old = inputFrom(editing); const summary = fields.map(([key,label]) => `${label}: $${old[key]} → $${draft[key]} USD (≈ ${cup(draft[key], rate)})`).join("\n"); if (window.confirm(`Publicar nueva tarifa para ${categoryLabel(editing.vehicleCategoryCode)}\n\nModalidad: ${editing.serviceCode}\n${summary}\n\nLos viajes anteriores no cambian.`)) save.mutate(); }}>{save.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}Publicar nueva tarifa</Button></div>
    </SectionCard> : null}
    <SectionCard title="Ajustes especiales" description="Recargos o reglas comerciales aplicados por zona, horario u otras condiciones." module="planes">
      {!airport ? <p className="text-sm text-muted-foreground">No hay ajuste de aeropuerto configurado.</p> : <div className="space-y-3"><div className="rounded-md border p-4"><p className="font-semibold">Aeropuerto José Martí - Auto</p><p className="text-sm">Modalidad: Auto ligero · Tipo: Recargo fijo · Estado: {airport.status === "active" ? "Activo" : "Inactivo"}</p><p className="text-sm">Importe: ${airport.adjustmentValue.toFixed(2)} USD · ≈ {cup(airport.adjustmentValue, rate)}</p><p className="text-xs text-muted-foreground">Zona: {String(airport.conditionConfig.zone_name ?? "Aeropuerto Internacional José Martí")} · Dirección: {String(airport.conditionConfig.direction ?? "destino")} · Radio: {String(airport.conditionConfig.radius_km ?? 3)} km</p>{canManage && <Button className="mt-3" size="sm" onClick={() => setAdjustmentDraft({item:airport,value:airport.adjustmentValue,enabled:airport.status==="active"})}>Editar ajuste</Button>}</div>
      {adjustmentDraft ? <div className="rounded-md border p-4 space-y-3"><Label>Importe USD</Label><Input type="number" min="0" step="0.01" value={adjustmentDraft.value} onChange={e=>setAdjustmentDraft({...adjustmentDraft,value:Number(e.target.value)})}/><p className="text-xs text-muted-foreground">≈ {cup(adjustmentDraft.value,rate)} · CUP solo visual.</p><label className="flex gap-2 items-center">Activo <Switch checked={adjustmentDraft.enabled} onCheckedChange={enabled=>setAdjustmentDraft({...adjustmentDraft,enabled})}/></label><Button disabled={publishAdjustment.isPending || adjustmentDraft.value<0} onClick={()=>{const old=adjustmentDraft.item; if(window.confirm(`Ajuste: Aeropuerto José Martí - Auto\nValor actual: $${old.adjustmentValue} USD\nValor nuevo: $${adjustmentDraft.value} USD (≈ ${cup(adjustmentDraft.value,rate)})\nEstado actual: ${old.status}\nEstado nuevo: ${adjustmentDraft.enabled?"Activo":"Inactivo"}\n\nSe creará una nueva versión de esta regla. Las operaciones anteriores conservarán las condiciones con las que fueron calculadas.`)) publishAdjustment.mutate();}}>Publicar nueva versión</Button></div>:null}</div>}
    </SectionCard>
  </div>;
}

function categoryLabel(code: string) {
  return ({ light_car: "Auto ligero", bicitaxi: "Bicitaxi", motorcycle: "Motocicleta", tricycle: "Triciclo" } as Record<string, string>)[code] ?? code;
}
