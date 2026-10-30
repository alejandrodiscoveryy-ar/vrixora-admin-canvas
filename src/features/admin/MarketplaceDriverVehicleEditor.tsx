import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseClient } from "@/lib/supabase";

type CatalogItem = { code: string; name: string };
type PhotoItem = { id: string; label: string };
type Vehicle = {
  id: string;
  name: string | null;
  category_code: string | null;
  propulsion_code: string | null;
  category_other_description: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  registration: string | null;
  passenger_capacity: number | null;
  cargo_capacity_kg: number | null;
  cargo_volume_m3: number | null;
  cargo_length_cm: number | null;
  cargo_width_cm: number | null;
  cargo_height_cm: number | null;
  body_type: string | null;
  main_photo_asset_id: string | null;
};
type EditorPayload = {
  vehicle: Vehicle;
  categories: CatalogItem[];
  propulsions: CatalogItem[];
  service_types: CatalogItem[];
  services: string[];
  photos: PhotoItem[];
  active_job: boolean;
  working: boolean;
  unpublished_modalities: Array<{ service_code: string; category_code: string }>;
};
type FormState = {
  category: string;
  propulsion: string;
  otherCategory: string;
  brand: string;
  model: string;
  year: string;
  registration: string;
  passengers: string;
  cargoKg: string;
  cargoVolume: string;
  cargoLength: string;
  cargoWidth: string;
  cargoHeight: string;
  bodyType: string;
  photoId: string;
  services: string[];
  reason: string;
  acknowledged: boolean;
};

const optionalNumber = (s: string): number | null =>
  s.trim() === "" ? null : Number(s.replace(",", "."));
const inputClass =
  "mt-1 h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="min-w-0 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

export default function MarketplaceDriverVehicleEditor({
  projectId,
  driverUserId,
  vehicleId,
}: {
  projectId: string;
  driverUserId: string;
  vehicleId: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const details = useQuery({
    queryKey: ["driver-vehicle-editor", projectId, driverUserId, vehicleId],
    enabled: open,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_get_marketplace_driver_vehicle_edit_v1",
        {
          target_project_id: projectId,
          target_driver_user_id: driverUserId,
          target_vehicle_id: vehicleId,
        },
      );
      if (error) throw error;
      return data as EditorPayload;
    },
  });
  useEffect(() => {
    if (!open || !details.data) return;
    const { vehicle: v, services } = details.data;
    setForm({
      category: v.category_code ?? "",
      propulsion: v.propulsion_code ?? "",
      otherCategory: v.category_other_description ?? "",
      brand: v.brand ?? "",
      model: v.model ?? "",
      year: v.year == null ? "" : String(v.year),
      registration: v.registration ?? "",
      passengers: v.passenger_capacity == null ? "" : String(v.passenger_capacity),
      cargoKg: v.cargo_capacity_kg == null ? "" : String(v.cargo_capacity_kg),
      cargoVolume: v.cargo_volume_m3 == null ? "" : String(v.cargo_volume_m3),
      cargoLength: v.cargo_length_cm == null ? "" : String(v.cargo_length_cm),
      cargoWidth: v.cargo_width_cm == null ? "" : String(v.cargo_width_cm),
      cargoHeight: v.cargo_height_cm == null ? "" : String(v.cargo_height_cm),
      bodyType: v.body_type ?? "",
      photoId: v.main_photo_asset_id ?? "",
      services: [...services],
      reason: "",
      acknowledged: false,
    });
  }, [details.data, open]);

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const { error } = await getSupabaseClient().rpc(
        "admin_update_marketplace_driver_vehicle_full_v1",
        {
          target_project_id: projectId,
          target_driver_user_id: driverUserId,
          target_vehicle_id: vehicleId,
          target_category_code: f.category,
          target_propulsion_code: f.propulsion,
          target_category_other_description: f.category === "other" ? f.otherCategory.trim() : null,
          target_brand: f.brand.trim(),
          target_model: f.model.trim(),
          target_year: optionalNumber(f.year),
          target_registration: f.registration.trim() || null,
          target_passenger_capacity: optionalNumber(f.passengers),
          target_cargo_capacity_kg: optionalNumber(f.cargoKg),
          target_cargo_volume_m3: optionalNumber(f.cargoVolume),
          target_cargo_length_cm: optionalNumber(f.cargoLength),
          target_cargo_width_cm: optionalNumber(f.cargoWidth),
          target_cargo_height_cm: optionalNumber(f.cargoHeight),
          target_body_type: f.bodyType.trim() || null,
          target_main_photo_asset_id: f.photoId || null,
          target_service_codes: f.services,
          target_reason: f.reason.trim(),
        },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["marketplace-driver-360", projectId, driverUserId] }),
        queryClient.invalidateQueries({ queryKey: ["driver-management-360", projectId, driverUserId] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace-drivers", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["driver-vehicle-editor", projectId, driverUserId, vehicleId] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace-driver-directory-media", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace-driver-360-media", projectId, driverUserId] }),
      ]);
      setOpen(false);
      setForm(null);
    },
  });

  const change = (patch: Partial<FormState>) =>
    setForm((previous) => (previous ? { ...previous, ...patch } : previous));
  const originalCategory = details.data?.vehicle.category_code ?? "";
  const categoryChanged = Boolean(form && form.category !== originalCategory);
  const hasInvalidNumbers = Boolean(form && (
    [form.year, form.passengers, form.cargoKg, form.cargoVolume,
      form.cargoLength, form.cargoWidth, form.cargoHeight].some((v) => {
      const n = optionalNumber(v);
      return n !== null && (!Number.isFinite(n) || n < 0);
    }) || [form.year, form.passengers].some((v) => {
      const n = optionalNumber(v);
      return n !== null && !Number.isInteger(n);
    }) || (optionalNumber(form.year) !== null && (Number(form.year) < 1886 || Number(form.year) > 2200))
  ));
  const unpublishedForSelected = (details.data?.unpublished_modalities ?? []).filter((item) =>
    item.category_code === form?.category && form?.services.includes(item.service_code)
  );
  const saveDisabled = !form || save.isPending || Boolean(details.data?.active_job) ||
    Boolean(details.data?.working) || !form.photoId ||
    !form.category || !form.propulsion || form.brand.trim().length < 2 ||
    `${form.brand.trim()} ${form.model.trim()}`.trim().length > 80 ||
    !form.model.trim() || form.services.length === 0 || form.reason.trim().length < 5 ||
    (form.category === "other" && !form.otherCategory.trim()) ||
    (categoryChanged && !form.acknowledged) || hasInvalidNumbers ||
    (form.category === "motorcycle" && optionalNumber(form.passengers) !== 1) ||
    (form.services.some((service) => ["passenger", "tourism"].includes(service)) &&
      (optionalNumber(form.passengers) ?? 0) < 1) ||
    (form.services.includes("cargo") && (optionalNumber(form.cargoKg) ?? 0) <= 0);

  return (
    <div className="sm:col-span-2 min-w-0">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-cyan-400/30 bg-cyan-400/[0.04] text-cyan-100 hover:bg-cyan-400/10"
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); setForm(null); }}
      >
        <Pencil className="mr-1.5 h-4 w-4" /> Editar vehículo completo
        <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setForm(null); }}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[980px] overflow-y-auto border-cyan-400/25 bg-[#0b151b] p-4 shadow-[0_35px_100px_-35px_rgba(0,0,0,0.95)] sm:p-6">
          <DialogHeader className="border-b border-cyan-400/15 pb-4 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">TukTuk · Gestión de vehículos</p>
            <DialogTitle className="text-xl font-bold text-white sm:text-2xl">Editar vehículo completo</DialogTitle>
            <DialogDescription>Corrige categoría, capacidades y servicios. Los cambios requieren motivo administrativo y quedan auditados.</DialogDescription>
          </DialogHeader>
      {open ? (
        <div className="mt-2 rounded-2xl border border-cyan-400/15 bg-[#101c21] p-3 sm:p-4">
          {details.isPending ? <p className="text-sm">Consultando ficha del vehículo…</p> : null}
          {details.isError ? (
            <p role="alert" className="text-sm text-amber-200">
              No se pudo cargar la edición. Verifica que la migración administrativa esté aplicada.
            </p>
          ) : null}
          {details.data && form ? (
            <form
              className="space-y-4"
              onSubmit={(event) => { event.preventDefault(); if (!saveDisabled) save.mutate(form); }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">Datos verificados del vehículo</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Categoría del vehículo">
                  <select className={inputClass} required value={form.category} onChange={(e) => {
                    const category = e.target.value;
                    change({ category, passengers: category === "motorcycle" ? "1" : form.passengers, acknowledged: false });
                  }}>
                    <option value="">Seleccionar</option>
                    {details.data.categories.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="Propulsión">
                  <select className={inputClass} required value={form.propulsion} onChange={(e) => change({ propulsion: e.target.value })}>
                    <option value="">Seleccionar</option>
                    {details.data.propulsions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                </Field>
                {form.category === "other" ? (
                  <Field label="Descripción de otra categoría">
                    <input className={inputClass} required maxLength={160} value={form.otherCategory} onChange={(e) => change({ otherCategory: e.target.value })} />
                  </Field>
                ) : null}
                <Field label="Marca">
                  <input className={inputClass} required maxLength={100} value={form.brand} onChange={(e) => change({ brand: e.target.value })} />
                </Field>
                <Field label="Modelo">
                  <input className={inputClass} required maxLength={100} value={form.model} onChange={(e) => change({ model: e.target.value })} />
                </Field>
                <div className="col-span-full mt-1 border-t border-cyan-400/10 pt-3 text-xs font-semibold uppercase tracking-[0.11em] text-slate-400">Datos técnicos y capacidad</div>
                <Field label="Año">
                  <input className={inputClass} type="number" min={1886} max={2200} step="1" value={form.year} onChange={(e) => change({ year: e.target.value })} />
                </Field>
                <Field label="Matrícula">
                  <input className={inputClass} maxLength={32} value={form.registration} onChange={(e) => change({ registration: e.target.value })} />
                </Field>
                <Field label="Pasajeros (sin contar al conductor)">
                  <input className={inputClass} type="number" min={0} step="1" value={form.passengers} onChange={(e) => change({ passengers: e.target.value })} />
                </Field>
                <Field label="Carga máxima (kg)">
                  <input className={inputClass} type="number" min={0} step="any" value={form.cargoKg} onChange={(e) => change({ cargoKg: e.target.value })} />
                </Field>
                {([
                  ["cargoVolume", "Volumen (m³)"],
                  ["cargoLength", "Longitud de carga (cm)"],
                  ["cargoWidth", "Ancho de carga (cm)"],
                  ["cargoHeight", "Alto de carga (cm)"],
                ] as const).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input className={inputClass} type="number" min={0} step="any" value={form[key]} onChange={(e) => change({ [key]: e.target.value })} />
                  </Field>
                ))}
                <Field label="Carrocería">
                  <input className={inputClass} maxLength={160} value={form.bodyType} onChange={(e) => change({ bodyType: e.target.value })} />
                </Field>
                <div className="col-span-full mt-1 border-t border-cyan-400/10 pt-3 text-xs font-semibold uppercase tracking-[0.11em] text-slate-400">Documentación visual</div>
                <Field label="Foto principal ya registrada">
                  <select className={inputClass} value={form.photoId} onChange={(e) => change({ photoId: e.target.value })}>
                    <option value="">Seleccionar foto obligatoria</option>
                    {details.data.photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.label}</option>)}
                  </select>
                </Field>
              </div>
              {unpublishedForSelected.length > 0 ? (
                <p role="status" className="rounded-lg border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-100">
                  Hay modalidades no publicadas para esta categoría. Corregir el vehículo no las publica ni las habilita a clientes.
                </p>
              ) : null}
              <fieldset className="rounded-lg border border-border/60 p-3">
                <legend className="px-1 text-xs font-semibold text-foreground">Servicios autorizados para el vehículo</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {details.data.service_types.map((item) => (
                    <label key={item.code} className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.services.includes(item.code)} onChange={(e) => change({
                        services: e.target.checked
                          ? [...form.services, item.code]
                          : form.services.filter((code) => code !== item.code),
                      })} />
                      {item.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              {categoryChanged ? (
                <label className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-500/[0.07] p-3 text-xs text-amber-100">
                  <input className="mt-0.5" type="checkbox" checked={form.acknowledged} onChange={(e) => change({ acknowledged: e.target.checked })} />
                  Confirmo la categoría real del vehículo y he revisado pasajeros, carga y servicios. La corrección puede cambiar las nuevas solicitudes que recibe el conductor; no modifica carreras anteriores.
                </label>
              ) : null}
              {details.data.active_job || details.data.working ? (
                <div role="alert" className="flex gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3 text-sm text-amber-100">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> La edición está bloqueada mientras el conductor esté en modo Trabajar o tenga una carrera activa o pendiente de cierre. Primero debe pasar a Descansar y finalizar las carreras.
                </div>
              ) : null}
              <Field label="Motivo administrativo obligatorio (mínimo 5 caracteres)">
                <input className={inputClass} required minLength={5} maxLength={300} value={form.reason} onChange={(e) => change({ reason: e.target.value })} />
              </Field>
              {save.isError ? <p role="alert" className="text-sm text-rose-200">No se pudo guardar. Comprueba los permisos, los servicios y si hay alguna carrera activa.</p> : null}
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" /> La operación registra los valores anteriores, los nuevos y el motivo de la corrección.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saveDisabled}>{save.isPending ? "Guardando…" : "Guardar corrección auditada"}</Button>
                <Button type="button" variant="outline" onClick={() => { setOpen(false); setForm(null); }}>Cancelar</Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
