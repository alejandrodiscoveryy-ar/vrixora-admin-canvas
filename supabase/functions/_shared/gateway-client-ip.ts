import { isIP } from "node:net";

/**
 * Deployment prerequisite: the managed ingress MUST overwrite this header and
 * prevent direct requests from bypassing it. Syntax validation alone does not
 * establish that trust. Verify that contract before deploying these gateways.
 * Never fall back to caller-controlled forwarding chains or a shared identity.
 */
export function gatewayClientIp(headers: Headers): string {
  const ip = headers.get("cf-connecting-ip")?.trim() ?? "";
  const family = isIP(ip);
  if (!family || ip.includes("%")) {
    throw new Error("GATEWAY_CLIENT_IP_UNAVAILABLE");
  }
  // Normalize equivalent IPv6 spellings before deriving the HMAC identity.
  return family === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip;
}
