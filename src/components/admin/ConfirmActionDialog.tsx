import { AlertTriangle, Info, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const toneConfig = {
  normal: { icon: Info, color: "text-[var(--semantic-info-foreground)]" },
  warning: { icon: AlertTriangle, color: "text-[var(--semantic-warning-foreground)]" },
  destructive: { icon: Trash2, color: "text-[var(--semantic-danger-foreground)]" },
} as const;

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "normal",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: keyof typeof toneConfig;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const config = toneConfig[tone];
  const Icon = config.icon;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100%-1rem)] rounded-[var(--radius-dialog)] border-border-default bg-surface-overlay shadow-[var(--shadow-overlay)]">
        <AlertDialogHeader>
          <div
            className={cn(
              "mx-auto mb-2 grid h-11 w-11 place-items-center rounded-xl bg-surface-3 sm:mx-0",
              config.color,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={onConfirm}
            className={cn(tone === "destructive" && buttonVariants({ variant: "destructive" }))}
          >
            {pending ? "Procesando..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
