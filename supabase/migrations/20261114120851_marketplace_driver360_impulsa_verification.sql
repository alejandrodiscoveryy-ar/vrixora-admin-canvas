-- Administrative verification badges and independent Impulsa deactivation.
-- No changes to verification, consent, fares, or existing profiles at migration time.
begin;
create function public.admin_get_marketplace_driver_verifications_v1(target_project_id uuid,target_driver_user_ids uuid[])
returns table(driver_user_id uuid, verified boolean, verified_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.view');
  if coalesce(cardinality(target_driver_user_ids),0)>200 then
    raise exception 'TOO_MANY_DRIVERS' using errcode='22023';
  end if;
  return query
    select d.user_id, v.is_verified, case when v.is_verified then r.verified_at else null end
    from public.driver_profiles d
    left join app_private.marketplace_driver_identity_reviews r
      on r.project_id=d.project_id and r.driver_user_id=d.user_id
    cross join lateral (select app_private.marketplace_driver_identity_verified_v1(d.project_id,d.user_id) as is_verified) v
    where d.project_id=target_project_id and d.user_id=any(target_driver_user_ids);
end $$;
revoke all on function public.admin_get_marketplace_driver_verifications_v1(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.admin_get_marketplace_driver_verifications_v1(uuid,uuid[]) to authenticated;

create function public.admin_deactivate_marketplace_promo_card_v1(target_project_id uuid,target_driver_user_id uuid,target_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p app_private.marketplace_driver_promo_profiles%rowtype; reason text:=btrim(coalesce(target_reason,''));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if char_length(reason) not between 5 and 300 then raise exception 'INVALID_REASON' using errcode='22023'; end if;
  select * into p from app_private.marketplace_driver_promo_profiles
    where project_id=target_project_id and driver_user_id=target_driver_user_id for update;
  if not found or p.revoked_at is not null then return jsonb_build_object('enabled',false); end if;
  update app_private.marketplace_driver_promo_profiles set revoked_at=now()
    where project_id=p.project_id and driver_user_id=p.driver_user_id;
  update app_private.marketplace_driver_promo_attribution set phase='fleet',released_at=now(),release_reason='revoked'
    where project_id=p.project_id and driver_user_id=p.driver_user_id and phase='preferred';
  insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    values(p.project_id,auth.uid(),'admin_deactivate_driver_promo','driver_profile',p.driver_user_id::text,jsonb_build_object('reason',reason));
  return jsonb_build_object('enabled',false);
end $$;
revoke all on function public.admin_deactivate_marketplace_promo_card_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_deactivate_marketplace_promo_card_v1(uuid,uuid,text) to authenticated;
commit;
