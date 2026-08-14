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
  | "payments.correct"
  | "members.view"
  | "members.manage"
  | "analytics.view"
  | "settings.view"
  | "settings.manage"
  | "whatsapp_settings.manage"
  | "commercial.view"
  | "commercial.manage"
  | "audit.view";

export interface ProjectSettings {
  notifyLicenseExpiry: boolean;
  autoRenewVerifiedPayments: boolean;
  logoUrl: string;
  iconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  whatsapp: string;
  supportEmail: string;
  websiteUrl: string;
  privacyUrl: string;
  termsUrl: string;
  currency: Currency;
  trialDays: number;
  paymentMethods: ServicePayment["method"][];
  minimumVersion: string;
  maintenanceMode: boolean;
  forceUpdate: boolean;
  welcomeMessage: string;
}

export interface WhatsAppSettings {
  projectId: string;
  fallbackNumber: string;
  supportNumber: string;
  paymentNumber: string;
  supportButtonText: string;
  paymentButtonText: string;
  supportTemplate: string;
  paymentTemplate: string;
  supportEnabled: boolean;
  paymentEnabled: boolean;
  version: number;
  updatedAt: string;
}

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
  phone: string | null;
  avatarUrl: string | null;
  registeredAt: string;
  licenseId: string | null;
  licenseKey: string | null;
  plan: string;
  status: LicenseStatus;
  activatedAt: string;
  expiresAt: string;
  maxDevices: number;
  activeDevices: number;
  lastPaymentAt: string | null;
  lastPaymentAmount: number | null;
  lastPaymentCurrency: Currency | null;
  lastRenewedAt: string | null;
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
  method: "card" | "transfer" | "cash" | "paypal" | "other";
  reference: string;
  employeeId: string;
  createdAt: string;
  status: "pending" | "paid" | "cancelled" | "refunded" | "complimentary";
  notes: string | null;
  userEmail?: string;
  licenseKey?: string;
  operatorLabel?: string;
  hasReceipt?: boolean;
}

export interface UpdatePaymentInput {
  paymentId: string;
  amount: number;
  currency: Currency;
  method: ServicePayment["method"];
  reference: string;
  status: ServicePayment["status"];
  notes?: string;
  adjustmentReason: string;
}

export interface BillingPreview {
  licenseId: string;
  previousPlan: string;
  newPlan: string;
  licenseType: string;
  previousExpiresAt: string | null;
  newStartedAt: string;
  newExpiresAt: string | null;
  durationDays: number | null;
  maxDevices: number;
  price: number;
  currency: Currency;
  applicationRule: "apply_now" | "after_expiry";
  isTrialConversion: boolean;
}

export interface BillingReceipt {
  receiptId: string;
  receiptNumber: string;
  paymentId: string;
  licenseId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  clientEmail: string;
  maskedLicenseKey: string;
  previousPlan: string;
  plan: string;
  planName: string;
  durationDays: number | null;
  listPrice: number;
  amount: number;
  currency: Currency;
  method: ServicePayment["method"];
  reference: string;
  chargedAt: string;
  startedAt: string;
  expiresAt: string | null;
  status: LicenseStatus;
  maxDevices: number;
  operatorEmail: string;
  notes: string | null;
  whatsapp: string | null;
  supportEmail: string | null;
  applicationRule: "apply_now" | "after_expiry";
}

export interface ChargePlanInput {
  licenseId: string;
  plan: string;
  amount: number;
  method: "cash" | "transfer" | "other";
  reference?: string;
  chargedAt: string;
  notes?: string;
  applicationRule: "apply_now" | "after_expiry";
  idempotencyKey: string;
  clientWhatsapp?: string;
  confirmClientWhatsappChange?: boolean;
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
  settings(projectId: string): Promise<ProjectSettings>;
  uploadBrandAsset(projectId: string, kind: "logo" | "favicon", file: File): Promise<string>;
  update(
    projectId: string,
    changes: ProjectSettings & {
      name: string;
      description: string;
    },
  ): Promise<void>;
  whatsappSettings(projectId: string): Promise<WhatsAppSettings>;
  updateWhatsAppSettings(projectId: string, settings: WhatsAppSettings): Promise<WhatsAppSettings>;
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
  deleteInactivePlan(projectId: string, planCode: string): Promise<{ reassignedLicenses: number }>;
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
  update(input: UpdatePaymentInput): Promise<ServicePayment>;
  remove(paymentId: string, reason: string): Promise<void>;
  void(paymentId: string, reason: string): Promise<void>;
  previewCharge(
    licenseId: string,
    plan: string,
    applicationRule: ChargePlanInput["applicationRule"],
  ): Promise<BillingPreview>;
  chargeAndAssign(input: ChargePlanInput): Promise<BillingReceipt>;
  receipt(paymentId: string): Promise<BillingReceipt>;
  repairReceipt(paymentId: string): Promise<BillingReceipt>;
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

export interface UsageAnalyticsFilters {
  from: string;
  to: string;
  plan?: string;
  licenseStatus?: LicenseStatus;
  source?: string;
  campaign?: string;
  appVersion?: string;
}

export interface UsageAnalyticsDay {
  date: string;
  newUsers: number;
  trials: number;
  paidLicenses: number;
  activeUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  logins: number;
  renewals: number;
  expired: number;
  revenueCUP: number;
  revenueUSD: number;
  revenueEUR: number;
}

export interface UsageAnalyticsDimensions {
  sources: string[];
  campaigns: string[];
  versions: string[];
}

export interface RetentionMetrics {
  cohortCount: number;
  eligible7: number;
  eligible30: number;
  retained7: number;
  retained30: number;
  retention7Rate: number;
  retention30Rate: number;
  trialUsers: number;
  paidUsers: number;
  trialToPaidRate: number;
}

export interface UsageAnalyticsService {
  series(projectId: string, filters: UsageAnalyticsFilters): Promise<UsageAnalyticsDay[]>;
  dimensions(projectId: string): Promise<UsageAnalyticsDimensions>;
  retention(
    projectId: string,
    filters: Pick<UsageAnalyticsFilters, "plan" | "source" | "campaign">,
  ): Promise<RetentionMetrics>;
}

export type CommercialLeadStatus =
  "new" | "contacted" | "interested" | "trial" | "ready_to_charge" | "customer" | "not_interested";
export type CommercialSource =
  "whatsapp" | "facebook" | "instagram" | "sms" | "referral" | "direct" | "other";

export interface CommercialLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: CommercialSource;
  medium: string | null;
  campaign: string | null;
  referralCode: string | null;
  referredByUserId: string | null;
  referredByName: string | null;
  status: CommercialLeadStatus;
  notes: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  userId: string | null;
  createdAt: string;
  lastInteractionAt: string | null;
  nextActionAt: string | null;
  registered: boolean;
  trialStarted: boolean;
  paid: boolean;
  renewalCount: number;
  revenue: Record<string, number>;
}

export interface CommercialCampaign {
  id: string;
  name: string;
  source: CommercialSource;
  medium: string | null;
  status: "draft" | "active" | "paused" | "closed";
  startsAt: string | null;
  endsAt: string | null;
}

export interface CommercialLeadHistoryEntry {
  id: string | number;
  eventType: string;
  previousValue: string | null;
  newValue: string | null;
  note: string | null;
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
}

export interface CommercialMetrics {
  totalLeads: number;
  registered: number;
  trials: number;
  paid: number;
  notConverted: number;
  conversionRate: number;
  topSource: string;
  topCampaign: string;
}

export interface CommercialLeadInput {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  source: CommercialSource;
  medium?: string;
  campaignId?: string;
  campaign?: string;
  referralCode?: string;
  referredByUserId?: string;
  status: CommercialLeadStatus;
  notes?: string;
  responsibleId?: string;
  nextActionAt?: string;
  userId?: string;
}

export interface CommercialService {
  listLeads(projectId: string): Promise<CommercialLead[]>;
  saveLead(projectId: string, input: CommercialLeadInput): Promise<string>;
  addNote(projectId: string, leadId: string, note: string): Promise<void>;
  listLeadHistory(projectId: string, leadId: string): Promise<CommercialLeadHistoryEntry[]>;
  listCampaigns(projectId: string): Promise<CommercialCampaign[]>;
  saveCampaign(
    projectId: string,
    campaign: Omit<CommercialCampaign, "id"> & { id?: string },
  ): Promise<string>;
  metrics(projectId: string): Promise<CommercialMetrics>;
}

export type PreinvoiceStatus = "prepared" | "sent" | "pending" | "paid" | "expired" | "cancelled";
export type ExchangeRateMode = "manual" | "automatic";
export type ReferralRewardStatus = "pending" | "earned" | "applied" | "reverted";

export interface P0ASettings {
  projectId: string;
  baseCurrency: Currency;
  chargeCurrency: Currency;
  rateMode: ExchangeRateMode;
  currentRate: number;
  rateSource: string;
  rateUpdatedAt: string;
  testModeEnabled: boolean;
  referralRewardDays: number;
}

export interface ExchangeRateHistoryEntry {
  id: string | number;
  baseCurrency: Currency;
  chargeCurrency: Currency;
  rate: number;
  rateMode: ExchangeRateMode;
  rateSource: string;
  changedBy: string | null;
  createdAt: string;
}

export interface DocumentIdentitySnapshot {
  project_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  icon_url: string | null;
  primary_color: string;
  secondary_color: string;
  whatsapp: string | null;
  support_email: string | null;
  website_url: string | null;
  privacy_url: string | null;
  terms_url: string | null;
  captured_at: string;
}

export interface Preinvoice {
  id: string;
  number: number;
  clientId: string;
  planCode: string;
  basePrice: number;
  baseCurrency: Currency;
  exchangeRate: number;
  exchangeRateSource: string;
  chargeCurrency: Currency;
  chargeAmount: number;
  status: PreinvoiceStatus;
  isTest: boolean;
  identitySnapshot: DocumentIdentitySnapshot;
  planSnapshot: Record<string, unknown>;
  issuedAt: string;
  expiresAt: string;
  paidPaymentId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CreatePreinvoiceInput {
  projectId: string;
  clientId: string;
  planCode: string;
  chargeCurrency?: Currency;
  exchangeRate?: number;
  rateSource?: string;
  isTest?: boolean;
}

export interface P0AFoundationService {
  settings(projectId: string): Promise<P0ASettings>;
  updateExchangeSettings(
    projectId: string,
    input: Pick<
      P0ASettings,
      "baseCurrency" | "chargeCurrency" | "rateMode" | "currentRate" | "rateSource"
    >,
  ): Promise<P0ASettings>;
  setTestMode(projectId: string, enabled: boolean): Promise<boolean>;
  setReferralRewardDays(projectId: string, rewardDays: number): Promise<number>;
  exchangeRateHistory(projectId: string, limit?: number): Promise<ExchangeRateHistoryEntry[]>;
  createPreinvoice(input: CreatePreinvoiceInput): Promise<string>;
  listPreinvoices(projectId: string, includeTest?: boolean): Promise<Preinvoice[]>;
  setPreinvoiceStatus(
    projectId: string,
    preinvoiceId: string,
    status: Exclude<PreinvoiceStatus, "prepared" | "expired">,
    paymentId?: string,
  ): Promise<void>;
  registerReferral(
    projectId: string,
    referrerUserId: string,
    referredUserId: string,
    referralCode?: string,
    isTest?: boolean,
  ): Promise<string>;
  createReferralReward(
    projectId: string,
    relationshipId: string,
    paymentId: string,
    isTest?: boolean,
  ): Promise<string>;
  deleteTestData(
    projectId: string,
  ): Promise<{ preinvoices: number; referralRewards: number; referralRelationships: number }>;
}

export interface AdminServices {
  provider: DataProvider;
  projects: ProjectService;
  projectMembers: ProjectMemberService;
  licenses: LicenseService;
  payments: PaymentService;
  licenseAuditLog: LicenseAuditLogService;
  audit: AuditService;
  usageAnalytics: UsageAnalyticsService;
  commercial: CommercialService;
  foundations: P0AFoundationService;
}
