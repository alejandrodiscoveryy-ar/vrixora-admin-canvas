import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";
import { gatewayClientIp } from "../_shared/gateway-client-ip.ts";
import { publicSocialProfile, renderSocialPng } from "./social-card.ts";

const noStore = {"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers:{...noStore,"Content-Type":"application/json"}});
async function identity(ip: string, secret: string) {
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("impulsa-social:"+ip))),b=>b.toString(16).padStart(2,"0")).join("");
}
function portraitData(bytes: Uint8Array, mime: string): string | null {
  if (bytes.length < 8 || bytes.length > 3*1024*1024) return null;
  if (mime === "image/jpeg" ? !(bytes[0]===255&&bytes[1]===216&&bytes[2]===255) :
      mime === "image/png" ? !(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71) : true) return null;
  let binary = "";
  for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return "data:"+mime+";base64,"+btoa(binary);
}

Deno.serve(async request => {
  if (request.method !== "GET" && request.method !== "HEAD") return json({error:"METHOD_NOT_ALLOWED"},405);
  const input = new URL(request.url).searchParams;
  const alias = input.get("alias") ?? "", format = input.get("format") ?? "meta";
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(alias) || alias.endsWith("-") || !["meta","image"].includes(format)) return json({error:"INVALID_ALIAS"},400);
  try {
    const ip = gatewayClientIp(request.headers);
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), secret = Deno.env.get("MARKETPLACE_RATE_LIMIT_SECRET");
    if (!url || !key || !secret) return json({error:"UNAVAILABLE"},503);
    const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    // Public preview data only; independent read budget, no booking or account operations.
    const limit = await db.rpc("marketplace_customer_gateway_rate_limit",{target_operation:"read",target_derived_identity:await identity(ip,secret)});
    if (limit.error) return json({error:"RATE_LIMITED"},429);
    const resolved = await db.rpc("resolve_marketplace_promo_alias_v1",{target_alias:alias});
    if (resolved.error) return json({error:"UNAVAILABLE"},503);
    if (typeof resolved.data !== "string" || !/^[0-9a-f]{32}$/.test(resolved.data)) return json({data:null},404);
    const result = await db.rpc("resolve_marketplace_promo_profile_v1",{target_code:resolved.data});
    if (result.error) return json({error:"UNAVAILABLE"},503);
    const profile = publicSocialProfile(result.data);
    if (!profile) return json({data:null},404);
    if (format === "meta") return request.method === "HEAD" ? new Response(null,{headers:{...noStore,"Content-Type":"application/json"}}) : json({data:profile});
    let portrait: string | null = null;
    // Resolve only the consent-authorized driver photo returned by the existing public-profile RPC.
    if (typeof result.data.photo_asset_id === "string") {
      const project = await db.from("projects").select("id").eq("slug","tuktuk-control").single();
      if (!project.error && project.data) {
        const asset = await db.from("media_assets").select("storage_bucket,storage_path,mime_type,byte_size").eq("project_id",project.data.id).eq("id",result.data.photo_asset_id).eq("asset_kind","driver_photo").eq("status","available").maybeSingle();
        const a = asset.data;
        if (!asset.error && a && a.storage_bucket === "marketplace-media" && ["image/jpeg","image/png"].includes(a.mime_type) && Number(a.byte_size)>0 && Number(a.byte_size)<=3*1024*1024) {
          const file = await db.storage.from("marketplace-media").download(a.storage_path);
          if (!file.error && file.data && file.data.size <= 3*1024*1024) portrait=portraitData(new Uint8Array(await file.data.arrayBuffer()),a.mime_type);
        }
      }
    }
    if (request.method === "HEAD") return new Response(null,{headers:{...noStore,"Content-Type":"image/png"}});
    const bytes = await renderSocialPng(profile,portrait);
    return new Response(bytes,{headers:{...noStore,"Content-Type":"image/png"}});
  } catch (error) { console.error("Impulsa social preview failed",error instanceof Error ? error.message : "unknown"); return json({error:"UNAVAILABLE"},503); }
});
