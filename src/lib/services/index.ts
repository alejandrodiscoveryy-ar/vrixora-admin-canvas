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
  ProjectMemberService,
  ProjectService,
  ServiceLicense,
  ServicePayment,
} from "./types";

export function getAdminServices(provider: DataProvider = "demo"): AdminServices {
  return provider === "supabase" ? supabaseServices : demoServices;
}

export { demoServices, supabaseServices };
