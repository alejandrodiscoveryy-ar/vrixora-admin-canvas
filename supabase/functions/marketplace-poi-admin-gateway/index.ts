// TukTuk: administrar catalogos OSM por provincia, sin exponer service_role al navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY");
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key || !secret) throw new Error("CONFIGURATION_MISSING");

    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) return reply({ error: "AUTH_REQUIRED" }, 401);
    const actor = createClient(url, key, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    const { data: verified, error: authError } = await actor.auth.getUser(jwt);
    if (authError || !verified.user) return reply({ error: "AUTH_REQUIRED" }, 401);

    const body = await request.json();
    const operation = String(body?.operation ?? "");
    const projectId = String(body?.project_id ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId))
      return reply({ error: "PROJECT_ID_INVALID" }, 400);
    if (!["list", "queue"].includes(operation)) return reply({ error: "OPERATION_INVALID" }, 400);

    // La autorización de proyecto ocurre ANTES de crear el cliente privilegiado.
    const { data: permissions, error: permissionError } = await actor.rpc(
      "get_my_project_permissions", { target_project_id: projectId },
    );
    if (permissionError || !Array.isArray(permissions)) return reply({ error: "PROJECT_FORBIDDEN" }, 403);
    const codes = new Set(permissions.map((p: { permission_code: string }) => p.permission_code));
    if (!codes.has("marketplace.view") && !codes.has("marketplace.map.manage"))
      return reply({ error: "PROJECT_FORBIDDEN" }, 403);
    if (operation === "queue" && !codes.has("marketplace.map.manage"))
      return reply({ error: "MAP_MANAGE_FORBIDDEN" }, 403);

    const service = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: project, error: projectError } = await service
      .from("projects").select("id,slug").eq("id", projectId).maybeSingle();
    if (projectError || project?.slug !== "tuktuk-control")
      return reply({ error: "PROJECT_INVALID" }, 403);

    if (operation === "queue") {
      const code = String(body.province_code ?? "").trim();
      if (!/^CU-(0[1-9]|1[0-6]|99)$/.test(code)) return reply({ error: "PROVINCE_INVALID" }, 400);
      const { data, error } = await service.rpc("marketplace_poi_queue_refresh", {
        target_project_id: projectId,
        target_province_code: code,
        target_requested_by: verified.user.id,
      });
      if (error) throw error;
      const token = Deno.env.get("TUKTUK_POI_GITHUB_DISPATCH_TOKEN")?.trim();
      let dispatched = false;
      if (token) {
        try {
          const result = await fetch(
            "https://api.github.com/repos/alejandrodiscoveryy-ar/vrixora-admin-canvas/actions/workflows/tuktuk-poi-province-refresh.yml/dispatches",
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
                "User-Agent": "tuktuk-poi-admin/1.0",
              },
              body: JSON.stringify({ ref: "main" }),
              signal: AbortSignal.timeout(15000),
            },
          );
          dispatched = result.status === 204;
        } catch {
          dispatched = false;
        }
      }
      if (!dispatched) {
        // No informar una sincronizacion iniciada si GitHub no la acepto.
        await service.rpc("marketplace_poi_cancel_queued", {
          target_job_id: data,
          target_error: token ? "GITHUB_DISPATCH_FAILED" : "GITHUB_DISPATCH_NOT_CONFIGURED",
        });
        return reply({ error: "GITHUB_DISPATCH_UNAVAILABLE" }, 503);
      }
      return reply({ ok: true, job_id: data, status: "queued", province_code: code });
    }

    const [{ data: provinces, error: provinceError }, { data: jobs, error: jobError }] = await Promise.all([
      service.from("marketplace_poi_provinces")
        .select("code,name,catalog_ready,poi_count,last_updated_at,last_source_md5")
        .order("name"),
      service.from("marketplace_poi_refresh_jobs")
        .select("id,province_code,status,created_at,started_at,finished_at,processed_count,error_message")
        .eq("project_id", projectId).order("created_at", { ascending: false }).limit(30),
    ]);
    if (provinceError || jobError) throw (provinceError ?? jobError);
    return reply({ ok: true, provinces: provinces ?? [], jobs: jobs ?? [] });
  } catch (error) {
    // No exponer SQL ni detalles internos al navegador.
    console.error("POI_ADMIN_ERROR", error instanceof Error ? error.message : "unknown");
    return reply({ error: "POI_ADMIN_UNAVAILABLE" }, 503);
  }
});
