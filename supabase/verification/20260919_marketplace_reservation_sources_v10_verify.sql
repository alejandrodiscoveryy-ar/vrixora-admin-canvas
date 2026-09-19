-- SOLO LECTURA; ejecutar exclusivamente contra BD AISLADA con R7-R10 aplicadas.
-- NO es una prueba de escenarios transaccionales ni autoriza produccion.
-- Fallar si faltan columnas, triggers, contratos o hay saldos incoherentes.
do $$
declare violations bigint;
begin
  if to_regprocedure('app_private.marketplace_attribute_commission_reservation()') is null
    or to_regprocedure('app_private.marketplace_classify_wallet_transaction()') is null
    or to_regprocedure('app_private.marketplace_wallet_source_balances(uuid,uuid)') is null
    or to_regprocedure('public.admin_list_marketplace_wallet_sources(uuid,integer,timestamptz,uuid)') is null then
    raise exception 'V10_MISSING_FUNCTIONS';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema='public' and table_name='commission_reservations'
        and column_name in ('real_reserved_amount','promotional_reserved_amount'))<>2 then
    raise exception 'V10_MISSING_COLUMNS';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid='public.commission_reservations'::regclass
        and t.tgname='commission_reservations_attribute_sources'
        and not t.tgisinternal and t.tgenabled<>'D') then
    raise exception 'V10_RESERVATION_TRIGGER_INACTIVE';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid='public.wallet_transactions'::regclass
        and t.tgname='wallet_transactions_classify_sources'
        and not t.tgisinternal and t.tgenabled<>'D') then
    raise exception 'V10_LEDGER_TRIGGER_INACTIVE';
  end if;
  select count(*) into violations from public.commission_reservations r
    where r.real_reserved_amount<0 or r.promotional_reserved_amount<0
      or r.real_reserved_amount+r.promotional_reserved_amount<>r.amount;
  if violations<>0 then raise exception 'V10_INVALID_HOLDS: %',violations; end if;
  select count(*) into violations from public.wallet_transactions t
    where t.real_delta+t.promotional_delta<>t.amount_delta;
  if violations<>0 then raise exception 'V10_INVALID_LEDGER: %',violations; end if;
  select count(*) into violations from public.wallets w
    cross join lateral app_private.marketplace_wallet_source_balances(w.project_id,w.user_id) s
    where s.real_balance+s.promotional_balance
      <> app_private.marketplace_wallet_total_balance(w.project_id,w.user_id)
       or s.real_reserved_balance+s.promotional_reserved_balance
      <> app_private.marketplace_wallet_reserved_balance(w.project_id,w.user_id)
       or s.real_available_balance<0 or s.promotional_available_balance<0;
  if violations<>0 then raise exception 'V10_INVALID_BALANCES: %',violations; end if;
end $$;
-- Integracion transaccional AUN PENDIENTE en copia aislada: deposito valido/no valido,
-- primer viaje real, dos reservas, premio posterior, cobro en orden inverso,
-- cancelacion/release, incidencia completed/cancelled, reversion y carrera.
