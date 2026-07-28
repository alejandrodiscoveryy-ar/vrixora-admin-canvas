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
  ServicePayment,
  CreateLicenseInput,
  LicenseAuditEntry,
  LicenseDevice,
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
  },
  licenses: {
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
        .select("code,name,max_devices,features")
        .order("name");
      throwIfError(error);

      return (data ?? []).map(
        (plan): LicensePlan => ({
          code: plan.code,
          name: plan.name,
          maxDevices: plan.max_devices,
          features: plan.features ?? {},
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
          currency: payment.currency as Currency,
          method: payment.method,
          reference: payment.reference,
          employeeId: payment.recorded_by,
          createdAt: payment.created_at,
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
