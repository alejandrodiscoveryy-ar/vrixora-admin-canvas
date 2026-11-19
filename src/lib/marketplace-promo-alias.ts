/**
 * Suggests a readable, driver-specific commercial URL before activation.
 * The unique database constraint remains the source of truth: a suggestion
 * never reserves an alias or grants promotional consent.
 */
const RESERVED_PROMO_ALIASES = new Set([
  "admin", "api", "tuktuk", "soporte", "impulsa",
  "cliente", "conductor", "ayuda", "login", "registro",
]);

export function validDriverPromoAlias(alias: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,31}$/.test(alias)
    && !alias.endsWith("-")
    && !RESERVED_PROMO_ALIASES.has(alias);
}

export function suggestDriverPromoAlias(displayName: string, userId: string): string {
  const words = displayName.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const name = [words[0], words.length > 1 ? words[words.length - 1] : null]
    .filter(Boolean).join("-");
  // User IDs are UUIDs; the visible suffix distinguishes homonyms.
  // The server checks actual availability atomically on activation.
  const identifier = userId.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  const suffix = identifier.length >= 8 ? identifier.slice(-8) : "pendiente";
  const maxPrefixLength = 32 - suffix.length - 1;
  const prefix = (name || "conductor").slice(0, maxPrefixLength).replace(/-+$/, "") || "conductor";
  const candidate = `${prefix}-${suffix}`;
  return validDriverPromoAlias(candidate) ? candidate : `conductor-${suffix}`;
}
