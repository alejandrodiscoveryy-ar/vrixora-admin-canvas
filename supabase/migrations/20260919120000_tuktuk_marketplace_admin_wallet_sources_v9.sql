-- R9: proyeccion administrativa de saldo real y promocional.
-- DEPENDE DE R8. No genera asientos, no acredita CUP y no modifica licencias.
-- El RPC original admin_list_marketplace_wallets conserva su contrato.
do $$
begin
  if to_regprocedure('app_private.marketplace_wallet_source_balances(uuid,uuid)') is null then
    raise exception 'R9_REQUIRES_R8';
  end if;
end $$;

create function public.admin_list_marketplace_wallet_sources(
  target_project_id uuid,
  target_limit integer default 100,
  target_before_updated_at timestamptz default null,
  target_before_user_id uuid default null
)
returns table(
  user_id uuid,driver_display_name text,driver_phone text,currency text,
  total_balance numeric,reserved_balance numeric,available_balance numeric,
  initial_deposit_confirmed boolean,initial_deposit_confirmed_at timestamptz,
  initial_deposit_amount numeric,initial_minimum_snapshot numeric,updated_at timestamptz,
  real_balance numeric,promotional_balance numeric,
  real_reserved_balance numeric,promotional_reserved_balance numeric,
  real_available_balance numeric,promotional_available_balance numeric
)
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.view');
  perform app_private.require_project_permission(target_project_id,'payments.view');
  if (target_before_updated_at is null) <> (target_before_user_id is null) then
    raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023';
  end if;
  return query
    select w.user_id,p.display_name,p.phone,w.currency,
      app_private.marketplace_wallet_total_balance(w.project_id,w.user_id),
      app_private.marketplace_wallet_reserved_balance(w.project_id,w.user_id),
      app_private.marketplace_wallet_available_balance(w.project_id,w.user_id),
      w.initial_deposit_confirmed_at is not null,w.initial_deposit_confirmed_at,
      w.initial_deposit_amount,w.initial_minimum_snapshot,w.updated_at,
      b.real_balance,b.promotional_balance,b.real_reserved_balance,
      b.promotional_reserved_balance,b.real_available_balance,b.promotional_available_balance
    from public.wallets w
    join public.profiles p on p.id=w.user_id
    cross join lateral app_private.marketplace_wallet_source_balances(w.project_id,w.user_id) b
    where w.project_id=target_project_id
      and (target_before_updated_at is null
        or (w.updated_at,w.user_id)<(target_before_updated_at,target_before_user_id))
    order by w.updated_at desc,w.user_id desc
    limit least(greatest(coalesce(target_limit,100),1),200);
end;
$$;
revoke all on function public.admin_list_marketplace_wallet_sources(uuid,integer,timestamptz,uuid)
  from public,anon;
grant execute on function public.admin_list_marketplace_wallet_sources(uuid,integer,timestamptz,uuid)
  to authenticated;
