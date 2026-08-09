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
  ProjectPermission,
  UsageAnalyticsDay,
  RetentionMetrics,
  BillingPreview,
  BillingReceipt,
  WhatsAppSettings,
} from "./types";
import { requireOnline } from "@/lib/pwa";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function mapBillingPreview(data: Record<string, unknown>): BillingPreview {
  return {
    licenseId: String(data.license_id),
    previousPlan: String(data.previous_plan),
    newPlan: String(data.new_plan),
    licenseType: String(data.license_type),
    previousExpiresAt: data.previous_expires_at ? String(data.previous_expires_at) : null,
    newStartedAt: String(data.new_started_at),
    newExpiresAt: data.new_expires_at ? String(data.new_expires_at) : null,
    durationDays: data.duration_days == null ? null : Number(data.duration_days),
    maxDevices: Number(data.max_devices),
    price: Number(data.price),
    currency: data.currency as BillingPreview["currency"],
    applicationRule: data.application_rule as BillingPreview["applicationRule"],
    isTrialConversion: Boolean(data.is_trial_conversion),
  };
}

function mapBillingReceipt(data: Record<string, unknown>): BillingReceipt {
  return {
    receiptId: String(data.receipt_id),
    receiptNumber: String(data.receipt_number),
    paymentId: String(data.payment_id),
    licenseId: String(data.license_id),
    projectId: String(data.project_id),
    projectName: String(data.project_name),
    clientName: String(data.client_name),
    clientEmail: String(data.client_email),
    maskedLicenseKey: String(data.masked_license_key),
    previousPlan: String(data.previous_plan),
    plan: String(data.plan),
    planName: String(data.plan_name),
    durationDays: data.duration_days == null ? null : Number(data.duration_days),
    listPrice: Number(data.list_price),
    amount: Number(data.amount),
    currency: data.currency as BillingReceipt["currency"],
    method: data.method as BillingReceipt["method"],
    reference: String(data.reference),
    chargedAt: String(data.charged_at),
    startedAt: String(data.started_at),
    expiresAt: data.expires_at ? String(data.expires_at) : null,
    status: data.status as BillingReceipt["status"],
    maxDevices: Number(data.max_devices),
    operatorEmail: String(data.operator_email),
    notes: data.notes ? String(data.notes) : null,
    whatsapp: data.whatsapp ? String(data.whatsapp) : null,
    supportEmail: data.support_email ? String(data.support_email) : null,
    applicationRule: data.application_rule as BillingReceipt["applicationRule"],
  };
}

function mapWhatsAppSettings(data: Record<string, unknown>): WhatsAppSettings {
  return {
    projectId: String(data.project_id),
    fallbackNumber: data.fallback_number ? String(data.fallback_number) : "",
    supportNumber: data.support_number ? String(data.support_number) : "",
    paymentNumber: data.payment_number ? String(data.payment_number) : "",
    supportButtonText: String(data.support_button_text),
    paymentButtonText: String(data.payment_button_text),
    supportTemplate: String(data.support_template),
    paymentTemplate: String(data.payment_template),
    supportEnabled: Boolean(data.support_enabled),
    paymentEnabled: Boolean(data.payment_enabled),
    version: Number(data.version),
    updatedAt: String(data.updated_at),
  };
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
  project_id?: string;
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
  license_id: string | null;
  operator_label: string | null;
  has_receipt: boolean;
};

type ClientRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  registered_at: string;
  license_id: string | null;
  license_key: string | null;
  plan: string;
  status: string;
  activated_at: string;
  expires_at: string;
  max_devices: number;
  active_devices: number | string;
  last_payment_at: string | null;
  last_payment_amount: number | string | null;
  last_payment_currency: string | null;
  last_renewed_at: string | null;
};

type AuditEventRow = {
  id: number | string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type UsageAnalyticsRow = {
  metric_date: string;
  new_users: number | string;
  trials: number | string;
  paid_licenses: number | string;
  active_users: number | string;
  weekly_active_users: number | string;
  monthly_active_users: number | string;
  logins: number | string;
  renewals: number | string;
  expired: number | string;
  revenue_cup: number | string;
  revenue_usd: number | string;
  revenue_eur: number | string;
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
        .select(
          "notify_license_expiry,auto_renew_verified_payments,logo_url,icon_url,primary_color,secondary_color,whatsapp,support_email,website_url,privacy_url,terms_url,currency,trial_days,payment_methods,minimum_version,maintenance_mode,force_update,welcome_message",
        )
        .eq("id", projectId)
        .single();
      throwIfError(error);
      if (!data) throw new Error("No se encontró el proyecto.");
      return {
        notifyLicenseExpiry: data.notify_license_expiry,
        autoRenewVerifiedPayments: data.auto_renew_verified_payments,
        logoUrl: data.logo_url ?? "",
        iconUrl: data.icon_url ?? "",
        primaryColor: data.primary_color,
        secondaryColor: data.secondary_color,
        whatsapp: data.whatsapp ?? "",
        supportEmail: data.support_email ?? "",
        websiteUrl: data.website_url ?? "",
        privacyUrl: data.privacy_url ?? "",
        termsUrl: data.terms_url ?? "",
        currency: data.currency as Currency,
        trialDays: data.trial_days,
        paymentMethods: data.payment_methods as ServicePayment["method"][],
        minimumVersion: data.minimum_version ?? "",
        maintenanceMode: data.maintenance_mode,
        forceUpdate: data.force_update,
        welcomeMessage: data.welcome_message ?? "",
      };
    },
    async update(projectId, changes) {
      await requireOnline("Actualizar la configuración del proyecto");
      const { error } = await getSupabaseClient().rpc("admin_update_project_settings", {
        target_project_id: projectId,
        target_name: changes.name,
        target_description: changes.description,
        target_notify_license_expiry: changes.notifyLicenseExpiry,
        target_auto_renew_verified_payments: changes.autoRenewVerifiedPayments,
        target_logo_url: changes.logoUrl,
        target_icon_url: changes.iconUrl,
        target_primary_color: changes.primaryColor,
        target_secondary_color: changes.secondaryColor,
        target_whatsapp: changes.whatsapp,
        target_support_email: changes.supportEmail,
        target_website_url: changes.websiteUrl,
        target_privacy_url: changes.privacyUrl,
        target_terms_url: changes.termsUrl,
        target_currency: changes.currency,
        target_trial_days: changes.trialDays,
        target_payment_methods: changes.paymentMethods,
        target_minimum_version: changes.minimumVersion,
        target_maintenance_mode: changes.maintenanceMode,
        target_force_update: changes.forceUpdate,
        target_welcome_message: changes.welcomeMessage,
      });
      throwIfError(error);
    },
    async whatsappSettings(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_get_whatsapp_settings", {
        target_project_id: projectId,
      });
      throwIfError(error);
      const row = data as Record<string, unknown>;
      return mapWhatsAppSettings(row);
    },
    async updateWhatsAppSettings(projectId, settings) {
      await requireOnline("Actualizar la configuración de WhatsApp");
      const { data, error } = await getSupabaseClient().rpc("admin_update_whatsapp_settings", {
        target_project_id: projectId,
        target_fallback_number: settings.fallbackNumber,
        target_support_number: settings.supportNumber,
        target_payment_number: settings.paymentNumber,
        target_support_button_text: settings.supportButtonText,
        target_payment_button_text: settings.paymentButtonText,
        target_support_template: settings.supportTemplate,
        target_payment_template: settings.paymentTemplate,
        target_support_enabled: settings.supportEnabled,
        target_payment_enabled: settings.paymentEnabled,
      });
      throwIfError(error);
      return mapWhatsAppSettings(data as Record<string, unknown>);
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
        .select("id,email,display_name,avatar_url")
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
          avatarUrl: profile?.avatar_url ?? null,
          role: member.role,
          projectIds: [projectId],
        };
      });
    },
    async permissions(projectId) {
      const { data, error } = await getSupabaseClient().rpc("get_my_project_permissions", {
        target_project_id: projectId,
      });
      throwIfError(error);
      return ((data ?? []) as Array<{ permission_code: ProjectPermission }>).map(
        (row) => row.permission_code,
      );
    },
    async add(projectId, email, role) {
      await requireOnline("Agregar un miembro al proyecto");
      const { error } = await getSupabaseClient().rpc("admin_upsert_project_member", {
        target_project_id: projectId,
        target_email: email.trim(),
        target_role: role,
      });
      throwIfError(error);
    },
    async remove(projectId, userId) {
      await requireOnline("Eliminar un miembro del proyecto");
      const { error } = await getSupabaseClient().rpc("admin_remove_project_member", {
        target_project_id: projectId,
        target_user_id: userId,
      });
      throwIfError(error);
    },
  },
  licenses: {
    async listClients(projectId) {
      const client = getSupabaseClient();
      const { data, error } = await client.rpc("admin_list_registered_clients", {
        target_project_id: projectId,
      });
      throwIfError(error);

      const rows = (data ?? []) as ClientRow[];
      return rows.map(
        (client: ClientRow): ServiceClient => ({
          userId: client.user_id,
          email: client.email,
          displayName: client.display_name ?? client.email,
          phone: client.phone,
          avatarUrl: client.avatar_url,
          registeredAt: client.registered_at,
          licenseId: client.license_id,
          licenseKey: client.license_key,
          plan: client.plan,
          status: client.status as LicenseStatus,
          activatedAt: client.activated_at,
          expiresAt: client.expires_at,
          maxDevices: Number(client.max_devices),
          activeDevices: Number(client.active_devices),
          lastPaymentAt: client.last_payment_at,
          lastPaymentAmount:
            client.last_payment_amount == null ? null : Number(client.last_payment_amount),
          lastPaymentCurrency: client.last_payment_currency as Currency | null,
          lastRenewedAt: client.last_renewed_at,
        }),
      );
    },
    async setClientStatus(projectId, userId, status, reason) {
      await requireOnline("Cambiar el estado de una licencia");
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
    async listPlans(projectId) {
      const { data, error } = await getSupabaseClient()
        .from("license_plans")
        .select(
          "project_id,code,name,license_type,duration_days,price,currency,max_devices,features,description,active,is_featured",
        )
        .eq("project_id", projectId)
        .order("name");
      throwIfError(error);

      return (data ?? []).map(
        (plan: PlanRow): LicensePlan => ({
          projectId: plan.project_id,
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
      await requireOnline("Renovar una licencia");
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
      await requireOnline("Crear una licencia");
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
      await requireOnline("Actualizar una licencia");
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
      await requireOnline("Gestionar un dispositivo");
      const { error } = await getSupabaseClient().rpc("admin_manage_license_device", {
        target_device_id: deviceId,
        operation,
        reason: reason ?? null,
      });
      throwIfError(error);
    },
    async resetDevices(licenseId, reason) {
      await requireOnline("Restablecer dispositivos de licencia");
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
          projectId,
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
      await requireOnline("Guardar un plan");
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
        projectId,
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
      await requireOnline("Asignar una licencia con pago");
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
      await requireOnline("Renovar una licencia con pago");
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
          licenseId: payment.license_id ?? undefined,
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
          operatorLabel: payment.operator_label ?? payment.recorded_by,
          hasReceipt: payment.has_receipt,
        }),
      );
    },
    async record(input) {
      await requireOnline("Registrar un pago");
      const { data, error } = await getSupabaseClient().rpc("admin_record_license_payment", {
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
      return {
        id: data.id,
        projectId: data.project_id,
        userId: data.user_id,
        licenseId: data.license_id,
        amount: Number(data.amount),
        listPrice: Number(data.list_price),
        discount: Number(data.discount),
        plan: data.plan,
        currency: data.currency as Currency,
        method: data.method,
        reference: data.reference,
        employeeId: data.recorded_by,
        createdAt: data.created_at,
        status: data.status,
        notes: data.notes,
      };
    },
    async updateStatus(paymentId, status, notes) {
      await requireOnline("Cambiar el estado de un pago");
      const { data, error } = await getSupabaseClient().rpc("admin_update_payment_status", {
        target_payment_id: paymentId,
        target_status: status,
        target_notes: notes ?? null,
      });
      throwIfError(error);
      return {
        id: data.id,
        projectId: data.project_id,
        userId: data.user_id,
        licenseId: data.license_id,
        amount: Number(data.amount),
        listPrice: Number(data.list_price),
        discount: Number(data.discount),
        plan: data.plan,
        currency: data.currency as Currency,
        method: data.method,
        reference: data.reference,
        employeeId: data.recorded_by,
        createdAt: data.created_at,
        status: data.status,
        notes: data.notes,
      };
    },
    async update(input) {
      await requireOnline("Actualizar un pago");
      const { data, error } = await getSupabaseClient().rpc("admin_update_payment_record", {
        target_payment_id: input.paymentId,
        target_amount: input.amount,
        target_currency: input.currency,
        target_method: input.method,
        target_reference: input.reference,
        target_status: input.status,
        target_notes: input.notes ?? null,
        target_adjustment_reason: input.adjustmentReason,
      });
      throwIfError(error);
      return {
        id: data.id,
        projectId: data.project_id,
        userId: data.user_id,
        licenseId: data.license_id,
        amount: Number(data.amount),
        listPrice: Number(data.list_price),
        discount: Number(data.discount),
        plan: data.plan,
        currency: data.currency as Currency,
        method: data.method,
        reference: data.reference,
        employeeId: data.recorded_by,
        createdAt: data.created_at,
        status: data.status,
        notes: data.notes,
      };
    },
    async remove(paymentId, reason) {
      await requireOnline("Eliminar un pago");
      const { error } = await getSupabaseClient().rpc("admin_delete_payment_record", {
        target_payment_id: paymentId,
        target_reason: reason,
      });
      throwIfError(error);
    },
    async previewCharge(licenseId, plan, applicationRule) {
      const { data, error } = await getSupabaseClient().rpc("admin_preview_charge_plan", {
        target_license_id: licenseId,
        target_plan: plan,
        target_rule: applicationRule,
      });
      throwIfError(error);
      return mapBillingPreview(data as Record<string, unknown>);
    },
    async chargeAndAssign(input) {
      await requireOnline("Cobrar y asignar una licencia");
      const { data, error } = await getSupabaseClient().rpc(
        "admin_charge_and_assign_plan_with_client_phone",
        {
          target_license_id: input.licenseId,
          target_plan: input.plan,
          target_amount: input.amount,
          target_method: input.method,
          target_reference: input.reference ?? null,
          target_charged_at: input.chargedAt,
          target_notes: input.notes ?? null,
          target_application_rule: input.applicationRule,
          target_idempotency_key: input.idempotencyKey,
          target_client_phone: input.clientWhatsapp ?? null,
          target_confirm_phone_change: input.confirmClientWhatsappChange ?? false,
        },
      );
      throwIfError(error);
      return mapBillingReceipt(data as Record<string, unknown>);
    },
    async receipt(paymentId) {
      const { data, error } = await getSupabaseClient().rpc("admin_get_billing_receipt", {
        target_payment_id: paymentId,
      });
      throwIfError(error);
      return mapBillingReceipt(data as Record<string, unknown>);
    },
    async repairReceipt(paymentId) {
      await requireOnline("Reparar un recibo");
      const { data, error } = await getSupabaseClient().rpc(
        "admin_repair_missing_billing_receipt",
        { target_payment_id: paymentId },
      );
      throwIfError(error);
      return mapBillingReceipt(data as Record<string, unknown>);
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
  audit: {
    async list(projectId, limit = 100) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_audit_events", {
        target_project_id: projectId,
        target_limit: limit,
      });
      throwIfError(error);
      return (data ?? []).map((entry: AuditEventRow) => ({
        id: Number(entry.id),
        actorId: entry.actor_id,
        actorEmail: entry.actor_email,
        action: entry.action,
        entityType: entry.entity_type,
        entityId: entry.entity_id,
        metadata: entry.metadata ?? {},
        ipAddress: entry.ip_address,
        userAgent: entry.user_agent,
        createdAt: entry.created_at,
      }));
    },
  },
  usageAnalytics: {
    async series(projectId, filters) {
      const { data, error } = await getSupabaseClient().rpc("admin_get_usage_analytics", {
        target_project_id: projectId,
        target_from: filters.from,
        target_to: filters.to,
        target_plan: filters.plan ?? null,
        target_license_status: filters.licenseStatus ?? null,
        target_source: filters.source ?? null,
        target_campaign: filters.campaign ?? null,
        target_app_version: filters.appVersion ?? null,
      });
      throwIfError(error);
      return ((data ?? []) as UsageAnalyticsRow[]).map(
        (row): UsageAnalyticsDay => ({
          date: row.metric_date,
          newUsers: Number(row.new_users),
          trials: Number(row.trials),
          paidLicenses: Number(row.paid_licenses),
          activeUsers: Number(row.active_users),
          weeklyActiveUsers: Number(row.weekly_active_users),
          monthlyActiveUsers: Number(row.monthly_active_users),
          logins: Number(row.logins),
          renewals: Number(row.renewals),
          expired: Number(row.expired),
          revenueCUP: Number(row.revenue_cup),
          revenueUSD: Number(row.revenue_usd),
          revenueEUR: Number(row.revenue_eur),
        }),
      );
    },
    async dimensions(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_get_usage_dimensions", {
        target_project_id: projectId,
      });
      throwIfError(error);
      const result = (data ?? {}) as {
        sources?: string[];
        campaigns?: string[];
        versions?: string[];
      };
      return {
        sources: result.sources ?? [],
        campaigns: result.campaigns ?? [],
        versions: result.versions ?? [],
      };
    },
    async retention(projectId, filters) {
      const { data, error } = await getSupabaseClient().rpc("admin_get_retention_metrics", {
        target_project_id: projectId,
        target_plan: filters.plan ?? null,
        target_source: filters.source ?? null,
        target_campaign: filters.campaign ?? null,
      });
      throwIfError(error);
      const row = data as Record<string, number>;
      return {
        cohortCount: Number(row.cohort_count ?? 0),
        eligible7: Number(row.eligible_7 ?? 0),
        eligible30: Number(row.eligible_30 ?? 0),
        retained7: Number(row.retained_7 ?? 0),
        retained30: Number(row.retained_30 ?? 0),
        retention7Rate: Number(row.retention_7_rate ?? 0),
        retention30Rate: Number(row.retention_30_rate ?? 0),
        trialUsers: Number(row.trial_users ?? 0),
        paidUsers: Number(row.paid_users ?? 0),
        trialToPaidRate: Number(row.trial_to_paid_rate ?? 0),
      } satisfies RetentionMetrics;
    },
  },
};
