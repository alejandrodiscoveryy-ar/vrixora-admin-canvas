import { useState } from "react";
import { ExternalLink, MessageCircle, MonitorSmartphone, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
type WhatsAppLinks = { desktop: string; web: string };

/** El usuario elige cómo abrir WhatsApp. Ninguna opción envía el mensaje. */
export default function ImpulsaWhatsAppOpenChooser({
  links,
  driverName,
  inviteToGroup,
}: {
  links: WhatsAppLinks;
  driverName: string;
  inviteToGroup: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button"
          aria-label={inviteToGroup
            ? "Invitar a " + driverName + " al grupo de Impulsa por WhatsApp"
            : "Abrir WhatsApp de " + driverName}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/[0.06] px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">
          <MessageCircle aria-hidden="true" className="size-4" />
          {inviteToGroup ? "Invitar al grupo" : "WhatsApp"}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿Cómo quieres abrir WhatsApp?</DialogTitle>
          <DialogDescription>
            {inviteToGroup
              ? "Se preparará para " + driverName + " la invitación al grupo de Impulsa, con el enlace incluido."
              : "Se abrirá el chat de " + driverName + "."}
            {" "}El mensaje no se enviará hasta que tú lo confirmes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <a href={links.desktop} onClick={() => setOpen(false)}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] px-3 py-4 text-center text-sm font-semibold text-foreground hover:bg-emerald-400/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">
            <Smartphone className="size-6 text-emerald-300" aria-hidden="true"/>
            Abrir aplicación
          </a>
          <a href={links.web} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/[0.07] px-3 py-4 text-center text-sm font-semibold text-foreground hover:bg-cyan-400/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
            <MonitorSmartphone className="size-6 text-cyan-300" aria-hidden="true"/>
            Abrir WhatsApp Web
            <ExternalLink className="size-3 text-text-secondary" aria-hidden="true"/>
          </a>
        </div>
        <p className="text-xs text-text-secondary">La opción Aplicación necesita tener WhatsApp instalado. Si no se abre, utiliza WhatsApp Web.</p>
      </DialogContent>
    </Dialog>
  );
}
