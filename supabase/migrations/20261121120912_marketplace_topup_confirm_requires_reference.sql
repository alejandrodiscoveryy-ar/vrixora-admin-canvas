CREATE OR REPLACE FUNCTION public.admin_confirm_marketplace_topup(target_project_id uuid, target_topup_id uuid, target_confirmation_idempotency_key uuid)
 RETURNS topups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid;
  topup_record public.topups%rowtype;
  wallet_record public.wallets%rowtype;
  transaction_id uuid;
  prior_balance numeric;
  receipt public.marketplace_financial_documents%rowtype;
begin
  actor:=app_private.require_project_permission(
    target_project_id,
    'payments.manage'
  );

  if target_confirmation_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;

  select * into topup_record
  from public.topups
  where id=target_topup_id and project_id=target_project_id
  for update;

  if not found then
    raise exception 'TOPUP_NOT_FOUND' using errcode='P0002';
  end if;

  select * into wallet_record
  from public.wallets
  where project_id=topup_record.project_id
    and user_id=topup_record.user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode='P0002';
  end if;

  if topup_record.status in ('confirmed','reconciled') then
    if topup_record.confirmation_idempotency_key
       is distinct from target_confirmation_idempotency_key then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_OPERATION'
        using errcode='22023';
    end if;

    perform app_private.issue_marketplace_topup_receipt(
      target_project_id,
      topup_record.id,
      coalesce(topup_record.confirmed_by,actor),
      target_confirmation_idempotency_key
    );

    return topup_record;
  end if;

  if topup_record.status='rejected' then
    raise exception 'REJECTED_TOPUP_CANNOT_BE_CONFIRMED'
      using errcode='22023';
  end if;

  -- A transfer must have bank evidence before any wallet credit or receipt.
  -- Older transfer requests may retain their original reference.
  if topup_record.method='transfer'
     and nullif(btrim(topup_record.reference),'') is null
     and not exists (
       select 1 from app_private.marketplace_topup_received_references v
       where v.project_id=target_project_id and v.topup_id=topup_record.id
         and nullif(btrim(v.payment_reference),'') is not null
     ) then
    raise exception 'PAYMENT_REFERENCE_REQUIRED_FOR_CONFIRMATION'
      using errcode='22023';
  end if;

  prior_balance:=app_private.marketplace_wallet_total_balance(
    target_project_id,
    topup_record.user_id
  );

  insert into public.wallet_transactions(
    project_id,user_id,currency,transaction_type,amount_delta,balance_after,
    source_type,source_id,idempotency_key,actor_id,metadata
  )
  values(
    target_project_id,
    topup_record.user_id,
    topup_record.currency,
    'topup',
    topup_record.amount,
    prior_balance+topup_record.amount,
    'topup',
    topup_record.id::text,
    target_confirmation_idempotency_key,
    actor,
    jsonb_build_object('topup_id',topup_record.id)
  )
  returning id into transaction_id;

  update public.topups
  set status='confirmed',
      confirmation_idempotency_key=target_confirmation_idempotency_key,
      ledger_transaction_id=transaction_id,
      confirmed_by=actor,
      confirmed_at=now(),
      updated_at=now()
  where id=topup_record.id and project_id=target_project_id
  returning * into topup_record;

  receipt:=app_private.issue_marketplace_topup_receipt(
    target_project_id,
    topup_record.id,
    actor,
    target_confirmation_idempotency_key
  );

  return topup_record;
end;
$function$;
