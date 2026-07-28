import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { supabaseServices } from "@/lib/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RendimientoSection({ projectId }: { projectId: string }) {
  const payments = useQuery({
    queryKey: ["admin-payments", projectId],
    queryFn: () => supabaseServices.payments.listAdmin(projectId),
  });
  const licenses = useQuery({
    queryKey: ["admin-licenses", projectId],
    queryFn: () => supabaseServices.licenses.list(projectId),
  });
  const history = useQuery({
    queryKey: ["license-audit", projectId],
    queryFn: () => supabaseServices.licenseAuditLog.list(projectId),
  });
  const paid = (payments.data ?? []).filter((item) => item.status === "paid");
  const byMonth = new Map<string, number>();
  paid.forEach((item) => {
    const month = item.createdAt.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + item.amount);
  });
  const months = [...byMonth.entries()].sort();
  const max = Math.max(1, ...months.map(([, value]) => value));
  const rows = licenses.data ?? [];
  const active = rows.filter((item) => item.status === "active").length;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          label="Ingresos cobrados"
          value={paid.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
        />
        <Metric label="Licencias emitidas" value={rows.length} />
        <Metric
          label="Tasa de activación"
          value={`${rows.length ? Math.round((active / rows.length) * 100) : 0}%`}
        />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Ingresos reales por mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {months.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aún no hay pagos cobrados.
            </p>
          ) : (
            <div className="flex h-48 items-end gap-3">
              {months.map(([month, value]) => (
                <div key={month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-36 w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-primary"
                      style={{ height: `${(value / max) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs">{month}</div>
                  <div className="text-xs font-medium">{value.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">Historial real de acciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(history.data ?? []).slice(0, 12).map((entry) => (
            <div key={entry.id} className="flex justify-between gap-3 border-b pb-2">
              <div>
                <div className="text-sm font-medium">{entry.action}</div>
                <div className="text-xs text-muted-foreground">{entry.detail}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
