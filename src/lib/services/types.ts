import type { Employee, HistoryEntry, Project } from "@/lib/mock-data";

export type DataProvider = "demo" | "supabase";
export type Currency = "CUP" | "USD" | "EUR";
export type LicenseStatus = "active" | "pending" | "expired" | "suspended" | "revoked";
export type ProjectRole = "owner" | "admin" | "support" | "accounting" | "marketing";
export type ProjectPermission =
  | "project.view"
  | "customers.view"
  | "customers.manage"
  | "licenses.view"
  | "licenses.manage"
  | "plans.view"
  | "plans.manage"
  | "payments.view"
  | "payments.manage"
  | "members.view"
  | "members.manage"
  | "analytics.view"
  | "settings.view"
  | "settings.manage"
  | "audit.view";

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
  projectId?: string;
  code: string;
  name: string;
  licenseType: string;
  durationDays: number | null;
  price: number;
  currency: Currency;
  maxDevices: number;
  features: Record<string, unknown>;
  description: string | null;
  isActive: boolean;
  isFeatured: boolean;
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
  createdAt: string;
  userEmail: string;
  activeDevices: number;
}

export interface ServiceClient {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  registeredAt: string;
  licenseId: string | null;
  licenseKey: string | null;
  plan: string;
  status: LicenseStatus;
  expiresAt: string;
}

export interface LicenseDevice {
  id: string;
  licenseId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface LicenseAuditEntry {
  id: string;
  licenseId: string;
  action: string;
  detail: string;
  actorId: string;
  actorEmail?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateLicenseInput {
  projectId: string;
  email: string;
  licenseType: string;
  plan: string;
  status: LicenseStatus;
  durationDays?: number;
  activatedAt?: string;
  maxDevices?: number;
  features?: Record<string, unknown>;
  notes?: string;
  licenseKey?: string;
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
  listPrice: number;
  discount: number;
  plan: string;
  currency: Currency;
  method: "card" | "transfer" | "cash" | "paypal";
  reference: string;
  employeeId: string;
  createdAt: string;
  status: "pending" | "paid" | "cancelled" | "refunded" | "complimentary";
  notes: string | null;
  userEmail?: string;
  licenseKey?: string;
}

export interface LicenseBillingInput {
  projectId?: string;
  email?: string;
  licenseId?: string;
  plan: string;
  startedAt?: string;
  licenseStatus?: LicenseStatus;
  method: ServicePayment["method"];
  reference: string;
  notes?: string;
  overrideAmount?: number;
  adjustmentReason?: string;
  paymentStatus: ServicePayment["status"];
}

export interface ProjectService {
  list(userId?: string): Promise<Project[]>;
  settings(projectId: string): Promise<{
    notifyLicenseExpiry: boolean;
    autoRenewVerifiedPayments: boolean;
  }>;
  update(
    projectId: string,
    changes: {
      name: string;
      description: string;
      notifyLicenseExpiry: boolean;
      autoRenewVerifiedPayments: boolean;
    },
  ): Promise<void>;
}

export interface ProjectMemberService {
  list(projectId: string): Promise<Employee[]>;
  permissions(projectId: string): Promise<ProjectPermission[]>;
  add(projectId: string, email: string, role: Exclude<ProjectRole, "owner">): Promise<void>;
  remove(projectId: string, userId: string): Promise<void>;
}

export interface LicenseService {
  listClients(projectId: string): Promise<ServiceClient[]>;
  setClientStatus(
    projectId: string,
    userId: string,
    status: LicenseStatus,
    reason?: string,
  ): Promise<ServiceLicense>;
  list(projectId: string): Promise<ServiceLicense[]>;
  listTypes(): Promise<LicenseType[]>;
  listPlans(projectId: string): Promise<LicensePlan[]>;
  renew(licenseId: string, durationDays?: number, note?: string): Promise<ServiceLicense>;
  validate(
    projectId: string,
    licenseKey: string,
    deviceFingerprint: string,
  ): Promise<LicenseValidationResult>;
  create(input: CreateLicenseInput): Promise<ServiceLicense>;
  update(
    licenseId: string,
    operation: "renew" | "status" | "extend" | "plan",
    payload: Record<string, unknown>,
  ): Promise<ServiceLicense>;
  listDevices(licenseId: string): Promise<LicenseDevice[]>;
  listHistory(licenseId: string): Promise<LicenseAuditEntry[]>;
  manageDevice(deviceId: string, operation: "block" | "remove", reason?: string): Promise<void>;
  resetDevices(licenseId: string, reason: string): Promise<number>;
  listAdminPlans(projectId: string): Promise<LicensePlan[]>;
  savePlan(projectId: string, plan: LicensePlan): Promise<LicensePlan>;
  assignWithPayment(input: LicenseBillingInput): Promise<ServiceLicense>;
  renewWithPayment(input: LicenseBillingInput): Promise<ServiceLicense>;
}

export interface PaymentService {
  list(projectId: string): Promise<ServicePayment[]>;
  listAdmin(projectId: string): Promise<ServicePayment[]>;
  record(input: LicenseBillingInput): Promise<ServicePayment>;
  updateStatus(
    paymentId: string,
    status: ServicePayment["status"],
    notes?: string,
  ): Promise<ServicePayment>;
}

export interface LicenseAuditLogService {
  list(projectId: string): Promise<HistoryEntry[]>;
}

export interface AuditEvent {
  id: number;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditService {
  list(projectId: string, limit?: number): Promise<AuditEvent[]>;
}

export interface AdminServices {
  provider: DataProvider;
  projects: ProjectService;
  projectMembers: ProjectMemberService;
  licenses: LicenseService;
  payments: PaymentService;
  licenseAuditLog: LicenseAuditLogService;
  audit: AuditService;
}
