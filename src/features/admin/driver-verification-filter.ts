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
