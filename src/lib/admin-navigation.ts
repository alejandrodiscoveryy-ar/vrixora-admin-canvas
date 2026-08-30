import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CreditCard,
  FileKey2,
  Gauge,
  ScrollText,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
  Megaphone,
  PlugZap,
} from "lucide-react";

import type { ProjectPermission } from "@/lib/services";

export type AdminProjectTab = {
  slug: string;
  label: string;
  icon: LucideIcon;
  permission: ProjectPermission;
};

export const ADMIN_PROJECT_TABS = [
  {
    slug: "",
    label: "Resumen",
    icon: Gauge,
    permission: "project.view",
  },
  {
    slug: "clientes",
    label: "Clientes",
    icon: Users,
    permission: "customers.view",
  },
  {
    slug: "comercial",
    label: "Comercial",
    icon: Megaphone,
    permission: "commercial.view",
  },
  {
    slug: "licencias",
    label: "Licencias",
    icon: FileKey2,
    permission: "licenses.view",
  },
  {
    slug: "planes",
    label: "Planes y precios",
    icon: Tags,
    permission: "plans.view",
  },
  {
    slug: "pagos",
    label: "Pagos",
    icon: CreditCard,
    permission: "payments.view",
  },
  {
    slug: "empleados",
    label: "Empleados",
    icon: ShieldCheck,
    permission: "members.view",
  },
  {
    slug: "rendimiento",
    label: "Rendimiento",
    icon: BarChart3,
    permission: "analytics.view",
  },
  {
    slug: "configuracion",
    label: "Configuración",
    icon: Settings2,
    permission: "settings.view",
  },
  {
    slug: "comunicados",
    label: "Comunicados",
    icon: Megaphone,
    permission: "settings.view",
  },
  {
    slug: "integraciones",
    label: "Integraciones",
    icon: PlugZap,
    permission: "settings.view",
  },
  {
    slug: "auditoria",
    label: "Auditoría",
    icon: ScrollText,
    permission: "audit.view",
  },
] satisfies Array<AdminProjectTab>;
