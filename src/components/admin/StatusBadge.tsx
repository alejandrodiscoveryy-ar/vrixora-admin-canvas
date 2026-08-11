import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AdminStatus } from "./types";

const statusConfig: Record<
  AdminStatus,
  { label: string; variant: NonNullable<BadgeProps["variant"]>; dot: string }
> = {
  active: { label: "Activo", variant: "success", dot: "bg-[var(--semantic-success)]" },
  paid: { label: "Pagado", variant: "success", dot: "bg-[var(--semantic-success)]" },
  pending: { label: "Pendiente", variant: "warning", dot: "bg-[var(--semantic-warning)]" },
  expired: { label: "Vencido", variant: "danger", dot: "bg-[var(--semantic-danger)]" },
  cancelled: { label: "Cancelado", variant: "danger", dot: "bg-[var(--semantic-danger)]" },
  inactive: { label: "Inactivo", variant: "inactive", dot: "bg-[var(--semantic-inactive)]" },
  info: { label: "Información", variant: "info", dot: "bg-[var(--semantic-info)]" },
};

export interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  status: AdminStatus;
  label?: string;
  showDot?: boolean;
}

export function StatusBadge({
  status,
  label,
  showDot = true,
  className,
  ...props
}: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge
      variant={config.variant}
      className={cn("gap-1.5 rounded-full px-2.5 py-1", className)}
      {...props}
    >
      {showDot ? (
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      ) : null}
      {label ?? config.label}
    </Badge>
  );
}
