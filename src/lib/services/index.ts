import { demoServices } from "./demo";
import { supabaseServices } from "./supabase";
import type { AdminServices, DataProvider } from "./types";

export type {
  AdminServices,
  Currency,
  DataProvider,
  LicenseAuditLogService,
  LicenseAuditEntry,
  LicenseDevice,
  CreateLicenseInput,
  LicensePlan,
  LicenseBillingInput,
  LicenseService,
  LicenseStatus,
  LicenseType,
  LicenseValidationResult,
  PaymentService,
  ProjectPermission,
  ProjectRole,
  ProjectSettings,
  AuditEvent,
  AuditService,
  ProjectMemberService,
  ProjectService,
  ServiceClient,
  ServiceLicense,
  ServicePayment,
  UpdatePaymentInput,
  RetentionMetrics,
  UsageAnalyticsDay,
  UsageAnalyticsDimensions,
  UsageAnalyticsFilters,
  UsageAnalyticsService,
} from "./types";

export function getAdminServices(provider: DataProvider = "supabase"): AdminServices {
  return provider === "supabase" ? supabaseServices : demoServices;
}

export { demoServices, supabaseServices };
