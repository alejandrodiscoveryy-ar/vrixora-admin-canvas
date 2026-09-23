import { handleRequest, parseDirections, routeToken, verifiedRoute } from "./index.ts";

const origin = { lat: 23.1136, lon: -82.3666 };
const destination = { lat: 23.12, lon: -82.37 };
const secret = "local-test-signing-secret";
const route = { distance_km: 9, duration_seconds: 1200 };
function check(value: boolean, message: string) {
  if (!value) throw Error(message);
}
async function rejects(action: () => Promise<unknown>, message: string) {
  let rejected = false;
  try { await action(); } catch { rejected = true; }
  check(rejected, message);
}

Deno.test("GeoJSON longitude latitude becomes Flutter latitude longitude", () => {
  const parsed = parseDirections({ routes: [{
    distance: 9000, duration: 1200,
    geometry: { coordinates: [[-82.3666, 23.1136], [-82.37, 23.12]] },
  }] });
  check(parsed.distance_km === 9, "distance conversion");
  check(parsed.route_points[0].lat === 23.1136, "latitude conversion");
  check(parsed.route_points[0].lon === -82.3666, "longitude conversion");
});

Deno.test("signed route rejects tampering and changed coordinates", async () => {
  const token = await routeToken(origin, destination, route, secret);
  const verified = await verifiedRoute(token, origin, destination, secret);
  check(verified.distance_km === 9, "signed distance");
  await rejects(() => verifiedRoute(token, { ...origin, lat: 23.2 }, destination, secret), "changed point accepted");
  await rejects(() => verifiedRoute(`${token}0`, origin, destination, secret), "changed signature accepted");
});

Deno.test("signed route expires after fifteen minutes", async () => {
  const token = await routeToken(origin, destination, route, secret);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 901000;
    await rejects(() => verifiedRoute(token, origin, destination, secret), "expired token accepted");
  } finally {
    Date.now = realNow;
  }
});

Deno.test("create_request overrides browser distance with the signed route", async () => {
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MAPBOX_SERVER_TOKEN",
    "MARKETPLACE_ROUTE_SIGNING_SECRET", "MARKETPLACE_RATE_LIMIT_SECRET"];
  const previous = names.map(name => Deno.env.get(name));
  const values = ["https://local.example", "service-key", "mapbox-test", secret, "rate-secret"];
  names.forEach((name, index) => Deno.env.set(name, values[index]));
  const realFetch = globalThis.fetch;
  let captured: any;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("marketplace_customer_gateway_rate_limit")) return new Response(null, { status: 204 });
    if (url.includes("create_marketplace_customer_request")) {
      captured = JSON.parse(String(init?.body));
      return Response.json([{ job_id: "job-test" }]);
    }
    throw Error(`Unexpected call: ${url}`);
  };
  try {
    const token = await routeToken(origin, destination, route, secret);
    const response = await handleRequest(new Request("https://local.example/map", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "create_request", origin, destination, route_token: token,
        params: { target_details: { estimated_distance_km: 1, distance_source: "manual" } } }),
    }));
    check(response.status === 200, `create failed: ${await response.text()}`);
    check(captured.target_details.estimated_distance_km === 9, "browser km was trusted");
    check(captured.target_details.distance_source === "provider", "distance source was trusted");
  } finally {
    globalThis.fetch = realFetch;
    names.forEach((name, index) => previous[index] == null ? Deno.env.delete(name) : Deno.env.set(name, previous[index]));
  }
});
