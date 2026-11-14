// Unknown verification is not equivalent to an unverified identity.
export function matchesDriverVerification(filter: string, verified: boolean | undefined): boolean {
  if (filter === "verified") return verified === true;
  if (filter === "unverified") return verified === false;
  return true;
}
