import { getSupabaseClient } from "@/lib/supabase";
import { requireOnline } from "@/lib/pwa";

export function normalizeClientPhone(value: string) {
  return value.trim().replace(/[\s().-]/g, "") || null;
}

export function isValidClientPhone(value: string) {
  const normalized = normalizeClientPhone(value);
  return normalized === null || /^\+[1-9][0-9]{7,14}$/.test(normalized);
}

export async function updateClientContact(projectId: string, clientId: string, phone: string) {
  await requireOnline("actualizar el contacto del cliente");

  const normalized = normalizeClientPhone(phone);
  const { data, error } = await getSupabaseClient().rpc("admin_update_client_contact", {
    target_project_id: projectId,
    target_client_id: clientId,
    target_phone: normalized,
  });

  if (error) {
    if (error.message.includes("INVALID_CLIENT_PHONE")) {
      throw new Error(
        "Introduce un móvil válido en formato internacional, por ejemplo +5351234567.",
      );
    }

    throw new Error(error.message);
  }

  const result = data as { phone?: string | null } | null;
  return result?.phone ?? normalized;
}
