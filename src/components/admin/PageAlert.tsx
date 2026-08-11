import { AlertCircle, CheckCircle2, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PageAlertTone = "info" | "success" | "warning" | "error";

const toneMap: Record<PageAlertTone, { icon: LucideIcon; className: string }> = {
  info: {
    icon: Info,
    className:
      "border-[var(--semantic-info-border)] bg-[var(--semantic-info-surface)] text-[var(--semantic-info-foreground)]",
  },
  success: {
    icon: CheckCircle2,
    className:
      "border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] text-[var(--semantic-success-foreground)]",
  },
  warning: {
    icon: TriangleAlert,
    className:
      "border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] text-[var(--semantic-warning-foreground)]",
  },
  error: {
    icon: AlertCircle,
    className:
      "border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-surface)] text-[var(--semantic-danger-foreground)]",
  },
};

export function PageAlert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: PageAlertTone;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const config = toneMap[tone];
  const Icon = config.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-compact)] border p-4 text-sm",
        config.className,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-text-secondary">
        {title ? <p className="font-semibold text-text-primary">{title}</p> : null}
        <div className={cn(title ? "mt-1" : "")}>{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
