import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Coins, Gift, Search, UsersRound, Wallet } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ReferredPerson = {
  relationship_id: string;
  referred_user_id: string;
  referred_name: string;
  referral_code: string | null;
  referred_at: string;
  driver_status: string | null;
  settled_jobs: number;
  fare_cup: number | null;
  real_commissions_cup: number | null;
  promotional_commissions_cup: number | null;
  referral_credit_cup: number | null;
};

type Referrer = {
  referrer_user_id: string;
  referrer_name: string;
  referred_count: number;
  driver_profiles: number;
  productive_referrals: number;
  settled_jobs: number;
  fare_cup: number | null;
  real_commissions_cup: number | null;
  promotional_commissions_cup: number | null;
  referral_credit_cup: number | null;
  people: ReferredPerson[];
};

type ReferralNetwork = {
  can_view_financial: boolean;
  summary: {
    referrers: number;
    referred: number;
    driver_profiles: number;
    productive_referrals: number;
    settled_jobs: number;
    fare_cup: number | null;
    real_commissions_cup: number | null;
    promotional_commissions_cup: number | null;
    referral_credit_cup: number | null;
  };
  referrers: Referrer[];
};

const money = (amount: number | null | undefined) =>
  amount == null
    ? "Restringido"
    : new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(amount) + " CUP";

const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(parsed);
};

const driverStatus = (status: string | null) => {
  if (status === null) return "Sin perfil de conductor";
  if (status === "active") return "Perfil activo";
  if (status === "suspended") return "Perfil suspendido";
  if (status === "incomplete") return "Perfil incompleto";
  return "Perfil: " + status;
};

export default function CommercialReferralsPanel({ projectId }: { projectId: string }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showEveryPerson, setShowEveryPerson] = useState<Record<string, boolean>>({});

  const network = useQuery<ReferralNetwork>({
    queryKey: ["commercial-referral-network-v1", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "admin_get_commercial_referral_network_v1",
        { target_project_id: projectId },
      );
      if (error) throw error;
      if (data === null || typeof data !== "object") {
        throw new Error("No se recibió una respuesta válida de referidos.");
      }
      return data as unknown as ReferralNetwork;
    },
  });

  const groups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("es");
    return (network.data?.referrers ?? [])
      .map((referrer) => {
        const referrerMatches = referrer.referrer_name.toLocaleLowerCase("es").includes(needle);
        const people = !needle || referrerMatches
          ? referrer.people
          : referrer.people.filter(
              (person) =>
                person.referred_name.toLocaleLowerCase("es").includes(needle) ||
                (person.referral_code ?? "").toLocaleLowerCase("es").includes(needle),
            );
        return { referrer, people };
      })
      .filter(({ referrer, people }) =>
        !needle || referrer.referrer_name.toLocaleLowerCase("es").includes(needle) || people.length > 0,
      );
  }, [network.data, search]);

  if (network.isPending) {
    return <div className="rounded-2xl border border-border/60 p-6 text-sm text-muted-foreground">Consultando la red de referidos…</div>;
  }
  if (network.isError || !network.data) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-5">
        <p className="font-semibold">No se pudo consultar la red de referidos.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {network.error instanceof Error ? network.error.message : "Comprueba la conexión o los permisos."}
        </p>
        <Button variant="outline" className="mt-3" onClick={() => void network.refetch()}>Reintentar</Button>
      </div>
    );
  }

  const payload = network.data;
  const summary = payload.summary;
  const canViewMoney = payload.can_view_financial;
  const tiles = [
    { label: "Conductores que refirieron", value: String(summary.referrers), icon: UsersRound },
    { label: "Personas referidas", value: String(summary.referred), icon: UsersRound },
    { label: "Con perfil de conductor", value: String(summary.driver_profiles), icon: UsersRound },
    { label: "Referidos con carreras reales", value: String(summary.productive_referrals), icon: ChevronRight },
    { label: "Comisiones desde saldo real", value: money(summary.real_commissions_cup), icon: Coins },
    { label: "Comisiones desde saldo promocional", value: money(summary.promotional_commissions_cup), icon: Wallet },
    { label: "Premios acreditados a referentes", value: money(summary.referral_credit_cup), icon: Gift },
  ];

  return (
    <section className="relative space-y-5 rounded-[26px] border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.055] via-background/85 to-cyan-500/[0.035] p-3 sm:p-5">
      <div className="rounded-[22px] border border-violet-400/20 bg-background/75 p-4 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">Comercial · Referidos</p>
        <h2 className="mt-1 text-xl font-semibold">Quién refirió a quién</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Abre un conductor para ver a cada persona que invitó, sus carreras reales y lo que generaron para TUKTUK.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Se excluyen carreras y vínculos de prueba. Las comisiones promocionales no son dinero nuevo recibido;
          los premios por invitaciones son créditos para el referente, no ingresos de TUKTUK.
        </p>
        {!canViewMoney && (
          <p className="mt-3 text-xs text-amber-300">
            Los importes están ocultos: se requiere permiso de Finanzas para consultarlos.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }) => (
          <div key={label} className="min-w-0 rounded-2xl border border-violet-400/15 bg-background/75 p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{label}</span><Icon className="h-4 w-4 shrink-0 text-violet-300" />
            </div>
            <div className="mt-2 break-words text-xl font-bold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Red de conductores</h3>
          <p className="text-xs text-muted-foreground">Todos los vínculos de cada referente, sin límite de uno o dos invitados.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar referente o referido" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar referente, referido o código" className="pl-9" />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-border/60 p-6 text-sm text-muted-foreground">
          {search.trim() ? "No hay coincidencias para esta búsqueda." : "Todavía no hay vínculos registrados."}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ referrer, people }, index) => {
            const isOpen = expanded[referrer.referrer_user_id] ?? index === 0;
            const showAll = showEveryPerson[referrer.referrer_user_id] || Boolean(search.trim());
            const visiblePeople = showAll ? people : people.slice(0, 8);
            return (
              <article key={referrer.referrer_user_id} className="overflow-hidden rounded-2xl border border-violet-400/20 bg-background/80">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-violet-400/5"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded((current) => ({
                    ...current, [referrer.referrer_user_id]: !(current[referrer.referrer_user_id] ?? index === 0),
                  }))}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {isOpen ? <ChevronDown className="h-5 w-5 shrink-0 text-violet-300" /> : <ChevronRight className="h-5 w-5 shrink-0 text-violet-300" />}
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{referrer.referrer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {referrer.referred_count} referidos · {referrer.driver_profiles} perfiles · {referrer.productive_referrals} con carreras reales
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Comisión real generada</p>
                    <p className="font-semibold tabular-nums text-emerald-300">{money(referrer.real_commissions_cup)}</p>
                    <p className="text-xs text-muted-foreground">Premios al referente: {money(referrer.referral_credit_cup)}</p>
                  </div>
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-border/55 p-3 sm:p-4">
                    {visiblePeople.map((person) => (
                      <div key={person.relationship_id} className="grid gap-3 rounded-xl border border-border/50 bg-background/65 p-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold">{person.referred_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{driverStatus(person.driver_status)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Referido: {date(person.referred_at)} · Código: {person.referral_code || "No consta"}
                          </p>
                        </div>
                        <div className="text-xs">
                          <p className="text-muted-foreground">Carreras reales liquidadas</p>
                          <p className="mt-1 font-semibold tabular-nums">{person.settled_jobs}</p>
                          <p className="mt-2 text-muted-foreground">Valor de sus servicios</p>
                          <p className="mt-1 font-medium tabular-nums">{money(person.fare_cup)}</p>
                        </div>
                        <div className="text-xs">
                          <p className="text-muted-foreground">Comisión real TUKTUK</p>
                          <p className="mt-1 font-semibold tabular-nums text-emerald-300">{money(person.real_commissions_cup)}</p>
                          <p className="mt-1 text-muted-foreground">Comisión promocional: {money(person.promotional_commissions_cup)}</p>
                          <p className="mt-1 text-muted-foreground">Premio al referente: {money(person.referral_credit_cup)}</p>
                        </div>
                      </div>
                    ))}
                    {people.length > 8 && !search.trim() && (
                      <Button variant="outline" size="sm" onClick={() => setShowEveryPerson((current) => ({
                        ...current, [referrer.referrer_user_id]: !current[referrer.referrer_user_id],
                      }))}>
                        {showAll ? "Mostrar menos" : "Ver las " + people.length + " personas referidas"}
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Mostrando {visiblePeople.length} de {people.length} personas de este referente.
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}