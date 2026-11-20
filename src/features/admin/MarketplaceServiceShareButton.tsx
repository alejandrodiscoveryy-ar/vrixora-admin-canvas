import { useState } from "react";
import { Copy, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { buildServiceShareMessage, cleanServiceShareComment, type ServiceSharePayload } from "@/lib/marketplace-service-share";

async function loadPayload(projectId: string, jobId: string): Promise<ServiceSharePayload> {
  const { data, error } = await getSupabaseClient().rpc("admin_get_marketplace_job_whatsapp_payload", {
    target_project_id: projectId, target_job_id: jobId,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || !("serviceCode" in data)) throw new Error("JOB_NOT_SHAREABLE");
  return data as unknown as ServiceSharePayload;
}

export default function MarketplaceServiceShareButton({ projectId, jobId, compact = false }: {
  projectId: string; jobId: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<ServiceSharePayload | null>(null);
  const [comment, setComment] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [failure, setFailure] = useState("");
  const preview = payload ? buildServiceShareMessage(payload, comment) : "";
  const freight = payload?.serviceCode === "courier" || payload?.serviceCode === "cargo";
  const reset = () => { setPayload(null); setComment(""); setReviewed(false); setFailure(""); };
  const errorText = (error: unknown) => error instanceof Error && error.message.includes("JOB_NOT_SHAREABLE")
    ? "La carrera ya no está disponible para el grupo: puede haber vencido, sido asignada, ser de prueba o tener prioridad Impulsa."
    : "No se pudo comprobar la disponibilidad del servicio. Actualiza e inténtalo de nuevo.";
  const prepare = async () => {
    reset(); setOpen(true); setBusy(true);
    try {
      const fresh = await loadPayload(projectId, jobId);
      setPayload(fresh); setComment(cleanServiceShareComment(fresh.comment ?? ""));
    } catch (error) { setFailure(errorText(error)); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (!payload || !reviewed || busy) return;
    setBusy(true); setFailure("");
    try {
      const fresh = await loadPayload(projectId, jobId);
      if (JSON.stringify(fresh) !== JSON.stringify(payload)) {
        setPayload(fresh); setComment(cleanServiceShareComment(fresh.comment ?? "")); setReviewed(false);
        setFailure("El servicio cambió. Revisa el mensaje actualizado antes de copiar.");
        return;
      }
      try {
        await navigator.clipboard.writeText(preview);
        toast.success("Mensaje copiado. Pégalo en el grupo de conductores.");
        setOpen(false); reset();
      } catch {
        setFailure("El navegador no permitió copiar automáticamente. Selecciona el texto de la vista previa y cópialo manualmente.");
      }
    } catch (error) {
      setPayload(null); setReviewed(false); setFailure(errorText(error));
    } finally { setBusy(false); }
  };
  const share = async () => {
    if (!payload || !reviewed || busy) return;
    if (typeof navigator.share !== "function") {
      setFailure("Este dispositivo no admite compartir directamente. Usa «Copiar mensaje».");
      return;
    }
    setBusy(true); setFailure("");
    try {
      // Revalidar antes de invocar el menú del sistema; un trabajo asignado,
      // vencido o con prioridad protegida nunca debe compartirse desde Admin.
      const fresh = await loadPayload(projectId, jobId);
      if (JSON.stringify(fresh) !== JSON.stringify(payload)) {
        setPayload(fresh); setComment(cleanServiceShareComment(fresh.comment ?? "")); setReviewed(false);
        setFailure("El servicio cambió. Revisa el mensaje actualizado antes de compartir.");
        return;
      }
      // Android abre el selector nativo; el operador elige WhatsApp y el grupo.
      // En navegadores que pierden la activación tras la comprobación, queda «Copiar».
      await navigator.share({ title: "Carrera disponible · Agencia TukTuk", text: preview });
      setOpen(false); reset();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof Error && error.message.includes("JOB_NOT_SHAREABLE")) {
        setPayload(null); setReviewed(false); setFailure(errorText(error));
      } else {
        setFailure("No se pudo abrir el menú para compartir. Usa «Copiar mensaje».");
      }
    } finally { setBusy(false); }
  };
  return <>
    <Button type="button" size="sm" variant="outline"
      className={compact ? "h-auto min-h-11 flex-1 basis-[8rem] whitespace-normal border-emerald-500/30 text-emerald-400 text-[10px]" : "w-full min-h-11 border-emerald-500/30 text-emerald-500"}
      onClick={() => void prepare()} disabled={busy}>
      <Copy className="mr-1.5 h-4 w-4 shrink-0" /> Copiar para WhatsApp
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); if (!value) reset(); } }}>
      <DialogContent overlayClassName="z-[110]" className="z-[120] max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compartir servicio con conductores</DialogTitle>
          <DialogDescription>Revisa el mensaje antes de copiar. No compartas nombres, teléfonos ni detalles personales del cliente.</DialogDescription>
        </DialogHeader>
        {busy ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Comprobando disponibilidad…</p> : null}
        {failure ? <p role="alert" className="text-sm text-amber-500">{failure}</p> : null}
        {payload ? <>
          {freight && payload.comment ? <label className="grid gap-1 text-sm font-medium">
            Comentario del cliente (puedes quitar datos privados)
            <Textarea value={comment} onChange={(event) => { setComment(event.target.value); setReviewed(false); }} disabled={busy} rows={3} />
          </label> : null}
          <Textarea aria-label="Vista previa del mensaje" value={preview} readOnly rows={12} className="text-sm" />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.target.checked)} />
            He revisado el mensaje y no contiene información privada innecesaria.
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" className="min-h-11 w-full" disabled={busy || !reviewed} onClick={() => void copy()}>
              <Copy className="mr-2 h-4 w-4" /> Copiar mensaje
            </Button>
            {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
              <Button type="button" variant="outline" className="min-h-11 w-full" disabled={busy || !reviewed} onClick={() => void share()}>
                <Share2 className="mr-2 h-4 w-4" /> Compartir por WhatsApp
              </Button>
            ) : null}
          </div>
        </> : null}
      </DialogContent>
    </Dialog>
  </>;
}
