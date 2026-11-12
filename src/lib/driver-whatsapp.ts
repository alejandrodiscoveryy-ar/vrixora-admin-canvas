/** Launch WhatsApp Desktop by deep link; WhatsApp Web remains an explicit fallback. */
export function driverWhatsAppLinks(phone: string | null | undefined, message?: string) {
  if (!phone) return null;
  const trimmed = phone.trim();
  // Require explicit international dial code; never guess a driver's country.
  if (!/^\+?[1-9][\d\s().-]*$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  const draft = message?.trim() ? `&text=${encodeURIComponent(message)}` : "";
  return {
    desktop: `whatsapp://send?phone=${digits}${draft}`,
    web: `https://web.whatsapp.com/send?phone=${digits}${draft}`,
  };
}

/** Owner-supplied invitation; used only for the TukTuk driver directory welcome. */
export const TUKTUK_DRIVER_GROUP_URL = "https://chat.whatsapp.com/DjmuiDfi6a0CdtqFgqujkb?s=cl&p=a&iam=2";

export function driverWelcomeMessage(displayName: string | null | undefined) {
  const firstName = displayName?.trim().split(/\s+/)[0];
  return [
    firstName ? `¡Hola, ${firstName}! 👋` : "¡Hola! 👋",
    "¡Te damos la bienvenida a la Agencia TukTuk! 🛺",
    "Nos alegra que formes parte de nuestro equipo de conductores. Te invitamos a unirte a nuestro grupo de WhatsApp, donde compartimos novedades, orientaciones y avisos importantes para trabajar juntos.",
    `Únete al grupo: ${TUKTUK_DRIVER_GROUP_URL}`,
    "¡Gracias por confiar en nosotros! Seguimos creciendo juntos. Equipo TukTuk.",
  ].join("\n\n");
}
