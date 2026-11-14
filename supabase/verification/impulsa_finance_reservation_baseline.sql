-- Read-only production function baseline for disposable tests.
CREATE OR REPLACE FUNCTION app_private.marketplace_attribute_commission_reservation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
