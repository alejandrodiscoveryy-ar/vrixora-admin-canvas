/** Shared visual tokens for the TukTuk commercial workspace. Functional state stays in each feature. */
export const commercialPremium = {
  shell: "space-y-4",
  header: "rounded-2xl border border-border/60 bg-card/75 px-4 py-4 shadow-sm sm:px-5 sm:py-5 admin-graphite-panel",
  eyebrow: "text-[10px] font-semibold uppercase tracking-[0.16em]",
  title: "mt-1 text-xl font-semibold tracking-tight text-foreground",
  description: "mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground",
  section: "rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm sm:p-4 admin-graphite-panel",
  metric: "min-w-0 rounded-xl border border-border/60 bg-card/65 p-3 shadow-sm",
  accordion: "group overflow-hidden rounded-xl border border-border/60 bg-card/70 transition-colors open:border-violet-400/25 open:bg-card/85",
  accordionTitle: "flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden",
  accordionBody: "border-t border-border/40 p-2 sm:p-3",
} as const;
