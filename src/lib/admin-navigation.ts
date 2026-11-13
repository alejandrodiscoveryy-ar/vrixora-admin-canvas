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
  SlidersHorizontal,
  CarFront,
  Truck,
  Package,
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
    label: "Ajustes generales",
    icon: SlidersHorizontal,
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

export const PRICING_WORKSPACE_VIEWS = [
  { code: "global", number: "01", label: "Ajuste general", subtitle: "Plataforma y control de cambios", eyebrow: "GESTIÓN TRANSVERSAL", description: "Consulta el ajuste publicado y prepara nuevas simulaciones con verificación segura.", icon: SlidersHorizontal },
  { code: "passenger", number: "02", label: "Pasajeros", subtitle: "Viajes y modalidades de transporte", eyebrow: "SERVICIO DE PASAJEROS", description: "Gestiona los precios de las modalidades para trasladar personas.", icon: CarFront },
  { code: "cargo", number: "03", label: "Carga", subtitle: "Mercancías y logística", eyebrow: "SERVICIO DE CARGA", description: "Gestiona tarifas para el transporte de objetos y mercancías.", icon: Truck },
  { code: "courier", number: "04", label: "Mensajería", subtitle: "Paquetes y entregas", eyebrow: "SERVICIO DE MENSAJERÍA", description: "Gestiona tarifas para recogidas y entregas.", icon: Package },
] as const;

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
  { slug: "configuracion", label: "Configuración operativa", icon: ShieldCheck, permission: "settings.view" },
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
    label: "Configuración",
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

/** Navigation families use existing module accent tokens, never operational status colors. */
export type AdminNavTone = "trabajos" | "panel" | "usuarios" | "comercial" | "tarifas" | "analitica" | "administracion" | "auditoria" | "finanzas" | "licencias" | "equipo" | "recargas" | "mapa";

export function adminNavTone(section: string): AdminNavTone {
  switch (section) {
    case "trabajos": return "trabajos";
    case "clientes": return "usuarios";
    case "comercial": return "comercial";
    case "planes": return "tarifas";
    case "rendimiento": return "analitica";
    case "administracion":
    case "configuracion":
    case "empleados":
    case "comunicados":
    case "integraciones": return "administracion";
    case "auditoria": return "auditoria";
    case "pagos":
    case "billeteras":
    case "recargas": return "finanzas";
    case "licencias": return "licencias";
    default: return "panel";
  }
}


/** Child colors identify destinations, not statuses. Keep parent colors independent. */
export function adminSubnavTone(group: "trabajos" | "precios" | "administracion" | "configuracion", child: string): AdminNavTone {
  switch (group) {
    case "trabajos":
      switch (child) {
        case "resumen": return "panel";
        case "trabajos": return "trabajos";
        case "atencion": return "comercial";
        case "mapa": return "mapa";
        case "conductores": return "equipo";
        case "clientes": return "usuarios";
        case "billeteras": return "finanzas";
        case "recargas": return "recargas";
        case "incidencias": return "auditoria";
        case "configuracion": return "administracion";
        default: return "trabajos";
      }
    case "precios":
      switch (child) {
        case "passenger": return "usuarios";
        case "cargo": return "analitica";
        case "courier": return "trabajos";
        default: return "tarifas";
      }
    case "administracion":
      switch (child) {
        case "empleados": return "equipo";
        case "comunicados": return "comercial";
        case "integraciones": return "licencias";
        default: return "administracion";
      }
    case "configuracion":
      switch (child) {
        case "pruebas": return "comercial";
        case "operacion": return "panel";
        case "territorio": return "trabajos";
        default: return "administracion";
      }
  }
}
