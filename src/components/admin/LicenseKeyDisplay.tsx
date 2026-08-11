import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function maskLicenseKey(value: string) {
  if (value.length <= 8) return "VRX-••••-••••";
  return `${value.slice(0, 3)}-••••-${value.slice(-4)}`;
}

export function LicenseKeyDisplay({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!value) {
    return <span className={cn("text-text-tertiary", className)}>Sin licencia</span>;
  }

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Clave de licencia copiada");
    } catch {
      toast.error("No fue posible copiar la clave");
    }
  };

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span
        className={cn(
          "min-w-0 font-mono text-xs text-text-secondary",
          revealed ? "break-all text-text-primary" : "whitespace-nowrap",
        )}
        title={revealed ? value : "Clave de licencia oculta"}
      >
        {revealed ? value : maskLicenseKey(value)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={revealed ? "Ocultar clave de licencia" : "Mostrar clave de licencia"}
        title={revealed ? "Ocultar clave" : "Mostrar clave"}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label="Copiar clave de licencia"
        title="Copiar clave"
        onClick={copyKey}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
