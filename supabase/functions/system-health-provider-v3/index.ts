// Server-only collector. A one-use, short-lived database challenge gates each scrape.
const BASE = "https://vvxvnywzgtqhlaqpxyqh.supabase.co";
const allowed = new Set([
  "node_cpu_seconds_total","node_memory_MemTotal_bytes","node_memory_MemAvailable_bytes",
  "node_memory_SwapTotal_bytes","node_memory_SwapFree_bytes","node_load1","node_boot_time_seconds",
  "node_disk_io_time_seconds_total","node_disk_read_bytes_total","node_disk_written_bytes_total",
  "node_network_receive_bytes_total","node_network_transmit_bytes_total",
]);
type Series = { labels: Record<string,string>; value: number };
type Metrics = Record<string, Series[]>;
export function parseMetrics(body: string) {
  const metrics: Metrics = {};
  const families = new Set<string>();
  for (const line of body.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+([^\s]+)(?:\s|$)/);
    if (!match) continue;
    families.add(match[1]);
    if (!allowed.has(match[1])) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value) || value < 0) continue;
    const labels: Record<string,string> = {};
    for (const m of (match[2] || "").matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g)) labels[m[1]]=m[2];
    (metrics[match[1]] ??= []).push({labels,value});
  }
  const gauge=(name:string)=>metrics[name]?.length===1 ? metrics[name][0].value : null;
  function counters(name:string, key:(s:Series)=>string|null) {
    const result: Record<string,number> = Object.create(null);
    for (const s of metrics[name] || []) {
      const k=key(s); if(k===null)continue;
      if(Object.hasOwn(result,k))return null; // ambiguous duplicate series
      result[k]=s.value;
    }
    return Object.keys(result).length>0 && Object.keys(result).length<=256 ? result : null;
  }
  const cpuKey=(s:Series)=>/^\d+$/.test(s.labels.cpu||"") && /^[a-z_]+$/.test(s.labels.mode||"") ? s.labels.cpu+":"+s.labels.mode : null;
  const cpu=counters("node_cpu_seconds_total",s=>["guest","guest_nice"].includes(s.labels.mode)?null:cpuKey(s));
  const device=(s:Series)=>/^[a-zA-Z0-9_.:-]{1,64}$/.test(s.labels.device||"") && !/^(loop|ram|zram|fd|sr)\d/.test(s.labels.device) ? s.labels.device : null;
  const iface=(s:Series)=>s.labels.device!=="lo"?device(s):null;
  return {
    metric_families:families.size, boot:gauge("node_boot_time_seconds"),
    ram_total:gauge("node_memory_MemTotal_bytes"),ram_available:gauge("node_memory_MemAvailable_bytes"),
    swap_total:gauge("node_memory_SwapTotal_bytes"),swap_free:gauge("node_memory_SwapFree_bytes"),
    load1:gauge("node_load1"),
    cpu_total:cpu,cpu_idle:counters("node_cpu_seconds_total",s=>s.labels.mode==="idle"?cpuKey(s):null),
    cpu_iowait:counters("node_cpu_seconds_total",s=>s.labels.mode==="iowait"?cpuKey(s):null),
    cpu_count:cpu?new Set(Object.keys(cpu).map(k=>k.split(":")[0])).size:null,
    disk_io:counters("node_disk_io_time_seconds_total",device),
    disk_read:counters("node_disk_read_bytes_total",device),
    disk_write:counters("node_disk_written_bytes_total",device),
    net_rx:counters("node_network_receive_bytes_total",iface),
    net_tx:counters("node_network_transmit_bytes_total",iface),
  };
}
Deno.serve(async req=>{
  const out=(status:number)=>Response.json({accepted:status===200},{status,headers:{"Cache-Control":"no-store"}});
  if(req.method!=="POST")return out(405);
  const nonce=req.headers.get("x-health-challenge")||"";
  if(!/^[a-f0-9]{64}$/.test(nonce))return out(401);
  let key:string;
  try{key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;}catch{return out(503);}
  if(typeof key!=="string"||!key.startsWith("sb_secret_"))return out(503);
  async function rpc(name:string,body:unknown){
    return fetch(BASE+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(8000)});
  }
  try{
    const claim=await rpc("system_health_claim_provider_v3",{challenge:nonce});
    if(!claim.ok || await claim.json()!==true)return out(401);
    const started=performance.now();
    let status=503;let raw:ReturnType<typeof parseMetrics>|null=null;
    try{
      const response=await fetch(BASE+"/customer/v1/privileged/metrics",{headers:{Authorization:"Basic "+btoa("service_role:"+key),Accept:"text/plain"},redirect:"error",signal:AbortSignal.timeout(10000)});
      status=response.status;
      if(response.ok){
        const body=await response.text();
        if(body.length>2_000_000){status=502;}else{
          raw=parseMetrics(body);
          if(!raw.metric_families || raw.ram_total===null && raw.cpu_total===null){raw=null;status=502;}
        }
      }else await response.body?.cancel();
    }catch{status=503;raw=null;}
    const done=await rpc("system_health_finish_provider_v3",{challenge:nonce,provider_status:status,elapsed_ms:Math.round(performance.now()-started),raw_sample:raw});
    return out(done.ok?200:502);
  }catch{return out(503);}
});
