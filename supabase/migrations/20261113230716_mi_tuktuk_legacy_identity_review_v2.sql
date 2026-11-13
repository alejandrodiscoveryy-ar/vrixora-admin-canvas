-- Allow the authorized administrator to classify a legacy document as part
-- of its explicit review, never infer a type or verify automatically.
begin;
create or replace function public.admin_set_marketplace_driver_identity_review_v2(
  target_project_id uuid,target_driver_user_id uuid,target_verified boolean,
  target_reason text,target_front_asset_id uuid,target_back_asset_id uuid,
  target_document_type text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.driver_profiles%rowtype; result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform app_private.require_project_permission(target_project_id,'marketplace.manage');
  if target_verified is distinct from true then
    return public.admin_set_marketplace_driver_identity_review_v1(target_project_id,target_driver_user_id,
      target_verified,target_reason,target_front_asset_id,target_back_asset_id);
  end if;
  select * into d from public.driver_profiles where project_id=target_project_id and user_id=target_driver_user_id for update;
  if not found then raise exception 'DRIVER_NOT_FOUND' using errcode='P0002'; end if;
  if target_document_type is null or target_document_type not in ('national_id','driver_license')
    or (d.identity_document_type is not null and d.identity_document_type is distinct from target_document_type)
    or target_front_asset_id is null or target_back_asset_id is null
    or target_front_asset_id is distinct from d.identity_front_asset_id
    or target_back_asset_id is distinct from d.identity_back_asset_id
  then raise exception 'DOCUMENT_TYPE_OR_ASSETS_CHANGED' using errcode='22023'; end if;
  if d.identity_document_type is null then
    update public.driver_profiles set identity_document_type=target_document_type
      where project_id=d.project_id and user_id=d.user_id;
    insert into public.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
      values(d.project_id,auth.uid(),'admin_classify_driver_identity','driver_profile',d.user_id::text,
        jsonb_build_object('document_type',target_document_type,'reason',btrim(target_reason)));
  end if;
  -- The established review validates permission, current documents, ownership,
  -- available private assets, name and reason. Failure rolls back classification.
  result:=public.admin_set_marketplace_driver_identity_review_v1(target_project_id,target_driver_user_id,true,
    target_reason,target_front_asset_id,target_back_asset_id);
  return result;
end $$;
revoke all on function public.admin_set_marketplace_driver_identity_review_v2(uuid,uuid,boolean,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_set_marketplace_driver_identity_review_v2(uuid,uuid,boolean,text,uuid,uuid,text) to authenticated;
commit;
