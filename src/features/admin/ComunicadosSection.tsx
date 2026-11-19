import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { premiumSurface, premiumHeaderSurface, premiumControlSurface } from "@/components/admin/density";
import { PageAlert } from "@/components/admin/PageAlert";
import { SectionCard } from "@/components/admin/SectionCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProjectPermissions } from "@/hooks/useProjects";
import { supabaseServices, type MobileAnnouncementCategory } from "@/lib/services";

const CARD_CLASS = premiumSurface;
const HEADER_CLASS = `px-3 py-3 sm:px-4 ${premiumHeaderSurface}`;
const CONTENT_CLASS = "p-3";
const CONTROL_CLASS =
  `min-h-11 rounded-[var(--radius-control)] border-border-default bg-surface-2 shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 ${premiumControlSurface}`;

export default function ComunicadosSection({ projectId, premium = false }: { projectId: string; premium?: boolean }) {
  const queryClient = useQueryClient();
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canSend = permissions.includes("settings.manage");
  const category: MobileAnnouncementCategory = "general";
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  const audienceQuery = useQuery({
    queryKey: ["mobile-push-audience", projectId],
    queryFn: () => supabaseServices.communications.audience(projectId),
  });

  const titleValue = title.trim();
  const bodyValue = body.trim();
  const validationMessage = getValidationMessage({ title: titleValue, body: bodyValue });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!canSend) {
        throw new Error("No tienes permiso para enviar comunicados.");
      }

      if (validationMessage) {
        throw new Error(validationMessage);
      }

      return supabaseServices.communications.send(projectId, {
        category,
        title: titleValue,
        body: bodyValue,
      });
    },
    onSuccess: async (result) => {
      setTitle("");
      setBody("");
      setConfirmationOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["mobile-push-audience", projectId] });
      toast.success(
        result.queuedUsers === 1
          ? "Comunicado enviado a 1 usuario elegible."
          : `Comunicado enviado a ${result.queuedUsers} usuarios elegibles.`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar el comunicado.");
    },
  });

  return (
    <div className="space-y-3">
      {!premium ? (
        <ModuleHeader density="compact" appearance="premium"
          title="Comunicados"
          description="Envía comunicados generales a los dispositivos Android elegibles. Las actualizaciones se gestionan desde Aplicación y versiones."
          icon={Megaphone}
          module="configuracion"
        />
      ) : null}

      <SectionCard density="compact" appearance="premium"
        title="Audiencia de notificaciones"
        description="Se incluyen clientes con licencia activa y al menos un dispositivo Android con notificaciones habilitadas."
        module="configuracion"
        className={CARD_CLASS}
        headerClassName={HEADER_CLASS}
        contentClassName={CONTENT_CLASS}
      >
        
        {audienceQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : audienceQuery.isError || !audienceQuery.data ? (
          <PageAlert tone="error" title="No se pudo cargar la audiencia">
            {audienceQuery.error instanceof Error
              ? audienceQuery.error.message
              : "Intenta actualizar la sección nuevamente."}
          </PageAlert>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <AudienceMetric
              label="Usuarios Android elegibles"
              value={audienceQuery.data.eligibleAndroidUsers}
            />
            <AudienceMetric
              label="Dispositivos con notificaciones activas"
              value={audienceQuery.data.enabledAndroidTokens}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard density="compact" appearance="premium"
        title="Nuevo comunicado"
        description={premium ? undefined : "El envío se registra y el backend valida nuevamente el permiso de configuración."}
        module="configuracion"
        className={CARD_CLASS}
        headerClassName={HEADER_CLASS}
        contentClassName={CONTENT_CLASS}
      >
        
        <div className="min-w-0 space-y-3">
          {!canSend ? (
            <PageAlert tone="info" title="Solo lectura">
              Puedes consultar la audiencia, pero necesitas el permiso de configuración para enviar
              comunicados.
            </PageAlert>
          ) : null}

          <p className="text-xs text-text-secondary">
            Para anunciar una nueva versión Android, utiliza Configuración → Aplicación y versiones.
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="mobile-announcement-title">Título</Label>
              <span className="text-xs text-text-tertiary">{title.length}/100</span>
            </div>
            <Input
              id="mobile-announcement-title"
              className={CONTROL_CLASS}
              value={title}
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Título del comunicado"
              disabled={!canSend || sendMutation.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="mobile-announcement-body">Mensaje</Label>
              <span className="text-xs text-text-tertiary">{body.length}/500</span>
            </div>
            <Textarea
              id="mobile-announcement-body"
              className={`min-h-28 ${CONTROL_CLASS}`}
              value={body}
              maxLength={500}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Escribe el mensaje que recibirán los clientes."
              disabled={!canSend || sendMutation.isPending}
            />
          </div>

          {validationMessage && canSend ? (
            <PageAlert tone="warning">{validationMessage}</PageAlert>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => setConfirmationOpen(true)}
              disabled={!canSend || Boolean(validationMessage) || sendMutation.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              Enviar comunicado
            </Button>
          </div>
        </div>
      </SectionCard>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Enviar comunicado?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {audienceQuery.data
                ? `Se enviará a ${audienceQuery.data.eligibleAndroidUsers} usuario(s) Android elegible(s).`
                : "Se enviará a los usuarios Android elegibles."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar envío
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AudienceMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="relative isolate min-w-0 overflow-hidden rounded-[var(--radius-compact)] border border-border-default bg-surface-2/80 p-3 shadow-[var(--shadow-xs)]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-[var(--module-accent)] opacity-70" />
      <Smartphone aria-hidden="true" className="pointer-events-none absolute bottom-1 right-2 size-14 text-[var(--module-accent)] opacity-[0.055]" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-text-secondary">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--module-border)] bg-[var(--module-surface)] text-[var(--module-accent)]" aria-hidden="true">
            <Smartphone className="size-4" />
          </span>
          <p className="text-xs font-medium">{label}</p>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-text-primary">{value}</p>
      </div>
    </div>
  );
}

function getValidationMessage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  if (!title) return "El título es obligatorio.";
  if (title.length > 100) return "El título no puede superar 100 caracteres.";
  if (!body) return "El mensaje es obligatorio.";
  if (body.length > 500) return "El mensaje no puede superar 500 caracteres.";
  return null;
}
