-- Datos configurables para recibir transferencias en Agencia TukTuk.
-- Solo el personal con payments.manage puede leer o modificar esta cuenta.
create table if not exists app_private.marketplace_topup_payment_destinations (
  project_id uuid primary key references public.projects(id) on delete cascade,
  card_number text not null default '',
  payment_phone text not null default '',
  whatsapp_phone text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint topup_destination_card_format check (card_number = '' or card_number ~ '^[0-9]{12,19}$'),
  constraint topup_destination_payment_phone_format check (payment_phone = '' or payment_phone ~ '^[+]?[1-9][0-9]{7,14}$'),
  constraint topup_destination_whatsapp_format check (whatsapp_phone = '' or whatsapp_phone ~ '^[+]?[1-9][0-9]{7,14}$'),
  constraint topup_destination_card_phone_pair check ((card_number = '') = (payment_phone = ''))
);
alter table app_private.marketplace_topup_payment_destinations enable row level security;
revoke all on app_private.marketplace_topup_payment_destinations from public, anon, authenticated;

create or replace function public.admin_get_marketplace_topup_payment_destination(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $body$
begin
  perform app_private.require_project_permission(target_project_id, 'payments.manage');
  return coalesce(
    (select jsonb_build_object(
       'cardNumber', card_number,
       'paymentPhone', payment_phone,
       'whatsappPhone', whatsapp_phone,
       'updatedAt', updated_at
     )
     from app_private.marketplace_topup_payment_destinations
     where project_id = target_project_id),
    jsonb_build_object('cardNumber', '', 'paymentPhone', '', 'whatsappPhone', '', 'updatedAt', null)
  );
end;
$body$;

create or replace function public.admin_set_marketplace_topup_payment_destination(
  target_project_id uuid,
  target_card_number text,
  target_payment_phone text,
  target_whatsapp_phone text
)
returns jsonb language plpgsql security definer set search_path = '' as $body$
declare
  actor uuid;
  normalized_card text := regexp_replace(coalesce(target_card_number, ''), '[^0-9]', '', 'g');
  normalized_phone text := regexp_replace(coalesce(target_payment_phone, ''), '[ ().-]', '', 'g');
  normalized_whatsapp text := regexp_replace(coalesce(target_whatsapp_phone, ''), '[ ().-]', '', 'g');
begin
  actor := app_private.require_project_permission(target_project_id, 'payments.manage');
  if (normalized_card = '') <> (normalized_phone = '') then
    raise exception 'TOPUP_DESTINATION_REQUIRES_CARD_AND_PHONE' using errcode = '22023';
  end if;
  if normalized_card <> '' and normalized_card !~ '^[0-9]{12,19}$' then
    raise exception 'INVALID_TOPUP_CARD_NUMBER' using errcode = '22023';
  end if;
  if normalized_phone <> '' and normalized_phone !~ '^[+]?[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_TOPUP_PAYMENT_PHONE' using errcode = '22023';
  end if;
  if normalized_whatsapp <> '' and normalized_whatsapp !~ '^[+]?[1-9][0-9]{7,14}$' then
    raise exception 'INVALID_TOPUP_WHATSAPP_PHONE' using errcode = '22023';
  end if;
  insert into app_private.marketplace_topup_payment_destinations (
    project_id, card_number, payment_phone, whatsapp_phone, updated_by
  ) values (
    target_project_id, normalized_card, normalized_phone, normalized_whatsapp, actor
  )
  on conflict (project_id) do update set
    card_number = excluded.card_number,
    payment_phone = excluded.payment_phone,
    whatsapp_phone = excluded.whatsapp_phone,
    updated_at = now(),
    updated_by = actor;
  return public.admin_get_marketplace_topup_payment_destination(target_project_id);
end;
$body$;

revoke all on function public.admin_get_marketplace_topup_payment_destination(uuid) from public, anon;
revoke all on function public.admin_set_marketplace_topup_payment_destination(uuid,text,text,text) from public, anon;
grant execute on function public.admin_get_marketplace_topup_payment_destination(uuid) to authenticated;
grant execute on function public.admin_set_marketplace_topup_payment_destination(uuid,text,text,text) to authenticated;
