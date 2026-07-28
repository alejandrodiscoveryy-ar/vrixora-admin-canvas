import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { supabaseServices } from "@/lib/services";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ClientesSection({ projectId }: { projectId: string }) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["admin-licenses", projectId],
    queryFn: () => supabaseServices.licenses.list(projectId),
  });
  const clients = useMemo(
    () =>
      (query.data ?? []).filter((license) =>
        `${license.userEmail} ${license.key} ${license.plan}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [query.data, search],
  );

  return (
    <Card className="glass-panel">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Clientes con licencia<Badge variant="outline">{clients.length}</Badge>
        </CardTitle>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Correo, clave o plan"
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <p className="py-12 text-center text-sm text-destructive">{query.error.message}</p>
        ) : clients.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No hay clientes que coincidan.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Correo</TableHead>
                <TableHead>Clave</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead>Vencimiento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.userEmail}</TableCell>
                  <TableCell className="font-mono text-xs">{client.key}</TableCell>
                  <TableCell>{client.plan}</TableCell>
                  <TableCell>
                    <Badge variant={client.status === "active" ? "default" : "secondary"}>
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(client.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {client.expiresAt
                      ? new Date(client.expiresAt).toLocaleDateString()
                      : "Sin vencimiento"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
