import { BadgeCheck } from "lucide-react";

export default function DriverVerifiedBadge({ compact = false, iconOnly = false }: { compact?: boolean; iconOnly?: boolean }) {
  if (iconOnly) return (
    <span className="inline-flex shrink-0 items-center" title="Conductor verificado por Agencia TukTuk" role="img" aria-label="Conductor verificado" data-driver-verified="true">
      <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-[#1D9BF0] text-white" aria-hidden="true" />
    </span>
  );
  return <span title="Identidad verificada por Agencia TukTuk" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold leading-tight text-blue-600 dark:text-blue-300" data-driver-verified="true">
    <BadgeCheck className="h-4 w-4 shrink-0 fill-[#1D9BF0] text-white" aria-hidden="true" />
    {compact ? "Verificado" : "Conductor verificado"}
  </span>;
}
