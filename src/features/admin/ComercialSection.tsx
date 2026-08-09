import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Plus, StickyNote } from "lucide-react";
import { toast } from "sonner";
import {
  supabaseServices,
  type CommercialCampaign,
  type CommercialLead,
  type CommercialLeadInput,
  type CommercialLeadStatus,
  type CommercialSource,
} from "@/lib/services";
import { useProjectPermissions } from "@/hooks/useProjects";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";

const SOURCES: CommercialSource[] = [
  "whatsapp",
  "facebook",
  "instagram",
  "sms",
  "referral",
  "direct",
  "other",
];
const STATUSES: CommercialLeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "trial",
  "ready_to_charge",
  "customer",
  "not_interested",
];
const EMPTY: CommercialLeadInput = {
  name: "",
  phone: "",
  email: "",
  source: "whatsapp",
  medium: "",
  campaign: "",
  referralCode: "",
  status: "new",
  notes: "",
  nextActionAt: "",
};

export default function ComercialSection({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const { user } = useSupabaseAuth();
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canManage = permissions.includes("commercial.manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [responsible, setResponsible] = useState("all");
  const [editing, setEditing] = useState<CommercialLeadInput | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CommercialCampaign | "new" | null>(null);
  const leads = useQuery({
    queryKey: ["commercial-leads", projectId],
    queryFn: () => supabaseServices.commercial.listLeads(projectId),
  });
  const campaigns = useQuery({
    queryKey: ["commercial-campaigns", projectId],
    queryFn: () => supabaseServices.commercial.listCampaigns(projectId),
  });
  const metrics = useQuery({
    queryKey: ["commercial-metrics", projectId],
    queryFn: () => supabaseServices.commercial.metrics(projectId),
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["commercial-leads", projectId] }),
      client.invalidateQueries({ queryKey: ["commercial-campaigns", projectId] }),
      client.invalidateQueries({ queryKey: ["commercial-metrics", projectId] }),
    ]);
  const rows = useMemo(
    () =>
      (leads.data ?? []).filter((lead) => {
        const text =
          `${lead.name} ${lead.phone} ${lead.email ?? ""} ${lead.campaign ?? ""}`.toLowerCase();
        return (
          text.includes(search.toLowerCase()) &&
          (status === "all" || lead.status === status) &&
          (source === "all" || lead.source === source) &&
          (campaign === "all" || lead.campaign === campaign) &&
          (responsible === "all" || (lead.responsibleName ?? "unassigned") === responsible)
        );
      }),
    [leads.data, search, status, source, campaign, responsible],
  );
  const campaignNames = [
    ...new Set((leads.data ?? []).map((lead) => lead.campaign).filter(Boolean)),
  ] as string[];
  const responsibleNames = [
    ...new Set((leads.data ?? []).map((lead) => lead.responsibleName ?? "unassigned")),
  ];
  const m = metrics.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Megaphone className="h-5 w-5 text-primary" />
            Seguimiento comercial
          </h2>
          <p className="text-sm text-muted-foreground">
            Lead → registro → prueba → pago → renovación.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditingCampaign("new")}>
              Campaña
            </Button>
            <Button onClick={() => setEditing({ ...EMPTY })}>
              <Plus className="mr-2 h-4 w-4" />
              Lead
            </Button>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {[
          ["Leads", m?.totalLeads],
          ["Registrados", m?.registered],
          ["Pruebas", m?.trials],
          ["Pagaron", m?.paid],
          ["No convertidos", m?.notConverted],
          ["Conversión", `${m?.conversionRate ?? 0}%`],
          ["Mejor canal", m?.topCampaign || m?.topSource || "—"],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-xl font-semibold">{value ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leads y conversiones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-5">
            <Input
              placeholder="Buscar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Filter value={status} onChange={setStatus} values={STATUSES} label="Estado" />
            <Filter value={source} onChange={setSource} values={SOURCES} label="Fuente" />
            <Filter
              value={campaign}
              onChange={setCampaign}
              values={campaignNames}
              label="Campaña"
            />
            <Filter
              value={responsible}
              onChange={setResponsible}
              values={responsibleNames}
              label="Responsable"
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Conversión</TableHead>
                  <TableHead>Seguimiento</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {lead.phone} · {lead.email || "sin email"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.source}
                      <div className="text-xs text-muted-foreground">{lead.campaign || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{labelStatus(lead.status)}</Badge>
                    </TableCell>
                    <TableCell>{lead.responsibleName || "Sin asignar"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Badge variant={lead.registered ? "default" : "secondary"}>Registro</Badge>
                        <Badge variant={lead.trialStarted ? "default" : "secondary"}>Prueba</Badge>
                        <Badge variant={lead.paid ? "default" : "secondary"}>Pago</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {money(lead.revenue)} · {lead.renewalCount} renov.
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <div className="flex">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Editar"
                            onClick={() => setEditing(toInput(lead))}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Añadir nota"
                            onClick={async () => {
                              const note = window.prompt("Nueva nota comercial");
                              if (!note) return;
                              try {
                                await supabaseServices.commercial.addNote(projectId, lead.id, note);
                                await refresh();
                                toast.success("Nota registrada");
                              } catch (error) {
                                toast.error(String(error));
                              }
                            }}
                          >
                            <StickyNote className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!leads.isLoading && !rows.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay leads para los filtros seleccionados.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campañas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(campaigns.data ?? []).map((item) => (
            <Button
              key={item.id}
              variant="outline"
              disabled={!canManage}
              onClick={() => setEditingCampaign(item)}
            >
              {item.name} · {item.source}
              {canManage && <Pencil className="ml-2 h-3.5 w-3.5" />}
            </Button>
          ))}
          {!campaigns.isLoading && !campaigns.data?.length && (
            <span className="text-sm text-muted-foreground">No hay campañas registradas.</span>
          )}
        </CardContent>
      </Card>
      {editing && (
        <LeadDialog
          projectId={projectId}
          value={editing}
          campaigns={campaigns.data ?? []}
          currentUserId={user?.id}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {editingCampaign && (
        <CampaignDialog
          projectId={projectId}
          value={editingCampaign === "new" ? undefined : editingCampaign}
          onClose={() => setEditingCampaign(null)}
          onSaved={async () => {
            setEditingCampaign(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function LeadDialog({
  projectId,
  value,
  campaigns,
  currentUserId,
  onClose,
  onSaved,
}: {
  projectId: string;
  value: CommercialLeadInput;
  campaigns: Awaited<ReturnType<typeof supabaseServices.commercial.listCampaigns>>;
  currentUserId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(value);
  const mutation = useMutation({
    mutationFn: () => supabaseServices.commercial.saveLead(projectId, form),
    onSuccess: () => {
      toast.success("Lead guardado");
      void onSaved();
    },
    onError: (e) => toast.error(String(e)),
  });
  const set = <K extends keyof CommercialLeadInput>(key: K, val: CommercialLeadInput[K]) =>
    setForm((old) => ({ ...old, [key]: val }));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar lead" : "Nuevo lead"}</DialogTitle>
          <DialogDescription>
            La conversión se calcula desde usuarios, licencias y pagos existentes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="WhatsApp">
            <Input
              value={form.phone}
              placeholder="+5351234567"
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Fuente">
            <Select value={form.source} onValueChange={(v) => set("source", v as CommercialSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Medio">
            <Input value={form.medium} onChange={(e) => set("medium", e.target.value)} />
          </Field>
          <Field label="Campaña">
            <Select
              value={form.campaignId || "none"}
              onValueChange={(id) => {
                const c = campaigns.find((x) => x.id === id);
                setForm((old) => ({
                  ...old,
                  campaignId: id === "none" ? undefined : id,
                  campaign: c?.name || "",
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin campaña</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Estado">
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v as CommercialLeadStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {labelStatus(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Código referido">
            <Input
              value={form.referralCode}
              onChange={(e) => set("referralCode", e.target.value)}
            />
          </Field>
          <Field label="Próxima acción">
            <Input
              type="datetime-local"
              value={form.nextActionAt?.slice(0, 16)}
              onChange={(e) =>
                set("nextActionAt", e.target.value ? new Date(e.target.value).toISOString() : "")
              }
            />
          </Field>
          <Field label="User ID vinculado">
            <Input
              value={form.userId}
              onChange={(e) => set("userId", e.target.value)}
              placeholder="Automático por email"
            />
          </Field>
          <Field label="User ID referente">
            <Input
              value={form.referredByUserId ?? ""}
              onChange={(e) => set("referredByUserId", e.target.value)}
              placeholder="Opcional"
            />
          </Field>
          <div className="sm:col-span-2 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!currentUserId}
              onClick={() => set("responsibleId", currentUserId)}
            >
              Asignarme como responsable
            </Button>
            {form.responsibleId && (
              <span className="text-xs text-muted-foreground">Responsable asignado</span>
            )}
          </div>
          <div className="sm:col-span-2">
            <Field label="Notas">
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={mutation.isPending || !form.name.trim() || !form.phone.trim()}
            onClick={() => mutation.mutate()}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function CampaignDialog({
  projectId,
  value,
  onClose,
  onSaved,
}: {
  projectId: string;
  value?: CommercialCampaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [source, setSource] = useState<CommercialSource>(value?.source ?? "whatsapp");
  const [medium, setMedium] = useState(value?.medium ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      supabaseServices.commercial.saveCampaign(projectId, {
        id: value?.id,
        name,
        source,
        medium,
        status: "active",
        startsAt: null,
        endsAt: null,
      }),
    onSuccess: () => {
      toast.success("Campaña guardada");
      void onSaved();
    },
    onError: (e) => toast.error(String(e)),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva campaña</DialogTitle>
          <DialogDescription>
            Identificador comercial para atribución y conversiones.
          </DialogDescription>
        </DialogHeader>
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Fuente">
          <Select value={source} onValueChange={(v) => setSource(v as CommercialSource)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Medio">
          <Input value={medium} onChange={(e) => setMedium(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Filter({
  value,
  onChange,
  values,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  values: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: todos</SelectItem>
        {values.map((v) => (
          <SelectItem key={v} value={v}>
            {v === "unassigned" ? "Sin asignar" : v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function labelStatus(value: CommercialLeadStatus) {
  return {
    new: "Nuevo",
    contacted: "Contactado",
    interested: "Interesado",
    trial: "En prueba",
    ready_to_charge: "Listo para cobro",
    customer: "Cliente",
    not_interested: "No interesado",
  }[value];
}
function money(values: Record<string, number>) {
  const rows = Object.entries(values);
  return rows.length
    ? rows.map(([currency, total]) => `${total} ${currency}`).join(" · ")
    : "Sin ingresos";
}
function toInput(lead: CommercialLead): CommercialLeadInput {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email || "",
    source: lead.source,
    medium: lead.medium || "",
    campaign: lead.campaign || "",
    referralCode: lead.referralCode || "",
    status: lead.status,
    notes: lead.notes || "",
    responsibleId: lead.responsibleId || undefined,
    nextActionAt: lead.nextActionAt || "",
    userId: lead.userId || "",
    referredByUserId: lead.referredByUserId || "",
  };
}
