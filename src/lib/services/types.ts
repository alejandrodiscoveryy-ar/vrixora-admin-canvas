import type {
  Employee,
  HistoryEntry,
  Project,
} from "@/lib/mock-data";

export type DataProvider = "demo" | "supabase";
export type Currency = "CUP" | "USD" | "EUR";

export interface ServiceLicense {
  id: string;
  projectId: string;
  userId: string;
  key: string;
  status: "active" | "expired" | "pending";
  activatedAt: string;
  expiresAt: string;
}

export interface ServicePayment {
  id: string;
  projectId: string;
  userId: string;
  licenseId?: string;
  amount: number;
  currency: Currency;
  method: "card" | "transfer" | "cash" | "paypal";
  reference: string;
  employeeId: string;
  createdAt: string;
}

export interface ProjectService {
  list(userId?: string): Promise<Project[]>;
}

export interface ProjectMemberService {
  list(projectId: string): Promise<Employee[]>;
}

export interface LicenseService {
  list(projectId: string): Promise<ServiceLicense[]>;
}

export interface PaymentService {
  list(projectId: string): Promise<ServicePayment[]>;
}

export interface LicenseAuditLogService {
  list(projectId: string): Promise<HistoryEntry[]>;
}

export interface AdminServices {
  provider: DataProvider;
  projects: ProjectService;
  projectMembers: ProjectMemberService;
  licenses: LicenseService;
  payments: PaymentService;
  licenseAuditLog: LicenseAuditLogService;
}
