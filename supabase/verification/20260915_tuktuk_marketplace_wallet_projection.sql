-- Static B9.2 verification. Financial concurrency examples remain Block 12 dynamic debt.
do $$
declare definition text; result_columns text[];
begin
  if to_regprocedure('public.get_my_marketplace_wallet()') is null then raise exception 'wallet RPC missing'; end if;
  select array_agg(a.attname order by a.attnum) into result_columns
  from pg_proc p join pg_type t on t.oid=p.prorettype join pg_attribute a on a.attrelid=t.typrelid
  where p.oid='public.get_my_marketplace_wallet()'::regprocedure and a.attnum>0 and not a.attisdropped;
  if result_columns <> array['currency','total_balance','reserved_balance','available_balance','initial_deposit_confirmed','initial_deposit_confirmed_at','initial_deposit_amount','initial_minimum_snapshot','current_initial_minimum_deposit','commission_rate'] then raise exception 'wallet RPC columns incorrect: %',result_columns; end if;
  select pg_get_functiondef('public.get_my_marketplace_wallet()'::regprocedure) into definition;
  if definition !~ 'auth.uid\(\)' or definition ~ 'target_user_id' or definition !~ 'marketplace_wallet_reserved_balance' or definition !~ 'total-reserved' then raise exception 'wallet projection implementation incorrect'; end if;
  if has_function_privilege('anon','public.get_my_marketplace_wallet()','EXECUTE') or not has_function_privilege('authenticated','public.get_my_marketplace_wallet()','EXECUTE') then raise exception 'wallet RPC grants incorrect'; end if;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name in ('wallets','wallet_transactions','commission_reservations') and grantee='authenticated' and privilege_type='SELECT') then raise exception 'direct wallet select grant detected'; end if;
end $$;

-- Block 12 dynamic debt: no wallet 0/0/0; 500 topup; open/consumed/released accumulated reservations;
-- referral credit without initial-deposit confirmation; concurrent acceptance coherence.
