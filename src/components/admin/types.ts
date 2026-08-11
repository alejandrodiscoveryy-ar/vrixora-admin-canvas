import type { LucideIcon } from "lucide-react";

export type AdminModuleKey =
  | "resumen"
  | "clientes"
  | "comercial"
  | "licencias"
  | "planes"
  | "pagos"
  | "empleados"
  | "rendimiento"
  | "configuracion"
  | "auditoria";

export const moduleColorMap: Record<AdminModuleKey, string> = {
  resumen: "var(--module-resumen)",
  clientes: "var(--module-clientes)",
  comercial: "var(--module-comercial)",
  licencias: "var(--module-licencias)",
  planes: "var(--module-planes)",
  pagos: "var(--module-pagos)",
  empleados: "var(--module-empleados)",
  rendimiento: "var(--module-rendimiento)",
  configuracion: "var(--module-configuracion)",
  auditoria: "var(--module-auditoria)",
};

export const moduleVisualMap: Record<
  AdminModuleKey,
  { accent: string; surface: string; border: string; foreground: string; glow: string }
> = Object.fromEntries(
  Object.keys(moduleColorMap).map((module) => [
    module,
    {
      accent: `var(--module-${module}-accent)`,
      surface: `var(--module-${module}-surface)`,
      border: `var(--module-${module}-border)`,
      foreground: `var(--module-${module}-foreground)`,
      glow: `var(--module-${module}-glow)`,
    },
  ]),
) as Record<
  AdminModuleKey,
  { accent: string; surface: string; border: string; foreground: string; glow: string }
>;

export const moduleBorderLeftMap: Record<AdminModuleKey, string> = {
  resumen: "border-l-4 border-l-[var(--module-resumen)]",
  clientes: "border-l-4 border-l-[var(--module-clientes)]",
  comercial: "border-l-4 border-l-[var(--module-comercial)]",
  licencias: "border-l-4 border-l-[var(--module-licencias)]",
  planes: "border-l-4 border-l-[var(--module-planes)]",
  pagos: "border-l-4 border-l-[var(--module-pagos)]",
  empleados: "border-l-4 border-l-[var(--module-empleados)]",
  rendimiento: "border-l-4 border-l-[var(--module-rendimiento)]",
  configuracion: "border-l-4 border-l-[var(--module-configuracion)]",
  auditoria: "border-l-4 border-l-[var(--module-auditoria)]",
};

export type SemanticState = "success" | "warning" | "danger" | "info" | "inactive";

export type AdminStatus =
  "active" | "paid" | "pending" | "expired" | "cancelled" | "inactive" | "info";

export const semanticColorMap: Record<SemanticState, string> = {
  success: "var(--semantic-success)",
  warning: "var(--semantic-warning)",
  danger: "var(--semantic-danger)",
  info: "var(--semantic-info)",
  inactive: "var(--semantic-inactive)",
};
