import type {
  Employee,
  HistoryEntry,
  Project,
} from "@/lib/mock-data";

export type DataProvider = "demo" | "supabase";
export type Currency = "CUP" | "USD" | "EUR";
export type LicenseStatus = "active" | "pending" | "expired" | "suspended" | "revoked";

export interface LicenseType {
  code: string;
  name: string;
  defaultDurationDays: number | null;
  allowsCustomDuration: boolean;
  neverExpires: boolean;
  defaultMaxDevices: number;
  defaultFeatures: Record<string, unknown>;
}

export interface LicensePlan {
  code: string;
  name: string;
  maxDevices: number;
  features: Record<string, unknown>;
}

export interface ServiceLicense {
  id: string;
  projectId: string;
  userId: string;
  key: string;
  licenseType: string;
  plan: string;
  status: LicenseStatus;
  durationDays: number | null;
  maxDevices: number;
  features: Record<string, unknown>;
  notes: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  lastValidation: string | null;
  revokedAt: string | null;
}

export interface LicenseValidationResult {
  valid: boolean;
  reason: string;
  licenseId?: string;
  licenseType?: string;
  plan?: string;
  expiresAt?: string | null;
  maxDevices?: number;
  features?: Record<string, unknown>;
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
  listTypes(): Promise<LicenseType[]>;
  listPlans(): Promise<LicensePlan[]>;
  renew(licenseId: string, durationDays?: number, note?: string): Promise<ServiceLicense>;
  validate(
    projectId: string,
    licenseKey: string,
    deviceFingerprint: string,
  ): Promise<LicenseValidationResult>;
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
