import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";

export default function MarketplaceRecoverServiceButton({ projectId, jobId, onRecovered }: { projectId: string; jobId: string; onRecovered?: (id: string) => void }) {
  const cache = useQueryClient();
  const recovery = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("admin_recover_marketplace_customer_job", {
        target_project_id: projectId, target_job_id: jobId,
      });
      if (error) throw new Error(error.message);
      const result = data as unknown as { job_id?: string; repeated?: boolean };
      if (!result?.job_id) throw new Error("RECOVERY_RESULT_MISSING");
      return result;
    },
    onSuccess: async (result) => {
      toast.success(result.repeated ? "Ya existe un intento de reemplazo" : "Buscando otro conductor");
      await cache.invalidateQueries();
      if (result.job_id) onRecovered?.(result.job_id);
    },
    onError: (error: Error) => toast.error(error.message.includes("MARKETPLACE_RECOVERY_NOT_AVAILABLE") ? "El servicio ya no admite reemplazo." : "No se pudo buscar otro conductor."),
  });
  return <Button type="button" variant="outline" size="sm" className="w-full min-h-11 border-emerald-500/30 text-emerald-300" disabled={recovery.isPending} onClick={() => {
    if (window.confirm("¿El cliente confirmó que todavía necesita este servicio? Se buscará otro conductor con el mismo precio, sin borrar el historial.")) recovery.mutate();
  }}><RefreshCw className={`mr-2 h-4 w-4 ${recovery.isPending ? "animate-spin" : ""}`} />{recovery.isPending ? "Buscando…" : "Buscar otro conductor"}</Button>;
}
