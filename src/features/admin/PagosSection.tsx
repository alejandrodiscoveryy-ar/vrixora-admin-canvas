import { CLIENTS, EMPLOYEES } from "@/lib/mock-data";
import { useDemoStore } from "@/lib/demo-store";
import { useDemoAuth } from "@/lib/demo-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";

export default function PagosSection({ projectId }: { projectId: string }) {
  const { payments } = useDemoStore();
  const { user } = useDemoAuth();
  if (!user) return null;

  const rows = payments
    .filter((p) => p.projectId === projectId && (user.role === "owner" || p.employeeId === user.id))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const total = rows.reduce((s, p) => s + p.amount, 0);

  return (
    <Card className="glass-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" />
          Pagos
          <Badge variant="outline" className="ml-2">{rows.length}</Badge>
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          Total: <span className="text-foreground font-semibold">{total.toLocaleString()} CUP</span>
          {user.role !== "owner" && <span className="ml-2 text-xs">(solo tus cobros)</span>}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Todavía no hay pagos registrados.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Ref.</TableHead>
                {user.role === "owner" && <TableHead>Registrado por</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const client = CLIENTS.find((c) => c.id === p.clientId);
                const emp = EMPLOYEES.find((e) => e.id === p.employeeId);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground text-xs">{p.createdAt}</TableCell>
                    <TableCell>{client?.name ?? "—"}</TableCell>
                    <TableCell className="font-medium">
                      {p.amount} {p.currency}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{p.method}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                    {user.role === "owner" && (
                      <TableCell className="text-muted-foreground">{emp?.name ?? "—"}</TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
