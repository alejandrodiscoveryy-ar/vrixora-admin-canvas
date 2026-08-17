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
  PaymentCancellationPreview,
  WhatsAppSettings,
  CommercialLead,
  CommercialCampaign,
  CommercialLeadHistoryEntry,
  BusinessAuditEvent,
  P0ASettings,
  ExchangeRateHistoryEntry,
  Preinvoice,
  Client360,
  Client360Payment,
  Client360Preinvoice,
  Client360ReferralPerson,
} from "./types";
import { requireOnline } from "@/lib/pwa";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function mapClient360(data: Record<string, unknown>): Client360 {
  const client = data.client as Record<string, unknown>;
  const permissions = data.permissions as Record<string, unknown>;
  const license = data.license as Record<string, unknown> | null;
  const lastPayment = data.last_payment as Record<string, unknown> | null;
  const commercial = data.commercial as Record<string, unknown> | null;
  const billing = data.billing as Record<string, unknown> | null;
  const referrals = data.referrals as Record<string, unknown> | null;
  const adoption = (data.adoption ?? {}) as Record<string, unknown>;
  const adoptionBreakdown = (adoption.breakdown ?? {}) as Record<string, unknown>;
  const mapPayment = (row: Record<string, unknown>): Client360Payment => ({
    id: String(row.id),
    licenseId: row.license_id ? String(row.license_id) : null,
    preinvoiceId: row.preinvoice_id ? String(row.preinvoice_id) : null,
    plan: String(row.plan),
    planName: String(row.plan_name ?? row.plan),
    amount: Number(row.amount),
    currency: row.currency as Client360Payment["currency"],
    method: row.method as Client360Payment["method"],
    reference: String(row.reference),
    status: row.status as Client360Payment["status"],
    notes: row.notes ? String(row.notes) : null,
    chargedAt: String(row.charged_at),
    createdAt: String(row.created_at),
    receiptId: row.receipt_id ? String(row.receipt_id) : null,
    receiptNumber: row.receipt_number ? String(row.receipt_number) : null,
    isTest: Boolean(row.is_test),
  });
  const mapReferral = (row: Record<string, unknown>): Client360ReferralPerson => ({
    relationshipId: String(row.relationship_id),
    userId: String(row.user_id),
    name: String(row.name),
    email: row.email ? String(row.email) : undefined,
    referralCode: row.referral_code ? String(row.referral_code) : null,
    createdAt: String(row.created_at),
    isTest: Boolean(row.is_test),
    rewardStatus: row.reward_status as Client360ReferralPerson["rewardStatus"],
    rewardDays: row.reward_days == null ? null : Number(row.reward_days),
  });
  return {
    permissions: {
      licenses: Boolean(permissions.licenses),
      payments: Boolean(permissions.payments),
      commercial: Boolean(permissions.commercial),
      audit: Boolean(permissions.audit),
    },
    client: {
      id: String(client.id),
      email: String(client.email),
      displayName: String(client.display_name ?? client.email),
      phone: client.phone ? String(client.phone) : null,
      avatarUrl: client.avatar_url ? String(client.avatar_url) : null,
      registeredAt: String(client.registered_at),
    },
    license: license
      ? {
          id: String(license.id),
          licenseKey: String(license.license_key),
          licenseType: String(license.license_type),
          planCode: String(license.plan_code),
          planName: String(license.plan_name),
          status: license.status as LicenseStatus,
          activatedAt: license.activated_at ? String(license.activated_at) : null,
          expiresAt: license.expires_at ? String(license.expires_at) : null,
          lastRenewedAt: license.last_renewed_at ? String(license.last_renewed_at) : null,
          maxDevices: Number(license.max_devices),
          activeDevices: Number(license.active_devices),
          devices: ((license.devices ?? []) as Array<Record<string, unknown>>).map((device) => ({
            id: String(device.id),
            label: device.label ? String(device.label) : null,
            firstSeenAt: String(device.first_seen_at),
            lastSeenAt: String(device.last_seen_at),
            revokedAt: device.revoked_at ? String(device.revoked_at) : null,
          })),
        }
      : null,
    lastPayment: lastPayment
      ? {
          id: String(lastPayment.id),
          amount: Number(lastPayment.amount),
          currency: lastPayment.currency as Client360Payment["currency"],
          status: lastPayment.status as Client360Payment["status"],
          chargedAt: String(lastPayment.charged_at),
          plan: String(lastPayment.plan),
          planName: String(lastPayment.plan_name ?? lastPayment.plan),
        }
      : null,
    commercial: commercial
      ? {
          id: String(commercial.id),
          source: commercial.source as NonNullable<Client360["commercial"]>["source"],
          medium: commercial.medium ? String(commercial.medium) : null,
          campaign: commercial.campaign ? String(commercial.campaign) : null,
          referralCode: commercial.referral_code ? String(commercial.referral_code) : null,
          referredById: commercial.referred_by_id ? String(commercial.referred_by_id) : null,
          referredByName: commercial.referred_by_name ? String(commercial.referred_by_name) : null,
          status: commercial.status as NonNullable<Client360["commercial"]>["status"],
          responsibleId: commercial.responsible_id ? String(commercial.responsible_id) : null,
          responsibleName: commercial.responsible_name ? String(commercial.responsible_name) : null,
          notes: commercial.notes ? String(commercial.notes) : null,
          lastInteractionAt: commercial.last_interaction_at
            ? String(commercial.last_interaction_at)
            : null,
          nextActionAt: commercial.next_action_at ? String(commercial.next_action_at) : null,
        }
      : null,
    billing: billing
      ? {
          preinvoices: ((billing.preinvoices ?? []) as Array<Record<string, unknown>>).map(
            (row): Client360Preinvoice => ({
              id: String(row.id),
              number: Number(row.number),
              planCode: String(row.plan_code),
              planName: String(row.plan_name),
              chargeAmount: Number(row.charge_amount),
              chargeCurrency: row.charge_currency as Client360Preinvoice["chargeCurrency"],
              status: row.status as Client360Preinvoice["status"],
              isTest: Boolean(row.is_test),
              issuedAt: String(row.issued_at),
              expiresAt: String(row.expires_at),
              paidPaymentId: row.paid_payment_id ? String(row.paid_payment_id) : null,
            }),
          ),
          payments: ((billing.payments ?? []) as Array<Record<string, unknown>>).map(mapPayment),
          receipts: ((billing.receipts ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id),
            paymentId: String(row.payment_id),
            receiptNumber: String(row.receipt_number),
            createdAt: String(row.created_at),
            isTest: Boolean(row.is_test),
          })),
        }
      : null,
    referrals: referrals
      ? {
          rewardDays: Number(referrals.reward_days ?? 15),
          referredBy: referrals.referred_by
            ? mapReferral(referrals.referred_by as Record<string, unknown>)
            : null,
          referredClients: (
            (referrals.referred_clients ?? []) as Array<Record<string, unknown>>
          ).map(mapReferral),
        }
      : null,
    adoption: {
      score: Number(adoption.score ?? 0),
      level: String(adoption.level ?? "Sin actividad") as Client360["adoption"]["level"],
      usageProfile: String(
        adoption.usage_profile ?? "Sin actividad",
      ) as Client360["adoption"]["usageProfile"],
      lastActivityAt: adoption.last_activity_at ? String(adoption.last_activity_at) : null,
      daysSinceActivity:
        adoption.days_since_activity == null ? null : Number(adoption.days_since_activity),
      activeDays30: Number(adoption.active_days_30 ?? 0),
      records30: Number(adoption.records_30 ?? 0),
      activeWeeks30: Number(adoption.active_weeks_30 ?? 0),
      entityTypes30: Number(adoption.entity_types_30 ?? 0),
      breakdown: {
        frequency: Number(adoptionBreakdown.frequency ?? 0),
        recency: Number(adoptionBreakdown.recency ?? 0),
        consistency: Number(adoptionBreakdown.consistency ?? 0),
        depth: Number(adoptionBreakdown.depth ?? 0),
      },
    },
    activity: ((data.activity ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      type: row.type as Client360["activity"][number]["type"],
      title: String(row.title),
      description: row.description ? String(row.description) : null,
      occurredAt: String(row.occurred_at),
    })),
  };
}

function mapBillingPreview(data: Record<string, unknown>): BillingPreview {
  return {
    licenseId: data.license_id ? String(data.license_id) : null,
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

function mapPaymentCancellationPreview(data: Record<string, unknown>): PaymentCancellationPreview {
  return {
    paymentId: String(data.payment_id),
    status: data.status as PaymentCancellationPreview["status"],
    clientName: String(data.client_name ?? "Cliente"),
    clientEmail: String(data.client_email ?? ""),
    amount: Number(data.amount),
    currency: data.currency as PaymentCancellationPreview["currency"],
    planName: String(data.plan_name ?? "Plan"),
    preinvoiceNumber: data.preinvoice_number == null ? null : Number(data.preinvoice_number),
    receiptNumber: data.receipt_number ? String(data.receipt_number) : null,
    licenseKey: data.license_key ? String(data.license_key) : null,
    currentExpiresAt: data.current_expires_at ? String(data.current_expires_at) : null,
    licenseEffect: data.license_effect ? String(data.license_effect) : null,
    effectDays: data.effect_days == null ? null : Number(data.effect_days),
    generatedReward: data.generated_reward as PaymentCancellationPreview["generatedReward"],
    appliedReferralRewards: Number(data.applied_referral_rewards ?? 0),
    appliedReferralDays: Number(data.applied_referral_days ?? 0),
    licenseCanRevertAutomatically: Boolean(data.license_can_revert_automatically),
    licenseRequiresReview: Boolean(data.license_requires_review),
    alreadyCancelled: Boolean(data.already_cancelled),
    result: data.result as PaymentCancellationPreview["result"],
    licenseAction: data.license_action ? String(data.license_action) : undefined,
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
    identitySnapshot: data.identity_snapshot as BillingReceipt["identitySnapshot"],
    isTest: Boolean(data.is_test),
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
  plan_name: string | null;
  preinvoice_id: string | null;
  is_test: boolean;
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
  plan: string | null;
  status: string | null;
  activated_at: string | null;
  expires_at: string | null;
  max_devices: number | null;
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
type BusinessAuditEventRow = AuditEventRow & {
  actor_name: string;
  actor_role: string;
  action_label: string;
  area: BusinessAuditEvent["area"];
  importance: BusinessAuditEvent["importance"];
  entity_label: string;
  reason: string | null;
  total_count: number | string;
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
        .select("id,name,slug,description,status,created_at,color,icon_url")
        .order("created_at", { ascending: false });
      throwIfError(error);

      return (data ?? []).map((project): Project => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description ?? "",
        status: project.status,
        createdAt: project.created_at,
        color: project.color,
        iconUrl: project.icon_url ?? null,
      }));
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
    async uploadBrandAsset(projectId, kind, file) {
      await requireOnline("Subir un recurso de marca");
      const extensionByType: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/x-icon": "ico",
        "image/vnd.microsoft.icon": "ico",
      };
      const extension = extensionByType[file.type];
      if (!extension) throw new Error("Formato no permitido. Usa PNG, JPG, WEBP o ICO.");
      if (file.size > 2 * 1024 * 1024) throw new Error("El archivo no puede superar 2 MB.");

      const objectPath = `${projectId}/${kind}-${crypto.randomUUID()}.${extension}`;
      const client = getSupabaseClient();
      const { error } = await client.storage.from("project-branding").upload(objectPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      throwIfError(error);
      return client.storage.from("project-branding").getPublicUrl(objectPath).data.publicUrl;
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
      return rows.map((client: ClientRow): ServiceClient => ({
        userId: client.user_id,
        email: client.email,
        displayName: client.display_name ?? client.email,
        phone: client.phone,
        avatarUrl: client.avatar_url,
        registeredAt: client.registered_at,
        licenseId: client.license_id,
        licenseKey: client.license_key,
        plan: client.plan,
        status: client.status as LicenseStatus | null,
        activatedAt: client.activated_at,
        expiresAt: client.expires_at,
        maxDevices: Number(client.max_devices ?? 0),
        activeDevices: Number(client.active_devices),
        lastPaymentAt: client.last_payment_at,
        lastPaymentAmount:
          client.last_payment_amount == null ? null : Number(client.last_payment_amount),
        lastPaymentCurrency: client.last_payment_currency as Currency | null,
        lastRenewedAt: client.last_renewed_at,
      }));
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

      return (data ?? []).map((licenseType): LicenseType => ({
        code: licenseType.code,
        name: licenseType.name,
        defaultDurationDays: licenseType.default_duration_days,
        allowsCustomDuration: licenseType.allows_custom_duration,
        neverExpires: licenseType.never_expires,
        defaultMaxDevices: licenseType.default_max_devices,
        defaultFeatures: licenseType.default_features ?? {},
      }));
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

      return (data ?? []).map((plan: PlanRow): LicensePlan => ({
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
      }));
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
      return (data ?? []).map((device): LicenseDevice => ({
        id: device.id,
        licenseId: device.license_id,
        firstSeenAt: device.first_seen_at,
        lastSeenAt: device.last_seen_at,
        revokedAt: device.revoked_at,
      }));
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
      return (data ?? []).map((entry): LicenseAuditEntry => ({
        id: entry.id,
        licenseId: entry.license_id,
        action: entry.action,
        detail: entry.detail,
        actorId: entry.actor_id,
        actorEmail: actorEmails.get(entry.actor_id),
        metadata: entry.metadata ?? {},
        createdAt: entry.created_at,
      }));
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
      return (data ?? []).map((plan: PlanRow): LicensePlan => ({
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
      }));
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
    async deleteInactivePlan(projectId, planCode) {
      await requireOnline("Eliminar un plan inactivo");
      const { data, error } = await getSupabaseClient().rpc("admin_delete_inactive_license_plan", {
        target_project_id: projectId,
        target_plan_code: planCode,
      });
      throwIfError(error);
      return { reassignedLicenses: Number(data?.reassigned_licenses ?? 0) };
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

      return (data ?? []).map((payment): ServicePayment => ({
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
      }));
    },
    async listAdmin(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_license_payments", {
        target_project_id: projectId,
      });
      throwIfError(error);
      return (data ?? []).map((payment: PaymentRow): ServicePayment => ({
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
        planName: payment.plan_name ?? payment.plan,
        preinvoiceId: payment.preinvoice_id,
        isTest: payment.is_test,
      }));
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
    async previewCancellation(paymentId) {
      const { data, error } = await getSupabaseClient().rpc("admin_preview_payment_cancellation", {
        target_payment_id: paymentId,
      });
      throwIfError(error);
      return mapPaymentCancellationPreview(data as Record<string, unknown>);
    },
    async cancelSafe(paymentId, reason) {
      await requireOnline("Cancelar un pago");
      const { data, error } = await getSupabaseClient().rpc("admin_cancel_payment_safe", {
        target_payment_id: paymentId,
        target_reason: reason,
      });
      throwIfError(error);
      return mapPaymentCancellationPreview(data as Record<string, unknown>);
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

      return (data ?? []).map((entry): HistoryEntry => ({
        id: entry.id,
        projectId: entry.project_id,
        action: entry.action,
        detail: entry.detail,
        actor: entry.actor_id,
        createdAt: entry.created_at,
      }));
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

    async listBusiness(projectId, from, to, limit = 2000) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_business_audit_events", {
        target_project_id: projectId,
        target_from: from,
        target_to: to,
        target_limit: limit,
      });

      throwIfError(error);

      return ((data ?? []) as BusinessAuditEventRow[]).map((entry): BusinessAuditEvent => ({
        id: Number(entry.id),
        actorId: entry.actor_id,
        actorEmail: entry.actor_email,
        actorName: entry.actor_name,
        actorRole: entry.actor_role,
        action: entry.action,
        actionLabel: entry.action_label,
        area: entry.area,
        importance: entry.importance,
        entityType: entry.entity_type,
        entityLabel: entry.entity_label,
        entityId: entry.entity_id,
        reason: entry.reason,
        metadata: entry.metadata ?? {},
        ipAddress: entry.ip_address,
        userAgent: entry.user_agent,
        createdAt: entry.created_at,
        totalCount: Number(entry.total_count),
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
      return ((data ?? []) as UsageAnalyticsRow[]).map((row): UsageAnalyticsDay => ({
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
      }));
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
  commercial: {
    async listLeads(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_commercial_leads", {
        target_project_id: projectId,
      });
      throwIfError(error);
      return ((data ?? []) as Array<Record<string, unknown>>).map((row): CommercialLead => ({
        id: String(row.id),
        name: String(row.name),
        phone: String(row.phone),
        email: row.email as string | null,
        source: row.source as CommercialLead["source"],
        medium: row.medium as string | null,
        campaign: row.campaign as string | null,
        referralCode: row.referral_code as string | null,
        referredByUserId: row.referred_by_user_id as string | null,
        referredByName: row.referred_by_name as string | null,
        status: row.status as CommercialLead["status"],
        notes: row.notes as string | null,
        responsibleId: row.responsible_id as string | null,
        responsibleName: row.responsible_name as string | null,
        userId: row.user_id as string | null,
        createdAt: String(row.created_at),
        lastInteractionAt: row.last_interaction_at as string | null,
        nextActionAt: row.next_action_at as string | null,
        registered: Boolean(row.registered),
        trialStarted: Boolean(row.trial_started),
        paid: Boolean(row.paid),
        renewalCount: Number(row.renewal_count),
        revenue: (row.revenue ?? {}) as Record<string, number>,
      }));
    },
    async saveLead(projectId, input) {
      await requireOnline("Guardar lead comercial");
      const { data, error } = await getSupabaseClient().rpc("admin_save_commercial_lead", {
        target_project_id: projectId,
        target_lead_id: input.id ?? null,
        target_name: input.name,
        target_phone: input.phone,
        target_email: input.email ?? null,
        target_source: input.source,
        target_medium: input.medium ?? null,
        target_campaign_id: input.campaignId ?? null,
        target_campaign: input.campaign ?? null,
        target_referral_code: input.referralCode ?? null,
        target_referred_by_user_id: input.referredByUserId ?? null,
        target_status: input.status,
        target_notes: input.notes ?? null,
        target_responsible_id: input.responsibleId ?? null,
        target_next_action_at: input.nextActionAt ?? null,
        target_user_id: input.userId ?? null,
      });
      throwIfError(error);
      return String(data);
    },
    async addNote(projectId, leadId, note) {
      await requireOnline("Agregar nota comercial");
      const { error } = await getSupabaseClient().rpc("admin_add_commercial_lead_note", {
        target_project_id: projectId,
        target_lead_id: leadId,
        target_note: note,
      });
      throwIfError(error);
    },
    async listLeadHistory(projectId, leadId) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_commercial_lead_history", {
        target_project_id: projectId,
        target_lead_id: leadId,
      });
      throwIfError(error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (row): CommercialLeadHistoryEntry => ({
          id: row.id as string | number,
          eventType: String(row.event_type),
          previousValue: row.previous_value as string | null,
          newValue: row.new_value as string | null,
          note: row.note as string | null,
          actorId: String(row.actor_id),
          actorName: row.actor_name as string | null,
          actorEmail: row.actor_email as string | null,
          createdAt: String(row.created_at),
        }),
      );
    },
    async listCampaigns(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_commercial_campaigns", {
        target_project_id: projectId,
      });
      throwIfError(error);
      return ((data ?? []) as Array<Record<string, unknown>>).map((row): CommercialCampaign => ({
        id: String(row.id),
        name: String(row.name),
        source: row.source as CommercialCampaign["source"],
        medium: row.medium as string | null,
        status: row.status as CommercialCampaign["status"],
        startsAt: row.starts_at as string | null,
        endsAt: row.ends_at as string | null,
      }));
    },
    async saveCampaign(projectId, campaign) {
      await requireOnline("Guardar campaña comercial");
      const { data, error } = await getSupabaseClient().rpc("admin_save_commercial_campaign", {
        target_project_id: projectId,
        target_campaign_id: campaign.id ?? null,
        target_name: campaign.name,
        target_source: campaign.source,
        target_medium: campaign.medium,
        target_status: campaign.status,
        target_starts_at: campaign.startsAt,
        target_ends_at: campaign.endsAt,
      });
      throwIfError(error);
      return String(data);
    },
    async metrics(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_get_commercial_metrics", {
        target_project_id: projectId,
      });
      throwIfError(error);
      const row = data as Record<string, unknown>;
      return {
        totalLeads: Number(row.total_leads),
        registered: Number(row.registered),
        trials: Number(row.trials),
        paid: Number(row.paid),
        notConverted: Number(row.not_converted),
        conversionRate: Number(row.conversion_rate),
        topSource: String(row.top_source ?? ""),
        topCampaign: String(row.top_campaign ?? ""),
      };
    },
  },
  foundations: {
    async settings(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_get_p0a_settings", {
        target_project_id: projectId,
      });
      throwIfError(error);
      const row = data as Record<string, unknown>;
      return {
        projectId: String(row.project_id),
        baseCurrency: row.base_currency as P0ASettings["baseCurrency"],
        chargeCurrency: row.charge_currency as P0ASettings["chargeCurrency"],
        rateMode: row.rate_mode as P0ASettings["rateMode"],
        currentRate: Number(row.current_rate),
        rateSource: String(row.rate_source),
        rateUpdatedAt: String(row.rate_updated_at),
        testModeEnabled: Boolean(row.test_mode_enabled),
        referralRewardDays: Number(row.referral_reward_days),
        canManageSettings: Boolean(row.can_manage_settings),
        canManageWhatsapp: Boolean(row.can_manage_whatsapp),
      };
    },
    async updateExchangeSettings(projectId, input) {
      await requireOnline("Actualizar el tipo de cambio");
      const { data, error } = await getSupabaseClient().rpc("admin_set_exchange_settings", {
        target_project_id: projectId,
        target_base_currency: input.baseCurrency,
        target_charge_currency: input.chargeCurrency,
        target_rate_mode: input.rateMode,
        target_rate: input.currentRate,
        target_rate_source: input.rateSource,
      });
      throwIfError(error);
      const row = data as Record<string, unknown>;
      return {
        projectId: String(row.project_id),
        baseCurrency: row.base_currency as P0ASettings["baseCurrency"],
        chargeCurrency: row.charge_currency as P0ASettings["chargeCurrency"],
        rateMode: row.rate_mode as P0ASettings["rateMode"],
        currentRate: Number(row.current_rate),
        rateSource: String(row.rate_source),
        rateUpdatedAt: String(row.rate_updated_at),
        testModeEnabled: Boolean(row.test_mode_enabled),
        referralRewardDays: Number(row.referral_reward_days),
        canManageSettings: Boolean(row.can_manage_settings),
        canManageWhatsapp: Boolean(row.can_manage_whatsapp),
      };
    },
    async setTestMode(projectId, enabled) {
      await requireOnline("Actualizar el modo de pruebas");
      const { data, error } = await getSupabaseClient().rpc("admin_set_test_mode", {
        target_project_id: projectId,
        target_enabled: enabled,
      });
      throwIfError(error);
      return Boolean(data);
    },
    async setReferralRewardDays(projectId, rewardDays) {
      await requireOnline("Actualizar la recompensa por referidos");
      const { data, error } = await getSupabaseClient().rpc("admin_set_referral_reward_days", {
        target_project_id: projectId,
        target_reward_days: rewardDays,
      });
      throwIfError(error);
      return Number(data);
    },
    async exchangeRateHistory(projectId, limit = 100) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_exchange_rate_history", {
        target_project_id: projectId,
        target_limit: limit,
      });
      throwIfError(error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (row): ExchangeRateHistoryEntry => ({
          id: row.id as string | number,
          baseCurrency: row.base_currency as ExchangeRateHistoryEntry["baseCurrency"],
          chargeCurrency: row.charge_currency as ExchangeRateHistoryEntry["chargeCurrency"],
          rate: Number(row.rate),
          rateMode: row.rate_mode as ExchangeRateHistoryEntry["rateMode"],
          rateSource: String(row.rate_source),
          changedBy: row.changed_by ? String(row.changed_by) : null,
          createdAt: String(row.created_at),
        }),
      );
    },
    async createPreinvoice(input) {
      await requireOnline("Crear prefactura");
      const { data, error } = await getSupabaseClient().rpc("admin_create_preinvoice", {
        target_project_id: input.projectId,
        target_client_id: input.clientId,
        target_plan_code: input.planCode,
        target_charge_currency: input.chargeCurrency ?? null,
        target_exchange_rate: input.exchangeRate ?? null,
        target_rate_source: input.rateSource ?? null,
        target_is_test: input.isTest ?? false,
      });
      throwIfError(error);
      return String(data);
    },
    async listPreinvoices(projectId, includeTest = false) {
      const { data, error } = await getSupabaseClient().rpc("admin_list_preinvoices", {
        target_project_id: projectId,
        target_include_test: includeTest,
      });
      throwIfError(error);
      return ((data ?? []) as Array<Record<string, unknown>>).map((row): Preinvoice => ({
        id: String(row.id),
        number: Number(row.number),
        clientId: String(row.client_id),
        planCode: String(row.plan_code),
        basePrice: Number(row.base_price),
        baseCurrency: row.base_currency as Preinvoice["baseCurrency"],
        exchangeRate: Number(row.exchange_rate),
        exchangeRateSource: String(row.exchange_rate_source),
        chargeCurrency: row.charge_currency as Preinvoice["chargeCurrency"],
        chargeAmount: Number(row.charge_amount),
        status: row.status as Preinvoice["status"],
        isTest: Boolean(row.is_test),
        identitySnapshot: row.identity_snapshot as Preinvoice["identitySnapshot"],
        planSnapshot: row.plan_snapshot as Record<string, unknown>,
        issuedAt: String(row.issued_at),
        expiresAt: String(row.expires_at),
        paidPaymentId: row.paid_payment_id ? String(row.paid_payment_id) : null,
        createdBy: String(row.created_by),
        createdAt: String(row.created_at),
      }));
    },
    async previewPreinvoiceConfirmation(projectId, preinvoiceId, chargedAt) {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_preview_preinvoice_confirmation",
        {
          target_project_id: projectId,
          target_preinvoice_id: preinvoiceId,
          target_charged_at: chargedAt,
        },
      );
      throwIfError(error);
      const row = data as Record<string, unknown>;
      return {
        preinvoiceId: String(row.preinvoice_id),
        clientId: String(row.client_id),
        planName: String(row.plan_name),
        previousExpiresAt: row.previous_expires_at ? String(row.previous_expires_at) : null,
        newStartedAt: String(row.new_started_at),
        newExpiresAt: row.new_expires_at ? String(row.new_expires_at) : null,
        expectedAmount: Number(row.expected_amount),
        currency: row.currency as Currency,
        exchangeRate: Number(row.exchange_rate),
        exchangeRateSource: String(row.exchange_rate_source),
        expiresAt: String(row.expires_at),
        isTest: Boolean(row.is_test),
      };
    },
    async confirmPreinvoicePayment(input) {
      await requireOnline("Confirmar prefactura");
      const { data, error } = await getSupabaseClient().rpc("admin_confirm_preinvoice_payment", {
        target_project_id: input.projectId,
        target_preinvoice_id: input.preinvoiceId,
        target_received_amount: input.receivedAmount,
        target_currency: input.currency,
        target_method: input.method,
        target_reference: input.reference ?? null,
        target_charged_at: input.chargedAt,
        target_notes: input.notes ?? null,
        target_idempotency_key: input.idempotencyKey,
      });
      throwIfError(error);
      return mapBillingReceipt(data as Record<string, unknown>);
    },
    async setPreinvoiceStatus(projectId, preinvoiceId, status, paymentId) {
      await requireOnline("Actualizar prefactura");
      const { error } = await getSupabaseClient().rpc("admin_set_preinvoice_status", {
        target_project_id: projectId,
        target_preinvoice_id: preinvoiceId,
        target_status: status,
        target_payment_id: paymentId ?? null,
      });
      throwIfError(error);
    },
    async registerReferral(
      projectId,
      referrerUserId,
      referredUserId,
      referralCode,
      isTest = false,
    ) {
      await requireOnline("Registrar referido");
      const { data, error } = await getSupabaseClient().rpc(
        "admin_register_referral_relationship",
        {
          target_project_id: projectId,
          target_referrer_user_id: referrerUserId,
          target_referred_user_id: referredUserId,
          target_referral_code: referralCode ?? null,
          target_is_test: isTest,
        },
      );
      throwIfError(error);
      return String(data);
    },
    async createReferralReward(projectId, relationshipId, paymentId, isTest = false) {
      await requireOnline("Registrar recompensa por referido");
      const { data, error } = await getSupabaseClient().rpc("admin_create_referral_reward", {
        target_project_id: projectId,
        target_relationship_id: relationshipId,
        target_payment_id: paymentId,
        target_is_test: isTest,
      });
      throwIfError(error);
      return String(data);
    },
    async deleteTestData(projectId) {
      await requireOnline("Eliminar datos de prueba");
      const { data, error } = await getSupabaseClient().rpc("admin_delete_p0a_test_data", {
        target_project_id: projectId,
      });
      throwIfError(error);
      const row = data as Record<string, unknown>;
      return {
        preinvoices: Number(row.preinvoices),
        payments: Number(row.payments),
        receipts: Number(row.receipts),
        referralRewards: Number(row.referral_rewards),
        referralRelationships: Number(row.referral_relationships),
      };
    },
  },
  client360: {
    async get(projectId, clientId) {
      const [baseResponse, billingResponse, adoptionResponse] = await Promise.all([
        getSupabaseClient().rpc("admin_get_client_360", {
          target_project_id: projectId,
          target_client_id: clientId,
        }),
        getSupabaseClient().rpc("admin_get_client_360_billing_context", {
          target_project_id: projectId,
          target_client_id: clientId,
        }),
        getSupabaseClient().rpc("admin_get_client_adoption", {
          target_project_id: projectId,
          target_client_id: clientId,
        }),
      ]);

      throwIfError(baseResponse.error);
      throwIfError(billingResponse.error);
      throwIfError(adoptionResponse.error);

      if (!baseResponse.data) {
        throw new Error("No se encontró el cliente en este proyecto.");
      }

      const merged = {
        ...(baseResponse.data as Record<string, unknown>),
      };

      const billingContext =
        billingResponse.data as Record<string, unknown> | null;

      if (billingContext) {
        merged.last_payment = billingContext.last_payment ?? null;
        merged.billing = billingContext.billing ?? null;

        const existingActivity = (
          (merged.activity ?? []) as Array<Record<string, unknown>>
        ).filter(
          (row) =>
            !["preinvoice", "payment", "document"].includes(String(row.type)),
        );

        const billingActivity =
          (billingContext.activity ?? []) as Array<Record<string, unknown>>;

        merged.activity = [...existingActivity, ...billingActivity].sort(
          (left, right) =>
            new Date(String(right.occurred_at)).getTime() -
            new Date(String(left.occurred_at)).getTime(),
        );
      }

      merged.adoption = adoptionResponse.data ?? null;

      return mapClient360(merged);
    },
  },
  referrals: {
    async clientSummary(projectId, clientId) {
      const { data, error } = await getSupabaseClient().rpc("admin_get_client_referral_summary", {
        target_project_id: projectId,
        target_client_id: clientId,
      });
      throwIfError(error);
      const row = data as Record<string, unknown>;
      const referredBy = row.referred_by as Record<string, unknown> | null;
      return {
        code: String(row.code),
        link: row.link ? String(row.link) : null,
        canLinkReferrer: Boolean(row.can_link_referrer),
        referredBy: referredBy
          ? {
              relationshipId: String(referredBy.relationship_id),
              userId: String(referredBy.user_id),
              name: String(referredBy.name),
              code: referredBy.code ? String(referredBy.code) : null,
              createdAt: String(referredBy.created_at),
            }
          : null,
        referredCount: Number(row.referred_count),
        earnedRewards: Number(row.earned_rewards),
        appliedRewards: Number(row.applied_rewards),
        pendingDays: Number(row.pending_days),
        appliedDays: Number(row.applied_days),
      };
    },
    async linkReferrer(projectId, clientId, code) {
      await requireOnline("Vincular referidor");
      const { data, error } = await getSupabaseClient().rpc("admin_link_client_referrer_code", {
        target_project_id: projectId,
        target_client_id: clientId,
        target_code: code,
      });
      throwIfError(error);
      return String(data);
    },
    async overview(projectId) {
      const { data, error } = await getSupabaseClient().rpc("admin_get_referral_overview", {
        target_project_id: projectId,
      });
      throwIfError(error);
      const row = data as Record<string, unknown>;
      return {
        relationships: Number(row.relationships),
        converted: Number(row.converted),
        appliedRewards: Number(row.applied_rewards),
        deliveredDays: Number(row.delivered_days),
        rows: ((row.rows ?? []) as Array<Record<string, unknown>>).map((item) => ({
          relationshipId: String(item.relationship_id),
          referrerName: String(item.referrer_name),
          referredName: String(item.referred_name),
          code: item.code ? String(item.code) : null,
          status: item.status as "pending" | "earned" | "applied" | "reverted",
          days: item.days == null ? null : Number(item.days),
          createdAt: String(item.created_at),
        })),
      };
    },
  },
};
