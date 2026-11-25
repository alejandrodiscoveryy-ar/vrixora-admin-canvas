import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { premiumHeaderSurface } from "@/components/admin/density";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

export type TopupPaymentDestination = {
  cardNumber: string;
  paymentPhone: string;
  whatsappPhone: string;
  updatedAt: string | null;
};

const blankDestination: TopupPaymentDestination = {
  cardNumber: "",
  paymentPhone: "",
  whatsappPhone: "",
  updatedAt: null,
};

export function useTopupPaymentDestination(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["marketplace-topup-payment-destination", projectId],
    queryFn: async (): Promise<TopupPaymentDestination> => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_topup_payment_destination",
        { target_project_id: projectId },
      );
      if (error) throw error;
      const row = (data ?? {}) as Partial<TopupPaymentDestination>;
      return {
        cardNumber: String(row.cardNumber ?? ""),
        paymentPhone: String(row.paymentPhone ?? ""),
        whatsappPhone: String(row.whatsappPhone ?? ""),
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
      };
    },
    enabled,
  });
}

export function topupPaymentInstructionsMessage(
  name: string,
  amount: string,
  destination: TopupPaymentDestination,
) {
  // Evitar repetir el mismo número cuando el teléfono receptor también es WhatsApp.
  const sameWhatsAppNumber =
    Boolean(destination.whatsappPhone) &&
    destination.whatsappPhone.replace(/\D/g, "") === destination.paymentPhone.replace(/\D/g, "");
  const separateWhatsAppNumber = Boolean(destination.whatsappPhone) && !sameWhatsAppNumber;

  return [
    "🛺 *Agencia TukTuk*",
    "",
    `👋 Hola, ${name}.`,
    "",
    "💳 *Datos para realizar tu recarga*",
    `💰 *Importe solicitado:* ${amount}`,
    `🏦 *Tarjeta de destino:* ${destination.cardNumber}`,
    `📱 *Teléfono asociado a la tarjeta:* ${destination.paymentPhone}`,
    ...(separateWhatsAppNumber
      ? [`💬 *WhatsApp para enviar el comprobante:* ${destination.whatsappPhone}`]
      : []),
    "",
    separateWhatsAppNumber
      ? "Cuando hagas la transferencia, envía la referencia o el comprobante al WhatsApp indicado."
      : "Cuando hagas la transferencia, envíanos la referencia o el comprobante respondiendo a este chat.",
    "🔐 Tu billetera se acreditará únicamente cuando confirmemos la recepción del dinero.",
    "",
    "🤝 *Equipo de Agencia TukTuk*",
  ].join("\n");
}

export function MarketplaceTopupPaymentDestination({
  projectId,
  destination,
  isLoading,
  isError,
  onRetry,
}: {
  projectId: string;
  destination: TopupPaymentDestination | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  const [cardNumber, setCardNumber] = useState("");
  const [paymentPhone, setPaymentPhone] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCardNumber(destination?.cardNumber ?? "");
    setPaymentPhone(destination?.paymentPhone ?? "");
    setWhatsappPhone(destination?.whatsappPhone ?? "");
  }, [destination?.cardNumber, destination?.paymentPhone, destination?.whatsappPhone]);

  const normalizedCard = cardNumber.replace(/[\s-]/g, "");
  const normalizedPaymentPhone = paymentPhone.replace(/[\s().-]/g, "");
  const normalizedWhatsappPhone = whatsappPhone.replace(/[\s().-]/g, "");
  const phonePattern = /^\+?[1-9]\d{7,14}$/;
  const cardValid = normalizedCard === "" || /^\d{12,19}$/.test(normalizedCard);
  const paymentPhoneValid = normalizedPaymentPhone === "" || phonePattern.test(normalizedPaymentPhone);
  const whatsappPhoneValid = normalizedWhatsappPhone === "" || phonePattern.test(normalizedWhatsappPhone);
  const pairComplete = Boolean(normalizedCard) === Boolean(normalizedPaymentPhone);
  const valid = cardValid && paymentPhoneValid && whatsappPhoneValid && pairComplete;
  const update = useMutation({
    mutationFn: async () => {
      const { error: rpcError } = await getSupabaseClient().rpc(
        "admin_set_marketplace_topup_payment_destination",
        {
          target_project_id: projectId,
          target_card_number: normalizedCard,
          target_payment_phone: normalizedPaymentPhone,
          target_whatsapp_phone: normalizedWhatsappPhone,
        },
      );
      if (rpcError) throw rpcError;
    },
    onSuccess: () => {
      setError(null);
      toast.success("Datos de recarga guardados.");
      void queryClient.invalidateQueries({ queryKey: ["marketplace-topup-payment-destination", projectId] });
    },
    onError: () => {
      setError("No se pudieron guardar los datos. Comprueba tu conexión y vuelve a intentarlo.");
    },
  });

  return (
    <div data-topup-account-panel className={cn("relative isolate overflow-hidden rounded-[var(--radius-card)] border px-3 py-2.5", premiumHeaderSurface)}>
      <Banknote aria-hidden="true" className="pointer-events-none absolute marketplace-finance-watermark marketplace-finance-watermark-account" />
      <div className="relative z-10 mt-2 space-y-3 border-t border-border-default pt-3">
        <p className="text-xs text-text-secondary">
          Se incluyen en los mensajes de pago a los conductores. Puedes cambiarlos aquí sin modificar la aplicación. El teléfono de la tarjeta y el WhatsApp pueden ser distintos.
        </p>
        {isLoading ? <p className="text-sm text-text-secondary">Cargando datos de recarga…</p> : null}
        {isError ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            No se pudieron cargar los datos.
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>Reintentar</Button>
          </div>
        ) : null}
        {!isLoading && !isError ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="topup-destination-card">Número de tarjeta receptora</Label>
                <Input
                  id="topup-destination-card"
                  className="mt-1.5"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                  placeholder="Número de tarjeta"
                />
              </div>
              <div>
                <Label htmlFor="topup-destination-phone">Teléfono asociado a la tarjeta</Label>
                <Input
                  id="topup-destination-phone"
                  className="mt-1.5"
                  type="tel"
                  autoComplete="off"
                  value={paymentPhone}
                  onChange={(event) => setPaymentPhone(event.target.value)}
                  placeholder="+53…"
                />
              </div>
              <div>
                <Label htmlFor="topup-destination-whatsapp">WhatsApp para comprobantes (opcional)</Label>
                <Input
                  id="topup-destination-whatsapp"
                  className="mt-1.5"
                  type="tel"
                  autoComplete="off"
                  value={whatsappPhone}
                  onChange={(event) => setWhatsappPhone(event.target.value)}
                  placeholder="Puede ser distinto"
                />
              </div>
            </div>
            {!valid ? <p className="text-xs text-rose-400">Introduce una tarjeta de 12 a 19 dígitos junto a su teléfono, y números telefónicos internacionales válidos.</p> : null}
            {error ? <p className="text-xs text-rose-400" role="alert">{error}</p> : null}
            <div className="flex justify-end">
              <Button type="button" disabled={!valid || update.isPending} onClick={() => { setError(null); update.mutate(); }}>
                {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar datos de recarga
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
