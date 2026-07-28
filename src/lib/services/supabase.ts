import type {
  Employee,
  HistoryEntry,
  Project,
} from "@/lib/mock-data";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  AdminServices,
  Currency,
  ServiceLicense,
  ServicePayment,
} from "./types";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
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

      const profilesById = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile]),
      );

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
      const { data, error } = await getSupabaseClient()
        .from("licenses")
        .select("id,project_id,user_id,license_key,status,activated_at,expires_at")
        .eq("project_id", projectId)
        .order("expires_at", { ascending: true });
      throwIfError(error);

      return (data ?? []).map(
        (license): ServiceLicense => ({
          id: license.id,
          projectId: license.project_id,
          userId: license.user_id,
          key: license.license_key,
          status: license.status,
          activatedAt: license.activated_at,
          expiresAt: license.expires_at,
        }),
      );
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
