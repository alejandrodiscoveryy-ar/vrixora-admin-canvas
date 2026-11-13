import { useState } from "react";
import { UserRound, Share2, QrCode, MapPin, Users } from "lucide-react";

const modalityLabels: Record<string, string> = {
  motorcycle: "Moto", bicitaxi: "Bicitaxi", tricycle: "Triciclo",
  light_car: "Auto", van: "Furgoneta", truck: "Camión", other: "Otro",
};

export default function MarketplaceDriverPromotionPreview({
  displayName, avatarUrl, categoryCode, active,
}: {
  displayName: string;
  avatarUrl: string | null | undefined;
  categoryCode: string | null | undefined;
  active: boolean;
}) {
  const [format, setFormat] = useState<"square" | "story">("square");
  const modality = categoryCode ? modalityLabels[categoryCode] ?? "Transporte" : "Transporte";
  const portrait = avatarUrl?.startsWith("https://") ? avatarUrl : null;
  return (
    <section aria-label="Mi TukTuk, vista previa interna" className="min-w-0 space-y-3 rounded-2xl border border-border/60 bg-card/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Mi TukTuk</h3>
          <p className="text-xs text-muted-foreground">Promoción personal · Vista previa privada</p>
        </div>
        <div role="group" aria-label="Formato de tarjeta" className="flex gap-1 rounded-lg border border-border/60 p-1">
          {(["square", "story"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={format === item}
              onClick={() => setFormat(item)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${format === item ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
              {item === "square" ? "Cuadrado" : "Historia"}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[360px]">
        <div className={`relative isolate flex w-full flex-col items-center justify-evenly gap-2 overflow-hidden rounded-2xl border border-orange-400/30 bg-slate-950 p-3 text-white shadow-xl ${format === "square" ? "aspect-square" : "aspect-[9/16]"}`}>
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl"/>
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl"/>
          <div className="relative flex w-full items-center justify-between gap-2">
            <span className="text-2xl font-black tracking-tight text-orange-400">TukTuk</span>
            <span className="text-xs text-slate-300">Mi TukTuk</span>
          </div>
          <div className="relative flex w-full flex-col items-center gap-1.5">
            <div className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-orange-400/70 bg-slate-800 ${format === "square" ? "h-16 w-16" : "h-28 w-28"}`}>
              <UserRound className="h-9 w-9 text-slate-400" aria-hidden="true"/>
              {portrait ? <img src={portrait} alt={`Foto de ${displayName}`} referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.style.display = "none"; }}/> : null}
            </div>
            <p className="max-w-full break-words text-center text-xl font-bold leading-tight">{displayName}</p>
            <p className="text-sm font-medium text-orange-200">{modality}</p>
          </div>
          <div className="relative space-y-1 text-center">
            <p className="text-sm font-semibold">¡Viaja conmigo!</p>
            <p className="text-xs text-slate-300">Tu conductor de confianza. Toda una flota a tu disposición.</p>
          </div>
          {/* The QR belongs inside the shareable artwork, not outside in Admin.
              Until a consented public link exists, do not render a fake scannable code. */}
          <div data-promotion-qr-area="embedded" className={`relative flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/5 p-2 ${format === "story" ? "flex-col text-center" : ""}`}>
            <div role="img" aria-label="Espacio reservado para el QR personal, aún no activo" className={`flex aspect-square shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-white p-2 text-slate-700 ${format === "story" ? "w-32" : "w-24"}`}>
              <QrCode className="h-9 w-9 text-slate-400" aria-hidden="true"/>
              <span className="text-center text-[9px] font-semibold leading-tight">QR PENDIENTE</span>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-bold">Escanea y viaja conmigo</p>
              <p className="text-[10px] leading-snug text-slate-300">Si no estoy disponible, TukTuk busca otro conductor para ti.</p>
              <p className="text-[10px] text-orange-200">QR y enlace personal pendientes de activación</p>
            </div>
          </div>
          <span className="relative text-[10px] font-medium uppercase tracking-wider text-slate-400">Borrador · No publicar</span>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <section className="min-w-0 space-y-2 rounded-xl border border-border/60 bg-background/50 p-3" aria-label="Vista previa del mensaje para compartir">
          <h4 className="text-sm font-semibold">Mensaje para compartir</h4>
          <p className="text-xs text-muted-foreground">La imagen llevará el QR; este texto acompañará la publicación con el enlace clicable.</p>
          <div className="space-y-2 rounded-lg bg-muted/30 p-3 text-sm">
            <p>¡Viaja conmigo! Soy {displayName}, conductor de TukTuk.</p>
            <p>Solicita tu transporte desde mi enlace personal. Si no estoy disponible, otro conductor de nuestra flota podrá atenderte.</p>
            <p className="font-medium text-primary">Solicita aquí: <span className="break-words text-muted-foreground">[Enlace personal pendiente de activación]</span></p>
            <p className="text-xs text-muted-foreground">Tu conductor de confianza. Toda una flota a tu disposición.</p>
          </div>
        </section>
        <section className="min-w-0 space-y-2 rounded-xl border border-border/60 bg-background/50 p-3" aria-label="Vista previa de la entrada personalizada del cliente">
          <h4 className="text-sm font-semibold">Así te verá el cliente</h4>
          <p className="text-xs text-muted-foreground">El enlace y el QR abrirán la misma entrada en TukTuk Cliente.</p>
          <div data-promotion-entry-preview="approved" className="space-y-5 rounded-2xl bg-[#141d29] p-4 text-white">
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xl font-black tracking-tight text-orange-400">TukTuk</span>
              <span className="text-sm font-semibold text-slate-400">Mi TukTuk</span>
            </div>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800">
                <UserRound className="h-12 w-12 text-slate-400" aria-hidden="true"/>
                {portrait ? <img src={portrait} alt={`Foto de ${displayName}`} referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.style.display = "none"; }}/> : null}
              </div>
              <p className="break-words text-2xl font-bold">Viaja con {displayName}</p>
              <p className="text-sm font-semibold text-slate-300">{modality}</p>
              {/* The public landing will display the confirmed service location and
                  verified badge only from authoritative public profile data. */}
            </div>
            <div className="space-y-3 border-t border-slate-600 pt-4">
              <p className="text-center text-lg font-bold">¿A dónde vamos hoy?</p>
              <div className="flex items-center gap-3 rounded-xl bg-[#1e293b] px-3 py-4 text-sm font-semibold text-slate-300">
                <MapPin className="h-5 w-5 shrink-0 text-cyan-400" aria-hidden="true"/>
                Punto de recogida
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-[#1e293b] px-3 py-4 text-sm font-semibold text-slate-300">
                <MapPin className="h-5 w-5 shrink-0 text-orange-400" aria-hidden="true"/>
                ¿Cuál es tu destino?
              </div>
              <div className="rounded-xl bg-orange-600 px-3 py-4 text-center text-base font-bold">Solicitar transporte</div>
              <div className="flex items-start gap-2 text-sm text-slate-300">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden="true"/>
                <p>Intentaremos localizar primero a {displayName}. Si no está disponible, buscaremos otro conductor de TukTuk para ti.</p>
              </div>
            </div>
          </div>
          <p className="text-center text-[10px] text-muted-foreground">Vista ilustrativa privada · todavía no enlazada. Ubicación y verificación se mostrarán cuando estén confirmadas.</p>
        </section>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
        <Share2 className="mt-0.5 h-4 w-4 shrink-0"/>
        <p>{!active ? "El conductor no está activo. " : ""}Esta vista previa no publica fotos, no genera enlaces activos ni modifica carreras. Compartir, descargar y publicar se habilitarán después del consentimiento del conductor y de conectar el despacho preferente.</p>
      </div>
    </section>
  );
}
