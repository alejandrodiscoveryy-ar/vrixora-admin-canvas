import { ImageResponse } from "npm:@vercel/og@0.11.1";
import React from "npm:react@19.2.0";
const h = React.createElement;

const categories: Record<string,string> = { motorcycle:"Moto", bicitaxi:"Bicitaxi", tricycle:"Triciclo", light_car:"Auto", comfort:"Confort", confort:"Confort", van:"Furgoneta", truck:"Camión", bicycle:"Bicicleta" };
const services: Record<string,string> = { passenger:"Pasajeros", cargo:"Carga", courier:"Mensajería", tourism:"Turismo" };
export type SocialProfile = { name: string; category: string; services: string[] };
export function publicSocialProfile(raw: unknown): SocialProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string,unknown>;
  if (p.verified !== true || typeof p.public_name !== "string" || !p.public_name.trim()) return null;
  const name = Array.from(p.public_name.trim().replace(/[\x00-\x1f\x7f]/g,"")).slice(0,60).join("");
  const category = categories[String(p.category_code)] ?? "Transporte";
  const list = Array.isArray(p.service_codes) ? [...new Set(p.service_codes.map(s => services[String(s)]).filter(Boolean))] : [];
  return { name, category, services: list };
}
const flex = {display:"flex"} as const;
export function socialCard(profile: SocialProfile, portrait: string | null) {
  const accent = profile.category === "Triciclo" ? "#FB923C" : profile.category === "Moto" ? "#38BDF8" : profile.category === "Bicitaxi" ? "#34D399" : "#2DD4BF";
  const nameSize = profile.name.length > 28 ? 48 : profile.name.length > 18 ? 58 : 72;
  return h("div",{style:{...flex,width:"100%",height:"100%",position:"relative",backgroundColor:"#071722",color:"#F8FAFC",padding:46,flexDirection:"column"}},
    h("div",{style:{...flex,position:"absolute",right:-100,top:-150,width:620,height:620,borderRadius:310,border:"2px solid #1A4452"}},
      h("div",{style:{...flex,margin:54,width:510,height:510,borderRadius:255,border:"2px solid #17404C"}})),
    h("div",{style:{...flex,alignItems:"center",justifyContent:"space-between",width:"100%",height:70}},
      h("div",{style:{...flex,alignItems:"baseline",fontSize:43,fontWeight:700,letterSpacing:-2}},"Tuk",h("span",{style:{color:accent}},"Tuk")),
      h("div",{style:{...flex,alignItems:"center",border:"1px solid #357E84",borderRadius:20,padding:"10px 24px",fontSize:24,fontWeight:700,letterSpacing:3,color:"#7DE8DA"}},"IMPULSA")),
    h("div",{style:{...flex,alignItems:"center",gap:38,marginTop:32}},
      h("div",{style:{...flex,alignItems:"center",justifyContent:"center",width:258,height:258,borderRadius:129,border:"6px solid "+accent,backgroundColor:"#163B49",overflow:"hidden",flexShrink:0}},
        portrait ? h("img",{src:portrait,width:246,height:246,style:{objectFit:"cover",borderRadius:123}}) :
          h("div",{style:{...flex,fontSize:105,fontWeight:700,color:"#BFECE9"}},Array.from(profile.name)[0]?.toUpperCase() || "T")),
      h("div",{style:{...flex,flexDirection:"column",width:750,gap:10}},
        h("div",{style:{...flex,fontSize:25,fontWeight:700,color:"#A7DCD9"}},"VIAJA CON"),
        h("div",{style:{...flex,fontSize:nameSize,fontWeight:700,letterSpacing:-1.6,lineHeight:1.05}},profile.name),
        h("div",{style:{...flex,alignItems:"center",gap:10,fontSize:27,color:"#CBE9FF"}},
          h("div",{style:{...flex,alignItems:"center",justifyContent:"center",width:38,height:38,borderRadius:19,backgroundColor:"#1D9BF0",color:"white",fontSize:26,fontWeight:700}},"✓"),
          "Conductor verificado"),
        h("div",{style:{...flex,fontSize:26,color:"#C1D0D9",lineHeight:1.2}},profile.category + (profile.services.length ? " · " + profile.services.join(" · ") : "")))),
    h("div",{style:{...flex,marginTop:34,backgroundColor:"#123340",border:"1px solid #286171",borderRadius:24,padding:"23px 28px",alignItems:"center",justifyContent:"space-between"}},
      h("div",{style:{...flex,flexDirection:"column",gap:5}},
        h("div",{style:{...flex,fontSize:35,fontWeight:700,color:"#F8FAFC"}},"Solicita mi servicio"),
        h("div",{style:{...flex,fontSize:23,color:"#ABD9D6"}},"Tu próximo viaje, a un toque.")),
      h("div",{style:{...flex,backgroundColor:accent,color:"#08212A",fontSize:27,fontWeight:700,borderRadius:16,padding:"16px 25px"}},"Viajar →")),
    h("div",{style:{...flex,marginTop:17,justifyContent:"space-between",fontSize:20,color:"#93B1BD"}},"Agencia TukTuk",h("span",null,"vrixora.com")));
}
export async function renderSocialPng(profile: SocialProfile, portrait: string | null): Promise<ArrayBuffer> {
  const render = async (image: string | null) => {
    const response = new ImageResponse(socialCard(profile,image), {width:1200,height:630,headers:{"Cache-Control":"no-store"}});
    return await response.arrayBuffer();
  };
  try { return await render(portrait); } catch (error) { if (!portrait) throw error; return await render(null); }
}
