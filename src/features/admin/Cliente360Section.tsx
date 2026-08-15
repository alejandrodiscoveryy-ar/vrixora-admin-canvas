import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText,
  History,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  Route,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabaseServices, type Client360Activity, type LicenseStatus } from "@/lib/services";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { DetailList } from "@/components/admin/DetailList";
import { EmptyState } from "@/components/admin/EmptyState";
import { LicenseKeyDisplay } from "@/components/admin/LicenseKeyDisplay";
import { SectionCard } from "@/components/admin/SectionCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { AdminStatus } from "@/components/admin/types";
import { useProjectPermissions } from "@/hooks/useProjects";
import { PreparePreinvoiceDialog } from "@/features/admin/PreinvoiceBillingDialog";
import { formatPreinvoiceNumber } from "@/lib/preinvoice-number";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "Sin fecha";
}

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Sin fecha";
}

function daysRemaining(value: string | null) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

function licenseStatus(status: LicenseStatus): AdminStatus {
  if (status === "active") return "active";
  if (status === "pending" || status === "suspended") return "pending";
  if (status === "expired" || status === "revoked") return "expired";
  return "inactive";
}

function statusLabel(status: string) {
  return (
    (
      {
        active: "Activa",
        pending: "Pendiente",
        expired: "Vencida",
        suspended: "Suspendida",
        revoked: "Revocada",
        paid: "Pagada",
        prepared: "Preparada",
        sent: "Enviada",
        cancelled: "Cancelada",
        refunded: "Reembolsada",
        complimentary: "Cortesía",
        new: "Nuevo",
        contacted: "Contactado",
        interested: "Interesado",
        trial: "En prueba",
        ready_to_charge: "Listo para cobrar",
        customer: "Cliente",
        not_interested: "No interesado",
        earned: "Ganada",
        applied: "Aplicada",
        reverted: "Revertida",
      } as Record<string, string>
    )[status] ?? status
  );
}

function billingStatus(status: string): AdminStatus {
  if (status === "paid" || status === "complimentary") return "paid";
  if (status === "expired") return "expired";
  if (status === "cancelled" || status === "refunded") return "cancelled";
  return "pending";
}

function sourceLabel(source: string) {
  return (
    (
      {
        whatsapp: "WhatsApp",
        facebook: "Facebook",
        instagram: "Instagram",
        sms: "SMS",
        referral: "Referido",
        direct: "Directo",
        other: "Otro",
      } as Record<string, string>
    )[source] ?? source
  );
}

export default function Cliente360Section({
  projectId,
  clientId,
}: {
  projectId: string;
  clientId: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [referrerOpen, setReferrerOpen] = useState(false);
  const [referrerCode, setReferrerCode] = useState("");
  const { data: permissions = [] } = useProjectPermissions(projectId);
  const canPrepareCharge = permissions.includes("payments.manage");
  const canManageCommercial = permissions.includes("commercial.manage");
  const plans = useQuery({
    queryKey: ["admin-license-plans", projectId],
    queryFn: () => supabaseServices.licenses.listAdminPlans(projectId),
    enabled: canPrepareCharge,
  });
  const query = useQuery({
    queryKey: ["admin-client-360", projectId, clientId],
    queryFn: () => supabaseServices.client360.get(projectId, clientId),
  });
  const referralSummary = useQuery({
    queryKey: ["admin-client-referrals", projectId, clientId],
    queryFn: () => supabaseServices.referrals.clientSummary(projectId, clientId),
    enabled: Boolean(query.data?.permissions.commercial),
  });
  const linkReferrer = useMutation({
    mutationFn: () => supabaseServices.referrals.linkReferrer(projectId, clientId, referrerCode),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-client-referrals", projectId, clientId],
        }),
        queryClient.invalidateQueries({ queryKey: ["admin-client-360", projectId, clientId] }),
        queryClient.invalidateQueries({ queryKey: ["commercial-referrals", projectId] }),
      ]);
      setReferrerOpen(false);
      setReferrerCode("");
      toast.success("Referidor vinculado correctamente");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo vincular el referidor"),
  });

  const data = query.data;
  const currentReferralSummary = referralSummary.data;
  const remaining = daysRemaining(data?.license?.expiresAt ?? null);
  const validWhatsapp = Boolean(
    data?.client.phone && /^\+[1-9][0-9]{7,14}$/.test(data.client.phone),
  );
  const documents = useMemo(() => {
    if (!data?.billing) return [];
    return [
      ...data.billing.preinvoices.map((item) => ({
        id: `preinvoice:${item.id}`,
        kind: "Prefactura",
        title: `Prefactura ${formatPreinvoiceNumber(item.number, item.issuedAt)}`,
        subtitle: item.planName,
        amount: `${item.chargeAmount.toLocaleString("es")} ${item.chargeCurrency}`,
        status: item.status,
        date: item.issuedAt,
      })),
      ...data.billing.payments.map((item) => ({
        id: `payment:${item.id}`,
        kind: "Pago",
        title: item.receiptNumber ? `Pago · ${item.receiptNumber}` : "Pago registrado",
        subtitle: item.planName,
        amount: `${item.amount.toLocaleString("es")} ${item.currency}`,
        status: item.status,
        date: item.chargedAt,
      })),
      ...data.billing.receipts.map((item) => ({
        id: `receipt:${item.id}`,
        kind: "Recibo",
        title: item.receiptNumber,
        subtitle: "Documento emitido",
        amount: "",
        status: "paid",
        date: item.createdAt,
      })),
    ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [data?.billing]);

  if (query.isLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  if (query.isError || !data)
    return (
      <EmptyState
        icon={UserRound}
        title="No se pudo abrir Cliente 360"
        description={
          query.error instanceof Error
            ? query.error.message
            : "El cliente no está disponible en este proyecto."
        }
        module="clientes"
        action={
          <Button
            variant="outline"
            onClick={() =>
              navigate({
                to: "/admin/proyectos/$id/$section",
                params: { id: projectId, section: "clientes" },
              })
            }
          >
            <ArrowLeft /> Volver a Clientes
          </Button>
        }
      />
    );

  return (
    <div className="space-y-4 md:space-y-6" data-admin-module="clientes">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() =>
          navigate({
            to: "/admin/proyectos/$id/$section",
            params: { id: projectId, section: "clientes" },
          })
        }
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Clientes
      </Button>

      <section className="rounded-[var(--radius-card)] border border-[var(--module-clientes-border)] bg-surface-1 p-4 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <Avatar className="h-12 w-12 shrink-0 border border-[var(--module-clientes-border)] sm:h-14 sm:w-14">
              <AvatarImage src={data.client.avatarUrl ?? undefined} />
              <AvatarFallback className="bg-[var(--module-clientes-surface)] font-semibold text-[var(--module-clientes-foreground)]">
                {data.client.displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-text-primary sm:text-2xl">
                  {data.client.displayName}
                </h1>
                {data.license ? (
                  <StatusBadge
                    status={licenseStatus(data.license.status)}
                    label={statusLabel(data.license.status)}
                  />
                ) : (
                  <StatusBadge status="inactive" label="Sin licencia" />
                )}
              </div>
              <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-text-secondary">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {data.client.email}
              </p>
              {data.client.phone ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {data.client.phone}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {data.license ? <Badge variant="info">{data.license.planName}</Badge> : null}
                {data.license?.expiresAt ? (
                  <Badge variant={remaining !== null && remaining <= 7 ? "warning" : "secondary"}>
                    Vence {formatDate(data.license.expiresAt)} · {remaining} días
                  </Badge>
                ) : data.license ? (
                  <Badge variant="secondary">Sin vencimiento</Badge>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
            {canPrepareCharge ? (
              <Button className="flex-1 sm:flex-none" onClick={() => setPrepareOpen(true)}>
                <CircleDollarSign className="h-4 w-4" /> Preparar cobro
              </Button>
            ) : null}
            {validWhatsapp ? (
              <Button asChild className="flex-1 sm:flex-none">
                <a
                  href={`https://wa.me/${data.client.phone!.slice(1)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Resumen" description="Situación actual del cliente" module="clientes">
          <DetailList
            columns={2}
            items={[
              { label: "Nombre", value: data.client.displayName },
              { label: "Correo", value: data.client.email },
              { label: "Contacto", value: data.client.phone ?? "Sin teléfono" },
              { label: "Registro", value: formatDate(data.client.registeredAt) },
              { label: "Plan actual", value: data.license?.planName ?? "Sin plan" },
              { label: "Vencimiento", value: formatDate(data.license?.expiresAt ?? null) },
              {
                label: "Último pago",
                value: data.lastPayment
                  ? `${data.lastPayment.amount.toLocaleString("es")} ${data.lastPayment.currency} · ${formatDate(data.lastPayment.chargedAt)}`
                  : "Sin pagos",
              },
              {
                label: "Estado general",
                value: data.license ? statusLabel(data.license.status) : "Sin licencia",
              },
            ]}
          />
        </SectionCard>

        {data.permissions.commercial ? (
          <SectionCard
            title="Comercial"
            description="Origen y seguimiento del cliente"
            module="comercial"
          >
            {data.commercial ? (
              <DetailList
                columns={2}
                items={[
                  { label: "Fuente", value: sourceLabel(data.commercial.source) },
                  { label: "Campaña", value: data.commercial.campaign ?? "Sin campaña" },
                  {
                    label: "Referido por",
                    value: data.commercial.referredByName ?? "Sin referencia",
                  },
                  { label: "Estado comercial", value: statusLabel(data.commercial.status) },
                  { label: "Responsable", value: data.commercial.responsibleName ?? "Sin asignar" },
                  {
                    label: "Última interacción",
                    value: formatDateTime(data.commercial.lastInteractionAt),
                  },
                  { label: "Próxima acción", value: formatDateTime(data.commercial.nextActionAt) },
                  { label: "Notas", value: data.commercial.notes ?? "Sin notas" },
                ]}
              />
            ) : (
              <EmptyState
                icon={Route}
                title="Sin seguimiento comercial"
                description="Este cliente todavía no tiene información comercial asociada."
                module="comercial"
                className="border-0 bg-transparent p-4"
              />
            )}
          </SectionCard>
        ) : null}
      </div>

      {data.permissions.payments ? (
        <SectionCard
          title="Cobros y documentos"
          description="Prefacturas, pagos y recibos en orden cronológico"
          module="pagos"
        >
          {documents.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {documents.map((document) => (
                <article
                  key={document.id}
                  className="rounded-xl border border-border-subtle bg-surface-2 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-tertiary">{document.kind}</p>
                      <h3 className="mt-1 truncate text-sm font-semibold text-text-primary">
                        {document.title}
                      </h3>
                      <p className="mt-1 truncate text-xs text-text-secondary">
                        {document.subtitle}
                      </p>
                    </div>
                    <FileText className="h-4 w-4 shrink-0 text-[var(--module-pagos)]" />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{document.amount}</p>
                      <p className="text-xs text-text-tertiary">{formatDateTime(document.date)}</p>
                    </div>
                    <StatusBadge
                      status={billingStatus(document.status)}
                      label={statusLabel(document.status)}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CircleDollarSign}
              title="Sin cobros ni documentos"
              description="Todavía no hay prefacturas, pagos o recibos para este cliente."
              module="pagos"
              className="border-0 bg-transparent p-4"
            />
          )}
        </SectionCard>
      ) : null}

      {data.permissions.licenses ? (
        <SectionCard
          title="Licencia y dispositivos"
          description="Acceso vigente y equipos vinculados"
          module="licencias"
        >
          {data.license ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <DetailList
                items={[
                  {
                    label: "Clave",
                    value: <LicenseKeyDisplay value={data.license.licenseKey} />,
                    mono: true,
                  },
                  { label: "Plan", value: data.license.planName },
                  { label: "Estado", value: statusLabel(data.license.status) },
                  { label: "Activación", value: formatDate(data.license.activatedAt) },
                  { label: "Vencimiento", value: formatDate(data.license.expiresAt) },
                  { label: "Días restantes", value: remaining === null ? "Sin límite" : remaining },
                  { label: "Última renovación", value: formatDate(data.license.lastRenewedAt) },
                  {
                    label: "Dispositivos",
                    value: `${data.license.activeDevices} de ${data.license.maxDevices}`,
                  },
                ]}
              />
              <div>
                <h3 className="mb-3 text-sm font-semibold">Dispositivos vinculados</h3>
                {data.license.devices.length ? (
                  <div className="space-y-2">
                    {data.license.devices.map((device) => (
                      <article
                        key={device.id}
                        className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-2 p-3"
                      >
                        <MonitorSmartphone className="h-4 w-4 shrink-0 text-[var(--module-licencias)]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {device.label ?? "Dispositivo sin nombre"}
                          </p>
                          <p className="text-xs text-text-tertiary">
                            Último uso {formatDateTime(device.lastSeenAt)}
                          </p>
                        </div>
                        <StatusBadge
                          status={device.revokedAt ? "inactive" : "active"}
                          label={device.revokedAt ? "Revocado" : "Vinculado"}
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-secondary">
                    No hay dispositivos vinculados.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={KeyRound}
              title="Sin licencia"
              description="Este cliente no tiene una licencia asociada al proyecto."
              module="licencias"
              className="border-0 bg-transparent p-4"
            />
          )}
        </SectionCard>
      ) : null}

      {data.permissions.commercial ? (
        <SectionCard
          title="Referidos"
          description={
            data.referrals
              ? `Recompensa configurada: ${data.referrals.rewardDays} días`
              : "Programa de referidos"
          }
          module="comercial"
        >
          {currentReferralSummary ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
                  <p className="text-xs text-text-tertiary">Código personal</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-mono text-base font-semibold">
                      {currentReferralSummary.code}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Copiar código"
                      onClick={() => {
                        void navigator.clipboard.writeText(currentReferralSummary.code);
                        toast.success("Código copiado");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {currentReferralSummary.link ? (
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => {
                        void navigator.clipboard.writeText(currentReferralSummary.link!);
                        toast.success("Enlace copiado");
                      }}
                    >
                      <Link2 className="mr-1 h-3.5 w-3.5" /> Copiar enlace de referido
                    </Button>
                  ) : null}
                </div>
                <DetailList
                  columns={2}
                  items={[
                    { label: "Clientes referidos", value: currentReferralSummary.referredCount },
                    { label: "Recompensas ganadas", value: currentReferralSummary.earnedRewards },
                    {
                      label: "Recompensas aplicadas",
                      value: currentReferralSummary.appliedRewards,
                    },
                    { label: "Días aplicados", value: currentReferralSummary.appliedDays },
                    { label: "Días pendientes", value: currentReferralSummary.pendingDays },
                  ]}
                />
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Quién lo refirió</h3>
                  {currentReferralSummary.referredBy ? (
                    <ReferralCard
                      name={currentReferralSummary.referredBy.name}
                      code={currentReferralSummary.referredBy.code}
                      status={null}
                      days={null}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-text-secondary">
                        Registro directo, sin referidor.
                      </p>
                      {canManageCommercial && currentReferralSummary.canLinkReferrer ? (
                        <Button size="sm" variant="outline" onClick={() => setReferrerOpen(true)}>
                          Vincular referidor
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Clientes referidos</h3>
                  {data.referrals?.referredClients.length ? (
                    <div className="space-y-2">
                      {data.referrals.referredClients.map((person) => (
                        <ReferralCard
                          key={person.relationshipId}
                          name={person.name}
                          code={person.referralCode}
                          status={person.rewardStatus}
                          days={person.rewardDays}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">Aún no ha referido clientes.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={UsersRound}
              title="Sin referidos"
              description="No existen relaciones ni recompensas de referidos para este cliente."
              module="comercial"
              className="border-0 bg-transparent p-4"
            />
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Actividad"
        description="Historia unificada y legible del cliente"
        module="auditoria"
      >
        {data.activity.length ? (
          <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-border-subtle">
            {data.activity.map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </ol>
        ) : (
          <EmptyState
            icon={History}
            title="Sin actividad"
            description="No hay eventos disponibles para este cliente."
            module="auditoria"
            className="border-0 bg-transparent p-4"
          />
        )}
      </SectionCard>
      <PreparePreinvoiceDialog
        open={prepareOpen}
        projectId={projectId}
        clientId={clientId}
        clientName={data.client.displayName}
        plans={plans.data ?? []}
        onClose={() => setPrepareOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({
            queryKey: ["admin-client-360", projectId, clientId],
          });
          void queryClient.invalidateQueries({ queryKey: ["admin-preinvoices", projectId] });
        }}
      />
      <Dialog open={referrerOpen} onOpenChange={setReferrerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Vincular referidor</DialogTitle>
            <DialogDescription>
              Introduce el código del cliente que realizó la referencia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="referrer-code">Código de referido</Label>
            <Input
              id="referrer-code"
              value={referrerCode}
              onChange={(event) => setReferrerCode(event.target.value.toUpperCase())}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReferrerOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!referrerCode.trim() || linkReferrer.isPending}
              onClick={() => linkReferrer.mutate()}
            >
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReferralCard({
  name,
  code,
  status,
  days,
}: {
  name: string;
  code: string | null;
  status: string | null;
  days: number | null;
}) {
  return (
    <article className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-2 p-3">
      <UsersRound className="h-4 w-4 shrink-0 text-[var(--module-comercial)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-text-tertiary">
          {code ? `Código ${code}` : "Sin código"}
          {days ? ` · ${days} días` : ""}
        </p>
      </div>
      <StatusBadge
        status={
          status === "earned" || status === "applied"
            ? "paid"
            : status === "reverted"
              ? "cancelled"
              : "pending"
        }
        label={status ? statusLabel(status) : "Sin recompensa"}
      />
    </article>
  );
}

function ActivityItem({ event }: { event: Client360Activity }) {
  const Icon =
    event.type === "payment"
      ? CircleDollarSign
      : event.type === "preinvoice" || event.type === "document"
        ? FileText
        : event.type === "license"
          ? KeyRound
          : event.type === "commercial"
            ? Route
            : event.type === "referral"
              ? UsersRound
              : event.type === "registration"
                ? UserRound
                : Clock3;
  return (
    <li className="relative flex gap-3 py-3">
      <span className="relative z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-1 ring-4 ring-surface-1">
        <span className="h-2 w-2 rounded-full bg-[var(--module-auditoria)]" />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--module-auditoria)]" />
              {event.title}
            </p>
            {event.description ? (
              <p className="mt-1 text-sm text-text-secondary">{event.description}</p>
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-text-tertiary">
            <CalendarClock className="mr-1 inline h-3 w-3" />
            {formatDateTime(event.occurredAt)}
          </span>
        </div>
      </div>
    </li>
  );
}
