-- Payment references arrive after a driver creates a transfer request.
-- Preserve the original topup request and its immutable provenance.
create table if not exists app_private.marketplace_topup_received_references (
  project_id uuid not null,
  topup_id uuid not null,
  payment_reference text not null check (length(btrim(payment_reference)) between 1 and 160),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  primary key (project_id,topup_id),
  foreign key (project_id,topup_id) references public.topups(project_id,id) on delete restrict
);
alter table app_private.marketplace_topup_received_references enable row level security;
revoke all on app_private.marketplace_topup_received_references from public, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.issue_marketplace_topup_receipt(target_project_id uuid, target_topup_id uuid, target_actor uuid, target_idempotency_key uuid)
 RETURNS marketplace_financial_documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t public.topups%rowtype;
  b public.project_marketplace_billing_settings%rowtype;
  existing public.marketplace_financial_documents%rowtype;
  result public.marketplace_financial_documents%rowtype;
  issued timestamptz:=now();
  number text;
begin
  select * into existing
  from public.marketplace_financial_documents d
  where d.project_id=target_project_id
    and d.topup_id=target_topup_id
    and d.document_type='topup_receipt';

  if found then
    return existing;
  end if;

  select * into t
  from public.topups
  where project_id=target_project_id
    and id=target_topup_id
  for share;

  if not found or t.status not in ('confirmed','reconciled') then
    raise exception 'TOPUP_NOT_CONFIRMED_FOR_DOCUMENT'
      using errcode='22023';
  end if;

  select * into b
  from public.project_marketplace_billing_settings
  where project_id=target_project_id;

  if not found then
    raise exception 'MARKETPLACE_BILLING_SETTINGS_NOT_FOUND'
      using errcode='P0002';
  end if;

  number:=app_private.next_marketplace_financial_document_number(
    target_project_id,
    issued
  );

  insert into public.marketplace_financial_documents(
    project_id,user_id,topup_id,document_type,document_number,
    amount,currency,concept,payment_method,payment_reference,
    issuer_snapshot,idempotency_key,issued_at,created_by
  )
  values(
    target_project_id,
    t.user_id,
    t.id,
    'topup_receipt',
    number,
    t.amount,
    t.currency,
    'Recarga de billetera TUKTUK',
    t.method,
    coalesce(
      (select v.payment_reference from app_private.marketplace_topup_received_references v
       where v.project_id=t.project_id and v.topup_id=t.id),
      t.reference
    ),
    jsonb_build_object(
      'issuer_display_name',b.issuer_display_name,
      'issuer_tax_id',b.issuer_tax_id,
      'issuer_address',b.issuer_address,
      'project_id',b.project_id,
      'technical_financial_document',true
    ),
    target_idempotency_key,
    issued,
    target_actor
  )
  returning * into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_marketplace_topups(target_project_id uuid, target_status text DEFAULT NULL::text, target_limit integer DEFAULT 100, target_before_requested_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_before_topup_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(topup_id uuid, user_id uuid, driver_display_name text, driver_phone text, amount numeric, currency text, status text, method text, reference text, notes text, was_initial_candidate boolean, initial_minimum_snapshot numeric, requested_at timestamp with time zone, confirmed_at timestamp with time zone, confirmed_by uuid, rejected_at timestamp with time zone, rejection_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin perform app_private.require_project_permission(target_project_id,'marketplace.view'); perform app_private.require_project_permission(target_project_id,'payments.view'); if (target_before_requested_at is null)<>(target_before_topup_id is null) then raise exception 'INVALID_PAGINATION_CURSOR' using errcode='22023'; end if;
return query select t.id,t.user_id,p.display_name,p.phone,t.amount,t.currency,t.status,t.method,coalesce(
    (select v.payment_reference from app_private.marketplace_topup_received_references v
     where v.project_id=t.project_id and v.topup_id=t.id),t.reference
  ),t.notes,t.was_initial_candidate,t.initial_minimum_snapshot,t.requested_at,t.confirmed_at,t.confirmed_by,t.rejected_at,t.rejection_reason from public.topups t join public.profiles p on p.id=t.user_id where t.project_id=target_project_id and (target_status is null or t.status=target_status) and (target_before_requested_at is null or (t.requested_at,t.id)<(target_before_requested_at,target_before_topup_id)) order by t.requested_at desc,t.id desc limit least(greatest(coalesce(target_limit,100),1),200); end;
$function$;

create or replace function public.admin_confirm_marketplace_topup_with_reference(
  target_project_id uuid,
  target_topup_id uuid,
  target_confirmation_idempotency_key uuid,
  target_payment_reference text
) returns public.topups
language plpgsql security definer set search_path = '' as $body$
declare
  actor uuid;
  record_to_confirm public.topups%rowtype;
  normalized_reference text := nullif(btrim(target_payment_reference),'');
  saved_reference text;
begin
  actor := app_private.require_project_permission(target_project_id, 'payments.manage');
  if target_confirmation_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;
  if normalized_reference is null or length(normalized_reference)>160 then
    raise exception 'PAYMENT_REFERENCE_REQUIRED' using errcode='22023';
  end if;
  select * into record_to_confirm from public.topups
    where id=target_topup_id and project_id=target_project_id for update;
  if not found then raise exception 'TOPUP_NOT_FOUND' using errcode='P0002'; end if;
  if record_to_confirm.method <> 'transfer' then
    raise exception 'PAYMENT_REFERENCE_ONLY_FOR_TRANSFER' using errcode='22023';
  end if;
  if record_to_confirm.status='rejected' then
    raise exception 'REJECTED_TOPUP_CANNOT_BE_CONFIRMED' using errcode='22023';
  end if;
  if record_to_confirm.status in ('confirmed','reconciled')
     and record_to_confirm.confirmation_idempotency_key is distinct from target_confirmation_idempotency_key then
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION' using errcode='22023';
  end if;
  select payment_reference into saved_reference
    from app_private.marketplace_topup_received_references
    where project_id=target_project_id and topup_id=target_topup_id;
  if saved_reference is null and record_to_confirm.status='requested' then
    insert into app_private.marketplace_topup_received_references
      (project_id,topup_id,payment_reference,recorded_by)
      values (target_project_id,target_topup_id,normalized_reference,actor);
  elsif saved_reference is distinct from normalized_reference then
    raise exception 'PAYMENT_REFERENCE_ALREADY_RECORDED' using errcode='22023';
  end if;
  -- Both reference recording and financial confirmation commit or roll back together.
  return public.admin_confirm_marketplace_topup(
    target_project_id,target_topup_id,target_confirmation_idempotency_key
  );
end;
$body$;
revoke all on function public.admin_confirm_marketplace_topup_with_reference(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.admin_confirm_marketplace_topup_with_reference(uuid,uuid,uuid,text) to authenticated;
