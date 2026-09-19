-- B9.2: extend the authenticated wallet projection without exposing ledger tables.
do $$
declare dependent_count integer;
begin
  select count(*) into dependent_count
  from pg_depend d
  where d.refobjid='public.get_my_marketplace_wallet()'::regprocedure
    and d.deptype='n';
  if dependent_count <> 0 then
    raise exception 'GET_MY_MARKETPLACE_WALLET_HAS_DEPENDENCIES';
  end if;
end $$;

drop function public.get_my_marketplace_wallet();

create function public.get_my_marketplace_wallet()
returns table(
  currency text,
  total_balance numeric,
  reserved_balance numeric,
  available_balance numeric,
  initial_deposit_confirmed boolean,
  initial_deposit_confirmed_at timestamptz,
  initial_deposit_amount numeric,
  initial_minimum_snapshot numeric,
  current_initial_minimum_deposit numeric,
  commission_rate numeric
)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; configured_minimum numeric; configured_commission numeric;
  total numeric; reserved numeric;
begin
  if actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select p.id,s.initial_minimum_deposit,s.commission_rate into pid,configured_minimum,configured_commission
  from public.projects p join public.project_marketplace_financial_settings s on s.project_id=p.id
  where p.slug='tuktuk-control';
  if pid is null then raise exception 'TUKTUK_PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  total:=coalesce(app_private.marketplace_wallet_total_balance(pid,actor),0);
  reserved:=coalesce(app_private.marketplace_wallet_reserved_balance(pid,actor),0);
  return query
  select coalesce(w.currency,'CUP'),total,reserved,total-reserved,
    w.initial_deposit_confirmed_at is not null,w.initial_deposit_confirmed_at,w.initial_deposit_amount,
    w.initial_minimum_snapshot,configured_minimum,configured_commission
  from (select 1) singleton
  left join public.wallets w on w.project_id=pid and w.user_id=actor;
end;
$$;

revoke all on function public.get_my_marketplace_wallet() from public,anon;
grant execute on function public.get_my_marketplace_wallet() to authenticated;
