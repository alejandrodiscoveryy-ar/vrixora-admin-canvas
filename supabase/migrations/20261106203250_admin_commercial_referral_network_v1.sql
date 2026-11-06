-- APLICADA en Supabase 2026-11-06, version 20261106203250. Comercial > Referidos: trazabilidad y rendimiento.
-- Consulta únicamente datos existentes; no crea premios ni altera billeteras.
create or replace function public.admin_get_commercial_referral_network_v1(
  target_project_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  can_view_financial boolean;
  response jsonb;
begin
  perform app_private.require_project_permission(target_project_id, 'commercial.view');
  can_view_financial := coalesce(
    app_private.has_project_permission(target_project_id, 'payments.view'), false
  );

  with linked_people as (
    select
      rel.id as relationship_id,
      rel.referrer_user_id,
      rel.referred_user_id,
      rel.referral_code,
      rel.created_at as referred_at,
      coalesce(nullif(btrim(referrer.display_name), ''), 'Referente sin nombre') as referrer_name,
      coalesce(nullif(btrim(referred.display_name), ''), 'Referido sin nombre') as referred_name,
      d.status as driver_status
    from public.referral_relationships rel
    left join public.profiles referrer on referrer.id = rel.referrer_user_id
    left join public.profiles referred on referred.id = rel.referred_user_id
    left join public.driver_profiles d on d.project_id = rel.project_id
       and d.user_id = rel.referred_user_id
    where rel.project_id = target_project_id and rel.is_test is false
  ),
  valid_jobs as (
    select
      j.assigned_driver_user_id as driver_id,
      count(*)::integer as settled_jobs,
      coalesce(sum(case when j.currency = 'CUP' then greatest(coalesce(j.final_price, 0), 0) else 0 end), 0) as fare_cup
    from public.jobs j
    where j.project_id = target_project_id
      and j.is_test is false
      and j.test_deleted_at is null
      and j.status = 'settled'
      and exists (select 1 from linked_people person where person.referred_user_id = j.assigned_driver_user_id)
    group by j.assigned_driver_user_id
  ),
  consumed_commissions as (
    select
      j.assigned_driver_user_id as driver_id,
      coalesce(sum(greatest(coalesce(cr.real_reserved_amount, 0), 0)), 0) as real_cup,
      coalesce(sum(greatest(coalesce(cr.promotional_reserved_amount, 0), 0)), 0) as promotional_cup
    from public.commission_reservations cr
    join public.jobs j on j.id = cr.job_id and j.project_id = cr.project_id
    where cr.project_id = target_project_id
      and cr.status = 'consumed'
      and cr.currency = 'CUP'
      and j.status = 'settled'
      and j.is_test is false
      and j.test_deleted_at is null
      and exists (select 1 from linked_people person where person.referred_user_id = j.assigned_driver_user_id)
    group by j.assigned_driver_user_id
  ),
  credited_rewards as (
    select
      reward.relationship_id,
      coalesce(sum(greatest(coalesce(tx.promotional_delta, 0), 0)), 0) as credited_cup
    from public.marketplace_referral_rewards reward
    join public.wallet_transactions tx on tx.id = reward.wallet_transaction_id
      and tx.project_id = reward.project_id
      and tx.user_id = reward.referrer_user_id
    where reward.project_id = target_project_id
      and tx.transaction_type = 'referral_credit'
      and tx.currency = 'CUP'
    group by reward.relationship_id
  ),
  per_person as (
    select
      person.*,
      coalesce(jobs.settled_jobs, 0) as settled_jobs,
      coalesce(jobs.fare_cup, 0) as fare_cup,
      coalesce(commission.real_cup, 0) as real_cup,
      coalesce(commission.promotional_cup, 0) as promotional_cup,
      coalesce(reward.credited_cup, 0) as credited_cup
    from linked_people person
    left join valid_jobs jobs on jobs.driver_id = person.referred_user_id
    left join consumed_commissions commission on commission.driver_id = person.referred_user_id
    left join credited_rewards reward on reward.relationship_id = person.relationship_id
  ),
  per_referrer as (
    select
      person.referrer_user_id,
      person.referrer_name,
      count(*)::integer as referred_count,
      count(person.driver_status)::integer as driver_profiles,
      count(*) filter (where person.settled_jobs > 0)::integer as productive_referrals,
      coalesce(sum(person.settled_jobs), 0)::integer as settled_jobs,
      coalesce(sum(person.fare_cup), 0) as fare_cup,
      coalesce(sum(person.real_cup), 0) as real_cup,
      coalesce(sum(person.promotional_cup), 0) as promotional_cup,
      coalesce(sum(person.credited_cup), 0) as credited_cup,
      jsonb_agg(jsonb_build_object(
        'relationship_id', person.relationship_id,
        'referred_user_id', person.referred_user_id,
        'referred_name', person.referred_name,
        'referral_code', person.referral_code,
        'referred_at', person.referred_at,
        'driver_status', person.driver_status,
        'settled_jobs', person.settled_jobs,
        'fare_cup', case when can_view_financial then person.fare_cup else null end,
        'real_commissions_cup', case when can_view_financial then person.real_cup else null end,
        'promotional_commissions_cup', case when can_view_financial then person.promotional_cup else null end,
        'referral_credit_cup', case when can_view_financial then person.credited_cup else null end
      ) order by person.referred_at desc, person.relationship_id) as people
    from per_person person
    group by person.referrer_user_id, person.referrer_name
  )
  select jsonb_build_object(
    'can_view_financial', can_view_financial,
    'summary', (select jsonb_build_object(
      'referrers', count(*)::integer,
      'referred', coalesce(sum(p.referred_count), 0)::integer,
      'driver_profiles', coalesce(sum(p.driver_profiles), 0)::integer,
      'productive_referrals', coalesce(sum(p.productive_referrals), 0)::integer,
      'settled_jobs', coalesce(sum(p.settled_jobs), 0)::integer,
      'fare_cup', case when can_view_financial then coalesce(sum(p.fare_cup), 0) else null end,
      'real_commissions_cup', case when can_view_financial then coalesce(sum(p.real_cup), 0) else null end,
      'promotional_commissions_cup', case when can_view_financial then coalesce(sum(p.promotional_cup), 0) else null end,
      'referral_credit_cup', case when can_view_financial then coalesce(sum(p.credited_cup), 0) else null end
    ) from per_referrer p),
    'referrers', coalesce((select jsonb_agg(jsonb_build_object(
      'referrer_user_id', p.referrer_user_id,
      'referrer_name', p.referrer_name,
      'referred_count', p.referred_count,
      'driver_profiles', p.driver_profiles,
      'productive_referrals', p.productive_referrals,
      'settled_jobs', p.settled_jobs,
      'fare_cup', case when can_view_financial then p.fare_cup else null end,
      'real_commissions_cup', case when can_view_financial then p.real_cup else null end,
      'promotional_commissions_cup', case when can_view_financial then p.promotional_cup else null end,
      'referral_credit_cup', case when can_view_financial then p.credited_cup else null end,
      'people', p.people
    ) order by p.referred_count desc, p.referrer_name, p.referrer_user_id) from per_referrer p), '[]'::jsonb)
  ) into response;

  return response;
end;
$function$;

revoke all on function public.admin_get_commercial_referral_network_v1(uuid) from public, anon;
grant execute on function public.admin_get_commercial_referral_network_v1(uuid) to authenticated;