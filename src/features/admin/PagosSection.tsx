import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CircleDollarSign, Search, Wallet } from "lucide-react";
import { supabaseServices } from "@/lib/services";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function PagosSection({ projectId }: { projectId: string }) {
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [method, setMethod] = useState("all");
  const [date, setDate] = useState("");
  const query = useQuery({
    queryKey: ["admin-payments", projectId],
    queryFn: () => supabaseServices.payments.listAdmin(projectId),
  });
  const audit = useQuery({
    queryKey: ["license-audit", projectId],
    queryFn: () => supabaseServices.licenseAuditLog.list(projectId),
  });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const filtered = useMemo(
    () =>
      rows.filter((p) => {
        const text = `${p.userEmail} ${p.licenseKey} ${p.reference}`.toLowerCase();
        return (
          text.includes(search.toLowerCase()) &&
          (plan === "all" || p.plan === plan) &&
          (status === "all" || p.status === status) &&
          (currency === "all" || p.currency === currency) &&
          (method === "all" || p.method === method) &&
          (!date || p.createdAt.slice(0, 10) === date)
        );
      }),
    [rows, search, plan, status, currency, method, date],
  );
  const paid = rows.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const pending = rows.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);
  const plans = [...new Set(rows.map((p) => p.plan))];
  const month = new Date().toISOString().slice(0, 7);
  const renewals = (audit.data ?? []).filter(
    (entry) => entry.action === "license_renewed" && entry.createdAt.startsWith(month),
  ).length;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CircleDollarSign}
          label="Ingresos por licencias"
          value={paid.toLocaleString()}
        />
        <Metric icon={CalendarClock} label="Pagos pendientes" value={pending.toLocaleString()} />
        <Metric icon={Wallet} label="Registros de pago" value={String(rows.length)} />
        <Metric icon={CalendarClock} label="Renovaciones del mes" value={String(renewals)} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            Historial de pagos<Badge variant="outline">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Usuario, clave o referencia"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Filter value={plan} onChange={setPlan} values={plans} label="Plan" />
            <Filter
              value={status}
              onChange={setStatus}
              values={["pending", "paid", "cancelled", "refunded", "complimentary"]}
              label="Estado"
            />
            <Filter
              value={currency}
              onChange={setCurrency}
              values={["CUP", "USD", "EUR"]}
              label="Moneda"
            />
            <Filter
              value={method}
              onChange={setMethod}
              values={["card", "transfer", "cash", "paypal"]}
              label="Método"
            />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Licencia</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Precio normal</TableHead>
                  <TableHead>Descuento</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Administrador</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(p.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{p.userEmail}</TableCell>
                    <TableCell className="font-mono text-xs">{p.licenseKey}</TableCell>
                    <TableCell>{p.plan}</TableCell>
                    <TableCell>
                      {p.listPrice} {p.currency}
                    </TableCell>
                    <TableCell>
                      {p.discount} {p.currency}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.amount} {p.currency}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === "paid"
                            ? "default"
                            : p.status === "pending"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                    <TableCell className="font-mono text-xs">{p.employeeId}</TableCell>
                    <TableCell>{p.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
function Filter({
  value,
  onChange,
  values,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  values: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: todos</SelectItem>
        {values.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
