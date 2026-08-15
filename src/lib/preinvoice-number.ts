export function formatPreinvoiceNumber(
  number: number,
  issuedAt: string,
  projectName = "TukTuk Control",
) {
  const compactName = projectName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();

  const prefix = compactName.slice(0, 3) || "VRX";
  const year = new Date(issuedAt).getUTCFullYear();

  return `${prefix}-PF-${year}-${String(number).padStart(6, "0")}`;
}
