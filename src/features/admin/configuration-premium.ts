import {
  premiumColumnHeaderSurface,
  premiumHeaderSurface,
  premiumMetricSurface,
  premiumSurface,
} from "@/components/admin/density";

/**
 * Opt-in editorial hierarchy for Configuración.
 * Uses the official graphite and module tokens, never a second color system.
 */
export const configurationPremium = {
  page: "min-w-0 space-y-3",
  navigation: `relative min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-border-default p-2 shadow-[var(--shadow-card)] ${premiumColumnHeaderSurface} before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[var(--module-accent)] before:opacity-80`,
  tab: "relative flex min-h-12 min-w-0 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-left transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
  tabActive: "border-[var(--module-border)] bg-[var(--module-surface)] text-text-primary shadow-[inset_0_-2px_var(--module-accent)]",
  tabIdle: "border-transparent bg-transparent text-text-secondary hover:border-border-default hover:bg-surface-3/75 hover:text-text-primary",
  tabIcon: "grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--module-border)] bg-[var(--module-surface)] text-[var(--module-accent)]",
  card: `relative min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-border-default shadow-[var(--shadow-card)] ${premiumSurface}`,
  cardHeader: `relative border-b border-border-default px-3 py-3 sm:px-4 ${premiumHeaderSurface} before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--module-accent)] before:opacity-75`,
  panel: `relative min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-border-default ${premiumColumnHeaderSurface}`,
  inset: `min-w-0 rounded-[var(--radius-compact)] border border-border-default ${premiumMetricSurface}`,
  accentLine: "pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-[var(--module-accent)] opacity-75",
  eyebrow: "text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--module-accent)]",
} as const;
