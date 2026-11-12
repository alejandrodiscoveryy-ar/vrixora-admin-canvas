/** Shared opt-in density contract. Existing callers retain comfortable spacing. */
export type AdminDensity = "comfortable" | "compact";

export const compactSectionHeader =
  "min-w-0 flex-col items-stretch gap-2 space-y-0 border-b border-border-subtle px-3 py-3 sm:px-4";

export const compactSectionContent = "p-3 sm:p-4";

export const compactToolbarControls =
  "min-w-0 max-sm:[&_button]:min-h-11 max-sm:[&_button]:max-w-full max-sm:[&_input]:min-h-11";

export const compactToolbarSurface =
  "min-w-0 rounded-[var(--radius-card)] border border-border-subtle bg-surface-1 p-3 shadow-[var(--shadow-xs)]";

export const embeddedToolbarSurface = "w-full min-w-0 border-0 bg-transparent p-0 shadow-none sm:p-0";

/** Opt-in visual treatment; combines existing tokens without changing the theme. */
export type AdminAppearance = "standard" | "premium";

// Keep the brand accent on controls/statuses, not on the background layers.
// Graphite tones derive from the existing neutral surface and text tokens.
export const premiumSurface =
  "border-border-default bg-surface-1 shadow-[var(--shadow-card)] dark:bg-[color:color-mix(in_oklab,var(--surface-3)_89%,var(--text-secondary)_11%)]";

export const premiumMetricSurface =
  "border-border-default bg-surface-1 shadow-[var(--shadow-card)] dark:bg-[color:color-mix(in_oklab,var(--surface-3)_83%,var(--text-secondary)_17%)]";

export const premiumHeaderSurface =
  "border-border-default bg-surface-2 dark:bg-[color:color-mix(in_oklab,var(--surface-3)_80%,var(--text-secondary)_20%)]";

export const premiumColumnHeaderSurface =
  "border-border-default bg-surface-2 dark:bg-[color:color-mix(in_oklab,var(--surface-3)_85%,var(--text-secondary)_15%)]";

export const premiumControlSurface =
  "dark:bg-[color:color-mix(in_oklab,var(--surface-3)_88%,var(--text-secondary)_12%)] dark:border-border-strong dark:shadow-none";

export const premiumTableDensity =
  "[&_th]:h-9 [&_th]:px-3 [&_th]:text-text-secondary [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-text-secondary";

export const premiumTableRow =
  "border-border-default hover:bg-surface-3 dark:hover:bg-[color:color-mix(in_oklab,var(--surface-3)_82%,var(--text-secondary)_18%)]";

export const premiumInactiveBadge =
  "dark:bg-[color:color-mix(in_oklab,var(--surface-3)_81%,var(--text-secondary)_19%)] dark:border-border-strong";
