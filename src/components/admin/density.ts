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
