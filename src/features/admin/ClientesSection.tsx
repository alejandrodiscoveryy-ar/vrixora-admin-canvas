import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Users } from "lucide-react";
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
    queryKey: ["admin-clients", projectId],
    queryFn: () => supabaseServices.licenses.listClients(projectId),
  });
  const clients = useMemo(
    () =>
      (query.data ?? []).filter((client) =>
        `${client.displayName} ${client.email} ${client.licenseKey ?? ""} ${client.plan}`
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
          Todos los clientes
          <Badge variant="outline">{clients.length}</Badge>
        </CardTitle>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, correo, clave o plan"
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : query.isError ? (
          <p className="py-12 text-center text-sm text-destructive">{query.error.message}</p>
        ) : clients.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No hay clientes que coincidan.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Clave</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Primer registro</TableHead>
                <TableHead>Vencimiento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.userId}>
                  <TableCell className="font-medium">{client.displayName}</TableCell>
                  <TableCell>{client.email}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {client.licenseKey ?? "Prueba inicial"}
                  </TableCell>
                  <TableCell>{client.plan}</TableCell>
                  <TableCell>
                    <Badge variant={client.status === "active" ? "default" : "secondary"}>
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(client.registeredAt).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(client.expiresAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
