import { publicSocialProfile, renderSocialPng } from "./social-card.ts";
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
Deno.test("only an explicitly verified, authorized promotional profile is rendered", () => {
  assert(publicSocialProfile({verified:false,public_name:"Test"}) === null,"unverified profile");
  assert(publicSocialProfile({verified:true,public_name:" "}) === null,"empty profile");
  const p=publicSocialProfile({verified:true,public_name:"Gerson",category_code:"tricycle",service_codes:["cargo","passenger","courier","unknown"],photo_asset_id:"internal"});
  assert(p?.name==="Gerson" && p.category==="Triciclo" && p.services.length===3,"public projection");
  assert(p && !("photo_asset_id" in p),"no private identifiers");
});
Deno.test("horizontal social artwork is real 1200x630 PNG, with portrait or fallback", async () => {
  const p={name:"Gerson",category:"Triciclo",services:["Carga","Mensajería","Pasajeros"]};
  const sample="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=";
  for (const portrait of [null,sample]) {
    const png=await renderSocialPng(p,portrait);
    const b=new Uint8Array(png);
    assert(b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71,"PNG signature");
    const view=new DataView(png);
    assert(view.getUint32(16)===1200 && view.getUint32(20)===630,"PNG dimensions");
    assert(png.byteLength>10000,"rendered image");
  }
});
