-- R10: procedencia FIJA por cada reserva de comision.
-- Solo esquema y funciones. No crea asientos, no concede premios ni toca licencias.
-- Requiere R7 -> R8 -> R9; nunca reescribe migraciones previas.
-- La primera instalacion exige cero reservas en TODOS los proyectos para evitar
-- inventar una procedencia historica. Si falla, DETENER y auditar; no limpiar datos.
do $$
begin
  if to_regprocedure('app_private.marketplace_classify_wallet_transaction()') is null
    or to_regprocedure('app_private.marketplace_wallet_source_balances(uuid,uuid)') is null
    or to_regprocedure('public.admin_list_marketplace_wallet_sources(uuid,integer,timestamptz,uuid)') is null
    or not exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='wallet_transactions' and column_name='promotional_delta') then
    raise exception 'R10_REQUIRES_R8_AND_R9';
  end if;
  if exists(select 1 from public.commission_reservations limit 1) then
    raise exception 'R10_EXISTING_RESERVATIONS_REQUIRE_EXPLICIT_SOURCE_RECONCILIATION';
  end if;
end $$;

alter table public.commission_reservations
  add column real_reserved_amount numeric(14,2) not null default 0,
  add column promotional_reserved_amount numeric(14,2) not null default 0,
  add constraint commission_reservations_source_sum_check
    check(real_reserved_amount>=0 and promotional_reserved_amount>=0
      and real_reserved_amount+promotional_reserved_amount=amount);

-- Conserva el control de inmutabilidad original y protege los dos campos nuevos.
create or replace function app_private.protect_commission_reservation_provenance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.project_id is distinct from old.project_id
    or new.job_id is distinct from old.job_id or new.user_id is distinct from old.user_id
    or new.currency is distinct from old.currency or new.final_price_snapshot is distinct from old.final_price_snapshot
    or new.commission_rate_snapshot is distinct from old.commission_rate_snapshot or new.amount is distinct from old.amount
    or new.real_reserved_amount is distinct from old.real_reserved_amount
    or new.promotional_reserved_amount is distinct from old.promotional_reserved_amount
    or new.opened_at is distinct from old.opened_at or new.created_at is distinct from old.created_at then
    raise exception 'COMMISSION_RESERVATION_PROVENANCE_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Se ejecuta dentro del INSERT ya existente en accept_job, despues de
-- bloquear la billetera. Refuerza el bloqueo por si surge otro flujo futuro.
create function app_private.marketplace_attribute_commission_reservation()
returns trigger language plpgsql security definer set search_path='' as $$
declare wallet_currency text; available_real numeric; available_promo numeric;
  promo_part numeric;
begin
  if new.status<>'open' or new.real_reserved_amount is distinct from 0
    or new.promotional_reserved_amount is distinct from 0 then
    raise exception 'COMMISSION_RESERVATION_SOURCE_SERVER_ONLY' using errcode='42501';
  end if;
  select w.currency into wallet_currency from public.wallets w
    where w.project_id=new.project_id and w.user_id=new.user_id for update;
  if not found or new.currency is distinct from wallet_currency or wallet_currency<>'CUP' then
    raise exception 'COMMISSION_RESERVATION_WALLET_INVALID' using errcode='22023';
  end if;
  select b.real_available_balance,b.promotional_available_balance
    into available_real,available_promo
  from app_private.marketplace_wallet_source_balances(new.project_id,new.user_id) b;
  if available_real is null or available_promo is null
    or available_real<0 or available_promo<0
    or available_real+available_promo<new.amount then
    raise exception 'INSUFFICIENT_MARKETPLACE_WALLET_BALANCE' using errcode='22023';
  end if;
  promo_part:=least(available_promo,new.amount);
  new.promotional_reserved_amount:=promo_part;
  new.real_reserved_amount:=new.amount-promo_part;
  return new;
end;
$$;
revoke all on function app_private.marketplace_attribute_commission_reservation() from public,anon,authenticated;
create trigger commission_reservations_attribute_sources
  before insert on public.commission_reservations for each row
  execute function app_private.marketplace_attribute_commission_reservation();

-- El clasificador de R8 sigue validando depositos confirmables,
-- recompensa promocional y reversion exacta del asiento original.
-- Solo cambia la rama COMISION para consumir el reparto congelado.
create or replace function app_private.marketplace_classify_wallet_transaction()
returns trigger language plpgsql security definer set search_path='' as $$
declare wallet_currency text; real_before numeric; promo_before numeric; total_before numeric;
  debit numeric; original_tx public.wallet_transactions%rowtype;
  active_reservation public.commission_reservations%rowtype; other_real_reserved numeric; other_promo_reserved numeric;
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
    -- La reserva conserva su procedencia desde la aceptacion. Nunca se reasigna
    -- en la liquidacion, incluso si despues entran nuevas recargas o premios.
    if active_reservation.real_reserved_amount < 0
      or active_reservation.promotional_reserved_amount < 0
      or active_reservation.real_reserved_amount + active_reservation.promotional_reserved_amount <> debit then
      raise exception 'WALLET_SOURCE_RESERVATION_SPLIT_INVALID' using errcode='22023';
    end if;
    select coalesce(sum(r.real_reserved_amount),0),coalesce(sum(r.promotional_reserved_amount),0)
      into other_real_reserved,other_promo_reserved
    from public.commission_reservations r
    where r.project_id=new.project_id and r.user_id=new.user_id
      and r.status='open' and r.id<>active_reservation.id;
    if real_before-active_reservation.real_reserved_amount < other_real_reserved
      or promo_before-active_reservation.promotional_reserved_amount < other_promo_reserved then
      raise exception 'WALLET_SOURCE_OTHER_RESERVATIONS_UNFUNDED' using errcode='22023';
    end if;
    new.real_delta:=-active_reservation.real_reserved_amount;
    new.promotional_delta:=-active_reservation.promotional_reserved_amount;

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

create or replace function app_private.marketplace_wallet_source_balances(target_project_id uuid,target_user_id uuid)
returns table(real_balance numeric,promotional_balance numeric,
  real_reserved_balance numeric,promotional_reserved_balance numeric,
  real_available_balance numeric,promotional_available_balance numeric)
language plpgsql stable security definer set search_path='' as $$
declare real_total numeric; promo_total numeric; promo_hold numeric; real_hold numeric;
begin
 select coalesce(sum(t.real_delta),0),coalesce(sum(t.promotional_delta),0)
   into real_total,promo_total from public.wallet_transactions t
   where t.project_id=target_project_id and t.user_id=target_user_id;
 select coalesce(sum(r.real_reserved_amount),0),coalesce(sum(r.promotional_reserved_amount),0)
   into real_hold,promo_hold from public.commission_reservations r
   where r.project_id=target_project_id and r.user_id=target_user_id and r.status='open';
 if real_total<0 or promo_total<0 or real_hold<0 or promo_hold<0
   or real_hold>real_total or promo_hold>promo_total
   or real_hold+promo_hold<>app_private.marketplace_wallet_reserved_balance(target_project_id,target_user_id) then
   raise exception 'WALLET_SOURCE_RESERVATION_INTEGRITY_FAILURE' using errcode='22023';
 end if;
 return query select real_total,promo_total,real_hold,promo_hold,real_total-real_hold,promo_total-promo_hold;
end;
$$;

-- Al no crear funciones publicas nuevas ni cambiar firmas, el contrato
-- Flutter y el RPC administrativo R9 mantienen sus seis campos de desglose.
-- Las devoluciones R8 siguen restaurando exactamente real_delta y promotional_delta
-- del cargo original mediante reversed_ledger_id.
