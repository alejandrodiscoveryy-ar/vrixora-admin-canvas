import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BriefcaseBusiness,
  Gauge,
  Megaphone,
  PlugZap,
  ScrollText,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";

import type { ProjectPermission } from "@/lib/services";

export type AdminProjectTab = {
  slug: string;
  label: string;
  icon: LucideIcon;
  permission: ProjectPermission;
};

export type AdminProjectGroup = {
  slug: string;
  label: string;
  icon: LucideIcon;
  children: AdminProjectTab[];
};

export type AdminProjectNavItem = AdminProjectTab | AdminProjectGroup;

const administrationChildren = [
  {
    slug: "configuracion",
    label: "Configuración",
    icon: Settings2,
    permission: "settings.view",
  },
  {
    slug: "empleados",
    label: "Empleados",
    icon: ShieldCheck,
    permission: "members.view",
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
] satisfies Array<AdminProjectTab>;

export const ADMIN_PROJECT_TABS = [
  {
    slug: "trabajos",
    label: "Trabajos",
    icon: BriefcaseBusiness,
    permission: "marketplace.view",
  },
  {
    slug: "",
    label: "Panel general",
    icon: Gauge,
    permission: "project.view",
  },
  {
    slug: "clientes",
    label: "Usuarios app",
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
    slug: "planes",
    label: "Tarifas",
    icon: Tags,
    permission: "plans.view",
  },
  {
    slug: "rendimiento",
    label: "Analítica",
    icon: BarChart3,
    permission: "analytics.view",
  },
  {
    slug: "administracion",
    label: "Administración",
    icon: Settings2,
    children: administrationChildren,
  },
  {
    slug: "auditoria",
    label: "Auditoría",
    icon: ScrollText,
    permission: "audit.view",
  },
] satisfies Array<AdminProjectNavItem>;