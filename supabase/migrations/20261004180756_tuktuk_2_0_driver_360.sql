create or replace function public.admin_get_marketplace_driver_360(
  target_project_id uuid,
  target_driver_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  driver_row public.driver_profiles%rowtype;
  result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'marketplace.view');

  select * into driver_row
  from public.driver_profiles d
  where d.project_id=target_project_id
    and d.user_id=target_driver_user_id;

  if not found then
    raise exception 'MARKETPLACE_DRIVER_NOT_FOUND' using errcode='P0002';
  end if;

  select jsonb_build_object(
    'account',(select to_jsonb(p) from public.profiles p where p.id=target_driver_user_id),
    'driver',to_jsonb(driver_row),
    'vehicles',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'vehicle',to_jsonb(v),
          'assignment',to_jsonb(a),
          'services',coalesce((
            select jsonb_agg(to_jsonb(vs) order by vs.service_code)
            from public.vehicle_services vs
            where vs.project_id=v.project_id and vs.vehicle_id=v.id
          ),'[]'::jsonb)
        )
        order by a.created_at,v.id
      )
      from public.driver_vehicle_assignments a
      join public.vehicles v on v.project_id=a.project_id and v.id=a.vehicle_id
      where a.project_id=target_project_id and a.driver_user_id=target_driver_user_id
    ),'[]'::jsonb),
    'promotion',(
      select to_jsonb(t)
      from public.marketplace_work_trials t
      where t.project_id=target_project_id and t.user_id=target_driver_user_id
    ),
    'jobs_summary',jsonb_build_object(
      'total',(select count(*) from public.jobs j where j.project_id=target_project_id and j.assigned_driver_user_id=target_driver_user_id),
      'completed_or_settled',(select count(*) from public.jobs j where j.project_id=target_project_id and j.assigned_driver_user_id=target_driver_user_id and j.status in ('completed','settled')),
      'active',(select count(*) from public.jobs j where j.project_id=target_project_id and j.assigned_driver_user_id=target_driver_user_id and j.status in ('accepted','en_route','pickup','in_progress','incident'))
    ),
    'referral',jsonb_build_object(
      'code',(select c.code from public.project_referral_codes c where c.project_id=target_project_id and c.user_id=target_driver_user_id limit 1),
      'referred_count',(select count(*) from public.referral_relationships r where r.project_id=target_project_id and r.referrer_user_id=target_driver_user_id),
      'rewarded_count',(select count(*) from public.marketplace_referral_rewards r where r.project_id=target_project_id and r.referrer_user_id=target_driver_user_id)
    ),
    'ratings',jsonb_build_object(
      'count',(select count(*) from public.marketplace_driver_customer_ratings r where r.project_id=target_project_id and r.driver_user_id=target_driver_user_id),
      'average',(select round(avg(r.stars)::numeric,2) from public.marketplace_driver_customer_ratings r where r.project_id=target_project_id and r.driver_user_id=target_driver_user_id)
    ),
    'incidents',(select count(*) from public.jobs j where j.project_id=target_project_id and j.assigned_driver_user_id=target_driver_user_id and j.status='incident')
  ) into result;

  return result;
end;
$function$;

create or replace function public.admin_get_marketplace_driver_financial_360(
  target_project_id uuid,
  target_driver_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  balances record;
  result jsonb;
begin
  perform app_private.require_project_permission(target_project_id,'payments.manage');

  if not exists(
    select 1
    from public.driver_profiles d
    where d.project_id=target_project_id
      and d.user_id=target_driver_user_id
  ) then
    raise exception 'MARKETPLACE_DRIVER_NOT_FOUND' using errcode='P0002';
  end if;

  select * into balances
  from app_private.marketplace_wallet_source_balances(target_project_id,target_driver_user_id);

  select jsonb_build_object(
    'wallet',jsonb_build_object(
      'real_balance',coalesce(balances.real_balance,0),
      'promotional_balance',coalesce(balances.promotional_balance,0),
      'real_reserved_balance',coalesce(balances.real_reserved_balance,0),
      'promotional_reserved_balance',coalesce(balances.promotional_reserved_balance,0),
      'real_available_balance',coalesce(balances.real_available_balance,0),
      'promotional_available_balance',coalesce(balances.promotional_available_balance,0)
    ),
    'topups',coalesce((
      select jsonb_agg(to_jsonb(t) order by t.requested_at desc,t.id desc)
      from public.topups t
      where t.project_id=target_project_id and t.user_id=target_driver_user_id
    ),'[]'::jsonb),
    'documents',coalesce((
      select jsonb_agg(to_jsonb(d) order by d.issued_at desc,d.id desc)
      from public.marketplace_financial_documents d
      where d.project_id=target_project_id and d.user_id=target_driver_user_id
    ),'[]'::jsonb),
    'referral_credits',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.qualified_at desc,r.id desc)
      from public.marketplace_referral_rewards r
      where r.project_id=target_project_id and r.referrer_user_id=target_driver_user_id
    ),'[]'::jsonb),
    'commission_total',coalesce((
      select -sum(t.amount_delta)
      from public.wallet_transactions t
      where t.project_id=target_project_id
        and t.user_id=target_driver_user_id
        and t.transaction_type='commission'
    ),0)
  ) into result;

  return result;
end;
$function$;

revoke execute on function public.admin_get_marketplace_driver_360(uuid,uuid) from public,anon;
revoke execute on function public.admin_get_marketplace_driver_financial_360(uuid,uuid) from public,anon;

grant execute on function public.admin_get_marketplace_driver_360(uuid,uuid) to authenticated;
grant execute on function public.admin_get_marketplace_driver_financial_360(uuid,uuid) to authenticated;