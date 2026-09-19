-- R8: separar procedencia real/promocional en asientos inmutables.
-- NO genera movimientos, NO realiza conversiones historicas, NO extiende licencias.
-- Requiere R1/R1.1/R2 y R7 antes de esta migracion.
-- Abortar antes de DDL si aparecio cualquier asiento desde la auditoria.
do $$
begin
  if exists(select 1 from public.wallet_transactions limit 1) then
    raise exception 'R8_REQUIRES_LIBRO_MAYOR_VACIO: revisar datos y preparar migracion de clasificacion';
  end if;
  if not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='marketplace_legacy_referral_entitlements') then
    raise exception 'R8_REQUIRES_R7';
  end if;
end $$;

-- Las columnas pertenecen al propio libro mayor; su inmutabilidad ya esta
-- protegida por wallet_transactions_immutable. No es un segundo saldo mutable.
alter table public.wallet_transactions
  add column real_delta numeric(14,2) not null default 0,
  add column promotional_delta numeric(14,2) not null default 0,
  add column reversed_ledger_id uuid,
  add constraint wallet_transactions_source_sum_check check (real_delta+promotional_delta=amount_delta),
  add constraint wallet_transactions_source_sign_check check (
    (transaction_type='topup' and real_delta>0 and promotional_delta=0 and reversed_ledger_id is null)
    or (transaction_type='referral_credit' and real_delta=0 and promotional_delta>0 and reversed_ledger_id is null)
    or (transaction_type='commission' and real_delta<=0 and promotional_delta<=0 and reversed_ledger_id is null)
    or (transaction_type='reversal' and real_delta>=0 and promotional_delta>=0 and reversed_ledger_id is not null)
  ),
  add constraint wallet_transactions_reversed_ledger_fkey
    foreign key(project_id,user_id,reversed_ledger_id)
      references public.wallet_transactions(project_id,user_id,id) on delete restrict;
create unique index wallet_transactions_one_reversal_per_original
  on public.wallet_transactions(project_id,reversed_ledger_id)
  where reversed_ledger_id is not null;

-- El flujo actual de cada cobro ya bloquea wallets FOR UPDATE. El trigger
-- revalida y adquiere ese bloqueo para que ningun asiento pueda saltarselo.
create or replace function app_private.marketplace_classify_wallet_transaction()
returns trigger language plpgsql security definer set search_path='' as $$
declare wallet_currency text; real_before numeric; promo_before numeric; total_before numeric;
  debit numeric; promo_part numeric; original_tx public.wallet_transactions%rowtype;
  active_reservation public.commission_reservations%rowtype; reserved_total numeric;
  topup_record public.topups%rowtype;
begin
  select w.currency into wallet_currency from public.wallets w
  where w.project_id=new.project_id and w.user_id=new.user_id for update;
  if not found then raise exception 'WALLET_SOURCE_WALLET_NOT_FOUND' using errcode='22023'; end if;
  if new.currency<>wallet_currency or new.currency<>'CUP' then
    raise exception 'WALLET_SOURCE_CURRENCY_MISMATCH' using errcode='22023';
  end if;
  if new.real_delta<>0 or new.promotional_delta<>0 or new.reversed_ledger_id is not null then
    raise exception 'WALLET_SOURCE_FIELDS_SERVER_ONLY' using errcode='42501';
  end if;
  select coalesce(sum(t.real_delta),0),coalesce(sum(t.promotional_delta),0),coalesce(sum(t.amount_delta),0)
    into real_before,promo_before,total_before
  from public.wallet_transactions t
  where t.project_id=new.project_id and t.user_id=new.user_id;
  if real_before<0 or promo_before<0 or real_before+promo_before<>total_before then
    raise exception 'WALLET_SOURCE_PREVIOUS_BALANCE_CORRUPT' using errcode='22023';
  end if;
  if new.balance_after<>total_before+new.amount_delta then
    raise exception 'WALLET_SOURCE_LEDGER_BALANCE_MISMATCH' using errcode='22023';
  end if;

  if new.transaction_type='topup' then
    if new.amount_delta<=0 or new.source_type<>'topup' then
      raise exception 'WALLET_SOURCE_INVALID_TOPUP' using errcode='22023';
    end if;
    select * into topup_record from public.topups t
    where t.project_id=new.project_id and t.user_id=new.user_id
      and t.id::text=new.source_id and t.status='requested' and t.amount=new.amount_delta
      and t.currency=new.currency;
    if not found then raise exception 'WALLET_SOURCE_TOPUP_NOT_VERIFIED' using errcode='22023'; end if;
    new.real_delta:=new.amount_delta;

  elsif new.transaction_type='referral_credit' then
    if new.amount_delta<=0 or new.source_type not in ('referral_reward','legacy_referral_transition') then
      raise exception 'WALLET_SOURCE_INVALID_PROMOTIONAL_CREDIT' using errcode='22023';
    end if;
    new.promotional_delta:=new.amount_delta;

  elsif new.transaction_type='commission' then
    if new.amount_delta>=0 or new.source_type<>'job_commission' then
      raise exception 'WALLET_SOURCE_INVALID_COMMISSION' using errcode='22023';
    end if;
    debit:=-new.amount_delta;
    select * into active_reservation from public.commission_reservations r
    where r.project_id=new.project_id and r.user_id=new.user_id
      and r.job_id::text=new.source_id and r.status='open' and r.amount=debit;
    if not found then raise exception 'WALLET_SOURCE_RESERVATION_NOT_FOUND' using errcode='22023'; end if;
    select coalesce(sum(r.amount),0) into reserved_total from public.commission_reservations r
    where r.project_id=new.project_id and r.user_id=new.user_id and r.status='open';
    if total_before-debit < reserved_total-debit then
      raise exception 'WALLET_SOURCE_OTHER_RESERVATIONS_UNFUNDED' using errcode='22023';
    end if;
    promo_part:=least(promo_before,debit);
    new.promotional_delta:=-promo_part;
    new.real_delta:=-(debit-promo_part);

  elsif new.transaction_type='reversal' then
    if new.amount_delta<=0 or new.source_type<>'job_commission_reversal'
      or nullif(new.metadata->>'original_ledger_transaction_id','') is null then
      raise exception 'WALLET_SOURCE_REVERSAL_REFERENCE_REQUIRED' using errcode='22023';
    end if;
    select * into original_tx from public.wallet_transactions t
    where t.id=(new.metadata->>'original_ledger_transaction_id')::uuid
      and t.project_id=new.project_id and t.user_id=new.user_id
      and t.transaction_type='commission' and t.source_type='job_commission'
      and t.source_id=new.source_id;
    if not found or new.amount_delta<>-original_tx.amount_delta then
      raise exception 'WALLET_SOURCE_REVERSAL_MISMATCH' using errcode='22023';
    end if;
    new.reversed_ledger_id:=original_tx.id;
    new.real_delta:=-original_tx.real_delta;
    new.promotional_delta:=-original_tx.promotional_delta;

  else
    -- No hay RPC de ajuste autorizado en el contrato actual. Si se agrega,
    -- sera necesaria una clasificacion explicita y auditable antes de activarlo.
    raise exception 'WALLET_SOURCE_UNCLASSIFIED_TRANSACTION' using errcode='22023';
  end if;
  if new.real_delta+new.promotional_delta<>new.amount_delta
    or real_before+new.real_delta<0 or promo_before+new.promotional_delta<0 then
    raise exception 'WALLET_SOURCE_NEGATIVE_OR_UNBALANCED' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function app_private.marketplace_classify_wallet_transaction() from public,anon,authenticated;
create trigger wallet_transactions_classify_sources
  before insert on public.wallet_transactions for each row
  execute function app_private.marketplace_classify_wallet_transaction();

-- Las reservas solo inmovilizan dinero para comisiones. La prioridad de
-- imputacion, tanto para reserva orientativa como para consumo, es PROMO -> REAL.
create or replace function app_private.marketplace_wallet_source_balances(target_project_id uuid,target_user_id uuid)
returns table(real_balance numeric,promotional_balance numeric,
  real_reserved_balance numeric,promotional_reserved_balance numeric,
  real_available_balance numeric,promotional_available_balance numeric)
language plpgsql stable security definer set search_path='' as $$
declare real_total numeric; promo_total numeric; reserved_total numeric;
  promo_hold numeric; real_hold numeric;
begin
 select coalesce(sum(t.real_delta),0),coalesce(sum(t.promotional_delta),0)
   into real_total,promo_total from public.wallet_transactions t
   where t.project_id=target_project_id and t.user_id=target_user_id;
 reserved_total:=app_private.marketplace_wallet_reserved_balance(target_project_id,target_user_id);
 if real_total<0 or promo_total<0 or reserved_total>real_total+promo_total then
   raise exception 'WALLET_SOURCE_RESERVATION_INTEGRITY_FAILURE' using errcode='22023';
 end if;
 promo_hold:=least(promo_total,reserved_total);
 real_hold:=reserved_total-promo_hold;
 return query select real_total,promo_total,real_hold,promo_hold,real_total-real_hold,promo_total-promo_hold;
end;
$$;
revoke all on function app_private.marketplace_wallet_source_balances(uuid,uuid) from public,anon,authenticated;

-- Contrato existente: solo se anaden columnas al final, sin renombrar ni
-- cambiar las primeras diez. Comprobar dependencias antes de sustituir.
do $$
declare dependencies integer;
begin
  select count(*) into dependencies from pg_catalog.pg_depend d
  where d.refobjid='public.get_my_marketplace_wallet()'::regprocedure and d.deptype='n';
  if dependencies<>0 then raise exception 'R8_WALLET_RPC_HAS_DEPENDENCIES'; end if;
end $$;
drop function public.get_my_marketplace_wallet();
create function public.get_my_marketplace_wallet()
returns table(currency text,total_balance numeric,reserved_balance numeric,available_balance numeric,
  initial_deposit_confirmed boolean,initial_deposit_confirmed_at timestamptz,
  initial_deposit_amount numeric,initial_minimum_snapshot numeric,
  current_initial_minimum_deposit numeric,commission_rate numeric,
  real_balance numeric,promotional_balance numeric,
  real_reserved_balance numeric,promotional_reserved_balance numeric,
  real_available_balance numeric,promotional_available_balance numeric)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; minimum_amount numeric; rate numeric;
  total numeric; reserved numeric;
  r numeric; p numeric; rr numeric; pr numeric; ra numeric; pa numeric;
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select project.id,setting.initial_minimum_deposit,setting.commission_rate
   into pid,minimum_amount,rate from public.projects project
   join public.project_marketplace_financial_settings setting on setting.project_id=project.id
   where project.slug='tuktuk-control';
 if pid is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode='P0002'; end if;
 total:=app_private.marketplace_wallet_total_balance(pid,actor);
 reserved:=app_private.marketplace_wallet_reserved_balance(pid,actor);
 select b.real_balance,b.promotional_balance,b.real_reserved_balance,b.promotional_reserved_balance,
   b.real_available_balance,b.promotional_available_balance into r,p,rr,pr,ra,pa
   from app_private.marketplace_wallet_source_balances(pid,actor) b;
 if r+p<>total or rr+pr<>reserved or ra+pa<>total-reserved then
   raise exception 'WALLET_SOURCE_PROJECTION_MISMATCH' using errcode='22023';
 end if;
 return query select coalesce(w.currency,'CUP'),total,reserved,total-reserved,
   w.initial_deposit_confirmed_at is not null,w.initial_deposit_confirmed_at,
   w.initial_deposit_amount,w.initial_minimum_snapshot,minimum_amount,rate,
   r,p,rr,pr,ra,pa
 from (select 1) singleton left join public.wallets w on w.project_id=pid and w.user_id=actor;
end;
$$;
revoke all on function public.get_my_marketplace_wallet() from public,anon;
grant execute on function public.get_my_marketplace_wallet() to authenticated;
