/** Launch WhatsApp Desktop by deep link; WhatsApp Web remains an explicit fallback. */
export function driverWhatsAppLinks(phone: string | null | undefined) {
  if (!phone) return null;
  const trimmed = phone.trim();
  // Require explicit international dial code; never guess a driver's country.
  if (!/^\+?[1-9][\d\s().-]*$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return {
    desktop: `whatsapp://send?phone=${digits}`,
    web: `https://wa.me/${digits}`,
  };
}
