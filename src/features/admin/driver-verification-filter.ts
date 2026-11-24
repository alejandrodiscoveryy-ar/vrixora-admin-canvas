// Unknown verification is not equivalent to an unverified identity.
export function matchesDriverVerification(filter: string, verified: boolean | undefined): boolean {
  if (filter === "verified") return verified === true;
  if (filter === "unverified") return verified === false;
  return true;
}

// A pending application may remain in history after identity verification.
// Pending and verified are mutually exclusive in the current directory.
export function matchesPendingDriverVerification(pending: boolean, verified: boolean | undefined): boolean {
  return pending && verified === false;
}

// Count only actionable applications, never historic pending records whose
// identity is already verified. Unknown verification state must not count as 0.
export function countPendingDriverVerifications(
  driverIds: readonly string[],
  pendingIds: ReadonlySet<string> | undefined,
  verifications: Readonly<Record<string, { verified: boolean } | undefined>> | undefined,
): number | null {
  if (!pendingIds || !verifications) return null;
  let count = 0;
  for (const id of driverIds) {
    const verified = verifications[id]?.verified;
    if (typeof verified !== "boolean") return null;
    if (matchesPendingDriverVerification(pendingIds.has(id), verified)) count += 1;
  }
  return count;
}
