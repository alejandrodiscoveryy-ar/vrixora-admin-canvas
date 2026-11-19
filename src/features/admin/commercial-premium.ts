import { premiumColumnHeaderSurface, premiumControlSurface, premiumHeaderSurface, premiumMetricSurface, premiumSurface } from "@/components/admin/density";

/**
 * Comercial-specific composition only: color, depth and density are inherited
 * from Vrixora Admin's official shared tokens, not a parallel visual palette.
 */
export const commercialPremium = {
  shell: "min-w-0 space-y-4",
  // Scoped to Comercial: softens the almost-black gutters without changing the Admin theme.
  workspace: "min-w-0 rounded-[var(--radius-card)] border border-border-subtle bg-surface-2 p-2 sm:p-3 dark:bg-[color:color-mix(in_oklab,var(--surface-3)_95%,var(--text-secondary)_5%)]",
  header: `min-w-0 rounded-[var(--radius-card)] border px-3 py-3 sm:px-4 ${premiumHeaderSurface}`,
  eyebrow: "text-[11px] font-semibold uppercase tracking-[0.12em]",
  title: "mt-1 break-words text-lg font-semibold tracking-tight text-text-primary sm:text-xl",
  description: "mt-1 max-w-2xl text-xs leading-relaxed text-text-secondary sm:text-sm",
  section: `min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4 ${premiumSurface}`,
  metric: `min-w-0 rounded-[var(--radius-card)] border p-3 ${premiumMetricSurface}`,
  // All layers use the same official graphite palette and keep clear edge contrast.
  inset: `min-w-0 rounded-[var(--radius-card)] border p-3 sm:p-4 ${premiumColumnHeaderSurface} shadow-none`,
  control: `rounded-[var(--radius-control)] border ${premiumControlSurface}`,
  accordion: `group min-w-0 overflow-hidden rounded-[var(--radius-card)] border transition-colors open:border-border-strong ${premiumSurface}`,
  accordionTitle: "flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-3 text-sm font-semibold text-text-primary sm:px-4 [&::-webkit-details-marker]:hidden",
  accordionBody: "border-t border-border-subtle p-3 sm:p-4",
} as const;
