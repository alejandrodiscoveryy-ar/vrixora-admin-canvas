-- P0-B: read-only Client 360 aggregation without duplicating persisted data.

create or replace function public.admin_list_registered_clients(target_project_id uuid)
returns table (
  user_id uuid,email text,display_name text,phone text,avatar_url text,registered_at timestamptz,
  license_id uuid,license_key text,plan text,status text,activated_at timestamptz,expires_at timestamptz,
  max_devices integer,active_devices bigint,last_payment_at timestamptz,last_payment_amount numeric,
  last_payment_currency text,last_renewed_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
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
    where payment.project_id=target_project_id and payment.user_id=profile.id and payment.status='paid'
    order by payment.charged_at desc,payment.created_at desc,payment.id desc limit 1
  ) last_payment on true
  where project.id=target_project_id
  order by profile.created_at desc;
end;
$$;

create or replace function public.admin_get_client_360(
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
  client_profile public.profiles%rowtype;
  can_view_licenses boolean;
  can_view_payments boolean;
  can_view_commercial boolean;
  can_view_audit boolean;
  result jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'customers.view');

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

  select * into client_profile from public.profiles profile where profile.id=target_client_id;
  if not found then raise exception 'CLIENT_NOT_FOUND' using errcode='P0002'; end if;

  can_view_licenses := app_private.has_project_permission(target_project_id,'licenses.view');
  can_view_payments := app_private.has_project_permission(target_project_id,'payments.view');
  can_view_commercial := app_private.has_project_permission(target_project_id,'commercial.view');
  can_view_audit := app_private.has_project_permission(target_project_id,'audit.view');

  select jsonb_build_object(
    'permissions',jsonb_build_object(
      'licenses',can_view_licenses,'payments',can_view_payments,
      'commercial',can_view_commercial,'audit',can_view_audit
    ),
    'client',jsonb_build_object(
      'id',client_profile.id,'email',client_profile.email,'display_name',client_profile.display_name,
      'phone',client_profile.phone,'avatar_url',client_profile.avatar_url,'registered_at',client_profile.created_at
    ),
    'license',case when can_view_licenses then (
      select jsonb_build_object(
        'id',license.id,'license_key',license.license_key,'license_type',license.license_type,
        'plan_code',license.plan,'plan_name',coalesce(plan.name,license.plan),'status',license.status,
        'activated_at',license.activated_at,'expires_at',license.expires_at,
        'last_renewed_at',license.last_renewed_at,'max_devices',license.max_devices,
        'active_devices',(select count(*) from public.license_devices device where device.license_id=license.id and device.revoked_at is null),
        'devices',coalesce((select jsonb_agg(jsonb_build_object(
          'id',device.id,'label',device.label,'first_seen_at',device.first_seen_at,
          'last_seen_at',device.last_seen_at,'revoked_at',device.revoked_at
        ) order by device.last_seen_at desc) from public.license_devices device where device.license_id=license.id),'[]'::jsonb)
      )
      from public.licenses license
      left join public.license_plans plan on plan.project_id=license.project_id and plan.code=license.plan
      where license.project_id=target_project_id and license.user_id=target_client_id
      order by license.created_at desc limit 1
    ) else null end,
    'last_payment',case when can_view_payments then (
      select jsonb_build_object('id',payment.id,'amount',payment.amount,'currency',payment.currency,
        'status',payment.status,'charged_at',payment.charged_at,'plan',payment.plan,
        'plan_name',coalesce(plan.name,receipt.snapshot->>'plan_name',payment.plan))
      from public.payments payment
      left join public.license_plans plan on plan.project_id=payment.project_id and plan.code=payment.plan
      left join public.billing_receipts receipt on receipt.payment_id=payment.id
      where payment.project_id=target_project_id
        and payment.user_id=target_client_id and payment.status='paid'
      order by payment.charged_at desc,payment.created_at desc,payment.id desc limit 1
    ) else null end,
    'commercial',case when can_view_commercial then (
      select jsonb_build_object(
        'id',lead.id,'source',lead.source,'medium',lead.medium,
        'campaign',coalesce(campaign.name,lead.campaign),'referral_code',lead.referral_code,
        'referred_by_id',lead.referred_by_user_id,
        'referred_by_name',coalesce(referrer.display_name,referrer.email),
        'status',lead.status,'responsible_id',lead.responsible_id,
        'responsible_name',coalesce(responsible.display_name,responsible.email),
        'notes',lead.notes,'last_interaction_at',lead.last_interaction_at,
        'next_action_at',lead.next_action_at
      )
      from public.commercial_leads lead
      left join public.commercial_campaigns campaign on campaign.id=lead.campaign_id and campaign.project_id=lead.project_id
      left join public.profiles referrer on referrer.id=lead.referred_by_user_id
      left join public.profiles responsible on responsible.id=lead.responsible_id
      where lead.project_id=target_project_id and lead.user_id=target_client_id and lead.archived_at is null
      order by lead.updated_at desc limit 1
    ) else null end,
    'billing',case when can_view_payments then jsonb_build_object(
      'preinvoices',coalesce((select jsonb_agg(jsonb_build_object(
        'id',invoice.id,'number',invoice.number,'plan_code',invoice.plan_code,
        'plan_name',coalesce(invoice.plan_snapshot->>'name',invoice.plan_code),
        'charge_amount',invoice.charge_amount,'charge_currency',invoice.charge_currency,
        'status',case when invoice.status in ('prepared','sent','pending') and invoice.expires_at<=now()
          then 'expired' else invoice.status end,
        'is_test',invoice.is_test,'issued_at',invoice.issued_at,'expires_at',invoice.expires_at,
        'paid_payment_id',invoice.paid_payment_id
      ) order by invoice.issued_at desc) from public.preinvoices invoice
        where invoice.project_id=target_project_id and invoice.client_id=target_client_id
          and not invoice.is_test),'[]'::jsonb),
      'payments',coalesce((select jsonb_agg(jsonb_build_object(
        'id',payment.id,'license_id',payment.license_id,'plan',payment.plan,
        'plan_name',coalesce(plan.name,receipt.snapshot->>'plan_name',payment.plan),
        'amount',payment.amount,'currency',payment.currency,'method',payment.method,
        'reference',payment.reference,'status',payment.status,'notes',payment.notes,
        'charged_at',payment.charged_at,'created_at',payment.created_at,
        'receipt_id',receipt.id,'receipt_number',receipt.receipt_number
      ) order by payment.charged_at desc,payment.created_at desc) from public.payments payment
        left join public.billing_receipts receipt on receipt.payment_id=payment.id
        left join public.license_plans plan on plan.project_id=payment.project_id and plan.code=payment.plan
        where payment.project_id=target_project_id and payment.user_id=target_client_id),'[]'::jsonb),
      'receipts',coalesce((select jsonb_agg(jsonb_build_object(
        'id',receipt.id,'payment_id',receipt.payment_id,'receipt_number',receipt.receipt_number,
        'created_at',receipt.created_at
      ) order by receipt.created_at desc) from public.billing_receipts receipt
        where receipt.project_id=target_project_id and receipt.user_id=target_client_id),'[]'::jsonb)
    ) else null end,
    'referrals',case when can_view_commercial then jsonb_build_object(
      'reward_days',(select settings.reward_days from public.project_referral_settings settings where settings.project_id=target_project_id),
      'referred_by',(select jsonb_build_object(
        'relationship_id',relationship.id,'user_id',relationship.referrer_user_id,
        'name',coalesce(profile.display_name,profile.email),'referral_code',relationship.referral_code,
        'created_at',relationship.created_at,'is_test',relationship.is_test,
        'reward_status',reward.status,'reward_days',reward.reward_days
      ) from public.referral_relationships relationship
        join public.profiles profile on profile.id=relationship.referrer_user_id
        left join public.referral_reward_ledger reward on reward.relationship_id=relationship.id and not reward.is_test
        where relationship.project_id=target_project_id and relationship.referred_user_id=target_client_id
          and not relationship.is_test),
      'referred_clients',coalesce((select jsonb_agg(jsonb_build_object(
        'relationship_id',relationship.id,'user_id',relationship.referred_user_id,
        'name',coalesce(profile.display_name,profile.email),'email',profile.email,
        'referral_code',relationship.referral_code,'created_at',relationship.created_at,
        'is_test',relationship.is_test,'reward_status',reward.status,'reward_days',reward.reward_days
      ) order by relationship.created_at desc) from public.referral_relationships relationship
        join public.profiles profile on profile.id=relationship.referred_user_id
        left join public.referral_reward_ledger reward on reward.relationship_id=relationship.id and not reward.is_test
        where relationship.project_id=target_project_id and relationship.referrer_user_id=target_client_id
          and not relationship.is_test),'[]'::jsonb)
    ) else null end,
    'activity',coalesce((
      select jsonb_agg(activity.item order by activity.occurred_at desc)
      from (
        select client_profile.created_at occurred_at,jsonb_build_object(
          'id','registration:'||client_profile.id::text,'type','registration','title','Cliente registrado',
          'description','Se creó la cuenta del cliente','occurred_at',client_profile.created_at
        ) item
        union all
        select license.created_at,jsonb_build_object(
          'id','license:'||license.id::text,'type','license','title',
          case when license.license_type='trial' then 'Prueba iniciada' else 'Licencia creada' end,
          'description','Plan '||coalesce(plan.name,license.plan),'occurred_at',license.created_at
        ) from public.licenses license
          left join public.license_plans plan on plan.project_id=license.project_id and plan.code=license.plan
          where can_view_licenses and license.project_id=target_project_id and license.user_id=target_client_id
        union all
        select history.created_at,jsonb_build_object(
          'id','license-history:'||history.id::text,'type','license','title',
          case history.action when 'renewed' then 'Licencia renovada' when 'status_changed' then 'Estado de licencia actualizado' else 'Cambio de licencia' end,
          'description',case when history.action='renewed' then 'Plan '||coalesce(plan.name,license.plan)
            else history.detail end,'occurred_at',history.created_at
        ) from public.license_audit_log history join public.licenses license on license.id=history.license_id
          left join public.license_plans plan on plan.project_id=license.project_id and plan.code=license.plan
          where can_view_licenses and license.project_id=target_project_id and license.user_id=target_client_id
        union all
        select invoice.issued_at,jsonb_build_object(
          'id','preinvoice:'||invoice.id::text,'type','preinvoice','title','Prefactura emitida',
          'description','Prefactura #'||invoice.number::text||' · '||invoice.charge_amount::text||' '||invoice.charge_currency,
          'occurred_at',invoice.issued_at
        ) from public.preinvoices invoice where can_view_payments and invoice.project_id=target_project_id
          and invoice.client_id=target_client_id and not invoice.is_test
        union all
        select payment.charged_at,jsonb_build_object(
          'id','payment:'||payment.id::text,'type','payment','title',
          case when payment.status='paid' then 'Pago confirmado' else 'Pago '||payment.status end,
          'description',payment.amount::text||' '||payment.currency||' · Plan '||coalesce(plan.name,receipt.snapshot->>'plan_name',payment.plan),
          'occurred_at',payment.charged_at
        ) from public.payments payment
          left join public.license_plans plan on plan.project_id=payment.project_id and plan.code=payment.plan
          left join public.billing_receipts receipt on receipt.payment_id=payment.id
          where can_view_payments and payment.project_id=target_project_id and payment.user_id=target_client_id
        union all
        select receipt.created_at,jsonb_build_object(
          'id','receipt:'||receipt.id::text,'type','document','title','Recibo generado',
          'description',receipt.receipt_number,'occurred_at',receipt.created_at
        ) from public.billing_receipts receipt where can_view_payments and receipt.project_id=target_project_id and receipt.user_id=target_client_id
        union all
        select history.created_at,jsonb_build_object(
          'id','commercial:'||history.id::text,'type','commercial','title',
          case history.event_type when 'created' then 'Seguimiento comercial iniciado'
            when 'note_added' then 'Nota comercial agregada'
            when 'status_changed' then 'Estado comercial actualizado'
            when 'responsible_changed' then 'Responsable comercial actualizado'
            else 'Actividad comercial' end,
          'description',coalesce(history.note,history.new_value),'occurred_at',history.created_at
        ) from public.commercial_lead_history history join public.commercial_leads lead on lead.id=history.lead_id
          where can_view_commercial and lead.project_id=target_project_id and lead.user_id=target_client_id
        union all
        select relationship.created_at,jsonb_build_object(
          'id','referral:'||relationship.id::text,'type','referral','title','Relación de referido registrada',
          'description',case when relationship.referred_user_id=target_client_id then 'Cliente referido' else 'Nuevo cliente referido' end,
          'occurred_at',relationship.created_at
        ) from public.referral_relationships relationship where can_view_commercial
          and relationship.project_id=target_project_id and not relationship.is_test
          and (relationship.referrer_user_id=target_client_id or relationship.referred_user_id=target_client_id)
        union all
        select event.created_at,jsonb_build_object(
          'id','audit:'||event.id::text,'type','audit','title','Cambio administrativo',
          'description',case event.entity_type when 'profiles' then 'Datos del cliente actualizados'
            when 'licenses' then 'Licencia actualizada' when 'payments' then 'Pago actualizado'
            else 'Información relacionada actualizada' end,
          'occurred_at',event.created_at
        ) from public.audit_events event where can_view_audit and event.project_id=target_project_id
          and coalesce(event.metadata#>>'{new,is_test}',event.metadata#>>'{old,is_test}','false')='false'
          and (event.entity_id=target_client_id::text
            or event.entity_id in (select license.id::text from public.licenses license where license.project_id=target_project_id and license.user_id=target_client_id)
            or event.entity_id in (select payment.id::text from public.payments payment where payment.project_id=target_project_id and payment.user_id=target_client_id)
            or event.entity_id in (select invoice.id::text from public.preinvoices invoice where invoice.project_id=target_project_id and invoice.client_id=target_client_id and not invoice.is_test))
      ) activity
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_get_client_360(uuid,uuid) from public,anon;
grant execute on function public.admin_get_client_360(uuid,uuid) to authenticated;
