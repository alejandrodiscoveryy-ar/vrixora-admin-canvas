-- Read-only contract expansion for the Client 360 referral cards.
-- It exposes only the referred profile's existing public avatar and registration date
-- under the same commercial.view permission already required by this RPC.

alter function public.admin_get_client_360(uuid, uuid) rename to admin_get_client_360_base;

create function public.admin_get_client_360(
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
  result jsonb;
begin
  result:=public.admin_get_client_360_base(target_project_id,target_client_id);

  -- The base function already performs all authorization checks. Extend only
  -- referral objects that it decided are visible, using their profile data.
  if result->'referrals' is not null and result#>'{referrals,referred_by}' is not null then
    result:=jsonb_set(result,'{referrals,referred_by,avatar_url}',
      (select jsonb_build_object('value',profile.avatar_url)->'value'
       from public.profiles profile
       where profile.id=(result#>>'{referrals,referred_by,user_id}')::uuid),true);
    result:=jsonb_set(result,'{referrals,referred_by,registered_at}',
      (select to_jsonb(profile.created_at)
       from public.profiles profile
       where profile.id=(result#>>'{referrals,referred_by,user_id}')::uuid),true);
  end if;

  if result->'referrals' is not null then
    result:=jsonb_set(result,'{referrals,referred_clients}',coalesce((
      select jsonb_agg(item.value || jsonb_build_object(
        'avatar_url',profile.avatar_url,
        'registered_at',profile.created_at
      ) order by item.ordinality)
      from jsonb_array_elements(coalesce(result#>'{referrals,referred_clients}','[]'::jsonb)) with ordinality item(value, ordinality)
      join public.profiles profile on profile.id=(item.value->>'user_id')::uuid
    ),'[]'::jsonb),true);
  end if;

  return result;
end;
$$;

revoke all on function public.admin_get_client_360_base(uuid,uuid) from public,anon;
grant execute on function public.admin_get_client_360_base(uuid,uuid),public.admin_get_client_360(uuid,uuid) to authenticated;
