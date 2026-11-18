import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabase";

// Only administrators with marketplace.manage can see pending applications.
export function usePendingDriverVerifications(projectId: string, driverIds: string[], enabled = true) {
  const ids = [...new Set(driverIds)].sort();
  return useQuery({
    queryKey: ["marketplace-pending-driver-verifications", projectId, ids],
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
      const results = await Promise.all(chunks.map(async (chunk) => {
        const { data, error } = await getSupabaseClient().rpc(
          "admin_list_marketplace_pending_impulsa_verifications_v1",
          { target_project_id: projectId, target_driver_user_ids: chunk },
        );
        if (error) throw error;
        return (data ?? []) as Array<{ driver_user_id: string }>;
      }));
      return new Set(results.flat().map((item) => item.driver_user_id));
    },
    enabled: enabled && ids.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
