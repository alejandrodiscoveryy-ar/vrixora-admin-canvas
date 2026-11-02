import type { LucideIcon } from "lucide-react";

export type PremiumSettingsMetric = {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "warning";
};

type Props = {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  metrics: PremiumSettingsMetric[];
};

export default function PremiumSettingsSnapshot({ number, eyebrow, title, description, icon: Icon, metrics }: Props) {
  return (
    <section aria-label={"Panel de " + title} className="relative isolate overflow-hidden rounded-[25px] border border-cyan-400/20 bg-gradient-to-br from-[#10212a] via-[#0a141b] to-[#061117] p-4 shadow-[0_25px_75px_-45px_rgba(0,0,0,0.95)] sm:p-6">
      <Icon aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-56 w-56 -rotate-12 text-cyan-300 opacity-[0.045]" strokeWidth={1} />
      <div className="relative space-y-5">
        <header className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-200">
            <Icon aria-hidden="true" className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-300/80">{number} / {eyebrow}</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-white">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">{description}</p>
          </div>
        </header>
        <div className="grid gap-2 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 rounded-2xl border border-cyan-400/15 bg-[#061118]/75 p-3.5 shadow-inner shadow-black/10">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-400">{metric.label}</p>
              <p className={"mt-1 truncate text-base font-bold " + (metric.tone === "warning" ? "text-amber-200" : metric.tone === "success" ? "text-emerald-200" : "text-white")} title={metric.value}>{metric.value}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{metric.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
