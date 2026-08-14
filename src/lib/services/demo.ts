import {
  CLIENTS,
  DEMO_USERS,
  EMPLOYEES,
  HISTORY,
  LICENSES,
  PAYMENTS,
  PROJECTS,
  visibleProjects,
} from "@/lib/mock-data";
import type { AdminServices } from "./types";

export const demoServices: AdminServices = {
  provider: "demo",
  projects: {
    async list(userId) {
      if (!userId) return PROJECTS;
      const user = DEMO_USERS.find((candidate) => candidate.id === userId);
      return user ? visibleProjects(user) : [];
    },
    async settings() {
      return {
        notifyLicenseExpiry: true,
        autoRenewVerifiedPayments: false,
        logoUrl: "",
        iconUrl: "",
        primaryColor: "#06b6d4",
        secondaryColor: "#0f172a",
        whatsapp: "",
        supportEmail: "",
        websiteUrl: "",
        privacyUrl: "",
        termsUrl: "",
        currency: "CUP" as const,
        trialDays: 30,
        paymentMethods: ["cash" as const],
        minimumVersion: "",
        maintenanceMode: false,
        forceUpdate: false,
        welcomeMessage: "",
      };
    },
    async uploadBrandAsset() {
      throw new Error("Esta operaciÃ³n requiere Supabase");
    },
    async update() {
      throw new Error("Esta operación requiere Supabase");
    },
    async whatsappSettings() {
      throw new Error("Esta configuración requiere Supabase");
    },
    async updateWhatsAppSettings() {
      throw new Error("Esta configuración requiere Supabase");
    },
  },
  projectMembers: {
    async list(projectId) {
      return EMPLOYEES.filter((employee) => employee.projectIds.includes(projectId));
    },
    async permissions() {
      return [
        "project.view",
        "customers.view",
        "licenses.view",
        "plans.view",
        "payments.view",
        "members.view",
        "analytics.view",
        "settings.view",
        "audit.view",
      ];
    },
    async add() {
      throw new Error("Esta operación requiere Supabase");
    },
    async remove() {
      throw new Error("Esta operación requiere Supabase");
    },
  },
  licenses: {
    async listClients(projectId) {
      return LICENSES.filter((license) => license.projectId === projectId).map((license) => ({
        userId: license.clientId,
        email: CLIENTS.find((client) => client.id === license.clientId)?.email ?? "",
        displayName: CLIENTS.find((client) => client.id === license.clientId)?.name ?? "",
        phone: null,
        avatarUrl: null,
        registeredAt: license.activatedAt,
        licenseId: license.id,
        licenseKey: license.key,
        plan: "standard",
        status: license.status,
        activatedAt: license.activatedAt,
        expiresAt: license.expiresAt,
        maxDevices: 1,
        activeDevices: 0,
        lastPaymentAt: null,
        lastPaymentAmount: null,
        lastPaymentCurrency: null,
        lastRenewedAt: null,
      }));
    },
    async setClientStatus() {
      throw new Error("Esta operación requiere Supabase");
    },
    async list(projectId) {
      return LICENSES.filter((license) => license.projectId === projectId).map((license) => ({
        id: license.id,
        projectId: license.projectId,
        userId: license.clientId,
        key: license.key,
        licenseType: "annual",
        plan: "standard",
        status: license.status,
        durationDays: 365,
        maxDevices: 1,
        features: {},
        notes: null,
        activatedAt: license.activatedAt,
        expiresAt: license.expiresAt,
        lastValidation: null,
        revokedAt: null,
        createdAt: license.activatedAt,
        userEmail: "",
        activeDevices: 0,
      }));
    },
    async listTypes() {
      return [
        {
          code: "annual",
          name: "Anual",
          defaultDurationDays: 365,
          allowsCustomDuration: false,
          neverExpires: false,
          defaultMaxDevices: 1,
          defaultFeatures: {},
        },
      ];
    },
    async listPlans(projectId) {
      return [
        {
          projectId,
          code: "standard",
          name: "Estándar",
          licenseType: "annual",
          durationDays: 365,
          price: 0,
          currency: "CUP",
          maxDevices: 1,
          features: {},
          description: null,
          isActive: true,
          isFeatured: false,
        },
      ];
    },
    async renew(licenseId, durationDays = 365) {
      const license = LICENSES.find((candidate) => candidate.id === licenseId);
      if (!license) throw new Error("License not found");
      const expiresAt = new Date(license.expiresAt);
      expiresAt.setDate(expiresAt.getDate() + durationDays);
      return {
        id: license.id,
        projectId: license.projectId,
        userId: license.clientId,
        key: license.key,
        licenseType: "annual",
        plan: "standard",
        status: "active",
        durationDays,
        maxDevices: 1,
        features: {},
        notes: null,
        activatedAt: license.activatedAt,
        expiresAt: expiresAt.toISOString(),
        lastValidation: null,
        revokedAt: null,
        createdAt: license.activatedAt,
        userEmail: "",
        activeDevices: 0,
      };
    },
    async validate(projectId, licenseKey) {
      const license = LICENSES.find(
        (candidate) => candidate.projectId === projectId && candidate.key === licenseKey,
      );
      return license
        ? {
            valid: license.status === "active" && new Date(license.expiresAt) > new Date(),
            reason: license.status,
            licenseId: license.id,
            licenseType: "annual",
            plan: "standard",
            expiresAt: license.expiresAt,
            maxDevices: 1,
            features: {},
          }
        : { valid: false, reason: "license_not_found" };
    },
    async create() {
      throw new Error("Esta operación requiere Supabase");
    },
    async update() {
      throw new Error("Esta operación requiere Supabase");
    },
    async listDevices() {
      return [];
    },
    async listHistory() {
      return [];
    },
    async manageDevice() {
      throw new Error("Esta operación requiere Supabase");
    },
    async resetDevices() {
      return 0;
    },
    async listAdminPlans(projectId) {
      return this.listPlans(projectId);
    },
    async savePlan(_projectId, plan) {
      return plan;
    },
    async deleteInactivePlan() {
      throw new Error("Esta operación requiere Supabase");
    },
    async assignWithPayment() {
      throw new Error("Esta operación requiere Supabase");
    },
    async renewWithPayment() {
      throw new Error("Esta operación requiere Supabase");
    },
  },
  payments: {
    async list(projectId) {
      return PAYMENTS.filter((payment) => payment.projectId === projectId).map((payment) => ({
        id: payment.id,
        projectId: payment.projectId,
        userId: payment.clientId,
        licenseId: payment.licenseId,
        amount: payment.amount,
        listPrice: payment.amount,
        discount: 0,
        plan: "standard",
        currency: payment.currency,
        method: payment.method,
        reference: payment.reference,
        employeeId: payment.employeeId,
        createdAt: payment.createdAt,
        status: "paid",
        notes: null,
      }));
    },
    async listAdmin(projectId) {
      return this.list(projectId);
    },
    async record() {
      throw new Error("Esta operación requiere Supabase");
    },
    async update() {
      throw new Error("Esta operación requiere Supabase");
    },
    async remove() {
      throw new Error("Esta operación requiere Supabase");
    },
    async void() {
      throw new Error("Esta operación requiere Supabase");
    },
    async previewCharge() {
      throw new Error("Esta operación requiere Supabase");
    },
    async chargeAndAssign() {
      throw new Error("Esta operación requiere Supabase");
    },
    async receipt() {
      throw new Error("Esta operación requiere Supabase");
    },
    async repairReceipt() {
      throw new Error("Esta operación requiere Supabase");
    },
    async updateStatus() {
      throw new Error("Esta operación requiere Supabase");
    },
  },
  licenseAuditLog: {
    async list(projectId) {
      return HISTORY.filter((entry) => entry.projectId === projectId);
    },
  },
  audit: {
    async list() {
      return [];
    },
  },
  usageAnalytics: {
    async series() {
      return [];
    },
    async dimensions() {
      return { sources: [], campaigns: [], versions: [] };
    },
    async retention() {
      return {
        cohortCount: 0,
        eligible7: 0,
        eligible30: 0,
        retained7: 0,
        retained30: 0,
        retention7Rate: 0,
        retention30Rate: 0,
        trialUsers: 0,
        paidUsers: 0,
        trialToPaidRate: 0,
      };
    },
  },
  commercial: {
    async listLeads() {
      return [];
    },
    async saveLead() {
      throw new Error("Esta operación requiere Supabase");
    },
    async addNote() {
      throw new Error("Esta operación requiere Supabase");
    },
    async listLeadHistory() {
      return [];
    },
    async listCampaigns() {
      return [];
    },
    async saveCampaign() {
      throw new Error("Esta operación requiere Supabase");
    },
    async metrics() {
      return {
        totalLeads: 0,
        registered: 0,
        trials: 0,
        paid: 0,
        notConverted: 0,
        conversionRate: 0,
        topSource: "",
        topCampaign: "",
      };
    },
  },
  foundations: {
    async settings(projectId) {
      return {
        projectId,
        baseCurrency: "CUP",
        chargeCurrency: "CUP",
        rateMode: "manual",
        currentRate: 1,
        rateSource: "manual",
        rateUpdatedAt: new Date(0).toISOString(),
        testModeEnabled: false,
        referralRewardDays: 15,
      };
    },
    async exchangeRateHistory() {
      return [];
    },
    async listPreinvoices() {
      return [];
    },
    async updateExchangeSettings() {
      throw new Error("Esta operaciÃ³n requiere Supabase");
    },
    async setTestMode() {
      throw new Error("Esta operaciÃ³n requiere Supabase");
    },
    async setReferralRewardDays() {
      throw new Error("Esta operaciÃ³n requiere Supabase");
    },
    async createPreinvoice() {
      throw new Error("Esta operaciÃ³n requiere Supabase");
    },
    async previewPreinvoiceConfirmation() {
      throw new Error("Esta operaciÃƒÂ³n requiere Supabase");
    },
    async confirmPreinvoicePayment() {
      throw new Error("Esta operaciÃƒÂ³n requiere Supabase");
    },
    async setPreinvoiceStatus() {
      throw new Error("Esta operaciÃ³n requiere Supabase");
    },
    async registerReferral() {
      throw new Error("Esta operaciÃ³n requiere Supabase");
    },
    async createReferralReward() {
      throw new Error("Esta operaciÃ³n requiere Supabase");
    },
    async deleteTestData() {
      throw new Error("Esta operaciÃ³n requiere Supabase");
    },
  },
  client360: {
    async get(projectId, clientId) {
      const client = CLIENTS.find((candidate) => candidate.id === clientId);
      const license = LICENSES.find(
        (candidate) => candidate.projectId === projectId && candidate.clientId === clientId,
      );
      if (!client || !license) throw new Error("No se encontró el cliente en este proyecto.");
      return {
        permissions: { licenses: true, payments: true, commercial: true, audit: true },
        client: {
          id: client.id,
          email: client.email,
          displayName: client.name,
          phone: null,
          avatarUrl: null,
          registeredAt: license.activatedAt,
        },
        license: {
          id: license.id,
          licenseKey: license.key,
          licenseType: "trial",
          planCode: "trial",
          planName: "Trial",
          status: license.status,
          activatedAt: license.activatedAt,
          expiresAt: license.expiresAt,
          lastRenewedAt: null,
          maxDevices: 1,
          activeDevices: 0,
          devices: [],
        },
        lastPayment: null,
        commercial: null,
        billing: { preinvoices: [], payments: [], receipts: [] },
        referrals: { rewardDays: 15, referredBy: null, referredClients: [] },
        activity: [
          {
            id: `registration:${client.id}`,
            type: "registration" as const,
            title: "Cliente registrado",
            description: "Se creó la cuenta del cliente",
            occurredAt: license.activatedAt,
          },
        ],
      };
    },
  },
  referrals: {
    async clientSummary() {
      return {
        code: "DEMO-0000000",
        link: null,
        canLinkReferrer: true,
        referredBy: null,
        referredCount: 0,
        earnedRewards: 0,
        appliedRewards: 0,
        pendingDays: 0,
        appliedDays: 0,
      };
    },
    async linkReferrer() {
      throw new Error("Esta operación requiere Supabase");
    },
    async overview() {
      return { relationships: 0, converted: 0, appliedRewards: 0, deliveredDays: 0, rows: [] };
    },
  },
};
