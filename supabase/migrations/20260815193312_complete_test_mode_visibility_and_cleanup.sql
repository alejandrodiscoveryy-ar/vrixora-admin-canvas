-- Completa el flujo de pruebas sin alterar operaciones reales.
-- 1) El último pago visible siempre ignora operaciones de prueba.
-- 2) Cliente 360 obtiene un contexto de cobro con pruebas claramente marcadas.
-- 3) La limpieza elimina también recibos y pagos de prueba respetando FKs.

create or replace function public.admin_list_registered_clients(target_project_id uuid)
returns table (
  user_id uuid,email text,display_name text,phone text,avatar_url text,registered_at timestamptz,
  license_id uuid,license_key text,plan text,status text,activated_at timestamptz,expires_at timestamptz,
  max_devices integer,active_devices bigint,last_payment_at timestamptz,last_payment_amount numeric,
  last_payment_currency text,last_renewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_project_permission(target_project_id,'customers.view');
  return query
  select profile.id,profile.email,profile.display_name,profile.phone,profile.avatar_url,profile.created_at,
    current_license.id,current_license.license_key,
    coalesce(current_plan.name,current_license.plan),
    current_license.status,
    current_license.activated_at,
    current_license.expires_at,
    current_license.max_devices,coalesce(device_totals.active_devices,0),
    last_payment.charged_at,last_payment.amount,last_payment.currency,current_license.last_renewed_at
  from public.projects project
  join public.profiles profile on exists(
    select 1 from public.licenses scoped_license
      where scoped_license.project_id=target_project_id and scoped_license.user_id=profile.id
    union all
    select 1 from public.payments scoped_payment
      where scoped_payment.project_id=target_project_id and scoped_payment.user_id=profile.id
    union all
    select 1 from public.commercial_leads scoped_lead
      where scoped_lead.project_id=target_project_id and scoped_lead.user_id=profile.id and scoped_lead.archived_at is null
  )
  left join lateral(
    select license.* from public.licenses license
    where license.project_id=target_project_id and license.user_id=profile.id
    order by license.created_at desc limit 1
  ) current_license on true
  left join public.license_plans current_plan
    on current_plan.project_id=current_license.project_id and current_plan.code=current_license.plan
  left join lateral(
    select count(*)::bigint active_devices from public.license_devices device
    where device.license_id=current_license.id and device.revoked_at is null
  ) device_totals on true
  left join lateral(
    select payment.charged_at,payment.amount,payment.currency from public.payments payment
    where payment.project_id=target_project_id
      and payment.user_id=profile.id
      and payment.status='paid'
      and not payment.is_test
    order by payment.charged_at desc,payment.created_at desc,payment.id desc limit 1
  ) last_payment on true
  where project.id=target_project_id
  order by profile.created_at desc;
end;
$$;

create or replace function public.admin_get_client_360_billing_context(
  target_project_id uuid,
  target_client_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  can_view_payments boolean;
begin
  perform app_private.require_project_permission(target_project_id,'customers.view');

  if not exists (
    select 1 from public.licenses license
    where license.project_id=target_project_id and license.user_id=target_client_id
    union all
    select 1 from public.payments payment
    where payment.project_id=target_project_id and payment.user_id=target_client_id
    union all
    select 1 from public.commercial_leads lead
    where lead.project_id=target_project_id and lead.user_id=target_client_id and lead.archived_at is null
  ) then
    raise exception 'CLIENT_NOT_FOUND' using errcode='P0002';
  end if;

  can_view_payments := app_private.has_project_permission(target_project_id,'payments.view');
  if not can_view_payments then
    return jsonb_build_object('last_payment',null,'billing',null,'activity','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'last_payment',(
      select jsonb_build_object(
        'id',payment.id,'amount',payment.amount,'currency',payment.currency,
        'status',payment.status,'charged_at',payment.charged_at,'plan',payment.plan,
        'plan_name',coalesce(plan.name,receipt.snapshot->>'plan_name',payment.plan),
        'is_test',payment.is_test
      )
      from public.payments payment
      left join public.license_plans plan
        on plan.project_id=payment.project_id and plan.code=payment.plan
      left join public.billing_receipts receipt on receipt.payment_id=payment.id
      where payment.project_id=target_project_id
        and payment.user_id=target_client_id
        and payment.status='paid'
        and not payment.is_test
      order by payment.charged_at desc,payment.created_at desc,payment.id desc
      limit 1
    ),
    'billing',jsonb_build_object(
      'preinvoices',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',invoice.id,'number',invoice.number,'plan_code',invoice.plan_code,
          'plan_name',coalesce(invoice.plan_snapshot->>'name',invoice.plan_code),
          'charge_amount',invoice.charge_amount,'charge_currency',invoice.charge_currency,
          'status',case
            when invoice.status in ('prepared','sent','pending') and invoice.expires_at<=now()
              then 'expired'
            else invoice.status
          end,
          'is_test',invoice.is_test,'issued_at',invoice.issued_at,'expires_at',invoice.expires_at,
          'paid_payment_id',invoice.paid_payment_id
        ) order by invoice.issued_at desc)
        from public.preinvoices invoice
        where invoice.project_id=target_project_id and invoice.client_id=target_client_id
      ),'[]'::jsonb),
      'payments',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',payment.id,'license_id',payment.license_id,'preinvoice_id',payment.preinvoice_id,
          'plan',payment.plan,'plan_name',coalesce(plan.name,receipt.snapshot->>'plan_name',payment.plan),
          'amount',payment.amount,'currency',payment.currency,'method',payment.method,
          'reference',payment.reference,'status',payment.status,'notes',payment.notes,
          'charged_at',payment.charged_at,'created_at',payment.created_at,
          'receipt_id',receipt.id,'receipt_number',receipt.receipt_number,
          'is_test',payment.is_test
        ) order by payment.charged_at desc,payment.created_at desc)
        from public.payments payment
        left join public.billing_receipts receipt on receipt.payment_id=payment.id
        left join public.license_plans plan
          on plan.project_id=payment.project_id and plan.code=payment.plan
        where payment.project_id=target_project_id and payment.user_id=target_client_id
      ),'[]'::jsonb),
      'receipts',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',receipt.id,'payment_id',receipt.payment_id,'receipt_number',receipt.receipt_number,
          'created_at',receipt.created_at,'is_test',payment.is_test
        ) order by receipt.created_at desc)
        from public.billing_receipts receipt
        join public.payments payment on payment.id=receipt.payment_id
        where receipt.project_id=target_project_id and receipt.user_id=target_client_id
      ),'[]'::jsonb)
    ),
    'activity',coalesce((
      select jsonb_agg(activity.item order by activity.occurred_at desc)
      from (
        select invoice.issued_at occurred_at,jsonb_build_object(
          'id','preinvoice:'||invoice.id::text,
          'type','preinvoice',
          'title',case when invoice.is_test then 'Prefactura de prueba emitida' else 'Prefactura emitida' end,
          'description',(case when invoice.is_test then 'OPERACIÓN DE PRUEBA — NO CONTABILIZAR · ' else '' end)
            ||'Prefactura #'||invoice.number::text||' · '||invoice.charge_amount::text||' '||invoice.charge_currency,
          'occurred_at',invoice.issued_at
        ) item
        from public.preinvoices invoice
        where invoice.project_id=target_project_id and invoice.client_id=target_client_id

        union all

        select payment.charged_at,jsonb_build_object(
          'id','payment:'||payment.id::text,
          'type','payment',
          'title',case
            when payment.is_test and payment.status='paid' then 'Pago de prueba confirmado'
            when payment.is_test then 'Pago de prueba '||payment.status
            when payment.status='paid' then 'Pago confirmado'
            else 'Pago '||payment.status
          end,
          'description',(case when payment.is_test then 'OPERACIÓN DE PRUEBA — NO CONTABILIZAR · ' else '' end)
            ||payment.amount::text||' '||payment.currency||' · Plan '
            ||coalesce(plan.name,receipt.snapshot->>'plan_name',payment.plan),
          'occurred_at',payment.charged_at
        )
        from public.payments payment
        left join public.license_plans plan
          on plan.project_id=payment.project_id and plan.code=payment.plan
        left join public.billing_receipts receipt on receipt.payment_id=payment.id
        where payment.project_id=target_project_id and payment.user_id=target_client_id

        union all

        select receipt.created_at,jsonb_build_object(
          'id','receipt:'||receipt.id::text,
          'type','document',
          'title',case when payment.is_test then 'Recibo de prueba generado' else 'Recibo generado' end,
          'description',(case when payment.is_test then 'OPERACIÓN DE PRUEBA — NO CONTABILIZAR · ' else '' end)
            ||receipt.receipt_number,
          'occurred_at',receipt.created_at
        )
        from public.billing_receipts receipt
        join public.payments payment on payment.id=receipt.payment_id
        where receipt.project_id=target_project_id and receipt.user_id=target_client_id
      ) activity
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_delete_p0a_test_data(target_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_preinvoices bigint := 0;
  deleted_payments bigint := 0;
  deleted_receipts bigint := 0;
  deleted_rewards bigint := 0;
  deleted_relationships bigint := 0;
begin
  perform app_private.require_project_permission(target_project_id,'settings.manage');

  delete from public.referral_reward_ledger reward
  where reward.project_id=target_project_id
    and (
      reward.is_test
      or reward.qualifying_payment_id in (
        select payment.id from public.payments payment
        where payment.project_id=target_project_id and payment.is_test
      )
    );
  get diagnostics deleted_rewards=row_count;

  update public.preinvoices invoice
  set status='cancelled',paid_payment_id=null,updated_at=now()
  where invoice.project_id=target_project_id
    and invoice.is_test
    and invoice.paid_payment_id is not null;

  delete from public.billing_receipts receipt
  using public.payments payment
  where receipt.payment_id=payment.id
    and payment.project_id=target_project_id
    and payment.is_test;
  get diagnostics deleted_receipts=row_count;

  delete from public.payments payment
  where payment.project_id=target_project_id and payment.is_test;
  get diagnostics deleted_payments=row_count;

  delete from public.preinvoices invoice
  where invoice.project_id=target_project_id and invoice.is_test;
  get diagnostics deleted_preinvoices=row_count;

  delete from public.referral_relationships relation
  where relation.project_id=target_project_id
    and relation.is_test
    and not exists(
      select 1 from public.referral_reward_ledger reward
      where reward.relationship_id=relation.id
    );
  get diagnostics deleted_relationships=row_count;

  return jsonb_build_object(
    'preinvoices',deleted_preinvoices,
    'payments',deleted_payments,
    'receipts',deleted_receipts,
    'referral_rewards',deleted_rewards,
    'referral_relationships',deleted_relationships
  );
end;
$$;

revoke all on function public.admin_list_registered_clients(uuid),
  public.admin_get_client_360_billing_context(uuid,uuid),
  public.admin_delete_p0a_test_data(uuid)
from public,anon;

grant execute on function public.admin_list_registered_clients(uuid),
  public.admin_get_client_360_billing_context(uuid,uuid),
  public.admin_delete_p0a_test_data(uuid)
to authenticated;
