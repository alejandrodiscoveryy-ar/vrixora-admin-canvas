import { useDemoStore } from "@/lib/demo-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";

export default function RendimientoSection({ projectId }: { projectId: string }) {
  const { payments, licenses, history } = useDemoStore();
  const projPayments = payments.filter((p) => p.projectId === projectId);
  const projLicenses = licenses.filter((l) => l.projectId === projectId);

  // Simple monthly aggregation for a static bar chart
  const byMonth = new Map<string, number>();
  projPayments.forEach((p) => {
    const m = p.createdAt.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + p.amount);
  });
  const months = Array.from(byMonth.entries()).sort();
  const maxVal = Math.max(1, ...months.map(([, v]) => v));

  const conversion = projLicenses.length
    ? Math.round((projLicenses.filter((l) => l.status === "active").length / projLicenses.length) * 100)
    : 0;

  const projHistory = history.filter((h) => h.projectId === projectId).slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Ingresos totales" value={`${projPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()} CUP`} />
        <Metric label="Licencias emitidas" value={projLicenses.length} />
        <Metric label="Tasa de activación" value={`${conversion}%`} />
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Ingresos por mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {months.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Sin datos suficientes.</div>
          ) : (
            <div className="flex items-end gap-3 h-48">
              {months.map(([m, v]) => (
                <div key={m} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex items-end h-40">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-primary/40 to-primary"
                      style={{ height: `${(v / maxVal) * 100}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">{m}</div>
                  <div className="text-xs font-medium">{v}€</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">Historial de acciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {projHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin acciones registradas.</p>
          ) : (
            projHistory.map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0">
                <div>
                  <div className="text-sm font-medium">{h.action}</div>
                  <div className="text-xs text-muted-foreground">{h.detail}</div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{h.actor}</div>
                  <div>{h.createdAt}</div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="glass-panel">
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        <Badge variant="outline" className="mt-3 text-[10px]">Demostración</Badge>
      </CardContent>
    </Card>
  );
}
