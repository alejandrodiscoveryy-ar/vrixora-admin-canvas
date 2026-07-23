// DEMO DATA — clearly marked. Replace with Supabase queries later.
export type Role = "owner" | "employee";

export type DemoUser = {
  id: string;
  name: string;
  role: Role;
  email: string;
  projectIds: string[]; // employees: assigned; owner: all
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "planning" | "paused";
  createdAt: string;
  color: string;
};

export type Client = {
  id: string;
  projectId: string;
  name: string;
  email: string;
  company?: string;
  createdAt: string;
};

export type License = {
  id: string;
  projectId: string;
  clientId: string;
  key: string;
  status: "active" | "expired" | "pending";
  activatedAt: string;
  expiresAt: string;
};

export type Payment = {
  id: string;
  projectId: string;
  clientId: string;
  licenseId?: string;
  amount: number;
  currency: "EUR" | "USD";
  method: "card" | "transfer" | "cash" | "paypal";
  reference: string;
  employeeId: string;
  createdAt: string;
};

export type Employee = {
  id: string;
  name: string;
  email: string;
  projectIds: string[];
  role: "employee" | "owner";
};

export type HistoryEntry = {
  id: string;
  projectId: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
};

export const DEMO_USERS: DemoUser[] = [
  {
    id: "u_owner",
    name: "Ada Vrix (Owner)",
    role: "owner",
    email: "ada@vrixora.demo",
    projectIds: ["tuktuk", "copias", "future"],
  },
  {
    id: "u_emp_a",
    name: "Empleado A",
    role: "employee",
    email: "a@vrixora.demo",
    projectIds: ["tuktuk"],
  },
  {
    id: "u_emp_b",
    name: "Empleado B",
    role: "employee",
    email: "b@vrixora.demo",
    projectIds: ["tuktuk", "copias"],
  },
];

export const PROJECTS: Project[] = [
  {
    id: "tuktuk",
    name: "TukTuk Control",
    slug: "tuktuk",
    description: "Sistema de gestión de flota de tuk-tuks turísticos.",
    status: "active",
    createdAt: "2024-03-12",
    color: "205",
  },
  {
    id: "copias",
    name: "Proyecto Copias",
    slug: "copias",
    description: "Plataforma de duplicación y trazabilidad documental.",
    status: "active",
    createdAt: "2024-09-01",
    color: "285",
  },
  {
    id: "future",
    name: "Aplicación futura",
    slug: "future",
    description: "Proyecto en fase de definición.",
    status: "planning",
    createdAt: "2026-01-15",
    color: "155",
  },
];

export const EMPLOYEES: Employee[] = [
  { id: "u_owner", name: "Ada Vrix", email: "ada@vrixora.demo", role: "owner", projectIds: ["tuktuk", "copias", "future"] },
  { id: "u_emp_a", name: "Empleado A", email: "a@vrixora.demo", role: "employee", projectIds: ["tuktuk"] },
  { id: "u_emp_b", name: "Empleado B", email: "b@vrixora.demo", role: "employee", projectIds: ["tuktuk", "copias"] },
];

const mkClients = (projectId: string, base: string, n: number): Client[] =>
  Array.from({ length: n }).map((_, i) => ({
    id: `${projectId}_c_${i + 1}`,
    projectId,
    name: `${base} Cliente ${i + 1}`,
    email: `cliente${i + 1}@${projectId}.demo`,
    company: i % 2 === 0 ? `${base} SL` : undefined,
    createdAt: `2025-0${(i % 9) + 1}-1${i % 9}`,
  }));

export const CLIENTS: Client[] = [
  ...mkClients("tuktuk", "TukTuk", 8),
  ...mkClients("copias", "Copias", 5),
  ...mkClients("future", "Futuro", 2),
];

const addDays = (d: string, days: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

export const LICENSES: License[] = CLIENTS.map((c, i) => ({
  id: `${c.id}_lic`,
  projectId: c.projectId,
  clientId: c.id,
  key: `VRX-${c.projectId.toUpperCase()}-${1000 + i}`,
  status: i % 5 === 0 ? "expired" : "active",
  activatedAt: "2025-06-01",
  expiresAt: i % 5 === 0 ? "2025-11-01" : addDays("2026-06-01", i * 3),
}));

export const PAYMENTS: Payment[] = CLIENTS.slice(0, 12).map((c, i) => ({
  id: `${c.id}_pay_${i}`,
  projectId: c.projectId,
  clientId: c.id,
  licenseId: `${c.id}_lic`,
  amount: [49, 99, 149, 299][i % 4],
  currency: i % 3 === 0 ? "USD" : "EUR",
  method: (["card", "transfer", "paypal", "cash"] as const)[i % 4],
  reference: `REF-${2025000 + i}`,
  employeeId: i % 2 === 0 ? "u_emp_a" : "u_emp_b",
  createdAt: `2026-0${(i % 7) + 1}-1${i % 9}`,
}));

export const HISTORY: HistoryEntry[] = [
  {
    id: "h1",
    projectId: "tuktuk",
    action: "Activación de licencia",
    detail: "VRX-TUKTUK-1002 renovada 365 días",
    actor: "Empleado A",
    createdAt: "2026-07-20 09:14",
  },
  {
    id: "h2",
    projectId: "copias",
    action: "Pago registrado",
    detail: "99 EUR por transferencia (REF-2025007)",
    actor: "Empleado B",
    createdAt: "2026-07-19 16:02",
  },
];

export function canSeeProject(user: DemoUser, projectId: string) {
  if (user.role === "owner") return true;
  return user.projectIds.includes(projectId);
}

export function visibleProjects(user: DemoUser) {
  return PROJECTS.filter((p) => canSeeProject(user, p.id));
}
