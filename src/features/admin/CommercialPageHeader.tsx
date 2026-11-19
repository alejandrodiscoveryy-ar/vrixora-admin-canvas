import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";

/**
 * Commercial uses Vrixora Admin's official ModuleHeader. No independent
 * gradients, typography scale or duplicate local header variants.
 */
export function CommercialPageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <ModuleHeader
      module="comercial"
      density="compact"
      appearance="premium"
      title={title}
      description={description}
      icon={icon}
      actions={actions}
      className="mb-0 min-w-0"
    />
  );
}
