import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Eye,
  Gauge,
  MapPin,
  Headphones,
  Megaphone,
  PlugZap,
  ScrollText,
  Settings2,
  ShieldCheck,
  Tags,
  UserRound,
  Wallet,
  WalletCards,
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

export const ADMINISTRATION_VIEWS = [
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

export const MARKETPLACE_WORKSPACE_VIEWS = [
  { slug: "resumen", label: "Pulso", icon: Eye, permission: "marketplace.view" },
  { slug: "trabajos", label: "Operaciones", icon: BriefcaseBusiness, permission: "marketplace.view" },
  { slug: "atencion", label: "Atención al cliente", icon: Headphones, permission: "marketplace.view" },
  { slug: "mapa", label: "Mapa", icon: MapPin, permission: "marketplace.view" },
  { slug: "conductores", label: "Conductores", icon: Users, permission: "marketplace.view" },
  { slug: "clientes", label: "Clientes", icon: UserRound, permission: "customers.view" },
  { slug: "billeteras", label: "Billeteras", icon: Wallet, permission: "payments.view" },
  { slug: "recargas", label: "Recargas", icon: WalletCards, permission: "payments.view" },
  { slug: "incidencias", label: "Incidencias", icon: AlertTriangle, permission: "marketplace.view" },
  { slug: "configuracion", label: "Configuración", icon: ShieldCheck, permission: "settings.view" },
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
    children: ADMINISTRATION_VIEWS,
  },
  {
    slug: "auditoria",
    label: "Auditoría",
    icon: ScrollText,
    permission: "audit.view",
  },
] satisfies Array<AdminProjectNavItem>;