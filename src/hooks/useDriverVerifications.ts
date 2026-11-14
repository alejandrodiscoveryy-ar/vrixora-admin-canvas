import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabase";

export type DriverVerification = { driver_user_id: string; verified: boolean; verified_at: string | null };

// One bounded query for a page of drivers, rather than one RPC per row.
export function useDriverVerifications(projectId: string, driverIds: string[], enabled = true) {
  const ids = [...new Set(driverIds)].sort();
  return useQuery({
    queryKey: ["marketplace-driver-verifications", projectId, ids],
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
      const results = await Promise.all(chunks.map(async (chunk) => {
        const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_driver_verifications_v1", {
          target_project_id: projectId, target_driver_user_ids: chunk,
        });
        if (error) throw error;
        return (data ?? []) as DriverVerification[];
      }));
      return Object.fromEntries(results.flat().map((item) => [item.driver_user_id, item])) as Record<string, DriverVerification>;
    },
    enabled: enabled && ids.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
