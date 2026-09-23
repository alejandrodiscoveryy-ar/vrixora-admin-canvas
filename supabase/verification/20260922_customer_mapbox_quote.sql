-- Run against a disposable local database after applying migrations and
-- configuring the approved active Marketplace tariffs.
do $$
declare
  passenger_quote jsonb;
  courier_quote jsonb;
begin
  passenger_quote := public.preview_marketplace_customer_quote(
    'passenger', 1, null, null, 9, 0, false, false, false
  );
  courier_quote := public.preview_marketplace_customer_quote(
    'courier', null, null, null, 3, 0, false, false, false
  );
  if (passenger_quote ->> 'recommended_price')::numeric <> 3900 then
    raise exception 'PASSENGER_9KM_PRICE_MISMATCH: %', passenger_quote;
  end if;
  if (courier_quote ->> 'recommended_price')::numeric <> 800 then
    raise exception 'COURIER_3KM_PRICE_MISMATCH: %', courier_quote;
  end if;
end;
$$;
