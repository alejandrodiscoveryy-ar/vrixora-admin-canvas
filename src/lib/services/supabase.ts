import type { Employee, HistoryEntry, Project } from "@/lib/mock-data";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  AdminServices,
  Currency,
  LicensePlan,
  LicenseStatus,
  LicenseType,
  LicenseValidationResult,
  ServiceLicense,
  ServiceClient,
  ServicePayment,
  CreateLicenseInput,
  LicenseAuditEntry,
  LicenseDevice,
  LicenseBillingInput,
} from "./types";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

type LicenseRow = {
  id: string;
  project_id: string;
  user_id: string;
  license_key: string;
  license_type: string;
  plan: string;
  status: string;
  duration_days: number | null;
  max_devices: number;
  features: Record<string, unknown> | null;
  notes: string | null;
  activated_at: string | null;
  expires_at: string | null;
  last_validation: string | null;
  revoked_at: string | null;
  created_at: string;
  user_email?: string;
  active_devices?: number;
};

type PlanRow = {
  code: string;
  name: string;
  license_type: string;
  duration_days: number | null;
  price: number | string;
  currency: string;
  max_devices: number;
  features: Record<string, unknown> | null;
  description: string | null;
  active: boolean;
  is_featured: boolean;
};

type PaymentRow = {
  id: string;
  amount: number | string;
  list_price: number | string;
  discount: number | string;
  plan: string;
  currency: string;
  method: ServicePayment["method"];
  reference: string;
  recorded_by: string;
  created_at: string;
  paid_status: ServicePayment["status"];
  notes: string | null;
  user_email: string;
  license_key: string | null;
};

type ClientRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  registered_at: string;
  license_id: string | null;
  license_key: string | null;
  plan: string;
  status: string;
  expires_at: string;
};

function mapLicense(license: LicenseRow): ServiceLicense {
  return {
    id: license.id,
    projectId: license.project_id,
    userId: license.user_id,
    key: license.license_key,
    licenseType: license.license_type,
    plan: license.plan,
    status: license.status as LicenseStatus,
    durationDays: license.duration_days,
    maxDevices: license.max_devices,
    features: license.features ?? {},
    notes: license.notes,
    activatedAt: license.activated_at,
    expiresAt: license.expires_at,
    lastValidation: license.last_validation,
    revokedAt: license.revoked_at,
    createdAt: license.created_at,
    userEmail: license.user_email ?? "",
    activeDevices: Number(license.active_devices ?? 0),
  };
}

export const supabaseServices: AdminServices = {
  provider: "supabase",
  projects: {
    async list() {
      const { data, error } = await getSupabaseClient()
        .from("projects")
        .select("id,name,slug,description,status,created_at,color")
        .order("created_at", { ascending: false });
      throwIfError(error);

      return (data ?? []).map(
        (project): Project => ({
          id: project.id,
          name: project.name,
          slug: project.slug,
          description: project.description ?? "",
          status: project.status,
          createdAt: project.created_at,
          color: project.color,
        }),
      );
    },
    async settings(projectId) {
      const { data, error } = await getSupabaseClient()
        .from("projects")
        .select("notify_license_expiry,auto_renew_verified_payments")
        .eq("id", projectId)
        .single();
      throwIfError(error);
      if (!data) throw new Error("No se encontró el proyecto.");
      return {
        notifyLicenseExpiry: data.notify_license_expiry,
        autoRenewVerifiedPayments: data.auto_renew_verified_payments,
      };
    },
    async update(projectId, changes) {
      const { error } = await getSupabaseClient().rpc("admin_update_project_settings", {
        target_project_id: projectId,
        target_name: changes.name,
        target_description: changes.description,
        target_notify_license_expiry: changes.notifyLicenseExpiry,
        target_auto_renew_verified_payments: changes.autoRenewVerifiedPayments,
      });
      throwIfError(error);
    },
  },
  projectMembers: {
    async list(projectId) {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from("project_members")
        .select("user_id,role")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      throwIfError(error);

      const members = data ?? [];
      if (members.length === 0) return [];

      const { data: profiles, error: profilesError } = await client
        .from("profiles")
        .select("id,email,display_name")
        .in(
          "id",
          members.map((member) => member.user_id),
        );
      throwIfError(profilesError);

      const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

      return members.map((member): Employee => {
        const profile = profilesById.get(member.user_id);
        return {
          id: member.user_id,
          name: profile?.display_name || profile?.email || "Usuario",
          email: profile?.email ?? "",
          role: member.role,
          projectIds: [projectId],
        };
      });
    },
    async add(projectId, email, role) {
      if (role !== "employee") {
        throw new Error("Solo se pueden asignar empleados desde el panel.");
      }
      const { error } = await getSupabaseClient().rpc("admin_add_project_member_by_email", {
        target_project_id: projectId,
        target_email: email.trim(),
      });
      throwIfError(error);
    },
    async remove(projectId, userId) {
      const { error } = await getSupabaseClient().rpc("admin_remove_project_member", {
        target_project_id: projectId,
        target_user_id: userId,
      });
      throwIfError(error);
    },
  },
  licenses: {
    async listClients(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_registered_clients", {
        target_project_id: projectId,
      });
      throwIfError(error);

      return (data ?? []).map(
        (client: ClientRow): ServiceClient => ({
          userId: client.user_id,
          email: client.email,
          displayName: client.display_name ?? client.email,
          registeredAt: client.registered_at,
          licenseId: client.license_id,
          licenseKey: client.license_key,
          plan: client.plan,
          status: client.status as LicenseStatus,
          expiresAt: client.expires_at,
        }),
      );
    },
    async setClientStatus(projectId, userId, status, reason) {
      const { data, error } = await getSupabaseClient().rpc("admin_set_client_license_status", {
        target_project_id: projectId,
        target_user_id: userId,
        target_status: status,
        target_reason: reason?.trim() || null,
      });
      throwIfError(error);
      if (!data) throw new Error("No se pudo actualizar la licencia.");
      return mapLicense(data);
    },
    async list(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_licenses", {
        target_project_id: projectId,
      });
      throwIfError(error);

      return (data ?? []).map(mapLicense);
    },
    async listTypes() {
      const { data, error } = await getSupabaseClient()
        .from("license_types")
        .select(
          "code,name,default_duration_days,allows_custom_duration,never_expires,default_max_devices,default_features",
        )
        .order("name");
      throwIfError(error);

      return (data ?? []).map(
        (licenseType): LicenseType => ({
          code: licenseType.code,
          name: licenseType.name,
          defaultDurationDays: licenseType.default_duration_days,
          allowsCustomDuration: licenseType.allows_custom_duration,
          neverExpires: licenseType.never_expires,
          defaultMaxDevices: licenseType.default_max_devices,
          defaultFeatures: licenseType.default_features ?? {},
        }),
      );
    },
    async listPlans() {
      const { data, error } = await getSupabaseClient()
        .from("license_plans")
        .select(
          "code,name,license_type,duration_days,price,currency,max_devices,features,description,active,is_featured",
        )
        .order("name");
      throwIfError(error);

      return (data ?? []).map(
        (plan: PlanRow): LicensePlan => ({
          code: plan.code,
          name: plan.name,
          licenseType: plan.license_type ?? "monthly",
          durationDays: plan.duration_days ?? null,
          price: Number(plan.price ?? 0),
          currency: (plan.currency ?? "CUP") as Currency,
          maxDevices: plan.max_devices,
          features: plan.features ?? {},
          description: plan.description ?? null,
          isActive: plan.active ?? true,
          isFeatured: plan.is_featured ?? false,
        }),
      );
    },
    async renew(licenseId, durationDays, note) {
      const { data, error } = await getSupabaseClient().rpc("renew_license", {
        target_license_id: licenseId,
        requested_duration_days: durationDays ?? null,
        renewal_note: note ?? null,
      });
      throwIfError(error);
      return mapLicense(data);
    },
    async validate(projectId, licenseKey, deviceFingerprint) {
      const { data, error } = await getSupabaseClient().rpc("validate_license", {
        target_project_id: projectId,
        target_license_key: licenseKey,
        target_device_fingerprint: deviceFingerprint,
      });
      throwIfError(error);
      return data as LicenseValidationResult;
    },
    async create(input: CreateLicenseInput) {
      const { data, error } = await getSupabaseClient().rpc("admin_create_license", {
        target_project_id: input.projectId,
        target_email: input.email,
        target_license_type: input.licenseType,
        target_plan: input.plan,
        target_status: input.status,
        target_duration_days: input.durationDays ?? null,
        target_activated_at: input.activatedAt ?? new Date().toISOString(),
        target_max_devices: input.maxDevices ?? null,
        target_features: input.features ?? null,
        target_notes: input.notes ?? null,
        target_license_key: input.licenseKey ?? null,
      });
      throwIfError(error);
      return mapLicense(data);
    },
    async update(licenseId, operation, payload) {
      const { data, error } = await getSupabaseClient().rpc("admin_update_license", {
        target_license_id: licenseId,
        operation,
        payload,
      });
      throwIfError(error);
      return mapLicense(data);
    },
    async listDevices(licenseId) {
      const { data, error } = await getSupabaseClient()
        .from("license_devices")
        .select("id,license_id,first_seen_at,last_seen_at,revoked_at")
        .eq("license_id", licenseId)
        .order("last_seen_at", { ascending: false });
      throwIfError(error);
      return (data ?? []).map(
        (device): LicenseDevice => ({
          id: device.id,
          licenseId: device.license_id,
          firstSeenAt: device.first_seen_at,
          lastSeenAt: device.last_seen_at,
          revokedAt: device.revoked_at,
        }),
      );
    },
    async listHistory(licenseId) {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from("license_audit_log")
        .select("id,license_id,action,detail,actor_id,metadata,created_at")
        .eq("license_id", licenseId)
        .order("created_at", { ascending: false });
      throwIfError(error);
      const actorIds = [...new Set((data ?? []).map((entry) => entry.actor_id).filter(Boolean))];
      const { data: actors, error: actorError } = actorIds.length
        ? await client.from("profiles").select("id,email").in("id", actorIds)
        : { data: [], error: null };
      throwIfError(actorError);
      const actorEmails = new Map((actors ?? []).map((actor) => [actor.id, actor.email]));
      return (data ?? []).map(
        (entry): LicenseAuditEntry => ({
          id: entry.id,
          licenseId: entry.license_id,
          action: entry.action,
          detail: entry.detail,
          actorId: entry.actor_id,
          actorEmail: actorEmails.get(entry.actor_id),
          metadata: entry.metadata ?? {},
          createdAt: entry.created_at,
        }),
      );
    },
    async manageDevice(deviceId, operation, reason) {
      const { error } = await getSupabaseClient().rpc("admin_manage_license_device", {
        target_device_id: deviceId,
        operation,
        reason: reason ?? null,
      });
      throwIfError(error);
    },
    async resetDevices(licenseId, reason) {
      const { data, error } = await getSupabaseClient().rpc("admin_reset_license_devices", {
        target_license_id: licenseId,
        reason,
      });
      throwIfError(error);
      return Number(data);
    },
    async listAdminPlans(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_license_plans", {
        target_project_id: projectId,
      });
      throwIfError(error);
      return (data ?? []).map(
        (plan: PlanRow): LicensePlan => ({
          code: plan.code,
          name: plan.name,
          licenseType: plan.license_type,
          durationDays: plan.duration_days,
          price: Number(plan.price),
          currency: plan.currency as Currency,
          maxDevices: plan.max_devices,
          features: plan.features ?? {},
          description: plan.description,
          isActive: plan.active,
          isFeatured: plan.is_featured,
        }),
      );
    },
    async savePlan(projectId, plan) {
      const { data, error } = await getSupabaseClient().rpc("admin_save_license_plan", {
        target_project_id: projectId,
        target_code: plan.code,
        target_name: plan.name,
        target_license_type: plan.licenseType,
        target_duration_days: plan.durationDays,
        target_price: plan.price,
        target_currency: plan.currency,
        target_max_devices: plan.maxDevices,
        target_features: plan.features,
        target_description: plan.description,
        target_is_active: plan.isActive,
        target_is_featured: plan.isFeatured,
      });
      throwIfError(error);
      return {
        code: data.code,
        name: data.name,
        licenseType: data.license_type,
        durationDays: data.duration_days,
        price: Number(data.price),
        currency: data.currency as Currency,
        maxDevices: data.max_devices,
        features: data.features ?? {},
        description: data.description,
        isActive: data.active,
        isFeatured: data.is_featured,
      };
    },
    async assignWithPayment(input: LicenseBillingInput) {
      const { data, error } = await getSupabaseClient().rpc("admin_assign_license_with_payment", {
        target_project_id: input.projectId,
        target_email: input.email,
        target_plan: input.plan,
        target_started_at: input.startedAt,
        target_status: input.licenseStatus,
        target_method: input.method,
        target_reference: input.reference,
        target_notes: input.notes ?? null,
        target_override_amount: input.overrideAmount ?? null,
        target_adjustment_reason: input.adjustmentReason ?? null,
        target_payment_status: input.paymentStatus,
      });
      throwIfError(error);
      return mapLicense(data);
    },
    async renewWithPayment(input: LicenseBillingInput) {
      const { data, error } = await getSupabaseClient().rpc("admin_renew_license_with_payment", {
        target_license_id: input.licenseId,
        target_plan: input.plan,
        target_method: input.method,
        target_reference: input.reference,
        target_notes: input.notes ?? null,
        target_override_amount: input.overrideAmount ?? null,
        target_adjustment_reason: input.adjustmentReason ?? null,
        target_payment_status: input.paymentStatus,
      });
      throwIfError(error);
      return mapLicense(data);
    },
  },
  payments: {
    async list(projectId) {
      const { data, error } = await getSupabaseClient()
        .from("payments")
        .select(
          "id,project_id,user_id,license_id,amount,currency,method,reference,recorded_by,created_at",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      throwIfError(error);

      return (data ?? []).map(
        (payment): ServicePayment => ({
          id: payment.id,
          projectId: payment.project_id,
          userId: payment.user_id,
          licenseId: payment.license_id ?? undefined,
          amount: Number(payment.amount),
          listPrice: Number(payment.amount),
          discount: 0,
          plan: "",
          currency: payment.currency as Currency,
          method: payment.method,
          reference: payment.reference,
          employeeId: payment.recorded_by,
          createdAt: payment.created_at,
          status: "paid",
          notes: null,
        }),
      );
    },
    async listAdmin(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_license_payments", {
        target_project_id: projectId,
      });
      throwIfError(error);
      return (data ?? []).map(
        (payment: PaymentRow): ServicePayment => ({
          id: payment.id,
          projectId,
          userId: "",
          licenseId: undefined,
          amount: Number(payment.amount),
          listPrice: Number(payment.list_price),
          discount: Number(payment.discount),
          plan: payment.plan,
          currency: payment.currency as Currency,
          method: payment.method,
          reference: payment.reference,
          employeeId: payment.recorded_by,
          createdAt: payment.created_at,
          status: payment.paid_status,
          notes: payment.notes,
          userEmail: payment.user_email,
          licenseKey: payment.license_key ?? undefined,
        }),
      );
    },
  },
  licenseAuditLog: {
    async list(projectId) {
      const { data, error } = await getSupabaseClient()
        .from("license_audit_log")
        .select("id,project_id,action,detail,actor_id,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      throwIfError(error);

      return (data ?? []).map(
        (entry): HistoryEntry => ({
          id: entry.id,
          projectId: entry.project_id,
          action: entry.action,
          detail: entry.detail,
          actor: entry.actor_id,
          createdAt: entry.created_at,
        }),
      );
    },
  },
};
