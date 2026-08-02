import { useEffect, useState } from "react";
import { Download, Eye, Printer, ReceiptText, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabaseServices, type BillingPreview, type BillingReceipt, type LicensePlan, type ServiceClient, type ServiceLicense } from "@/lib/services";
import { VrixoraLogo } from "@/components/brand/VrixoraLogo";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ChargePlanDialog({ client, license, plans, onClose, onDone }: { client: ServiceClient | null; license: ServiceLicense | null; plans: LicensePlan[]; onClose: () => void; onDone: () => void }) {
  const { user } = useSupabaseAuth();
  const activePlans = plans.filter((plan) => plan.isActive);
  const [plan, setPlan] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer" | "other">("cash");
  const [reference, setReference] = useState("");
  const [chargedAt, setChargedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [rule, setRule] = useState<"apply_now" | "after_expiry">("after_expiry");
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [receipt, setReceipt] = useState<BillingReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const selectedPlan = activePlans.find((item) => item.code === plan);

  useEffect(() => {
    if (!client) return;
    setPlan(""); setAmount(""); setMethod("cash"); setReference(""); setNotes(""); setRule("after_expiry"); setPreview(null); setReceipt(null);
    setChargedAt(localDateTime(new Date()));
    setIdempotencyKey(crypto.randomUUID());
  }, [client]);
  useEffect(() => { if (selectedPlan) setAmount(String(selectedPlan.price)); setPreview(null); }, [selectedPlan]);
  useEffect(() => setPreview(null), [rule]);

  const loadPreview = async () => {
    if (!license || !plan) return;
    setBusy(true);
    try { setPreview(await supabaseServices.payments.previewCharge(license.id, plan, rule)); }
    catch (error) { toast.error(message(error)); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!license || !selectedPlan || !preview) return;
    setBusy(true);
    try {
      const result = await supabaseServices.payments.chargeAndAssign({ licenseId: license.id, plan, amount: Number(amount), method, reference, chargedAt: new Date(chargedAt).toISOString(), notes, applicationRule: rule, idempotencyKey });
      setReceipt(result); onDone(); toast.success("Pago registrado, plan aplicado y recibo generado.");
    } catch (error) { toast.error(message(error)); }
    finally { setBusy(false); }
  };
  if (receipt) return <ReceiptDialog receipt={receipt} onClose={onClose} />;
  return <Dialog open={!!client} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
    <DialogHeader><DialogTitle>Registrar pago y asignar plan</DialogTitle><DialogDescription>Una sola operación segura: cobro, licencia, historial y recibo.</DialogDescription></DialogHeader>
    <div className="grid gap-4 md:grid-cols-2">
      <Info label="Cliente" value={client?.displayName ?? ""} /><Info label="Correo" value={client?.email ?? ""} />
      <Info label="Licencia actual" value={maskKey(client?.licenseKey)} /><Info label="Plan / estado actual" value={`${client?.plan ?? "—"} · ${client?.status ?? "—"}`} />
      <Info label="Vencimiento actual" value={formatDate(client?.expiresAt)} />
      <Info label="Tiempo restante" value={remainingTime(client?.expiresAt)} />
      <Info label="Dispositivos" value={client ? `${client.activeDevices} de ${client.maxDevices} en uso` : "—"} />
      <Info label="Último pago" value={client?.lastPaymentAt ? `${formatDate(client.lastPaymentAt)} · ${client.lastPaymentAmount} ${client.lastPaymentCurrency}` : "Sin pagos registrados"} />
      <Info label="Última renovación" value={client?.lastRenewedAt ? formatDate(client.lastRenewedAt) : "Sin renovaciones"} />
      <Info label="Operador" value={user?.email ?? "—"} />
      <Field label="Plan comprado"><Select value={plan} onValueChange={setPlan}><SelectTrigger><SelectValue placeholder="Seleccionar plan activo" /></SelectTrigger><SelectContent>{activePlans.map((item) => <SelectItem key={item.code} value={item.code}>{item.name} · {item.price} {item.currency}</SelectItem>)}</SelectContent></Select></Field>
      <Info label="Precio establecido" value={selectedPlan ? `${selectedPlan.price} ${selectedPlan.currency}` : "—"} />
      <Info label="Moneda" value={selectedPlan?.currency ?? "—"} />
      <Field label="Importe cobrado"><Input type="number" min="0" max={selectedPlan?.price} value={amount} onChange={(event) => { setAmount(event.target.value); setPreview(null); }} /></Field>
      <Field label="Método de pago"><Select value={method} onValueChange={(value) => setMethod(value as typeof method)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Efectivo</SelectItem><SelectItem value="transfer">Transferencia</SelectItem><SelectItem value="other">Otro</SelectItem></SelectContent></Select></Field>
      <Field label="Referencia opcional"><Input value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
      <Field label="Fecha y hora del cobro"><Input type="datetime-local" max={localDateTime(new Date())} value={chargedAt} onChange={(event) => setChargedAt(event.target.value)} /></Field>
      <Field label="Aplicación del plan"><Select value={rule} onValueChange={(value) => setRule(value as typeof rule)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="after_expiry">Después del vencimiento actual</SelectItem><SelectItem value="apply_now">Aplicar ahora</SelectItem></SelectContent></Select></Field>
      <div className="md:col-span-2"><Field label="Observaciones"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={selectedPlan && Number(amount) !== selectedPlan.price ? "Obligatorio si el importe difiere del precio" : "Opcional"} /></Field></div>
    </div>
    {preview && <Preview preview={preview} amount={Number(amount)} />}
    <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button>{!preview ? <Button disabled={busy || !license || !plan || !chargedAt || Number(amount) < 0 || Number(amount) > (selectedPlan?.price ?? 0) || (!!selectedPlan && Number(amount) !== selectedPlan.price && !notes.trim())} onClick={loadPreview}><Eye className="mr-2 h-4 w-4" />Revisar operación</Button> : <Button disabled={busy} onClick={confirm}><ReceiptText className="mr-2 h-4 w-4" />{busy ? "Confirmando…" : "Confirmar y generar recibo"}</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}

function Preview({ preview, amount }: { preview: BillingPreview; amount: number }) { return <div className="rounded-xl border border-primary/25 bg-primary/5 p-4"><h3 className="mb-3 font-semibold">Vista previa antes de confirmar</h3><div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="Plan anterior" value={preview.previousPlan} /><Info label="Plan nuevo" value={preview.newPlan} /><Info label="Vencimiento anterior" value={formatDate(preview.previousExpiresAt)} /><Info label="Nuevo inicio" value={formatDate(preview.newStartedAt)} /><Info label="Nuevo vencimiento" value={formatDate(preview.newExpiresAt)} /><Info label="Tiempo agregado" value={preview.durationDays == null ? "Sin vencimiento" : `${preview.durationDays} días`} /><Info label="Precio / cobrado" value={`${preview.price} / ${amount} ${preview.currency}`} /><Info label="Dispositivos" value={String(preview.maxDevices)} /></div></div>; }

export function ReceiptDialog({ receipt, onClose }: { receipt: BillingReceipt; onClose: () => void }) {
  const image = () => receiptImage(receipt);
  const downloadImage = () => { const link=document.createElement("a"); link.download=`${receipt.receiptNumber}.png`; link.href=image(); link.click(); };
  const share = async () => { try { const blob=await (await fetch(image())).blob(); const file=new File([blob],`${receipt.receiptNumber}.png`,{type:"image/png"}); if(navigator.share) await navigator.share({title:"Recibo VRIXORA",text:`Recibo ${receipt.receiptNumber}`,files:navigator.canShare?.({files:[file]})?[file]:undefined}); else window.open(`https://wa.me/?text=${encodeURIComponent(`Recibo VRIXORA ${receipt.receiptNumber}`)}`,"_blank"); } catch { toast.error("No fue posible compartir el recibo."); } };
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Recibo generado</DialogTitle><DialogDescription>La operación se confirmó correctamente.</DialogDescription></DialogHeader><ReceiptCard receipt={receipt} /><DialogFooter className="flex-wrap"><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Guardar PDF / imprimir</Button><Button variant="outline" onClick={downloadImage}><Download className="mr-2 h-4 w-4" />Descargar imagen</Button><Button variant="outline" onClick={share}><Share2 className="mr-2 h-4 w-4" />Compartir</Button><Button onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>;
}

function ReceiptCard({ receipt }: { receipt: BillingReceipt }) { return <div id="billing-receipt" className="rounded-xl border bg-white p-5 text-slate-900 shadow-sm"><div className="flex items-start justify-between gap-4 border-b pb-4"><div className="flex items-center gap-3"><VrixoraLogo size={48} className="rounded-lg" /><div><div className="text-lg font-bold">VRIXORA Solutions</div><div className="text-sm">{receipt.projectName || "TukTuk Control"}</div></div></div><div className="text-right"><div className="text-xs uppercase text-slate-500">Recibo</div><div className="font-mono text-sm font-semibold">{receipt.receiptNumber}</div><div className="text-xs text-slate-500">{formatDate(receipt.chargedAt)}</div></div></div><div className="grid gap-x-6 gap-y-3 py-5 text-sm sm:grid-cols-2"><ReceiptRow label="Cliente" value={receipt.clientName} /><ReceiptRow label="Correo" value={receipt.clientEmail} /><ReceiptRow label="Licencia" value={receipt.maskedLicenseKey} /><ReceiptRow label="Plan" value={receipt.planName} /><ReceiptRow label="Duración" value={receipt.durationDays == null ? "Sin vencimiento" : `${receipt.durationDays} días`} /><ReceiptRow label="Importe" value={`${receipt.amount} ${receipt.currency}`} /><ReceiptRow label="Método" value={methodLabel(receipt.method)} /><ReceiptRow label="Referencia" value={receipt.reference} /><ReceiptRow label="Inicio" value={formatDate(receipt.startedAt)} /><ReceiptRow label="Vencimiento" value={formatDate(receipt.expiresAt)} /><ReceiptRow label="Estado" value="Activa" /><ReceiptRow label="Dispositivos" value={String(receipt.maxDevices)} /><ReceiptRow label="Operador" value={receipt.operatorEmail} /><ReceiptRow label="Observaciones" value={receipt.notes || "—"} /></div><div className="border-t pt-4 text-center text-xs text-slate-500"><div>{receipt.whatsapp ? `WhatsApp ${receipt.whatsapp}` : receipt.supportEmail || "Soporte VRIXORA"}</div><div className="mt-1 font-medium text-slate-700">Aplicaciones inteligentes para negocios inteligentes</div></div></div>; }

function receiptImage(receipt: BillingReceipt) { const canvas=document.createElement("canvas"); canvas.width=1200; canvas.height=1500; const ctx=canvas.getContext("2d")!; ctx.fillStyle="#fff";ctx.fillRect(0,0,1200,1500);ctx.fillStyle="#071018";ctx.font="bold 42px Arial";ctx.fillText("VRIXORA Solutions",70,90);ctx.font="24px Arial";ctx.fillText(receipt.projectName,70,130);ctx.textAlign="right";ctx.font="bold 24px monospace";ctx.fillText(receipt.receiptNumber,1130,90);ctx.textAlign="left";ctx.strokeStyle="#dbe4ea";ctx.beginPath();ctx.moveTo(70,170);ctx.lineTo(1130,170);ctx.stroke(); const rows=[["Cliente",receipt.clientName],["Correo",receipt.clientEmail],["Licencia",receipt.maskedLicenseKey],["Plan",receipt.planName],["Duración",receipt.durationDays==null?"Sin vencimiento":`${receipt.durationDays} días`],["Importe",`${receipt.amount} ${receipt.currency}`],["Método",methodLabel(receipt.method)],["Referencia",receipt.reference],["Fecha",formatDate(receipt.chargedAt)],["Inicio",formatDate(receipt.startedAt)],["Vencimiento",formatDate(receipt.expiresAt)],["Dispositivos",String(receipt.maxDevices)],["Operador",receipt.operatorEmail],["Observaciones",receipt.notes||"—"]]; let y=230; rows.forEach(([label,value])=>{ctx.fillStyle="#64748b";ctx.font="20px Arial";ctx.fillText(label,70,y);ctx.fillStyle="#0f172a";ctx.font="bold 23px Arial";ctx.fillText(value.slice(0,75),330,y);y+=72;});ctx.fillStyle="#64748b";ctx.font="20px Arial";ctx.textAlign="center";ctx.fillText(receipt.whatsapp?`WhatsApp ${receipt.whatsapp}`:receipt.supportEmail||"Soporte VRIXORA",600,1330);ctx.fillStyle="#0f172a";ctx.font="bold 22px Arial";ctx.fillText("Aplicaciones inteligentes para negocios inteligentes",600,1380);return canvas.toDataURL("image/png"); }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value || "—"}</div></div>; }
function ReceiptRow({ label, value }: { label: string; value: string }) { return <div><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="break-words font-medium">{value}</div></div>; }
function localDateTime(date: Date) { const local=new Date(date.getTime()-date.getTimezoneOffset()*60000); return local.toISOString().slice(0,16); }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("es",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : "Sin vencimiento"; }
function remainingTime(value?: string | null) { if (!value) return "Sin vencimiento"; const days=Math.ceil((new Date(value).getTime()-Date.now())/86400000); if(days===1)return "Vence mañana"; if(days===0)return "Vence hoy"; if(days<0)return `Vencida hace ${Math.abs(days)} ${Math.abs(days)===1?"día":"días"}`; if(days<30)return `Quedan ${days} días`; const months=Math.floor(days/30); const rest=days%30; return rest?`Quedan ${months} ${months===1?"mes":"meses"} y ${rest} días`:`Quedan ${months} ${months===1?"mes":"meses"}`; }
function maskKey(value?: string | null) { return value ? `VRX-****-${value.slice(-4)}` : "Prueba inicial"; }
function methodLabel(value: string) { return value === "cash" ? "Efectivo" : value === "transfer" ? "Transferencia" : "Otro"; }
function message(error: unknown) { const value=error instanceof Error?error.message:String(error); if(value.includes("SPECIAL_LICENSE_PROTECTED")) return "Esta licencia especial no puede modificarse desde el flujo de cobro."; if(value.includes("PLAN_NOT_FOUND_OR_INACTIVE")) return "El plan ya no está activo."; if(value.includes("PRICE_ADJUSTMENT_REASON_REQUIRED")) return "Indica en observaciones el motivo del importe personalizado."; return value; }
