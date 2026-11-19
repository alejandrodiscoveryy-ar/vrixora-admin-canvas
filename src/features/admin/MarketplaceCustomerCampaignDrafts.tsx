import { commercialPremium as cp } from "@/features/admin/commercial-premium";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, BadgePercent, ChevronDown, Plus, ShieldAlert } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type Kind="percent"|"fixed"|"points";
type Audience="new"|"all"|"return";
type Draft={
  id:string;code:string;title:string;description:string;benefit_kind:Kind;
  benefit_value:number;max_discount_cup:number|null;audience:Audience;
  starts_on:string;ends_on:string;max_uses:number;budget_cup:number|null;
  status:"draft"|"archived";
};
type Form={
  id:string;title:string;codeSuffix:string;description:string;kind:Kind;
  value:string;maxDiscount:string;audience:Audience;
  startsOn:string;endsOn:string;uses:string;budget:string;
};
const cubaToday=()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Havana"});
const plusDays=(n:number)=>{
  const [year,month,day]=cubaToday().split("-").map(Number);
  return new Date(Date.UTC(year,month-1,day+n)).toISOString().slice(0,10);
};
const empty=():Form=>({
  id:"",title:"",codeSuffix:"",description:"",kind:"percent",value:"10",
  maxDiscount:"500",audience:"new",startsOn:cubaToday(),
  endsOn:plusDays(7),uses:"50",budget:"15000",
});
const kinds:Record<Kind,string>={percent:"Descuento %",fixed:"Descuento CUP",points:"Puntos extra"};
const audiences:Record<Audience,string>={new:"Nuevos clientes",all:"Todos los clientes",return:"Clientes por recuperar"};
const inputClass=`mt-1 w-full min-w-0 px-3 py-2 text-sm ${cp.control}`;
const number=(n:number)=>n.toLocaleString("es-CU",{maximumFractionDigits:2});
function benefit(d:Draft) {
  if(d.benefit_kind==="percent") return number(d.benefit_value)+" % · máx. "+number(d.max_discount_cup??0)+" CUP";
  return number(d.benefit_value)+(d.benefit_kind==="fixed"?" CUP":" puntos");
}
async function getDrafts(projectId:string):Promise<Draft[]> {
  const {data,error}=await getSupabaseClient().rpc("admin_list_marketplace_customer_campaign_drafts_v1",{
    target_project_id:projectId,
  });
  if(error)throw new Error(error.message);
  if(!Array.isArray(data))throw Error("INVALID_DRAFT_RESPONSE");
  return data as Draft[];
}
export default function MarketplaceCustomerCampaignDrafts({projectId,canEdit}:{
  projectId:string;canEdit:boolean;
}) {
  const client=useQueryClient();
  const [form,setForm]=useState<Form|null>(null);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const update=<K extends keyof Form>(key:K,value:Form[K])=>
    setForm(old=>old?{...old,[key]:value}:null);
  const q=useQuery({
    queryKey:["marketplace-customer-campaign-drafts",projectId],
    queryFn:()=>getDrafts(projectId),enabled:Boolean(projectId),staleTime:60_000,retry:1,
  });
  const entries=q.data??[];
  const activeDrafts=entries.filter(e=>e.status==="draft").length;
  const save=useMutation({
    mutationFn:async(f:Form)=>{
      const value=Number(f.value),maxDiscount=f.kind==="percent"?Number(f.maxDiscount):null;
      const budget=f.budget.trim()?Number(f.budget):null;
      const uses=Number(f.uses);
      if(f.title.trim().length<4||f.title.trim().length>90 ||
        !/^[a-z0-9_]{1,20}$/.test(f.codeSuffix) ||
        !f.startsOn||!f.endsOn||f.startsOn>f.endsOn ||
        !Number.isFinite(value)||value<=0 ||
        (f.kind==="percent"&&(value<1||value>50||!maxDiscount||maxDiscount<=0))||
        (f.kind==="points"&&!Number.isInteger(value))||
        !Number.isInteger(uses)||uses<1||uses>100000 ||
        (budget!==null&&(!Number.isFinite(budget)||budget<=0))) {
        throw Error("Revisa nombre, código, beneficio, fechas y límites.");
      }
      const {error}=await getSupabaseClient().rpc("admin_save_marketplace_customer_campaign_draft_v1",{
        target_project_id:projectId,target_id:f.id||null,
        target_code:"tuktuk_"+f.codeSuffix,target_title:f.title.trim(),
        target_description:f.description.trim(),target_kind:f.kind,
        target_value:value,target_max_discount_cup:maxDiscount,target_audience:f.audience,
        target_starts_on:f.startsOn,target_ends_on:f.endsOn,
        target_max_uses:uses,target_budget_cup:budget,
      });
      if(error)throw Error(error.message);
    },
    onSuccess:()=>{
      setForm(null);setNotice("Borrador guardado; no se ha activado ningún descuento.");
      void client.invalidateQueries({queryKey:["marketplace-customer-campaign-drafts",projectId]});
    },
    onError:e=>setNotice(e instanceof Error?e.message:"No se pudo guardar."),
  });
  const archive=useMutation({
    mutationFn:async(id:string)=>{
      const {error}=await getSupabaseClient().rpc("admin_archive_marketplace_customer_campaign_draft_v1",{
        target_project_id:projectId,target_id:id,
      });
      if(error)throw Error(error.message);
    },
    onSuccess:()=>{
      setExpanded(null);setNotice("Borrador archivado con historial.");
      void client.invalidateQueries({queryKey:["marketplace-customer-campaign-drafts",projectId]});
    },
    onError:e=>setNotice(e instanceof Error?e.message:"No se pudo archivar."),
  });
  const startEdit=(d?:Draft)=>{
    setNotice(null);
    if(!d){setForm(empty());return;}
    setForm({
      id:d.id,title:d.title,codeSuffix:d.code.replace(/^tuktuk_/,""),
      description:d.description,kind:d.benefit_kind,value:String(d.benefit_value),
      maxDiscount:String(d.max_discount_cup??500),audience:d.audience,
      startsOn:d.starts_on,endsOn:d.ends_on,uses:String(d.max_uses),
      budget:d.budget_cup===null?"":String(d.budget_cup),
    });
  };
  return <section aria-label="Promociones para clientes" className={cp.section + " space-y-3"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <BadgePercent className="h-5 w-5 text-orange-400"/>
        <div><h3 className="text-base font-semibold text-text-primary">Promociones para clientes</h3>
          <p className="text-[11px] text-muted-foreground">Vigencia · audiencia · presupuesto · límite de usos</p>
        </div>
      </div>
      {canEdit&&<button type="button" onClick={()=>startEdit()}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-orange-400/30 bg-orange-500/10 px-3 text-xs font-semibold text-orange-200">
        <Plus className="h-3.5 w-3.5"/> Nueva promoción
      </button>}
    </div>
    <div className="flex gap-2 rounded-lg border border-amber-400/25 bg-amber-500/[0.055] p-3 text-xs leading-relaxed text-amber-100">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0"/>
      <div><strong>Solo planificación.</strong> Todas las promociones son borradores. Las fechas son propuestas.
        Todavía no se aplican descuentos, puntos ni cupones al pasajero. No se modifica ningún cobro o comisión.</div>
    </div>
    <div className="flex gap-2 text-[11px]">
      <span className="rounded-md border border-border/50 px-2 py-1">{activeDrafts} borradores</span>
      <span className="rounded-md border border-border/50 px-2 py-1">{entries.length-activeDrafts} archivados</span>
      <span className="rounded-md border border-border/50 px-2 py-1 text-muted-foreground">0 ofertas activas de clientes</span>
    </div>
    {notice&&<p role="status" className="rounded-lg border border-border/50 p-2 text-xs text-muted-foreground">{notice}</p>}
    {form&&canEdit&&<form onSubmit={e=>{e.preventDefault();save.mutate(form);}}
      className={cp.section + " space-y-3"}>
      <div className="flex justify-between gap-2">
        <h4 className="text-sm font-semibold">{form.id?"Editar borrador":"Preparar nueva campaña"}</h4>
        <button type="button" className="text-xs underline" onClick={()=>setForm(null)}>Cancelar</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">1. Nombre
          <input required maxLength={90} minLength={4} className={inputClass} value={form.title}
            placeholder="Bienvenida TukTuk" onChange={e=>update("title",e.target.value)}/>
        </label>
        <label className="text-xs font-semibold">Identificador de campaña
          <div className={cp.control + " mt-1 flex items-center"}>
            <span className="pl-3 text-xs text-muted-foreground">tuktuk_</span>
            <input required disabled={Boolean(form.id)} maxLength={20}
              className="w-full min-w-0 bg-transparent px-2 py-2 text-xs disabled:opacity-50"
              placeholder="bienvenida" value={form.codeSuffix}
              onChange={e=>update("codeSuffix",e.target.value.toLowerCase().normalize("NFD")
                .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9_]/g,"").slice(0,20))}/>
          </div>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold">2. Beneficio
          <select value={form.kind} onChange={e=>update("kind",e.target.value as Kind)} className={inputClass}>
            {Object.entries(kinds).map(([key,value])=><option key={key} value={key}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Valor {form.kind==="percent"?"(%)":form.kind==="fixed"?"(CUP)":"(puntos)"}
          <input required type="number" min={1} max={form.kind==="percent"?50:undefined}
            step={form.kind==="points"?1:0.01} className={inputClass} value={form.value}
            onChange={e=>update("value",e.target.value)}/>
        </label>
        {form.kind==="percent"&&<label className="text-xs font-semibold">Descuento máximo (CUP)
          <input required type="number" min={1} step="0.01" className={inputClass}
            value={form.maxDiscount} onChange={e=>update("maxDiscount",e.target.value)}/>
        </label>}
        <label className="text-xs font-semibold">3. Público
          <select className={inputClass} value={form.audience} onChange={e=>update("audience",e.target.value as Audience)}>
            {Object.entries(audiences).map(([key,value])=><option key={key} value={key}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold">4. Inicio (Cuba)
          <input required type="date" value={form.startsOn} className={inputClass}
            onChange={e=>update("startsOn",e.target.value)}/>
        </label>
        <label className="text-xs font-semibold">Fin inclusive (Cuba)
          <input required type="date" min={form.startsOn} value={form.endsOn} className={inputClass}
            onChange={e=>update("endsOn",e.target.value)}/>
        </label>
        <label className="text-xs font-semibold">5. Máximo de usos
          <input required type="number" min={1} max={100000} step={1} value={form.uses} className={inputClass}
            onChange={e=>update("uses",e.target.value)}/>
        </label>
        <label className="text-xs font-semibold">Presupuesto previsto (CUP)
          <input type="number" min={1} step="0.01" value={form.budget} className={inputClass}
            placeholder="Opcional" onChange={e=>update("budget",e.target.value)}/>
        </label>
      </div>
      <label className="block text-xs font-semibold">Condiciones / notas
        <textarea rows={2} maxLength={600} value={form.description} className={inputClass}
          onChange={e=>update("description",e.target.value)} placeholder="Condiciones por definir, sin anunciar descuento todavía."/>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
        <p className="text-[11px] text-muted-foreground">Guardar no publica una promoción; solo el propietario puede crearla.</p>
        <button type="submit" disabled={save.isPending}
          className="rounded-lg bg-orange-500/15 px-3 py-2 text-xs font-semibold text-orange-300 disabled:opacity-50">
          {save.isPending?"Guardando…":"Guardar borrador"}
        </button>
      </div>
    </form>}
    {q.isPending?<p className="p-3 text-xs text-muted-foreground">Cargando catálogo de campañas…</p>:
      q.isError?<p role="alert" className="p-3 text-xs text-amber-400">Error al consultar borradores.
        <button type="button" onClick={()=>void q.refetch()} className="ml-2 underline">Reintentar</button></p>:
      !entries.length?<p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
        No hay promociones planificadas todavía. Puedes crear una sin activar ningún descuento.</p>:
      <div className="space-y-1.5">
        {entries.map(d=>{
          const opened=expanded===d.id;
          return <article key={d.id} className="overflow-hidden rounded-lg border border-border/50">
            <button type="button" aria-expanded={opened} aria-controls={"promo-"+d.id}
              onClick={()=>setExpanded(x=>x===d.id?null:d.id)}
              className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/10">
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs">{d.title}</strong>
                <span className="block truncate text-[11px] text-muted-foreground">{d.code} · {benefit(d)}</span>
              </span>
              <span className={"shrink-0 rounded-md px-2 py-1 text-[10px] "+(d.status==="draft"?"bg-amber-400/10 text-amber-300":"bg-muted/40 text-muted-foreground")}>
                {d.status==="draft"?"Borrador":"Archivado"}
              </span>
              <ChevronDown aria-hidden="true" className={"h-4 w-4 shrink-0 transition-transform "+(opened?"rotate-180":"")}/>
            </button>
            <div id={"promo-"+d.id} hidden={!opened}>
              {opened&&<div className="space-y-2 border-t border-border/35 px-3 py-3 text-xs">
                <p>{audiences[d.audience]} · del {d.starts_on} al {d.ends_on} (Cuba)</p>
                <p className="text-muted-foreground">Hasta {number(d.max_uses)} usos · Presupuesto {d.budget_cup===null?"sin definir":number(d.budget_cup)+" CUP"}</p>
                {d.description&&<p className="text-muted-foreground">{d.description}</p>}
                <p className="text-[11px] text-amber-300">No anunciar este beneficio como vigente: aún no existe aplicación automática en Cliente.</p>
                {d.status==="draft"&&canEdit&&<div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="rounded-md border border-border px-3 py-1.5" onClick={()=>startEdit(d)}>Editar</button>
                  <button type="button" disabled={archive.isPending} onClick={()=>{
                    if(window.confirm("¿Archivar este borrador? Se conservará el historial."))archive.mutate(d.id);
                  }} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 disabled:opacity-50">
                    <Archive className="h-3.5 w-3.5"/> Archivar
                  </button>
                </div>}
              </div>}
            </div>
          </article>;
        })}
      </div>}
  </section>;
}
