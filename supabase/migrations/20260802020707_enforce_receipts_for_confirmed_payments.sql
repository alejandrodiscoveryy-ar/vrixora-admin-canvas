create or replace function app_private.create_billing_receipt_for_payment(
  target_payment_id uuid,
  target_actor uuid default null,
  target_origin text default 'automatic'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  license_record public.licenses%rowtype;
  plan_record public.license_plans%rowtype;
  project_record public.projects%rowtype;
  client_record public.profiles%rowtype;
  operator_record public.profiles%rowtype;
  audit_metadata jsonb := '{}'::jsonb;
  receipt_record public.billing_receipts%rowtype;
  receipt_snapshot jsonb;
  receipt_id uuid := gen_random_uuid();
  receipt_number text;
  actor uuid;
begin
  select * into receipt_record
  from public.billing_receipts
  where payment_id = target_payment_id;

  if found then
    return receipt_record.snapshot;
  end if;

  select * into payment_record
  from public.payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if payment_record.status not in ('paid', 'complimentary') then
    raise exception 'PAYMENT_NOT_CONFIRMED' using errcode = '22023';
  end if;
  if payment_record.license_id is null then
    raise exception 'PAYMENT_LICENSE_REQUIRED' using errcode = '23502';
  end if;

  select * into license_record
  from public.licenses
  where id = payment_record.license_id;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if license_record.license_type = 'admin' then
    raise exception 'SPECIAL_LICENSE_PROTECTED' using errcode = '42501';
  end if;

  select * into plan_record
  from public.license_plans
  where project_id = payment_record.project_id
    and code = payment_record.plan;

  if not found then
    raise exception 'PAYMENT_PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into project_record
  from public.projects
  where id = payment_record.project_id;

  select * into client_record
  from public.profiles
  where id = payment_record.user_id;

  actor := coalesce(target_actor, payment_record.recorded_by);
  select * into operator_record
  from public.profiles
  where id = actor;

  select coalesce(entry.metadata, '{}'::jsonb)
  into audit_metadata
  from public.license_audit_log entry
  where entry.license_id = payment_record.license_id
    and entry.metadata ->> 'payment_id' = payment_record.id::text
  order by entry.created_at desc
  limit 1;

  receipt_number := 'VRX-' || to_char(payment_record.created_at, 'YYYYMMDD') || '-' ||
    upper(substr(replace(payment_record.id::text, '-', ''), 1, 8));

  receipt_snapshot := jsonb_build_object(
    'receipt_id', receipt_id,
    'receipt_number', receipt_number,
    'payment_id', payment_record.id,
    'license_id', license_record.id,
    'project_id', payment_record.project_id,
    'project_name', project_record.name,
    'client_name', coalesce(client_record.display_name, client_record.email),
    'client_email', client_record.email,
    'masked_license_key', 'VRX-****-' || right(license_record.license_key, 4),
    'previous_plan', coalesce(audit_metadata ->> 'previous_plan', payment_record.plan),
    'plan', payment_record.plan,
    'plan_name', plan_record.name,
    'duration_days', plan_record.duration_days,
    'list_price', payment_record.list_price,
    'amount', payment_record.amount,
    'currency', payment_record.currency,
    'method', payment_record.method,
    'reference', payment_record.reference,
    'charged_at', coalesce(payment_record.charged_at, payment_record.created_at),
    'started_at', coalesce(license_record.activated_at, payment_record.created_at),
    'expires_at', coalesce(
      nullif(audit_metadata ->> 'new_expires_at', '')::timestamptz,
      license_record.expires_at
    ),
    'status', license_record.status,
    'max_devices', license_record.max_devices,
    'operator_email', coalesce(operator_record.display_name, operator_record.email, actor::text),
    'notes', nullif(payment_record.notes, ''),
    'whatsapp', project_record.whatsapp,
    'support_email', project_record.support_email,
    'application_rule', target_origin
  );

  insert into public.billing_receipts(
    id, project_id, payment_id, license_id, user_id, idempotency_key,
    receipt_number, snapshot, created_by, created_at
  )
  values(
    receipt_id, payment_record.project_id, payment_record.id,
    license_record.id, payment_record.user_id,
    coalesce(payment_record.idempotency_key, payment_record.id),
    receipt_number, receipt_snapshot, actor, now()
  )
  on conflict (payment_id) do nothing
  returning * into receipt_record;

  if not found then
    select * into receipt_record
    from public.billing_receipts
    where payment_id = payment_record.id;
    return receipt_record.snapshot;
  end if;

  update public.payments
  set license_applied_at = coalesce(license_applied_at, created_at)
  where id = payment_record.id;

  update public.licenses
  set last_payment_id = payment_record.id,
      last_renewed_at = greatest(
        coalesce(last_renewed_at, payment_record.created_at),
        payment_record.created_at
      ),
      updated_at = greatest(updated_at, payment_record.created_at)
  where id = license_record.id
    and not exists (
      select 1
      from public.payments newer_payment
      where newer_payment.license_id = license_record.id
        and newer_payment.status in ('paid', 'complimentary')
        and newer_payment.created_at > payment_record.created_at
    );

  insert into public.license_audit_log(
    project_id, license_id, action, detail, actor_id, metadata
  )
  values(
    payment_record.project_id,
    license_record.id,
    case when target_origin = 'repair' then 'receipt_repaired' else 'receipt_generated' end,
    case when target_origin = 'repair'
      then 'Recibo faltante generado sin modificar la vigencia'
      else 'Recibo generado para el pago confirmado'
    end,
    actor,
    jsonb_build_object(
      'payment_id', payment_record.id,
      'receipt_id', receipt_record.id,
      'receipt_number', receipt_record.receipt_number,
      'origin', target_origin
    )
  );

  return receipt_record.snapshot;
end;
$$;

revoke all on function app_private.create_billing_receipt_for_payment(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function app_private.ensure_confirmed_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('paid', 'complimentary')
    and not exists (
      select 1 from public.billing_receipts receipt where receipt.payment_id = new.id
    )
  then
    perform app_private.create_billing_receipt_for_payment(
      new.id,
      new.recorded_by,
      'automatic'
    );
  end if;
  return new;
end;
$$;

revoke all on function app_private.ensure_confirmed_payment_receipt()
  from public, anon, authenticated;

drop trigger if exists payments_require_billing_receipt on public.payments;
create constraint trigger payments_require_billing_receipt
after insert or update on public.payments
deferrable initially deferred
for each row
when (new.status in ('paid', 'complimentary'))
execute function app_private.ensure_confirmed_payment_receipt();

create or replace function public.admin_repair_missing_billing_receipt(
  target_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  actor uuid;
begin
  select * into payment_record
  from public.payments
  where id = target_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  actor := app_private.require_project_permission(
    payment_record.project_id,
    'payments.correct'
  );
  perform app_private.require_project_permission(
    payment_record.project_id,
    'payments.manage'
  );

  return app_private.create_billing_receipt_for_payment(
    payment_record.id,
    actor,
    'repair'
  );
end;
$$;

revoke all on function public.admin_repair_missing_billing_receipt(uuid)
  from public, anon;
grant execute on function public.admin_repair_missing_billing_receipt(uuid)
  to authenticated;

drop function if exists public.admin_list_license_payments(uuid);
create function public.admin_list_license_payments(target_project_id uuid)
returns table(
  id uuid,
  user_email text,
  license_key text,
  plan text,
  list_price numeric,
  discount numeric,
  amount numeric,
  currency text,
  method text,
  reference text,
  paid_status text,
  recorded_by uuid,
  notes text,
  created_at timestamptz,
  license_id uuid,
  operator_label text,
  has_receipt boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id, 'payments.view');
  return query
  select
    payment.id,
    client.email,
    license.license_key,
    payment.plan,
    payment.list_price,
    payment.discount,
    payment.amount,
    payment.currency,
    payment.method,
    payment.reference,
    payment.status,
    payment.recorded_by,
    payment.notes,
    payment.created_at,
    payment.license_id,
    coalesce(operator_profile.display_name, operator_profile.email, payment.recorded_by::text),
    receipt.id is not null
  from public.payments payment
  join public.profiles client on client.id = payment.user_id
  left join public.licenses license on license.id = payment.license_id
  left join public.profiles operator_profile on operator_profile.id = payment.recorded_by
  left join public.billing_receipts receipt on receipt.payment_id = payment.id
  where payment.project_id = target_project_id
  order by payment.created_at desc;
end;
$$;

revoke all on function public.admin_list_license_payments(uuid) from public, anon;
grant execute on function public.admin_list_license_payments(uuid) to authenticated;
