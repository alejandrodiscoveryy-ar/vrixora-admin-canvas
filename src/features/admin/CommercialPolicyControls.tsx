import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Composición de ajustes comerciales; usa exclusivamente tokens oficiales del Admin. */
export function PolicyTile({
  title,
  description,
  controls,
  children,
  footer,
}: {
  title: string;
  description: string;
  controls?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-card)] border border-border-default bg-surface-2/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold text-text-primary sm:text-base">{title}</h3>
          <p className="max-w-md text-xs leading-relaxed text-text-secondary">{description}</p>
        </div>
        {controls}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">{footer}</div>}
    </section>
  );
}

export function PolicyStatus({
  active,
  label,
  pending = false,
}: {
  active: boolean;
  label?: string;
  pending?: boolean;
}) {
  return (
    <span className={
      "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
      (pending
        ? "border-[var(--semantic-warning-border)] bg-[var(--semantic-warning-surface)] text-[var(--semantic-warning-foreground)]"
        : active
          ? "border-[var(--semantic-success-border)] bg-[var(--semantic-success-surface)] text-[var(--semantic-success-foreground)]"
          : "border-border-default bg-surface-3 text-text-secondary")
    }>
      <span aria-hidden="true" className={"size-1.5 rounded-full " + (pending ? "bg-[var(--semantic-warning)]" : active ? "bg-[var(--semantic-success)]" : "bg-text-tertiary")} />
      {pending ? "Sin guardar" : label ?? (active ? "Activo" : "Inactivo")}
    </span>
  );
}

export function PolicyToggle({
  id,
  checked,
  onChange,
  disabled,
  label,
  pending = false,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
  label: string;
  pending?: boolean;
}) {
  return (
    <div className="flex min-h-11 shrink-0 items-center gap-2">
      <PolicyStatus active={checked} pending={pending} />
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
        className="data-[state=unchecked]:bg-[var(--border-strong)] data-[state=checked]:bg-primary"
      />
    </div>
  );
}

export function PolicyNumberField({
  id,
  label,
  value,
  onChange,
  disabled,
  unit,
  min,
  max,
  step,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  unit: string;
  min: string;
  max: string;
  step: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-text-secondary">{label}</Label>
      <div className="relative w-full max-w-[240px]">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          aria-label={label}
          className="h-11 w-full bg-surface-3/65 pr-16 text-base font-semibold tabular-nums text-text-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-text-secondary">
          {unit}
        </span>
      </div>
      {hint && <p className="text-xs leading-relaxed text-text-secondary">{hint}</p>}
    </div>
  );
}
