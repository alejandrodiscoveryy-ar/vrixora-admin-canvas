import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Save, ShieldCheck, AlertTriangle } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { structuralPriceUsd } from '@/lib/smart-pricing-v3-diagnostics';
import { isValidHolidayDate, simulateTemporalDraftUsd, roundTemporalDraftCup, type TemporalProfile } from '@/lib/smart-pricing-v3-temporal';
import type { MarketplacePricingTariff } from '@/lib/services';
import { Button } from '@/components/ui/button';

const modes = [
  ['motorcycle','Motocicleta'], ['bicitaxi','Bicitaxi'],
  ['tricycle','Triciclo'], ['light_car','Auto ligero'],
] as const;

const blank = (code: string): TemporalProfile => ({
  vehicle_category_code: code,
  evening_pct: 0, night_pct: 0, dawn_pct: 0,
  weekend_pct: 0, holiday_pct: 0, max_combined_pct: 40, holiday_dates: [],
});
const toNumbers = (p: TemporalProfile): TemporalProfile => ({
  ...p, evening_pct: Number(p.evening_pct), night_pct: Number(p.night_pct), dawn_pct: Number(p.dawn_pct),
  weekend_pct: Number(p.weekend_pct), holiday_pct: Number(p.holiday_pct), max_combined_pct: Number(p.max_combined_pct),
  holiday_dates: Array.isArray(p.holiday_dates) ? p.holiday_dates : [],
});

export default function MarketplaceTemporalDraftsV3({projectId,canManage,tariffs,exchangeRate}:{
  projectId: string;
  canManage: boolean;
  tariffs: MarketplacePricingTariff[];
  exchangeRate: number;
}) {
  const qc = useQueryClient();
  const [category,setCategory] = useState<string>('motorcycle');
  const [form,setForm] = useState<TemporalProfile>(()=>blank('motorcycle'));
  const [distance,setDistance] = useState(5);
  const [hour,setHour] = useState(2);
  const [weekend,setWeekend] = useState(true);
  const [holiday,setHoliday] = useState(false);
  const [formError,setFormError] = useState<string|null>(null);
  const [savedMessage,setSavedMessage] = useState<string|null>(null);

  const drafts = useQuery({
    queryKey:['marketplace-temporal-drafts-v3',projectId], enabled:Boolean(projectId),
    queryFn:async()=>{
      const {data,error}=await getSupabaseClient().rpc('admin_list_marketplace_temporal_drafts_v3',{target_project_id:projectId});
      if(error) throw error;
      return (Array.isArray(data)?data:[]) as TemporalProfile[];
    },
  });
  const currencySettings = useQuery({
    queryKey:['marketplace-temporal-currency-v3',projectId], enabled:Boolean(projectId),
    queryFn:async()=>{
      const {data,error}=await getSupabaseClient().rpc('admin_get_marketplace_pricing_dashboard',{target_project_id:projectId});
      if(error) throw error;
      const dashboard = (data ?? {}) as Record<string,unknown>;
      const settings = (dashboard.settings ?? {}) as Record<string,unknown>;
      return {
        base: String(settings.base_currency ?? ''),
        charge: String(settings.charge_currency ?? ''),
        mode: String(settings.rounding_mode ?? ''),
        increment: Number(settings.rounding_increment),
      };
    },
  });
  const current = useMemo(()=>drafts.data?.find(x=>x.vehicle_category_code===category),[drafts.data,category]);
  useEffect(()=>{
    const base=toNumbers(current??blank(category));
    setForm(base);
    setFormError(null);
    setSavedMessage(null);
  },[category,current]);
  const selectedTariff=tariffs.find(t=>t.serviceCode==='passenger' && t.vehicleCategoryCode===category);
  const baseUsd=structuralPriceUsd(selectedTariff,distance);
  const projectedUsd=baseUsd == null?null:simulateTemporalDraftUsd(baseUsd,form,{hour,weekend,holiday});
  const cupSettingsValid = currencySettings.data?.base === 'USD' && currencySettings.data?.charge === 'CUP';
  const cupIncrement = currencySettings.data?.increment ?? NaN;
  const cupMode = currencySettings.data?.mode ?? '';
  const baseCup = cupSettingsValid ? roundTemporalDraftCup(baseUsd,exchangeRate,cupIncrement,cupMode) : null;
  const projectedCup = cupSettingsValid ? roundTemporalDraftCup(projectedUsd,exchangeRate,cupIncrement,cupMode) : null;
  const cupText = (value:number|null) => value === null ? 'No disponible' : value.toLocaleString('es-CU',{maximumFractionDigits:0}) + ' CUP';
  const parsedDates=form.holiday_dates;
  const datesValid=parsedDates.length <= 60 && new Set(parsedDates).size===parsedDates.length && parsedDates.every(isValidHolidayDate);
  const ceiling = Math.max(form.evening_pct,form.night_pct,form.dawn_pct)+form.weekend_pct+form.holiday_pct;
  const validNumbers = [form.evening_pct,form.night_pct,form.dawn_pct,form.weekend_pct,form.holiday_pct,form.max_combined_pct]
    .every(v=>Number.isFinite(v) && v>=0 && v<=40);
  const safe = datesValid && validNumbers && ceiling<=form.max_combined_pct;
  const save = useMutation({
    mutationFn:async()=>{
      if(!safe || !canManage) throw new Error('Borrador fuera de límites o sin permiso.');
      const {error}=await getSupabaseClient().rpc('admin_save_marketplace_temporal_draft_v3',{
        target_project_id:projectId, target_vehicle_category_code:category,
        target_evening_pct:form.evening_pct, target_night_pct:form.night_pct,
        target_dawn_pct:form.dawn_pct, target_weekend_pct:form.weekend_pct,
        target_holiday_pct:form.holiday_pct, target_max_combined_pct:form.max_combined_pct,
        target_holiday_dates:parsedDates,
      });
      if(error) throw error;
    },
    onSuccess:()=>{setSavedMessage('Borrador guardado. Los precios publicados no cambian.');qc.invalidateQueries({queryKey:['marketplace-temporal-drafts-v3',projectId]});},
    onError:(e)=>setFormError(e instanceof Error?e.message:String(e)),
  });
  const fields:[keyof TemporalProfile,string,string][] = [
    ['evening_pct','Tarde · 18:00–22:00','Complemento vespertino'],
    ['night_pct','Noche · 22:00–00:00','Nocturnidad'],
    ['dawn_pct','Madrugada · 00:00–06:00','Madrugada'],
    ['weekend_pct','Sábado y domingo','Acumulable con una franja horaria'],
  ];
  return <section aria-label="Borradores de ajustes temporales V3" className="overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950/70 p-4 text-slate-100 sm:p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-cyan-300"/><div><h3 className="font-semibold">Calendario tarifario · borradores V3</h3><p className="text-xs text-slate-400">Configura y simula sin afectar cotizaciones reales.</p></div></div>
      <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">No publicado</span>
    </div>
    {drafts.isError ? <p role="alert" className="mb-3 text-sm text-amber-200">La gestión de borradores requiere la migración de la fase 2B en Supabase. No se han cambiado precios.</p> : null}
    <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
        <label className="block text-xs text-slate-300">Modalidad de pasajeros
          <select value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">
            {modes.map(([code,label])=><option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fields.map(([key,label,subtitle])=><label key={key} className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200">
            <span className="block font-medium">{label}</span><span className="block text-[10px] text-slate-400">{subtitle}</span>
            <span className="mt-2 flex items-center gap-1"><input disabled={!canManage} aria-label={label} type="number" min={0} max={40} step={1} value={form[key] as number}
              onChange={e=>{setSavedMessage(null);setForm(prev=>({...prev,[key]:e.target.value===''?NaN:Number(e.target.value)}));}}
              className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"/>%</span>
          </label>)}
          <label className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200">Tope total
            <span className="mt-2 flex items-center gap-1"><input disabled={!canManage} aria-label="Tope de recargos" type="number" min={0} max={40} step={1} value={form.max_combined_pct}
              onChange={e=>{setSavedMessage(null);setForm(prev=>({...prev,max_combined_pct:e.target.value===''?NaN:Number(e.target.value)}));}}
              className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"/>%</span>
          </label>
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3 text-xs text-slate-200">
          <input type="checkbox" aria-label="Aplicar recargo en días festivos"
            disabled={!canManage || form.holiday_dates.length===0}
            checked={form.holiday_pct>0}
            onChange={e=>{const activo=e.target.checked;setSavedMessage(null);setForm(prev=>({...prev,holiday_pct:activo?10:0}));}}
            className="h-5 w-5 accent-cyan-400"/>
          <span className="flex flex-col gap-1">
            <strong className="text-sm">Aplicar recargo en días festivos</strong>
            <span className="text-slate-400">{form.holiday_dates.length ?  (form.holiday_pct>0 ? 'Calendario cubano guardado · recargo del 10 %' : 'Calendario cubano guardado · recargo desactivado') : 'Calendario no disponible'}</span>
          </span>
        </label>
        <p className="flex gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 shrink-0 text-cyan-300"/>El servidor sigue usando el horario oficial de Cuba. Los porcentajes se guardan como borradores aislados del motor de cobro.</p>
        {!safe?<p role="alert" className="flex gap-2 text-xs text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0"/>Revisa porcentajes, fechas y tope: la suma máxima posible debe ser menor o igual al tope.</p>:null}
        {formError?<p role="alert" className="text-xs text-rose-300">{formError}</p>:null}
        {savedMessage?<p className="text-xs text-emerald-300">{savedMessage}</p>:null}
        <Button disabled={!canManage||!safe||save.isPending||drafts.isError} onClick={()=>save.mutate()}><Save className="mr-2 h-4 w-4"/>Guardar borrador</Button>
      </div>
      <div className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h4 className="text-sm font-semibold">Simulación estructural · sin publicar</h4>
        <label className="block text-xs text-slate-300">Distancia
          <select className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" value={distance} onChange={e=>setDistance(Number(e.target.value))}>
            <option value={2}>2 km</option><option value={5}>5 km</option><option value={10}>10 km</option>
          </select>
        </label>
        <label className="block text-xs text-slate-300">Hora en Cuba
          <select className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" value={hour} onChange={e=>setHour(Number(e.target.value))}>
            <option value={10}>10:00 · día</option><option value={19}>19:00 · tarde</option><option value={23}>23:00 · noche</option><option value={2}>02:00 · madrugada</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={weekend} onChange={e=>setWeekend(e.target.checked)}/>Fin de semana</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={holiday} onChange={e=>setHoliday(e.target.checked)}/>Simular día festivo (solo vista previa)</label>
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
          <p className="text-xs text-slate-400">Base estructural estimada · MN</p>
          <p className="text-lg font-semibold tabular-nums">{cupText(baseCup)}</p>
          <p className="mt-3 text-xs text-slate-300">Estimación con borrador · moneda nacional (MN)</p>
          <p className="text-2xl font-bold tabular-nums text-cyan-100">{cupText(projectedCup)}</p>
          <p className="mt-3 text-[11px] text-slate-300">Cálculo interno: {baseUsd==null?'Sin tarifa':baseUsd.toFixed(2)+' USD'} → {projectedUsd==null?'No disponible':projectedUsd.toFixed(3)+' USD'}</p>
          {projectedCup !== null ? (
            <p className="mt-1 text-[11px] text-slate-300">Tasa: 1 USD = {exchangeRate.toLocaleString('es-CU')} CUP · redondeo hacia arriba cada {cupIncrement.toLocaleString('es-CU')} CUP</p>
          ) : (
            <p role="status" className="mt-2 text-xs text-amber-200">Tasa o configuración de redondeo no disponibles. No se inventa un precio en MN.</p>
          )}
        </div>
        <p className="text-[11px] text-slate-400">Importe simulado en CUP/MN, no cotización final. El servidor calcula el precio real en CUP; este escenario omite otros recargos activos, aeropuerto, paradas y demás componentes de la carrera.</p>
      </div>
    </div>
  </section>;
}
