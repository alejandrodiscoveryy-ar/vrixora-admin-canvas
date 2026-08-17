export function adoptionBadgeVariant(
  level: string,
): "success" | "warning" | "danger" | "inactive" {
  if (level === "Alta") return "success";
  if (level === "Media") return "warning";
  if (level === "Baja") return "danger";
  return "inactive";
}

export function adoptionDotClass(level: string) {
  if (level === "Alta") return "bg-[var(--semantic-success-foreground)]";
  if (level === "Media") return "bg-[var(--semantic-warning-foreground)]";
  if (level === "Baja") return "bg-[var(--semantic-danger-foreground)]";
  return "bg-[var(--semantic-inactive-foreground)]";
}

export function adoptionSurfaceClass(level: string) {
  if (level === "Alta")
    return "border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)]";
  if (level === "Media")
    return "border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)]";
  if (level === "Baja")
    return "border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-surface)]";
  return "border-[var(--semantic-inactive-border)] bg-[var(--semantic-inactive-surface)]";
}

export function adoptionTextClass(level: string) {
  if (level === "Alta") return "text-[var(--semantic-success-foreground)]";
  if (level === "Media") return "text-[var(--semantic-warning-foreground)]";
  if (level === "Baja") return "text-[var(--semantic-danger-foreground)]";
  return "text-[var(--semantic-inactive-foreground)]";
}
