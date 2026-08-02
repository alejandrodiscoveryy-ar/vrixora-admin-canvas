create index if not exists billing_receipts_created_by_idx
  on public.billing_receipts(created_by);

create index if not exists billing_receipts_user_id_idx
  on public.billing_receipts(user_id);

create index if not exists licenses_last_payment_id_idx
  on public.licenses(last_payment_id)
  where last_payment_id is not null;
