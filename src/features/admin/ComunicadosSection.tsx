import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/admin/ModuleHeader";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProjectPermissions } from "@/hooks/useProjects";
import { supabaseServices, type MobileAnnouncementCategory } from "@/lib/services";

const GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.alejandrocruz.tuktukcontrol";

const CARD_CLASS = "border-border-default bg-surface-1 shadow-[var(--shadow-card)]";
const HEADER_CLASS = "px-4 py-2.5 sm:px-4 sm:py-2.5";
const CONTENT_CLASS = "p-3";
const CONTROL_CLASS =
  "border-border-strong bg-surface-2 shadow-[var(--shadow-xs)] hover:border-primary/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";

export default function ComunicadosSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canSend = permissions.includes("settings.manage");
  const [category, setCategory] = useState<MobileAnnouncementCategory>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [releaseVersion, setReleaseVersion] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  const audienceQuery = useQuery({
    queryKey: ["mobile-push-audience", projectId],
    queryFn: () => supabaseServices.communications.audience(projectId),
  });

  const isUpdate = category === "app_update";
  const titleValue = title.trim();
  const bodyValue = body.trim();
  const releaseVersionValue = releaseVersion.trim();
  const validationMessage = getValidationMessage({
    category,
    title: titleValue,
    body: bodyValue,
    releaseVersion: releaseVersionValue,
  });

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
        releaseVersion: isUpdate ? releaseVersionValue : undefined,
        actionUrl: isUpdate ? GOOGLE_PLAY_URL : undefined,
      });
    },
    onSuccess: async (result) => {
      setTitle("");
      setBody("");
      setReleaseVersion("");
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
      <ModuleHeader
        title="Comunicados"
        description="Envía avisos y actualizaciones de TukTuk Control a los dispositivos Android elegibles."
        icon={Megaphone}
        module="configuracion"
      />

      <SectionCard
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

      <SectionCard
        title="Nuevo comunicado"
        description="El envío se registra y el backend valida nuevamente el permiso de configuración."
        module="configuracion"
        className={CARD_CLASS}
        headerClassName={HEADER_CLASS}
        contentClassName={CONTENT_CLASS}
      >
        <div className="space-y-3">
          {!canSend ? (
            <PageAlert tone="info" title="Solo lectura">
              Puedes consultar la audiencia, pero necesitas el permiso de configuración para enviar
              comunicados.
            </PageAlert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mobile-announcement-category">Tipo de comunicado</Label>
              <Select
                value={category}
                onValueChange={(value) =>
                  setCategory(value === "app_update" ? "app_update" : "general")
                }
                disabled={!canSend || sendMutation.isPending}
              >
                <SelectTrigger id="mobile-announcement-category" className={CONTROL_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Comunicado general</SelectItem>
                  <SelectItem value="app_update">Nueva actualización</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isUpdate ? (
              <div className="space-y-1.5">
                <Label htmlFor="mobile-announcement-version">Versión</Label>
                <Input
                  id="mobile-announcement-version"
                  className={CONTROL_CLASS}
                  value={releaseVersion}
                  maxLength={40}
                  onChange={(event) => setReleaseVersion(event.target.value)}
                  placeholder="Ej. 1.2.0"
                  disabled={!canSend || sendMutation.isPending}
                />
              </div>
            ) : null}
          </div>

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
              placeholder={isUpdate ? "Nueva versión disponible" : "Título del comunicado"}
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

          {isUpdate ? (
            <PageAlert tone="info" title="Abrirá Google Play">
              Al tocar esta notificación, el cliente abrirá la página de TukTuk Control en Google
              Play.
            </PageAlert>
          ) : null}

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
              {isUpdate ? "Enviar actualización" : "Enviar comunicado"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isUpdate ? "¿Enviar actualización?" : "¿Enviar comunicado?"}
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
    <div className="rounded-[var(--radius-compact)] border border-border-default bg-surface-2 p-3">
      <div className="flex items-center gap-2 text-text-secondary">
        <Smartphone className="h-4 w-4 text-primary" />
        <p className="text-sm">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{value}</p>
    </div>
  );
}

function getValidationMessage({
  category,
  title,
  body,
  releaseVersion,
}: {
  category: MobileAnnouncementCategory;
  title: string;
  body: string;
  releaseVersion: string;
}) {
  if (!title) return "El título es obligatorio.";
  if (title.length > 100) return "El título no puede superar 100 caracteres.";
  if (!body) return "El mensaje es obligatorio.";
  if (body.length > 500) return "El mensaje no puede superar 500 caracteres.";
  if (category === "app_update" && !releaseVersion)
    return "La versión es obligatoria para una actualización.";
  if (releaseVersion.length > 40) return "La versión no puede superar 40 caracteres.";
  return null;
}
