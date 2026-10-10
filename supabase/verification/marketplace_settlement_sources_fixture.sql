-- SOLO PostgreSQL efimero en GitHub Actions. Ningun acceso a produccion.
-- Complemento del fixture reducido: reproduccion de campos y restricciones
-- de procedencia de saldo, reserva y comision existentes en Supabase real.

alter table public.wallet_transactions
  add column real_delta numeric(14,2) not null default 0,
  add column promotional_delta numeric(14,2) not null default 0,
  add column reversed_ledger_id uuid;

alter table public.commission_reservations
  add column real_reserved_amount numeric(14,2) not null default 0,
  add column promotional_reserved_amount numeric(14,2) not null default 0;

alter table public.wallet_transactions
  add constraint test_wallet_sources_sum check (real_delta + promotional_delta = amount_delta),
  add constraint test_wallet_source_sign check (
    (transaction_type='topup' and real_delta>0 and promotional_delta=0)
    or (transaction_type='referral_credit' and real_delta=0 and promotional_delta>0)
    or (transaction_type='commission' and real_delta<=0 and promotional_delta<=0)
  );

alter table public.commission_reservations
  add constraint test_reservation_source_sum check (
    real_reserved_amount>=0 and promotional_reserved_amount>=0
    and real_reserved_amount+promotional_reserved_amount=amount
  );

create table public.topups(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  amount numeric(14,2) not null,
  currency text not null default 'CUP',
  status text not null default 'requested'
);

-- Unico asiento de apertura ficticio: financia el saldo de 1000 del fixture.
-- Se inserta antes de activar el clasificador para evitar simular una recarga.
insert into public.wallet_transactions(
  project_id,user_id,currency,transaction_type,amount_delta,balance_after,
  source_type,source_id,idempotency_key,real_delta,promotional_delta
) values(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'CUP','topup',1000,1000,'topup','apertura-ficticia',gen_random_uuid(),1000,0
);

-- El fixture mantiene un saldo en public.wallets solo para la prueba.
-- En el sistema real, los saldos se proyectan desde los movimientos.
create or replace function app_private.wallet_apply_debit() returns trigger
language plpgsql as $$
declare prior numeric;
begin
  select balance into prior from public.wallets
  where project_id=new.project_id and user_id=new.user_id for update;
  if not found then raise exception 'MARKETPLACE_WALLET_NOT_FOUND'; end if;
  if new.balance_after <> prior + new.amount_delta or new.balance_after < 0 then
    raise exception 'WALLET_BALANCE_MISMATCH';
  end if;
  update public.wallets set balance=new.balance_after
    where project_id=new.project_id and user_id=new.user_id;
  return new;
end $$;

-- El fixture basico crea reservas sin procedencia. Para este ensayo
-- las nuevas reservas ordinarias se atribuyen a dinero real.
-- El escenario promocional la cambia antes del cargo para probar su ruta.
create or replace function app_private.test_allocate_reservation_sources()
returns trigger language plpgsql as $$
begin
  new.real_reserved_amount:=new.amount;
  new.promotional_reserved_amount:=0;
  return new;
end $$;
create trigger test_allocate_reservation_sources
before insert on public.commission_reservations
for each row execute function app_private.test_allocate_reservation_sources();
