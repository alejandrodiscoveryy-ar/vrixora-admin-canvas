// Public, read-only metadata for branded /tuk/nick Aliado links.
// Never returns rates, financial records, report keys or private identifiers.
// The website server calls this endpoint; the customer continues through the
// existing ?aliado=slug entry and untouched analytics pipeline.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const respond = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers });
const validSlug = (s: string) => /^[a-z0-9][a-z0-9-]{1,23}$/.test(s) && !s.endsWith("-");

Deno.serve(async (request: Request) => {
  if (request.method !== "GET") return respond(405, { error: "METHOD_NOT_ALLOWED" });
  const u = new URL(request.url);
  const slug = u.searchParams.get("slug") ?? "";
  if (!validSlug(slug)) return respond(400, { error: "INVALID_NICK" });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return respond(503, { error: "UNAVAILABLE" });
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("get_public_marketplace_ally_shortlink_v1", { target_slug: slug });
    if (error) return respond(503, { error: "UNAVAILABLE" });
    if (!data) return respond(404, { error: "NOT_FOUND" });
    const nick = data.display_name;
    const state = data.status;
    if (data.slug !== slug || typeof nick !== "string" ||
        !["active", "paused"].includes(state) || nick.length > 80) {
      return respond(503, { error: "INVALID_PROFILE" });
    }
    return respond(200, { slug, display_name: nick, status: state });
  } catch {
    return respond(503, { error: "UNAVAILABLE" });
  }
});
